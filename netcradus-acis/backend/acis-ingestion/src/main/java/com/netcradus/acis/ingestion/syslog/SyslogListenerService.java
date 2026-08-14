package com.netcradus.acis.ingestion.syslog;

import com.netcradus.acis.common.syslog.SyslogSource;
import com.netcradus.acis.common.syslog.SyslogSourceRepository;
import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.ingestion.service.IngestionErrorService;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicReference;
import java.util.stream.Collectors;

/**
 * Binds a real UDP DatagramSocket and TCP ServerSocket on each tenant's
 * assigned port (see SyslogSourceController) and forwards every raw line
 * received into the same Kafka topic /api/ingest/* uses — genuinely
 * receiving syslog/CEF traffic from real firewalls/routers/switches, not a
 * simulated ingestion count. A tenant with no syslog source configured
 * simply has no port bound; nothing listens or fakes data on their behalf.
 *
 * Re-syncs which ports should be bound every 30s (sync()), since a tenant
 * can add/remove/disable their source at any time via Settings — this
 * service has no other way to learn that short of polling the shared table.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SyslogListenerService {

    private static final String TOPIC = "acis-logs";

    private final SyslogSourceRepository syslogSourceRepository;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final IngestionErrorService ingestionErrorService;

    private final Map<UUID, BoundListener> active = new ConcurrentHashMap<>();
    private final ExecutorService executor = Executors.newCachedThreadPool();

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() {
        sync();
    }

    @Scheduled(fixedDelay = 30000, initialDelay = 30000)
    public void sync() {
        List<SyslogSource> enabled;
        TenantContext.setSystemPollerInProgress(true);
        try {
            enabled = syslogSourceRepository.findByEnabledTrue();
        } finally {
            TenantContext.setSystemPollerInProgress(false);
        }

        var desired = enabled.stream().collect(Collectors.toMap(SyslogSource::getTenantId, s -> s));

        for (UUID tenantId : new ArrayList<>(active.keySet())) {
            if (!desired.containsKey(tenantId)) {
                stop(tenantId);
            }
        }
        for (SyslogSource source : enabled) {
            if (!active.containsKey(source.getTenantId())) {
                start(source);
            }
        }

        // Persist in-memory "last received" timestamps picked up since the last sync —
        // batched here rather than on every packet, since a busy syslog feed can be
        // many messages/sec and writing to Postgres on each one would be wasteful.
        for (SyslogSource source : enabled) {
            BoundListener listener = active.get(source.getTenantId());
            if (listener == null) continue;
            Instant lastReceived = listener.lastReceived.get();
            if (lastReceived == null) continue;
            TenantContext.setTenantId(source.getTenantId().toString());
            try {
                source.setLastReceivedAt(OffsetDateTime.ofInstant(lastReceived, java.time.ZoneOffset.UTC));
                syslogSourceRepository.save(source);
            } catch (Exception e) {
                log.warn("Failed to persist lastReceivedAt for tenant {}: {}", source.getTenantId(), e.getMessage());
            } finally {
                TenantContext.clear();
            }
        }
    }

    private void start(SyslogSource source) {
        UUID tenantId = source.getTenantId();
        int port = source.getAssignedPort();
        try {
            DatagramSocket udpSocket = new DatagramSocket(port);
            ServerSocket tcpSocket = new ServerSocket(port);
            BoundListener listener = new BoundListener(udpSocket, tcpSocket);
            active.put(tenantId, listener);

            executor.submit(() -> runUdp(tenantId, listener));
            executor.submit(() -> runTcp(tenantId, listener));
            log.info("Syslog listener bound for tenant {} on port {} (UDP+TCP)", tenantId, port);
        } catch (IOException e) {
            log.error("Failed to bind syslog listener for tenant {} on port {}: {}", tenantId, port, e.getMessage());
        }
    }

    private void stop(UUID tenantId) {
        BoundListener listener = active.remove(tenantId);
        if (listener != null) {
            listener.close();
            log.info("Syslog listener stopped for tenant {}", tenantId);
        }
    }

    private void runUdp(UUID tenantId, BoundListener listener) {
        byte[] buffer = new byte[8192];
        while (!listener.udpSocket.isClosed()) {
            try {
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                listener.udpSocket.receive(packet);
                String message = new String(packet.getData(), 0, packet.getLength(), StandardCharsets.UTF_8);
                forward(tenantId, message, "syslog-udp");
                listener.lastReceived.set(Instant.now());
            } catch (IOException e) {
                if (!listener.udpSocket.isClosed()) {
                    log.warn("UDP syslog receive error for tenant {}: {}", tenantId, e.getMessage());
                    ingestionErrorService.record("syslog-udp", e.getMessage());
                }
            }
        }
    }

    private void runTcp(UUID tenantId, BoundListener listener) {
        while (!listener.tcpSocket.isClosed()) {
            try {
                Socket client = listener.tcpSocket.accept();
                executor.submit(() -> handleTcpConnection(tenantId, listener, client));
            } catch (IOException e) {
                if (!listener.tcpSocket.isClosed()) {
                    log.warn("TCP syslog accept error for tenant {}: {}", tenantId, e.getMessage());
                    ingestionErrorService.record("syslog-tcp", e.getMessage());
                }
            }
        }
    }

    private void handleTcpConnection(UUID tenantId, BoundListener listener, Socket client) {
        try (client; BufferedReader reader = new BufferedReader(new InputStreamReader(client.getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                if (!line.isBlank()) {
                    forward(tenantId, line, "syslog-tcp");
                    listener.lastReceived.set(Instant.now());
                }
            }
        } catch (IOException e) {
            log.debug("TCP syslog connection closed for tenant {}: {}", tenantId, e.getMessage());
        }
    }

    private void forward(UUID tenantId, String rawMessage, String service) {
        Map<String, Object> logDoc = new HashMap<>();
        logDoc.put("tenantId", tenantId.toString());
        logDoc.put("message", rawMessage);
        logDoc.put("level", "INFO");
        logDoc.put("service", service);
        logDoc.put("timestamp", Instant.now().toString());
        kafkaTemplate.send(TOPIC, logDoc);
    }

    @PreDestroy
    public void shutdown() {
        new ArrayList<>(active.keySet()).forEach(this::stop);
        executor.shutdownNow();
    }

    private static class BoundListener {
        final DatagramSocket udpSocket;
        final ServerSocket tcpSocket;
        final AtomicReference<Instant> lastReceived = new AtomicReference<>();

        BoundListener(DatagramSocket udpSocket, ServerSocket tcpSocket) {
            this.udpSocket = udpSocket;
            this.tcpSocket = tcpSocket;
        }

        void close() {
            udpSocket.close();
            try {
                tcpSocket.close();
            } catch (IOException ignored) {
                // Already closing — nothing useful to do.
            }
        }
    }
}
