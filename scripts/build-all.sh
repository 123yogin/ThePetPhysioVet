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


# ROUTING NOTE (see vercel.json "rewrites")
# -----------------------------------------
# The doctor SPA needs a fallback: /app/login, /app/enquiries and the rest
# exist only in the client router, so every /app/* path rewrites to
# /app/index.html. vercel.json does that.
#
# The marketing site must NOT have one. `npm run prerender` writes a real HTML
# file for every route below, and Vercel checks the filesystem before applying
# rewrites, so those files are served directly -- a catch-all never handled a
# real page. What it did handle was every path that does not exist, answering
# with the homepage at HTTP 200 and `robots: index, follow`.
#
# That soft 404 became load-bearing when three fabricated clinician profiles
# were deleted: /team/sarah-jenkins and friends kept returning 200 with page
# content, so a search engine holding those URLs would see live pages instead
# of a removal. Measured against production first -- every invented path,
# /no-such-page-xyz included, returned 200.
#
# With no catch-all, Vercel serves the prerendered file when one exists and
# falls back to dist/404.html with a real 404 when one does not. If you add a
# client-only route to the marketing site, prerender it; do not reinstate the
# catch-all.

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
