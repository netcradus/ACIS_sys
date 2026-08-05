package com.netcradus.acis.alerts;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import java.util.TimeZone;

// RBAC model (UserMember/ConsoleRole/RolePermission + repositories) and the
// @Component beans that resolve/enforce it (PermissionResolver,
// DefaultRoleProvisioner) live in acis-common, shared across every service
// enforcing RBAC via RbacEnforcementFilter — outside this app's default
// @SpringBootApplication scan root, so both entity/repository scanning AND
// general component scanning must be extended explicitly (EntityScan only
// covers @Entity/repository interfaces, not plain @Component beans).
@SpringBootApplication
@ComponentScan(basePackages = { "com.netcradus.acis.alerts", "com.netcradus.acis.common.rbac" })
@EntityScan(basePackages = { "com.netcradus.acis.alerts", "com.netcradus.acis.common.rbac" })
@EnableJpaRepositories(basePackages = { "com.netcradus.acis.alerts", "com.netcradus.acis.common.rbac" })
public class AcisAlertsApplication {
    public static void main(String[] args) {
        // Fix for PostgreSQL 16 TimeZone issues in certain environments
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(AcisAlertsApplication.class, args);
    }
}
