#!/bin/sh
# Start-up for the single-container image. `set -e` stops the container on any
# failing step rather than serving a half-configured app.
set -e

echo "[entrypoint] Applying migrations..."
python manage.py migrate --noinput

# Cache table for the rate limiter. Harmless no-op when REDIS_URL is set.
python manage.py createcachetable

echo "[entrypoint] Collecting static (SPA bundle + admin)..."
python manage.py collectstatic --noinput

echo "[entrypoint] Starting gunicorn on :${PORT}"
exec gunicorn petphysio.wsgi:application \
    --bind "0.0.0.0:${PORT}" \
    --workers "${WEB_CONCURRENCY:-2}" \
    --timeout 120 \
    --access-logfile - \
    --error-logfile -
