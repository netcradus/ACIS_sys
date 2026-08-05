package com.netcradus.acis.soar;

import java.util.TimeZone;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.domain.EntityScan;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableAsync
@EnableScheduling
// ApiKey/ApiKeyRepository, SyslogSource/SyslogSourceRepository, and the RBAC
// model (UserMember/ConsoleRole/RolePermission + their repositories, plus
// the PermissionResolver/DefaultRoleProvisioner @Component beans that
// resolve/seed it) all live in acis-common — shared with acis-ingestion (API
// key filter, syslog listener) and every other service enforcing RBAC
// (RbacEnforcementFilter), outside this app's default @SpringBootApplication
// scan root. @EntityScan only covers @Entity/repository interfaces, not
// plain @Component beans, so @ComponentScan must be widened too.
@ComponentScan(basePackages = { "com.netcradus.acis.soar", "com.netcradus.acis.common.rbac" })
@EntityScan(basePackages = { "com.netcradus.acis.soar", "com.netcradus.acis.common.apikey", "com.netcradus.acis.common.syslog", "com.netcradus.acis.common.rbac" })
@EnableJpaRepositories(basePackages = { "com.netcradus.acis.soar", "com.netcradus.acis.common.apikey", "com.netcradus.acis.common.syslog", "com.netcradus.acis.common.rbac" })
public class SoarApplication {
    public static void main(String[] args) {
        // Fix for PostgreSQL 16 timezone alias handling on some OS locales
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Kolkata"));
        SpringApplication.run(SoarApplication.class, args);
    }
}
