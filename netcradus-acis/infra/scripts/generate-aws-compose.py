#!/usr/bin/env python
"""
Generates docker-compose.aws.yml from docker-compose.prod.yml.

Why a generated, standalone file rather than a docker-compose override
file: docker compose override files can only ADD or OVERWRITE keys via
merge, never DELETE one - and every DB-touching service in
docker-compose.prod.yml has a `depends_on: postgres: condition:
service_healthy` entry that would leave those services refusing to start
(their depends_on target no longer exists) if postgres is simply dropped
via an override. So instead: parse the real, raw compose file (${VAR}
references stay as literal, uninterpolated strings - this is a plain
YAML parse, not `docker compose config`, which would bake in this
machine's local .env values), remove exactly the 3 services this AWS
architecture replaces (postgres/postgres-exporter -> real RDS; caddy ->
the ALB's own TLS termination), strip the now-dangling `depends_on:
postgres` key from every other service, and republish frontend/keycloak/
grafana's ports directly to the host (previously `expose:`-only,
internal-only, since Caddy used to be the one thing reaching them -
now the ALB's target groups need to reach the host ports directly).

Everything else in the file is untouched.

ECR mode: if the ECR_REGISTRY env var is set (e.g.
"113058466902.dkr.ecr.ap-south-1.amazonaws.com"), every `acis/<service>`
image reference is rewritten to `<ECR_REGISTRY>/acis/<service>`, keeping
the same `${IMAGE_TAG:-latest}` suffix convention. This is what the CI/CD
pipeline uses (infra/scripts/aws-remote-deploy-ecr.sh pulls pre-built,
pre-scanned images instead of building on the instance); the manual
deploy-to-aws.sh path leaves ECR_REGISTRY unset and keeps building
on-host exactly as before - no change to that existing, already-proven
flow.
"""
import os
import re
import sys
import yaml

SRC = "docker-compose.prod.yml"
DST = "docker-compose.aws.yml"
ECR_REGISTRY = os.environ.get("ECR_REGISTRY", "").strip()

REMOVE_SERVICES = {"postgres", "caddy"}
PUBLISH_PORTS = {
    "frontend": ["80:80"],
    "keycloak": ["8080:8080"],
    "grafana": ["3000:3000"],
}


def main():
    with open(SRC, "r", encoding="utf-8") as f:
        compose = yaml.safe_load(f)

    services = compose["services"]

    for name in REMOVE_SERVICES:
        services.pop(name, None)

    if ECR_REGISTRY:
        for name, svc in services.items():
            image = svc.get("image", "")
            if isinstance(image, str) and image.startswith("acis/"):
                svc["image"] = re.sub(r"^acis/", f"{ECR_REGISTRY}/acis/", image)
                # ECR mode pulls pre-built images (CI already built, scanned,
                # and pushed them) - no `build:` section needed, and none of
                # the Dockerfile build contexts are even present on the
                # instance for this deploy path (aws-remote-deploy-ecr.sh
                # only ships this one generated file, not the full repo).
                svc.pop("build", None)

    for name, svc in services.items():
        deps = svc.get("depends_on")
        if isinstance(deps, dict) and "postgres" in deps:
            del deps["postgres"]
            if not deps:
                del svc["depends_on"]
        elif isinstance(deps, list) and "postgres" in deps:
            deps.remove("postgres")
            if not deps:
                del svc["depends_on"]

    for name, ports in PUBLISH_PORTS.items():
        if name in services:
            services[name].pop("expose", None)
            services[name]["ports"] = ports

    # Real RDS connection - overrides the hardcoded DB_HOST: postgres each
    # of these services had.
    db_services = [
        "alerts", "log-service", "correlation", "ingestion", "soar",
        "asset-service", "platform-admin", "threat-service",
    ]
    for name in db_services:
        if name in services and "environment" in services[name]:
            services[name]["environment"]["DB_HOST"] = "${DB_HOST_RDS}"

    # postgres-exporter (DB health monitoring) stays, repointed at RDS
    # instead of the now-removed local postgres container - found missing
    # during a live monitoring-verification pass against the real AWS
    # deployment (Prometheus showed it as a dangling/down target
    # otherwise). RDS supports SSL, so sslmode=require rather than the
    # local deployment's disable.
    # backup service also hardcoded PGHOST: postgres / PGUSER: acis (the
    # local superuser bootstrap name) - same gap as postgres-exporter,
    # found the same way. RDS's master username is acis_admin (see
    # infra/terraform/rds.tf), not acis.
    if "backup" in services and "environment" in services["backup"]:
        services["backup"]["environment"]["PGHOST"] = "${DB_HOST_RDS}"
        services["backup"]["environment"]["PGUSER"] = "acis_admin"

    if "postgres-exporter" in services:
        services["postgres-exporter"]["environment"]["DATA_SOURCE_URI"] = (
            "${DB_HOST_RDS}:5432/${DB_NAME:-acis}?sslmode=require"
        )

    # Keycloak's --db-url-host is a CLI flag, not an env var - the whole
    # `command:` block needs to be redeclared with the real RDS host.
    # --hostname is the full public URL (Keycloak 26 "hostname v2" - see
    # docker-compose.prod.yml's own Keycloak service comment for why
    # --hostname-port no longer exists as a separate flag).
    if "keycloak" in services:
        services["keycloak"]["command"] = (
            "start\n"
            "--hostname=https://${PUBLIC_APP_DOMAIN:-localhost}:8443\n"
            "--http-enabled=true\n"
            "--proxy-headers=xforwarded\n"
            "--db=postgres\n"
            "--db-url-host=${DB_HOST_RDS}\n"
            "--db-url-database=keycloak\n"
            "--db-username=keycloak\n"
            "--db-password=${KEYCLOAK_DB_PASSWORD:?Set KEYCLOAK_DB_PASSWORD in .env}\n"
        )

    # postgres_data / postgres-init were only meaningful for the
    # now-removed local postgres container.
    compose.get("volumes", {}).pop("postgres_data", None)
    compose.get("volumes", {}).pop("caddy_data", None)
    compose.get("volumes", {}).pop("caddy_config", None)

    usage_line = (
        "#   docker compose -f docker-compose.aws.yml pull && docker compose -f docker-compose.aws.yml up -d\n"
        if ECR_REGISTRY else
        "#   docker compose -f docker-compose.aws.yml up -d --build\n"
    )
    header = (
        "# GENERATED FILE - do not hand-edit. Regenerate with:\n"
        "#   python infra/scripts/generate-aws-compose.py\n"
        "# from docker-compose.prod.yml. See that script's own docstring for why\n"
        "# this is a generated standalone file rather than a compose override.\n"
        "#\n"
        f"# Image source: {'ECR (' + ECR_REGISTRY + ')' if ECR_REGISTRY else 'built on-host'}\n"
        "# Usage on the AWS app host:\n"
        f"{usage_line}"
        "#\n"
        "# Differences from docker-compose.prod.yml:\n"
        "#   - postgres / postgres-exporter removed - DB_HOST_RDS (real RDS\n"
        "#     endpoint) replaces the local postgres container everywhere it\n"
        "#     was referenced, including Keycloak's --db-url-host.\n"
        "#   - caddy removed - the ALB terminates TLS now; frontend/keycloak/\n"
        "#     grafana publish their real ports directly to the host instead.\n"
        "\n"
    )

    with open(DST, "w", encoding="utf-8") as f:
        f.write(header)
        yaml.dump(compose, f, default_flow_style=False, sort_keys=False, width=100)

    print(f"Wrote {DST}")


if __name__ == "__main__":
    main()
