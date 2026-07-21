package com.netcradus.acis.common.tenant;

import org.springframework.jdbc.datasource.DelegatingDataSource;

import javax.sql.DataSource;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;

/**
 * Wraps the real DataSource so every JDBC connection handed to Hibernate/JPA
 * carries the current request's tenant as a Postgres session GUC
 * (app.current_tenant_id), which the Row Level Security policies created by
 * {@link RlsBootstrapper} read via current_setting(...). This is what makes
 * RLS actually see "the current tenant" — without it, every connection would
 * be tenant-less and (since policies are FORCE'd) would see zero rows.
 *
 * Lifecycle: tenant is set on checkout (getConnection()) and cleared when the
 * connection is returned to the pool (close()), since HikariCP reuses
 * connections across unrelated requests/threads — a session-level GUC left in
 * place would leak the previous caller's tenant to the next one.
 */
public class TenantAwareDataSource extends DelegatingDataSource {

    private static final String SET_TENANT_SQL = "SELECT set_config('app.current_tenant_id', ?, false)";

    public TenantAwareDataSource(DataSource targetDataSource) {
        super(targetDataSource);
    }

    @Override
    public Connection getConnection() throws SQLException {
        return wrap(applyTenant(super.getConnection()));
    }

    @Override
    public Connection getConnection(String username, String password) throws SQLException {
        return wrap(applyTenant(super.getConnection(username, password)));
    }

    private Connection applyTenant(Connection connection) throws SQLException {
        String tenantId = TenantContext.getTenantId();
        try (PreparedStatement ps = connection.prepareStatement(SET_TENANT_SQL)) {
            ps.setString(1, tenantId != null ? tenantId : "");
            ps.execute();
        }
        return connection;
    }

    private void clearTenant(Connection connection) {
        try (PreparedStatement ps = connection.prepareStatement(SET_TENANT_SQL)) {
            ps.setString(1, "");
            ps.execute();
        } catch (SQLException ignored) {
            // Connection may already be invalid/closing — nothing useful to do.
        }
    }

    private Connection wrap(Connection real) {
        InvocationHandler handler = (proxy, method, args) -> {
            if ("close".equals(method.getName())) {
                clearTenant(real);
            }
            try {
                return method.invoke(real, args);
            } catch (InvocationTargetException e) {
                throw e.getCause() != null ? e.getCause() : e;
            }
        };
        return (Connection) Proxy.newProxyInstance(
                Connection.class.getClassLoader(),
                new Class<?>[]{Connection.class},
                handler);
    }
}
