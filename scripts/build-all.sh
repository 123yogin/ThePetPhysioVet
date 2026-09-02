#!/usr/bin/env bash
# Builds both front-ends into one static tree for a single Vercel deployment.
#
#   dist/          the marketing site  (owns "/")
#   dist/app/      the clinic SPA      (owns "/app/*")
#
# They stay separate projects — the marketing site is server-side rendered and
# prerendered for search engines, the clinic app is a plain SPA behind auth.
# Merging their outputs here is what lets them share one domain, which is what
# keeps the booking form same-origin with the API and avoids CORS entirely.
set -euo pipefail

echo "--- marketing site ---"
cd landing
npm ci
npm run build          # client + ssr + prerender
cd ..

echo "--- clinic app ---"
cd frontend
npm ci
# Assets must resolve under /app/, and react-router reads the same value as its
# basename via import.meta.env.BASE_URL.
APP_BASE=/app/ npm run build
cd ..

echo "--- merging ---"
rm -rf dist
cp -r landing/dist dist
cp -r frontend/dist dist/app

echo "dist/          $(find dist -maxdepth 1 -type f | wc -l | tr -d ' ') files"
echo "dist/app/      $(find dist/app -maxdepth 1 -type f | wc -l | tr -d ' ') files"
test -f dist/index.html     || { echo "FATAL: marketing index.html missing"; exit 1; }
test -f dist/app/index.html || { echo "FATAL: clinic app index.html missing"; exit 1; }
