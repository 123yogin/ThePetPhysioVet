"""Vercel entrypoint: exposes the Django WSGI application as a serverless function.

Vercel's Python runtime looks for a module-level `app` (or `handler`) in files
under `api/`. Django lives in `backend/`, not the repository root, so that
directory is put on `sys.path` before the settings module is imported.

Everything under /api/* is rewritten to this function by vercel.json; the React
build is served as static files from the same domain, which keeps the SPA and
the API same-origin exactly as the nginx topology does.
"""

import os
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(BACKEND))

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "petphysio.settings")

from django.core.wsgi import get_wsgi_application  # noqa: E402

app = get_wsgi_application()
