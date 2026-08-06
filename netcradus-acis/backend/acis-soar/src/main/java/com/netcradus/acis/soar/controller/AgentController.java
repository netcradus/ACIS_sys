package com.netcradus.acis.soar.controller;

import com.netcradus.acis.common.dto.ApiResponse;
import com.netcradus.acis.soar.service.AgentEnrollmentService;
import lombok.RequiredArgsConstructor;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * The public surface a real heartbeat script actually calls — no JWT, no
 * tenant known until the enrollment token resolves one (see
 * AgentEnrollmentService.recordHeartbeat). Script-serving endpoints are
 * public for the same reason /api/platform/signup and /api/invitations/**
 * are: the caller (an install one-liner on a brand-new machine) can't
 * possibly have a JWT yet. See SecurityConfig (this service) and
 * acis-gateway's SecurityConfig for the matching permitAll carve-outs.
 */
@RestController
@RequestMapping("/api/agent")
@RequiredArgsConstructor
public class AgentController {

    private final AgentEnrollmentService agentEnrollmentService;

    @PostMapping("/heartbeat")
    public ResponseEntity<ApiResponse<String>> heartbeat(
            @RequestHeader("X-Agent-Token") String token,
            @RequestBody AgentEnrollmentService.HeartbeatRequest request) {
        try {
            agentEnrollmentService.recordHeartbeat(token, request);
            return ResponseEntity.ok(ApiResponse.success("ok"));
        } catch (AgentEnrollmentService.InvalidAgentTokenException e) {
            return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiResponse.error(e.getMessage()));
        }
    }

    @GetMapping(value = "/install.ps1", produces = "text/plain;charset=UTF-8")
    public ResponseEntity<String> installPs1() throws IOException {
        return scriptResponse("install.ps1");
    }

    @GetMapping(value = "/install.sh", produces = "text/plain;charset=UTF-8")
    public ResponseEntity<String> installSh() throws IOException {
        return scriptResponse("install.sh");
    }

    @GetMapping(value = "/install-mac.sh", produces = "text/plain;charset=UTF-8")
    public ResponseEntity<String> installMacSh() throws IOException {
        return scriptResponse("install-mac.sh");
    }

    /** Templated rather than static: kubectl apply -f can't pass CLI args the way the shell one-liners do, so the token/server go in as query params instead. */
    @GetMapping(value = "/k8s-daemonset.yaml", produces = "text/plain;charset=UTF-8")
    public ResponseEntity<String> k8sDaemonset(@RequestParam String token, @RequestParam String server) throws IOException {
        String content = readResource("k8s-daemonset.yaml")
                .replace("__ENROLLMENT_TOKEN__", token)
                .replace("__SERVER_URL__", server);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType("text/plain;charset=UTF-8")).body(content);
    }

    private ResponseEntity<String> scriptResponse(String filename) throws IOException {
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("text/plain;charset=UTF-8"))
                .body(readResource(filename));
    }

    private String readResource(String filename) throws IOException {
        try (var in = new ClassPathResource("agent-scripts/" + filename).getInputStream()) {
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }
}
