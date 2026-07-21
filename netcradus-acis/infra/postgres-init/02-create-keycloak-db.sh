#!/bin/bash
# Runs once via Postgres's /docker-entrypoint-initdb.d/ mechanism — ONLY on a
# brand-new (empty) data volume (see the note in 01-create-app-role.sh for
# migrating an existing volume).
#
# Why this exists: the dev/prod Keycloak container previously used its
# default embedded "dev-file" storage — fine for a demo, not for production
# (no real persistence guarantees, no backups, not safe for concurrent
# access). This creates a dedicated "keycloak" database + role in the same
# Postgres instance so Keycloak can run with --db=postgres.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DO \$\$
    BEGIN
        IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'keycloak') THEN
            CREATE ROLE keycloak WITH LOGIN PASSWORD '${KEYCLOAK_DB_PASSWORD}'
                NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE;
        ELSE
            ALTER ROLE keycloak WITH PASSWORD '${KEYCLOAK_DB_PASSWORD}';
        END IF;
    END
    \$\$;
EOSQL

# CREATE DATABASE cannot run inside a DO block / transaction, and has no
# "IF NOT EXISTS" — check first.
EXISTS=$(psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" -tAc \
    "SELECT 1 FROM pg_database WHERE datname = 'keycloak'")
if [ "$EXISTS" != "1" ]; then
    psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
        -c "CREATE DATABASE keycloak OWNER keycloak"
fi
