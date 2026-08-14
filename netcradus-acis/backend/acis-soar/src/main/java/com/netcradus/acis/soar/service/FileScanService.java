package com.netcradus.acis.soar.service;

import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.AlertDto;
import com.netcradus.acis.soar.integrations.clamav.ClamAvClient;
import com.netcradus.acis.soar.model.FileScanResult;
import com.netcradus.acis.soar.repository.FileScanResultRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.attribute.PosixFilePermission;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

/**
 * Real malware scanning against a self-hosted ClamAV daemon (ClamAvClient),
 * with quarantine for anything infected AND anything the engine couldn't
 * verify — a scan failure is treated as untrusted, never as an implicit
 * pass (fail-safe, not fail-open, unlike this codebase's usual posture on
 * NON-security-decision external calls). Uploaded bytes are never executed
 * or interpreted on this host: they're written to disk under a randomized,
 * extensionless filename, and the original filename/content-type the
 * uploader supplied are stored only as untrusted display metadata.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class FileScanService {

    private static final long MAX_FILE_SIZE_BYTES = 25L * 1024 * 1024; // 25MB

    private final FileScanResultRepository repository;
    private final ClamAvClient clamAvClient;
    private final KafkaTemplate<String, Object> kafkaTemplate;
    private final AuditEventPublisher auditEventPublisher;

    @Value("${acis.file-storage.base-dir:./file-storage}")
    private String baseDir;

    public FileScanResult scanAndStore(MultipartFile file, UUID tenantId, String uploadedBy) throws IOException {
        if (file.isEmpty()) {
            throw new IllegalArgumentException("Uploaded file is empty");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new IllegalArgumentException("File exceeds the 25MB scanning limit");
        }

        byte[] bytes = file.getBytes();
        String hash = sha256Hex(bytes);
        ClamAvClient.ScanResult scanResult = clamAvClient.scan(bytes);

        // ERROR (engine unreachable/failed) is treated the same as INFECTED for
        // storage purposes - an unverifiable file is never trusted by default.
        boolean quarantine = scanResult.verdict() != ClamAvClient.Verdict.CLEAN;

        FileScanResult result = new FileScanResult();
        result.setTenantId(tenantId);
        result.setFileName(file.getOriginalFilename());
        result.setContentType(file.getContentType());
        result.setFileSizeBytes(bytes.length);
        result.setFileHash(hash);
        result.setVerdict(scanResult.verdict().name());
        result.setThreatName(scanResult.threatName());
        result.setQuarantined(quarantine);
        result.setUploadedBy(uploadedBy);

        String storagePath = writeToDisk(bytes, tenantId, quarantine);
        result.setStoragePath(storagePath);

        FileScanResult saved = repository.save(result);

        if (quarantine) {
            publishAlert(saved);
            auditEventPublisher.publish("FILE_QUARANTINED", "file-scan/" + saved.getId(),
                    "verdict=" + saved.getVerdict() + " threat=" + saved.getThreatName());
        } else {
            auditEventPublisher.publish("FILE_SCANNED_CLEAN", "file-scan/" + saved.getId(), "verdict=CLEAN");
        }

        return saved;
    }

    public List<FileScanResult> listForTenant(UUID tenantId) {
        return repository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    public Optional<FileScanResult> getById(UUID id, UUID tenantId) {
        return repository.findByIdAndTenantId(id, tenantId);
    }

    /**
     * Manual analyst acknowledgment that a quarantined file's risk has been
     * reviewed - does NOT move, restore, or make the file executable/servable
     * in any way. It only records who accepted the risk and when, a real
     * safeguard against silently un-quarantining something.
     */
    public Optional<FileScanResult> release(UUID id, UUID tenantId, String releasedBy) {
        return repository.findByIdAndTenantId(id, tenantId).map(result -> {
            result.setReleased(true);
            result.setReleasedBy(releasedBy);
            result.setReleasedAt(OffsetDateTime.now());
            FileScanResult saved = repository.save(result);
            auditEventPublisher.publish("FILE_QUARANTINE_RELEASED", "file-scan/" + id, "releasedBy=" + releasedBy);
            return saved;
        });
    }

    private void publishAlert(FileScanResult result) {
        String title = result.getVerdict().equals("INFECTED")
                ? "Malware detected and quarantined: " + result.getThreatName()
                : "File quarantined - scan engine unavailable (fail-safe)";
        String severity = result.getVerdict().equals("INFECTED") ? "CRITICAL" : "HIGH";

        AlertDto alert = AlertDto.builder()
                .tenantId(result.getTenantId().toString())
                .title(title)
                .severity(severity)
                .source("Malware Scanner")
                .status("OPEN")
                .rawEvent("{\"fileName\":\"" + safeJson(result.getFileName()) + "\",\"sha256\":\"" + result.getFileHash()
                        + "\",\"verdict\":\"" + result.getVerdict() + "\",\"threatName\":\""
                        + safeJson(result.getThreatName()) + "\"}")
                .eventOccurredAt(LocalDateTime.now())
                .build();
        kafkaTemplate.send("acis.alerts", alert);
    }

    private String safeJson(String value) {
        return value == null ? "" : value.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    private String writeToDisk(byte[] bytes, UUID tenantId, boolean quarantine) throws IOException {
        String subDir = quarantine ? "quarantine" : "clean";
        Path dir = Paths.get(baseDir, subDir, tenantId.toString());
        Files.createDirectories(dir);
        // Randomized, extensionless filename - the uploader's original name/extension
        // never reaches the filesystem, so nothing here is ever executable-by-association.
        Path target = dir.resolve(UUID.randomUUID() + ".bin");
        Files.write(target, bytes);
        tryRestrictPermissions(target);
        return target.toString();
    }

    private void tryRestrictPermissions(Path path) {
        try {
            Set<PosixFilePermission> perms = EnumSet.of(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE);
            Files.setPosixFilePermissions(path, perms);
        } catch (UnsupportedOperationException e) {
            // Windows/non-POSIX filesystem (local dev) - no equivalent, safe to skip.
        } catch (IOException e) {
            log.warn("Could not restrict permissions on stored file {}: {}", path, e.getMessage());
        }
    }

    private String sha256Hex(byte[] bytes) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(bytes);
            StringBuilder hex = new StringBuilder(digest.length * 2);
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }
}
