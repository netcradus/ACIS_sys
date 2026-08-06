package com.netcradus.acis.common.rbac;

import jakarta.persistence.*;
import lombok.Data;
import java.util.UUID;

/**
 * A real, tenant-owned organizational grouping — moved here (from acis-soar)
 * because UserMember now holds a real @ManyToOne to it (see UserMember.group),
 * the same reason ConsoleRole lives here. Deliberately does not grant any
 * permission by itself (per the explicit choice this was scoped to stay
 * organizational-only) — access is still governed entirely by each member's
 * own ConsoleRole.
 */
@Data
@Entity
@Table(name = "user_groups")
public class UserGroup {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false,
            columnDefinition = "uuid default '00000000-0000-0000-0000-000000000001'")
    private UUID tenantId;

    private String name;

    private String description;

    /** Computed on read (see SettingsController.getGroups) — never trust a stored value here, real membership can change independently. */
    @Transient
    private Integer memberCount;

    @Column(name = "badge_initials")
    private String badgeInitials;
}
