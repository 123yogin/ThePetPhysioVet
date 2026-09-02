# syntax=docker/dockerfile:1
#
# Single-container image: React bundle + Django + gunicorn in one process.
#
# The normal topology (docker-compose.yml) is two containers, with nginx
# serving the SPA and proxying /api to gunicorn. Some hosts run exactly one
# container per app — Hugging Face Spaces, Fly machines, Cloud Run — so this
# image folds them together: the built bundle is collected into Django's
# static root and served by WhiteNoise, with a catch-all in petphysio/urls.py
# returning index.html for client-side routes. SERVE_SPA=true switches that
# on; the two-container images (backend/Dockerfile, frontend/Dockerfile) are
# unchanged and leave it off.
#
# Listens on 7860 — the port Hugging Face Spaces expects. Override with PORT.

##############################
# Stage 1 — build the SPA
##############################
FROM node:20-alpine AS spa

WORKDIR /spa
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

##############################
# Stage 2 — runtime
##############################
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=7860 \
    SERVE_SPA=true \
    SPA_DIST_DIR=/app/spa

# curl for the healthcheck, libpq for psycopg. No build toolchain needed:
# psycopg[binary] and Pillow both ship manylinux wheels.
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl libpq5 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY --from=spa /spa/dist /app/spa

# Spaces runs the container as UID 1000, and start-up writes the static
# manifest, the cache table and any media, so the tree must be owned by it.
RUN useradd -m -u 1000 appuser \
 && mkdir -p /app/media /app/staticfiles \
 && chown -R appuser:appuser /app

COPY --chown=appuser:appuser docker/entrypoint-single.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER appuser
EXPOSE 7860

# /api/v1/auth/me returns 401 unauthenticated, which still proves the stack is
# up; -f would treat that as failure, so check for any HTTP response instead.
HEALTHCHECK --interval=30s --timeout=5s --start-period=45s --retries=3 \
    CMD curl -sS -o /dev/null "http://127.0.0.1:${PORT}/api/v1/auth/me" || exit 1

ENTRYPOINT ["/entrypoint.sh"]
