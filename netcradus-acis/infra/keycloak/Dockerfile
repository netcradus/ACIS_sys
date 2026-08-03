# Custom Keycloak image: stock quay.io/keycloak/keycloak:24.0 plus the
# acis-async-reset-email SPI provider (closes the VAPT M-03 timing-based
# user-enumeration side channel in the password-reset flow — see
# infra/keycloak/providers/acis-async-reset-email).
#
# Build context is the repo root (matches the pattern used by every other
# service in docker-compose.*.yml, e.g. frontend/Dockerfile), so paths below
# are relative to repo root. Multi-stage: the provider JAR is built from
# source in-container, so a fresh `git pull` + `docker compose build` is
# self-contained — no manual pre-build step, no committed build artifacts.

FROM maven:3.9-eclipse-temurin-17 AS provider-build
WORKDIR /build
COPY infra/keycloak/providers/acis-async-reset-email/pom.xml ./pom.xml
COPY infra/keycloak/providers/acis-async-reset-email/src ./src
RUN mvn -B -q clean package

FROM quay.io/keycloak/keycloak:24.0
COPY --from=provider-build /build/target/acis-async-reset-email.jar /opt/keycloak/providers/acis-async-reset-email.jar

# Pre-scans providers into the image so the new authenticator is registered
# without a slower first-boot re-augmentation. Runtime flags (--db, hostname,
# etc.) are still supplied via `start` at container start, same as before —
# this only affects provider discovery, not runtime configuration.
RUN /opt/keycloak/bin/kc.sh build
