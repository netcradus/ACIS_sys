# Multi-stage build for Netcradus ACIS Web Application & Gateway
FROM node:18-alpine AS builder

WORKDIR /app
COPY netcradus-acis/frontend/package.json ./netcradus-acis/frontend/
RUN cd netcradus-acis/frontend && npm install

COPY netcradus-acis/frontend ./netcradus-acis/frontend

# Vite inlines VITE_* variables into the static bundle at BUILD time, so they
# must be present as environment variables during `npm run build`. DigitalOcean
# passes app-level BUILD_TIME variables in as Docker build args, which these
# ARG lines receive and the ENV lines then expose to the build step.
ARG VITE_KEYCLOAK_URL=http://localhost:8180
ARG VITE_KEYCLOAK_REALM=acis
ARG VITE_KEYCLOAK_CLIENT_ID=acis-frontend
ENV VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL} \
    VITE_KEYCLOAK_REALM=${VITE_KEYCLOAK_REALM} \
    VITE_KEYCLOAK_CLIENT_ID=${VITE_KEYCLOAK_CLIENT_ID}

RUN cd netcradus-acis/frontend && npm run build

FROM nginx:1.25-alpine
COPY --from=builder /app/netcradus-acis/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
