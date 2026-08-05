package com.netcradus.acis.common.rbac;

import jakarta.persistence.*;
import lombok.Data;
import java.util.UUID;
import java.util.List;

/**
 * A tenant-defined role (e.g. "SOC Analyst") with a per-module permission
 * matrix (see RolePermission). Moved here from acis-soar (where it's still
 * managed via Settings > Roles & Permissions) so every service that needs to
 * enforce it — not just acis-soar — can read it directly; same rationale as
 * ApiKey's placement here.
 */
@Data
@Entity
@Table(name = "console_roles")
public class ConsoleRole {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false,
            columnDefinition = "uuid default '00000000-0000-0000-0000-000000000001'")
    private UUID tenantId;

    private String name;

    @Column(name = "user_count")
    private Integer userCount;

    @OneToMany(mappedBy = "role", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    private List<RolePermission> permissions;
}
