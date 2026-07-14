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

    @Column(name = "tenant_id", nullable = false,
            columnDefinition = "uuid default '00000000-0000-0000-0000-000000000001'")
    private UUID tenantId;

    private String name;

    @Column(name = "owner_email")
    private String ownerEmail;

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
