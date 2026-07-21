# Build context must be the repo root (netcradus-acis/) so the nginx template
# under infra/docker/ is reachable — see docker-compose.prod.yml.
FROM node:18-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci
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

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
