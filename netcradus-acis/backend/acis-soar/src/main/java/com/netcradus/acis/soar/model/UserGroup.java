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

    private String name;

    private String description;

    @Column(name = "member_count")
    private Integer memberCount;

    @Column(name = "badge_initials")
    private String badgeInitials;
}
