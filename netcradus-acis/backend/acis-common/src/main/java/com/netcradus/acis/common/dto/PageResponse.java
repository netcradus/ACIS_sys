package com.netcradus.acis.common.dto;

import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Shared pagination envelope for list endpoints — added during the
 * production-readiness audit to replace several endpoints that returned an
 * entire tenant's table with no bound (AssetController.getAllAssets,
 * ThreatController.getAllIndicators, LogController.search). Wraps Spring
 * Data's Page so the actual query is paginated at the database level, not
 * fetched in full and sliced in Java.
 */
public record PageResponse<T>(
        List<T> content,
        int page,
        int size,
        long totalElements,
        int totalPages
) {
    public static <T> PageResponse<T> of(Page<T> springPage) {
        return new PageResponse<>(
                springPage.getContent(),
                springPage.getNumber(),
                springPage.getSize(),
                springPage.getTotalElements(),
                springPage.getTotalPages()
        );
    }
}
