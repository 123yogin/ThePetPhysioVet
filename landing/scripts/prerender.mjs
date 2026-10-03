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
  html = mustReplace(html, '<div id="root"></div>', `<div id="root">${body}</div>`, '#root body injection');
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
  } = mod;

  const routes = indexableRoutes();
  log(`Prerendering ${routes.length} routes from the registry…`);

  let rendered = 0;
  for (const route of routes) {
    const body = render(route.path);
    const head = renderHeadHtml(route.path);
    const html = composePage(template, { head, body, lang: SITE.lang });

    const outPath =
      route.path === '/' ? join(DIST, 'index.html') : join(DIST, route.path.replace(/^\//, ''), 'index.html');
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, 'utf8');

    const meta = getPageMeta(route.path);
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

  // Build date is used as lastmod for every URL. Once content is managed in a CMS
  // this should become a real per-page modification date.
  const lastmod = new Date().toISOString().split('T')[0];

  writeFileSync(join(DIST, 'robots.txt'), buildRobotsTxt(), 'utf8');
  writeFileSync(join(DIST, 'sitemap.xml'), buildSitemapXml(lastmod), 'utf8');
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
