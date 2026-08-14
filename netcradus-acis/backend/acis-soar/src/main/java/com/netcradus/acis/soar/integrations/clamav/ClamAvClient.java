package com.netcradus.acis.soar.integrations.clamav;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.DataInputStream;
import java.io.DataOutputStream;
import java.net.Socket;
import java.nio.charset.StandardCharsets;

/**
 * Real ClamAV client speaking clamd's INSTREAM protocol directly over TCP —
 * no third-party client library, same "hand-roll the small protocol" pattern
 * already used for CloudflareClient/SentinelOneClient in this package tree.
 * Protocol (see clamd(8)): send "zINSTREAM\0", then the file as a series of
 * [4-byte big-endian length][chunk] frames, terminated by a zero-length
 * frame, then read one response line ("stream: OK" or
 * "stream: <name> FOUND").
 */
@Slf4j
@Component
public class ClamAvClient {

    private static final int CHUNK_SIZE = 8192;
    private static final int SOCKET_TIMEOUT_MS = 15_000;

    @Value("${acis.clamav.host:localhost}")
    private String host;

    @Value("${acis.clamav.port:3310}")
    private int port;

    public enum Verdict { CLEAN, INFECTED, ERROR }

    public record ScanResult(Verdict verdict, String threatName) {
        public static ScanResult clean() { return new ScanResult(Verdict.CLEAN, null); }
        public static ScanResult infected(String name) { return new ScanResult(Verdict.INFECTED, name); }
        public static ScanResult error(String reason) { return new ScanResult(Verdict.ERROR, reason); }
    }

    public ScanResult scan(byte[] fileBytes) {
        try (Socket socket = new Socket(host, port)) {
            socket.setSoTimeout(SOCKET_TIMEOUT_MS);
            DataOutputStream out = new DataOutputStream(socket.getOutputStream());
            DataInputStream in = new DataInputStream(socket.getInputStream());

            out.writeBytes("zINSTREAM\0");
            out.flush();

            int offset = 0;
            while (offset < fileBytes.length) {
                int len = Math.min(CHUNK_SIZE, fileBytes.length - offset);
                out.writeInt(len); // clamd requires network byte order (big-endian) - DataOutputStream.writeInt already is
                out.write(fileBytes, offset, len);
                offset += len;
            }
            out.writeInt(0); // zero-length chunk terminates the stream
            out.flush();

            ByteArrayOutputStream responseBuf = new ByteArrayOutputStream();
            int b;
            while ((b = in.read()) != -1 && b != 0) {
                responseBuf.write(b);
            }
            String response = responseBuf.toString(StandardCharsets.US_ASCII).trim();
            return interpret(response);
        } catch (Exception e) {
            log.warn("ClamAV scan failed (engine unreachable or errored): {}", e.getMessage());
            return ScanResult.error(e.getMessage());
        }
    }

    private ScanResult interpret(String response) {
        // Real clamd response formats: "stream: OK", "stream: <name> FOUND", "stream: <reason> ERROR"
        if (response.isEmpty()) {
            return ScanResult.error("Empty response from ClamAV");
        }
        if (response.endsWith("OK")) {
            return ScanResult.clean();
        }
        if (response.contains("FOUND")) {
            String name = response.replaceFirst("^stream:\\s*", "").replaceFirst("\\s*FOUND$", "");
            return ScanResult.infected(name);
        }
        return ScanResult.error(response);
    }

    public boolean ping() {
        try (Socket socket = new Socket(host, port)) {
            socket.setSoTimeout(5000);
            DataOutputStream out = new DataOutputStream(socket.getOutputStream());
            DataInputStream in = new DataInputStream(socket.getInputStream());
            out.writeBytes("zPING\0");
            out.flush();
            ByteArrayOutputStream buf = new ByteArrayOutputStream();
            int b;
            while ((b = in.read()) != -1 && b != 0) {
                buf.write(b);
            }
            return buf.toString(StandardCharsets.US_ASCII).trim().equals("PONG");
        } catch (Exception e) {
            return false;
        }
    }
}
