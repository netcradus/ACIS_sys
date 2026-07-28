# Multi-stage build for Netcradus ACIS Web Application & Gateway
FROM node:18-alpine AS builder

WORKDIR /app
COPY frontend/package.json ./frontend/
RUN cd frontend && npm install

COPY frontend ./frontend
RUN cd frontend && npm run build

FROM nginx:1.25-alpine
COPY --from=builder /app/frontend/dist /usr/share/nginx/html

# Nginx SPA configuration for React Router
RUN echo 'server { \
    listen 80; \
    location / { \
        root /usr/share/nginx/html; \
        index index.html index.htm; \
        try_files $uri $uri/ /index.html; \
    } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
