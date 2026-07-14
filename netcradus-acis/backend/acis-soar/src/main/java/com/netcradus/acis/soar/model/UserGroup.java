package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;
import java.util.UUID;

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

    @Column(name = "member_count")
    private Integer memberCount;

    @Column(name = "badge_initials")
    private String badgeInitials;
}
