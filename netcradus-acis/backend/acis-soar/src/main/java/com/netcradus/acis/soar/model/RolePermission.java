package com.netcradus.acis.soar.model;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.Data;
import lombok.ToString;
import java.util.UUID;

@Data
@Entity
@Table(name = "role_permissions")
@ToString(exclude = "role")
public class RolePermission {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "tenant_id", nullable = false,
            columnDefinition = "uuid default '00000000-0000-0000-0000-000000000001'")
    private UUID tenantId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "role_id", nullable = false)
    @JsonIgnore
    private ConsoleRole role;

    @Column(name = "module_name")
    private String moduleName;

    @Column(name = "permission_level")
    private String permissionLevel; // NONE, READ, WRITE, ADMIN
}
