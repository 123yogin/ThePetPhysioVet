#!/bin/sh
# Backend container entrypoint (CLAUDE.md rule 6: idempotent, fail loudly).
#
# Order matters: migrations must succeed before collectstatic (which is
# purely file I/O and cannot fail for DB reasons), and both must succeed
# before gunicorn ever binds a port — we never want to serve traffic against
# an un-migrated database. `set -e` means the very first non-zero exit stops
# the script (and therefore the container) before `exec "$@"` is reached.
set -eu

# The container starts as root (see Dockerfile) so it can fix ownership of
# the `media_data` named volume (docker-compose.yml) on every boot — a
# freshly-created named volume's initial ownership is controlled by
# Docker/the host, not this image, and is not guaranteed to be `appuser`.
# Once that's fixed, re-exec this same script as the unprivileged `appuser`
# — everything below this block, including the app process itself, runs
# unprivileged.
if [ "$(id -u)" = "0" ]; then
    mkdir -p /app/media /app/staticfiles
    chown -R appuser:appuser /app/media /app/staticfiles
    exec runuser -u appuser -- "$0" "$@"
fi

echo "[entrypoint] Applying database migrations..."
python manage.py migrate --noinput
echo "[entrypoint] Migrations applied."

echo "[entrypoint] Collecting static files..."
python manage.py collectstatic --noinput
echo "[entrypoint] Static files collected."

echo "[entrypoint] Starting: $*"
exec "$@"
