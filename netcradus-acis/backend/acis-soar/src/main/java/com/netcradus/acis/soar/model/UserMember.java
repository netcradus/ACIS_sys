package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;
import java.util.UUID;

@Data
@Entity
@Table(name = "user_members")
public class UserMember {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String name;

    private String email;

    @Column(name = "group_name")
    private String groupName;

    private String status;

    @Column(name = "last_login")
    private String lastLogin;
}
