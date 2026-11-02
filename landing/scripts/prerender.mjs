/**
 * Static prerender + SEO file generation.
 *
 * Why this exists (the single highest-impact SEO fix in this repo):
 * the app was a pure client-side SPA shipping an empty <div id="root">, so the
 * raw HTML contained none of the clinic's content. Googlebot renders JavaScript
 * but does so in a deferred, rate-limited, failure-prone second pass — and the
 * AI crawler tier largely does not execute JavaScript at all. An HTML-only
 * fetcher saw an empty page.
 *
 * This step renders every route in the registry to real HTML at build time, so
 * the content is in the first byte of the response for every crawler.
 *
 * Run: node scripts/prerender.mjs   (wired into `npm run build`)
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const SSR_DIST = join(ROOT, '.ssr');

const log = (msg) => process.stdout.write(`  ${msg}\n`);

function loadTemplate() {
  const templatePath = join(DIST, 'index.html');
  if (!existsSync(templatePath)) {
    throw new Error('dist/index.html missing — run `vite build` before prerendering.');
  }
  return readFileSync(templatePath, 'utf8');
}

/** Replace that FAILS LOUDLY if the pattern isn't found. The head/body injections
 *  are exact-string matches against Vite's index.html; if that template ever
 *  changes shape (an attribute on <div id="root">, different <head> casing) a
 *  silent no-op would ship an empty #root at HTTP 200 on every route — the exact
 *  SEO catastrophe this prerender exists to prevent. Better to break the build. */
function mustReplace(html, pattern, replacement, label) {
  const out = html.replace(pattern, replacement);
  if (out === html) {
    throw new Error(
      `prerender: "${label}" replacement matched nothing — index.html structure changed. ` +
        `Aborting so we never ship empty prerendered pages.`,
    );
  }
  return out;
}

/** Inject generated head tags and rendered markup into the built client template. */
function composePage(template, { head, body, lang }) {
  let html = template;

  // Replace the build-time <title> so the generated, per-route one is the only title.
  html = html.replace(/<title>[\s\S]*?<\/title>\s*/i, '');

  // These two are load-bearing (head tags + the rendered app), so assert they hit.
  html = mustReplace(html, '<head>', `<head>\n    ${head}`, '<head> injection');
  // email_off stops Cloudflare's Email Obfuscation rewriting mailto links into
  // /cdn-cgi/l/email-protection hrefs, which 404 for every non-JS crawler and
  // pull a render-blocking decoder script into every page.
  html = mustReplace(
    html,
    '<div id="root"></div>',
    `<!--email_off--><div id="root">${body}</div><!--/email_off-->`,
    '#root body injection',
  );
  html = html.replace(/<html([^>]*)lang="[^"]*"/i, `<html$1lang="${lang}"`);

  return html;
}

async function main() {
  const template = loadTemplate();

  const entryUrl = pathToFileURL(join(SSR_DIST, 'entry-server.js')).href;
  const mod = await import(entryUrl);
  const {
    SITE,
    indexableRoutes,
    getPageMeta,
    render,
    renderHeadHtml,
    buildRobotsTxt,
    buildSitemapXml,
    buildLlmsTxt,
    buildLlmsFullTxt,
    CONTENT_UPDATED_DATE,
  } = mod;

  const routes = indexableRoutes();
  log(`Prerendering ${routes.length} routes from the registry…`);

  let rendered = 0;
  const fingerprints = new Map();
  for (const route of routes) {
    const body = render(route.path);
    const head = renderHeadHtml(route.path);
    const html = composePage(template, { head, body, lang: SITE.lang });

    const outPath =
      route.path === '/' ? join(DIST, 'index.html') : join(DIST, route.path.replace(/^\//, ''), 'index.html');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, 'utf8');

    const meta = getPageMeta(route.path);
    fingerprints.set(route.path, contentFingerprint(body, meta));
    log(`✓ ${route.path.padEnd(34)} ${String(meta.title.length).padStart(2)}ch title · ${String(meta.description.length).padStart(3)}ch desc`);
    rendered += 1;
  }

  // 404 page — prerendered as a real template but excluded from the sitemap and
  // marked noindex,follow by the metadata layer.
  const notFoundHtml = composePage(template, {
    body: render('/__not-found__'),
    head: renderHeadHtml('/__not-found__'),
    lang: SITE.lang,
  });
  writeFileSync(join(DIST, '404.html'), notFoundHtml, 'utf8');
  log('✓ /404.html (noindex, follow)');

  // Per-page lastmod: the date each page's visible content last changed, not
  // the build date. See updateLastmodManifest().
  const lastmodByPath = updateLastmodManifest(fingerprints, CONTENT_UPDATED_DATE);

  writeFileSync(join(DIST, 'robots.txt'), buildRobotsTxt(), 'utf8');
  writeFileSync(
    join(DIST, 'sitemap.xml'),
    buildSitemapXml((path) => lastmodByPath.get(path) ?? CONTENT_UPDATED_DATE),
    'utf8',
  );
  writeFileSync(join(DIST, 'llms.txt'), buildLlmsTxt(), 'utf8');
  writeFileSync(join(DIST, 'llms-full.txt'), buildLlmsFullTxt(), 'utf8');
  log('✓ robots.txt · sitemap.xml · llms.txt · llms-full.txt');

  rmSync(SSR_DIST, { recursive: true, force: true });

  log('');
  log(`Done: ${rendered} indexable routes + 404, origin ${SITE.origin}`);
  if (!SITE.indexable) {
    log('⚠  SITE.indexable is false — output is noindex and robots.txt blocks everything.');
  }
}

main().catch((error) => {
  console.error('\nPrerender failed:\n', error);
  process.exit(1);
});

/* ── Per-page lastmod ─────────────────────────────────────────────────────────
 *
 * src/seo/lastmod.json maps each route to { date, hash }. `hash` fingerprints
 * what a searcher or crawler would call the page's content: its visible text,
 * the links it makes, and its <title> and meta description. Class names, asset
 * hashes and layout markup are excluded on purpose, so a CSS tweak or a rebuilt
 * bundle does not move the date and teach Google that lastmod lies.
 *
 * On a local build the manifest is rewritten: a page whose fingerprint changed
 * gets today's date (Asia/Kolkata). Commit the updated manifest with the change.
 * On Vercel (VERCEL set) the file is not written; a changed page still gets
 * today's date in the sitemap, and the build log names the pages whose manifest
 * entry is stale so the drift is visible. Routes missing from the manifest fall
 * back to CONTENT_UPDATED_DATE rather than today, so adding this did not stamp
 * every existing page as new.
 */
function contentFingerprint(bodyHtml, meta) {
  const text = bodyHtml
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/g, ' ')
    .replace(/<a\b[^>]*\bhref="([^"]*)"[^>]*>/g, ' [$1] ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, (e) => e.toLowerCase())
    .replace(/\s+/g, ' ')
    .trim();
  return createHash('sha256')
    .update(`${meta.title}\n${meta.description}\n${text}`)
    .digest('hex')
    .slice(0, 16);
}

function todayInIndia() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function updateLastmodManifest(fingerprints, fallbackDate) {
  const manifestPath = join(ROOT, 'src', 'seo', 'lastmod.json');
  const previous = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, 'utf8')) : {};
  const today = todayInIndia();
  const next = {};
  const changed = [];
  for (const [path, hash] of fingerprints) {
    const prior = previous[path];
    if (prior && prior.hash === hash) {
      next[path] = prior;
    } else {
      next[path] = { date: prior ? today : fallbackDate, hash };
      if (prior) changed.push(path);
    }
  }
  const dates = new Map(Object.entries(next).map(([path, entry]) => [path, entry.date]));
  const stale = JSON.stringify(next, null, 2) + '\n' !== (existsSync(manifestPath) ? readFileSync(manifestPath, 'utf8') : '');
  if (process.env.VERCEL) {
    if (stale) log(`⚠ src/seo/lastmod.json is stale for: ${changed.join(', ') || 'new routes'} -- run a local build and commit it`);
  } else if (stale) {
    writeFileSync(manifestPath, JSON.stringify(next, null, 2) + '\n', 'utf8');
    log(`✓ lastmod.json updated${changed.length ? ` -- content changed: ${changed.join(', ')}` : ''}`);
  }
  return dates;
}
