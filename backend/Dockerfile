# syntax=docker/dockerfile:1
#
# Multi-stage build for the Django API (petphysio). Builds cleanly for both
# linux/amd64 and linux/arm64 (e.g. `docker buildx build --platform
# linux/amd64,linux/arm64 .`) — every base image below (python:3.12-slim) and
# every pinned dependency (gunicorn, whitenoise, psycopg[binary], Pillow,
# bcrypt) ships prebuilt wheels for both architectures, so no QEMU emulation
# is needed to compile anything at build time.
#
# Base image choice: python:3.12-slim, not 3.14 (the local dev venv's
# version). Django==6.0.7 (pinned range in requirements.txt is
# Django>=5.0,<6.1) requires Python >= 3.12, so 3.12 is the floor; staying on
# 3.12 rather than jumping to 3.13/3.14 gets the most mature, widely
# available prebuilt-wheel coverage across architectures for the compiled
# dependencies here (psycopg[binary], Pillow, bcrypt) as of this writing,
# without giving up anything the app needs.

##############################
# Stage 1: build dependencies
##############################
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# build-essential covers the rare sdist fallback (e.g. a platform/version
# combo with no prebuilt wheel yet) for bcrypt/Pillow. psycopg[binary]
# bundles its own libpq, so no libpq-dev / postgresql headers are needed.
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential \
    && rm -rf /var/lib/apt/lists/*

# A real venv (not `pip install --user`) so dependency resolution is a plain
# $PATH lookup at runtime — independent of which user/HOME is active. That
# matters because the container drops root -> `appuser` at startup (see
# entrypoint.sh) and `docker compose exec` sessions default back to root;
# `pip install --user` resolves against $HOME at *runtime*, which differs
# between those, and silently breaks one of them.
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /build
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

##############################
# Stage 2: runtime image
##############################
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app \
    DJANGO_SETTINGS_MODULE=petphysio.settings \
    PATH="/opt/venv/bin:$PATH"

# curl is only for the HEALTHCHECK below.
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 1000 --shell /usr/sbin/nologin appuser

WORKDIR /app

COPY --from=builder /opt/venv /opt/venv

# Application code. NOTE: this does NOT run `migrate` or `collectstatic` at
# build time — both happen in the entrypoint at container start, against
# whatever real database/volume the deployment wires up. Baking migrations
# into the image would apply them against no real DB (or, worse, a stale one
# baked into a cached layer) and is explicitly avoided here.
COPY --chown=appuser:appuser . .
COPY --chown=appuser:appuser docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh \
    && mkdir -p /app/staticfiles /app/media \
    && chown -R appuser:appuser /app/staticfiles /app/media

# NOTE: stays root here, not `USER appuser`. /app/media is a mount point for
# a named volume (docker-compose.yml) whose ownership on first creation is
# controlled by Docker/the host, not this image — the entrypoint chowns it
# to `appuser` on every container start (as root) and then drops privileges
# via `runuser` before the app itself ever runs. The app process (gunicorn)
# never runs as root.

EXPOSE 8000

# /admin/login/ is an always-200, unauthenticated, DB-touching (session
# middleware) Django view — a good cheap liveness/readiness probe without
# adding a bespoke health endpoint.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8000/admin/login/ -o /dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gunicorn", "petphysio.wsgi:application", "--bind", "0.0.0.0:8000", "--workers", "3", "--timeout", "60"]
