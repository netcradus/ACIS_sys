package com.netcradus.acis.log.controller;

import com.netcradus.acis.common.tenant.TenantContext;
import com.netcradus.acis.log.model.SavedSearch;
import com.netcradus.acis.log.repository.SavedSearchRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Real backend persistence for Log Explorer's Save Search / Load Saved
 * features — replaces the previous localStorage-only implementation, which
 * never left the browser and was wiped by a cache clear or device switch.
 * Scoped to tenant AND the real authenticated user (TenantContext.getUserEmail(),
 * JWT-derived — never client-supplied), so a saved search is personal and
 * never visible to another user, even within the same tenant.
 */
@Slf4j
@RestController
@RequestMapping("/api/logs/saved-searches")
@RequiredArgsConstructor
public class SavedSearchController {

    private final SavedSearchRepository savedSearchRepository;

    @GetMapping
    public ResponseEntity<List<Map<String, Object>>> list(@RequestHeader("X-Tenant-ID") String tenantId) {
        String userId = TenantContext.getUserEmail();
        List<Map<String, Object>> result = savedSearchRepository
                .findByTenantIdAndUserIdOrderByUpdatedAtDesc(tenantId, userId).stream()
                .map(SavedSearchController::toDto)
                .collect(Collectors.toList());
        return ResponseEntity.ok(result);
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestHeader("X-Tenant-ID") String tenantId, @RequestBody Map<String, String> body) {
        String userId = TenantContext.getUserEmail();
        String name = body.get("name") != null ? body.get("name").trim() : "";
        String query = body.get("query") != null ? body.get("query").trim() : "";

        if (name.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Search name is required"));
        }
        if (query.isEmpty()) {
            return ResponseEntity.badRequest().body(Map.of("error", "Cannot save an empty query"));
        }
        if (savedSearchRepository.findByTenantIdAndUserIdAndName(tenantId, userId, name).isPresent()) {
            return ResponseEntity.status(HttpStatus.CONFLICT)
                    .body(Map.of("error", "A saved search named '" + name + "' already exists"));
        }

        SavedSearch entity = new SavedSearch();
        entity.setTenantId(tenantId);
        entity.setUserId(userId);
        entity.setName(name);
        entity.setQuery(query);
        SavedSearch saved = savedSearchRepository.save(entity);
        return ResponseEntity.status(HttpStatus.CREATED).body(toDto(saved));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@RequestHeader("X-Tenant-ID") String tenantId, @PathVariable UUID id) {
        String userId = TenantContext.getUserEmail();
        return savedSearchRepository.findByIdAndTenantIdAndUserId(id, tenantId, userId)
                .map(entity -> {
                    savedSearchRepository.delete(entity);
                    return ResponseEntity.ok(Map.of("status", "deleted"));
                })
                .orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND)
                        .body(Map.of("error", "Saved search not found")));
    }

    private static Map<String, Object> toDto(SavedSearch s) {
        Map<String, Object> dto = new java.util.LinkedHashMap<>();
        dto.put("id", s.getId());
        dto.put("name", s.getName());
        dto.put("query", s.getQuery());
        dto.put("createdAt", s.getCreatedAt());
        dto.put("updatedAt", s.getUpdatedAt());
        return dto;
    }
}
