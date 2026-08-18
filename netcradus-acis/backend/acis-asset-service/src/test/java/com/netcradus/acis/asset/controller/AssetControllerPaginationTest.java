package com.netcradus.acis.asset.controller;

import com.netcradus.acis.asset.model.Asset;
import com.netcradus.acis.asset.model.AssetStatus;
import com.netcradus.acis.asset.model.AssetType;
import com.netcradus.acis.asset.service.AssetService;
import com.netcradus.acis.common.audit.AuditEventPublisher;
import com.netcradus.acis.common.dto.PageResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * Real coverage of AssetController.getAllAssets' pagination-parameter
 * handling — the actual clamping/defaulting logic added during the
 * production-readiness audit (MAX_PAGE_SIZE=500, size floored at 1, page
 * floored at 0 — see AssetController lines 21/40-41), tested against what
 * the controller genuinely does rather than an assumed "reject invalid
 * input" behavior. AssetService is mocked (Mockito), which is appropriate
 * here since this is testing the controller's own parameter-clamping logic,
 * not RLS or repository query correctness.
 */
class AssetControllerPaginationTest {

    private static final String TENANT = "tenant-a";

    private AssetService assetService;
    private AssetController controller;

    @BeforeEach
    void setUp() {
        assetService = mock(AssetService.class);
        AuditEventPublisher auditEventPublisher = mock(AuditEventPublisher.class);
        controller = new AssetController(assetService, auditEventPublisher);
    }

    private Asset asset(String name) {
        return Asset.builder()
                .name(name)
                .ipAddress("10.0.0.1")
                .type(AssetType.SERVER)
                .status(AssetStatus.ACTIVE)
                .build();
    }

    private Pageable capturePageable() {
        ArgumentCaptor<Pageable> captor = ArgumentCaptor.forClass(Pageable.class);
        verify(assetService).findAll(eq(TENANT), captor.capture());
        return captor.getValue();
    }

    @Test
    void firstPageUsesPageZeroAndTheRequestedSize() {
        when(assetService.findAll(eq(TENANT), any(Pageable.class))).thenAnswer(inv ->
                new PageImpl<>(List.of(asset("a1"), asset("a2")), inv.getArgument(1), 12));

        ResponseEntity<PageResponse<Asset>> response = controller.getAllAssets(TENANT, 0, 2);

        Pageable used = capturePageable();
        assertThat(used.getPageNumber()).isEqualTo(0);
        assertThat(used.getPageSize()).isEqualTo(2);
        assertThat(response.getBody().page()).isEqualTo(0);
        assertThat(response.getBody().totalElements()).isEqualTo(12);
        assertThat(response.getBody().content()).hasSize(2);
    }

    @Test
    void middlePageIsPassedThroughUnchanged() {
        when(assetService.findAll(eq(TENANT), any(Pageable.class))).thenAnswer(inv ->
                new PageImpl<>(List.of(asset("a5")), inv.getArgument(1), 12));

        controller.getAllAssets(TENANT, 2, 5);

        Pageable used = capturePageable();
        assertThat(used.getPageNumber()).isEqualTo(2);
        assertThat(used.getPageSize()).isEqualTo(5);
    }

    @Test
    void lastPageWithFewerElementsThanAFullPageIsReturnedAsIsNotPaddedOrErrored() {
        when(assetService.findAll(eq(TENANT), any(Pageable.class))).thenAnswer(inv ->
                new PageImpl<>(List.of(asset("last")), inv.getArgument(1), 11));

        ResponseEntity<PageResponse<Asset>> response = controller.getAllAssets(TENANT, 5, 2);

        assertThat(response.getBody().content()).hasSize(1);
        assertThat(response.getBody().totalElements()).isEqualTo(11);
        assertThat(response.getBody().totalPages()).isEqualTo(6); // ceil(11/2)
    }

    @Test
    void emptyResultSetReturnsEmptyContentNotAnError() {
        when(assetService.findAll(eq(TENANT), any(Pageable.class))).thenAnswer(inv ->
                new PageImpl<>(List.of(), inv.getArgument(1), 0));

        ResponseEntity<PageResponse<Asset>> response = controller.getAllAssets(TENANT, 0, 50);

        assertThat(response.getStatusCode().is2xxSuccessful()).isTrue();
        assertThat(response.getBody().content()).isEmpty();
        assertThat(response.getBody().totalElements()).isEqualTo(0);
    }

    @Test
    void pageSizeRequestLargerThanTheActualDatasetJustReturnsEverythingNotAnError() {
        List<Asset> all = List.of(asset("a1"), asset("a2"), asset("a3"));
        when(assetService.findAll(eq(TENANT), any(Pageable.class))).thenAnswer(inv ->
                new PageImpl<>(all, inv.getArgument(1), all.size()));

        ResponseEntity<PageResponse<Asset>> response = controller.getAllAssets(TENANT, 0, 1000);

        // The controller clamps the REQUESTED size down to MAX_PAGE_SIZE (500,
        // see AssetController.MAX_PAGE_SIZE) but does not error just because
        // that's bigger than what this tenant actually has — the underlying
        // page legitimately comes back with fewer rows than the page size.
        Pageable used = capturePageable();
        assertThat(used.getPageSize()).isEqualTo(500);
        assertThat(response.getBody().content()).hasSize(3);
    }

    @Test
    void negativePageNumberIsClampedToZeroNotRejected() {
        when(assetService.findAll(eq(TENANT), any(Pageable.class))).thenAnswer(inv ->
                new PageImpl<>(List.of(), inv.getArgument(1), 0));

        controller.getAllAssets(TENANT, -5, 10);

        Pageable used = capturePageable();
        assertThat(used.getPageNumber()).isEqualTo(0);
    }

    @Test
    void zeroPageSizeIsClampedUpToOneNotRejected() {
        when(assetService.findAll(eq(TENANT), any(Pageable.class))).thenAnswer(inv ->
                new PageImpl<>(List.of(asset("a1")), inv.getArgument(1), 1));

        controller.getAllAssets(TENANT, 0, 0);

        Pageable used = capturePageable();
        assertThat(used.getPageSize()).isEqualTo(1);
    }

    @Test
    void negativePageSizeIsAlsoClampedUpToOneNotRejected() {
        reset(assetService);
        when(assetService.findAll(eq(TENANT), any(Pageable.class))).thenAnswer(inv ->
                new PageImpl<>(List.of(asset("a1")), inv.getArgument(1), 1));

        controller.getAllAssets(TENANT, 0, -10);

        Pageable used = capturePageable();
        assertThat(used.getPageSize()).isEqualTo(1);
    }
}
