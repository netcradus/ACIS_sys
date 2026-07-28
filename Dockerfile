# Multi-stage build for Netcradus ACIS Web Application & Gateway
FROM node:18-alpine AS builder

WORKDIR /app
COPY netcradus-acis/frontend/package.json ./netcradus-acis/frontend/
RUN cd netcradus-acis/frontend && npm install

COPY netcradus-acis/frontend ./netcradus-acis/frontend
RUN cd netcradus-acis/frontend && npm run build

FROM nginx:1.25-alpine
COPY --from=builder /app/netcradus-acis/frontend/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
