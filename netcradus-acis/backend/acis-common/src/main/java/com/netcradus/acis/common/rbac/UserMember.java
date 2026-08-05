package com.netcradus.acis.common.rbac;

import jakarta.persistence.*;
import lombok.Data;
import java.util.UUID;

/**
 * A tenant's console user. role is the real, enforced link this system was
 * previously missing entirely — without it, ConsoleRole/RolePermission had
 * no way to resolve "what can THIS logged-in person actually do", which is
 * why RBAC was decorative before this. Nullable: a member with no role
 * assigned is denied every module by RbacEnforcementFilter (deny-by-default)
 * until an admin assigns one.
 */
@Data
@Entity
@Table(name = "user_members", uniqueConstraints = @UniqueConstraint(columnNames = {"tenant_id", "email"}))
public class UserMember {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false,
            columnDefinition = "uuid default '00000000-0000-0000-0000-000000000001'")
    private UUID tenantId;

    private String name;

    private String email;

    @Column(name = "group_name")
    private String groupName;

    private String status;

    @Column(name = "last_login")
    private String lastLogin;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "role_id")
    private ConsoleRole role;
}
