# syntax=docker/dockerfile:1
#
# Multi-stage build for the React (Vite) doctor SPA, served by nginx.
# Both node:20-alpine and nginx:1.27-alpine are official multi-arch images
# (linux/amd64 + linux/arm64), so this builds unmodified with
# `docker buildx build --platform linux/amd64,linux/arm64 .`.

##############################
# Stage 1: build the SPA bundle
##############################
FROM node:20-alpine AS build

WORKDIR /app

# Install deps first so this layer is cached across source-only changes.
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

##############################
# Stage 2: serve the static bundle via nginx
##############################
FROM nginx:1.27-alpine AS runtime

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:80/ >/dev/null || exit 1

# nginx's own base image already runs as root by default but drops to the
# unprivileged `nginx` user for the worker processes; the official image's
# entrypoint/CMD are kept as-is (no override needed here).
