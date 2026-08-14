package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;

import java.time.OffsetDateTime;
import java.util.UUID;

/**
 * Real audit trail of every file submitted for malware scanning — one row
 * per upload, clean or not, so "what did we scan and when" is always
 * answerable even for files that turned out clean. storagePath is a
 * server-side path under acis.file-storage.base-dir with a randomized,
 * extensionless filename (see FileScanService) — the original fileName
 * here is untrusted metadata only, never used to construct a real path or
 * to infer how the file should be opened.
 */
@Data
@Entity
@Table(name = "file_scan_results")
public class FileScanResult {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false)
    private UUID tenantId;

    @Column(name = "file_name")
    private String fileName;

    @Column(name = "content_type")
    private String contentType;

    @Column(name = "file_size_bytes")
    private long fileSizeBytes;

    @Column(name = "file_hash", nullable = false)
    private String fileHash;

    /** CLEAN, INFECTED, or ERROR (engine unreachable/failed - treated as untrusted, see FileScanService). */
    @Column(nullable = false)
    private String verdict;

    @Column(name = "threat_name")
    private String threatName;

    @Column(nullable = false)
    private boolean quarantined;

    @Column(name = "storage_path")
    private String storagePath;

    @Column(name = "uploaded_by")
    private String uploadedBy;

    private boolean released;

    @Column(name = "released_by")
    private String releasedBy;

    @Column(name = "released_at")
    private OffsetDateTime releasedAt;

    @Column(name = "created_at")
    private OffsetDateTime createdAt;

    @PrePersist
    public void prePersist() {
        if (createdAt == null) {
            createdAt = OffsetDateTime.now();
        }
    }
}
