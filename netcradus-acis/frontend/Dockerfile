# Build context must be the repo root (netcradus-acis/) so the nginx template
# under infra/docker/ is reachable — see docker-compose.prod.yml.
#
# node:18-alpine reached Node.js upstream end-of-life 2025-04-30 (no more
# security patches at all) - found during a container-hardening review.
# This is a build-stage-only image (discarded after `npm run build`, never
# part of the final nginx runtime image below), so the real exposure was
# lower than it looks, but an EOL base with known-unpatched CVEs has no
# reason to stick around. 22 is the current Active LTS line.
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm install
COPY frontend/ .

# Vite inlines VITE_* variables into the static bundle at BUILD time, so they
# must arrive as build args (docker-compose `build.args`), not just runtime
# container env vars, which would have no effect on an already-built bundle.
ARG VITE_KEYCLOAK_URL=http://localhost:8180
ARG VITE_KEYCLOAK_REALM=acis
ARG VITE_KEYCLOAK_CLIENT_ID=acis-frontend
ENV VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL} \
    VITE_KEYCLOAK_REALM=${VITE_KEYCLOAK_REALM} \
    VITE_KEYCLOAK_CLIENT_ID=${VITE_KEYCLOAK_CLIENT_ID}

RUN npm run build

FROM nginx:1.25-alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Rendered via nginx's built-in docker-entrypoint templating (envsubst) at
# container start, using the GATEWAY_UPSTREAM env var — e.g. http://gateway:8080
# in docker-compose — so /api and /ws reach the real backend instead of 404ing.
COPY infra/docker/nginx.conf.template /etc/nginx/templates/default.conf.template

# The master process (config parsing, binding port 80) starts as root — this
# is the official nginx image's own documented default and is required to
# bind a privileged (<1024) port at all. The WORKER processes, which handle
# every real client request, already drop to the unprivileged built-in
# "nginx" user via this base image's default `user nginx;` directive - no
# request is ever actually served as root. Moving the master process off
# root too would mean a coordinated change across this file, nginx.conf.template's
# listen port, and docker-compose.prod.yml/Caddyfile's proxied port, which
# needs testing against the real prod proxy chain (Caddy -> nginx -> gateway)
# rather than changed blind - flagged as a real, low-severity, deferred
# hardening item during the production-readiness audit.
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
