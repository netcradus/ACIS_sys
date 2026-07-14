package com.netcradus.acis.soar.model;

import jakarta.persistence.*;
import lombok.Data;
import java.util.UUID;

@Data
@Entity
@Table(name = "organizations")
public class Organization {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    private String name;

    @Column(name = "org_id_string")
    private String orgIdString; // e.g. org_ch_8841kd

    private String industry;

    @Column(name = "primary_region")
    private String primaryRegion;

    @Column(name = "support_email")
    private String supportEmail;

    @Column(name = "time_zone")
    private String timeZone;
}
