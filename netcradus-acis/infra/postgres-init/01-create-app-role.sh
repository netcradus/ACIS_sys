#!/bin/bash
# Runs once via Postgres's /docker-entrypoint-initdb.d/ mechanism — ONLY on a
# brand-new (empty) data volume. If you already have an initialized Postgres
# volume from before this file existed, this will NOT run automatically; see
# the note at the bottom of this file.
#
# Why this exists: the POSTGRES_USER the official postgres image creates
# (here, "acis") is always a superuser, and Postgres row-level security never
# applies to superusers — not even with FORCE ROW LEVEL SECURITY. So every
# acis-* Spring Boot service must connect as a SEPARATE, ordinary
# (non-superuser) role for the tenant-isolation policies created by
# RlsBootstrapper (see acis-common) to actually restrict anything. This
# script creates that role: acis_app.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'acis_app') THEN
            CREATE ROLE acis_app WITH LOGIN PASSWORD '${APP_DB_PASSWORD}'
                NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
        ELSE
            ALTER ROLE acis_app WITH PASSWORD '${APP_DB_PASSWORD}';
        END IF;
    END
    \$\$;

    GRANT ALL PRIVILEGES ON SCHEMA public TO acis_app;
EOSQL

# ── Migrating an existing (pre-acis_app) volume ────────────────────────────
# If your tables already exist and are owned by the bootstrap superuser
# ("acis"), acis_app won't be able to run Hibernate's schema updates or even
# read/write them (schema-level GRANT does not retroactively cover
# already-existing tables). Either:
#   a) Reset the dev volume (all seed data is regenerated automatically by
#      the *DataSeeder / SeedConfig CommandLineRunners on next startup):
#        docker compose down -v && docker compose up -d
#   b) Or migrate ownership of existing tables without losing data:
#        docker compose exec postgres psql -U acis -d acis -c \
#          "DO \$\$ DECLARE r RECORD; BEGIN \
#             FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='public' LOOP \
#               EXECUTE format('ALTER TABLE %I OWNER TO acis_app', r.tablename); \
#             END LOOP; \
#           END \$\$;"
