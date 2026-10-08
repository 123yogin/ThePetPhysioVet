/**
 * Build-time SEO regression guard. Exits non-zero on failure, so it can gate CI.
 *
 * The most valuable thing this repo can own is not an audit document — it is the
 * check that makes the incident impossible next quarter. The failures it catches
 * are the ones that actually cost traffic: a staging noindex shipped to
 * production, an empty rendered page, a missing canonical, a sitemap that
 * disagrees with what was built, a page with no crawlable content.
 *
 * Run: npm run seo:check   (after npm run build)
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');

const errors = [];
const warnings = [];
const fail = (msg) => errors.push(msg);
const warn = (msg) => warnings.push(msg);

const TITLE_MIN = 25;
const TITLE_MAX = 60;
const DESC_MIN = 140;
const DESC_MAX = 160;
/** Content bytes inside #root below which a page is effectively empty. */
const MIN_ROOT_CONTENT = 1000;
/** Treatment pages are the service landing pages; below this they are thin. */
const MIN_TREATMENT_WORDS = 700;
/** Pages that must exist and be in the sitemap. */
const REQUIRED_URLS = ['/treatments/hydrotherapy', '/treatments/acupuncture'];

if (!existsSync(DIST)) {
  console.error('dist/ not found — run `npm run build` first.');
  process.exit(1);
}

function walkHtml(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walkHtml(full));
    else if (entry.endsWith('.html')) out.push(full);
  }
  return out;
}

const pages = walkHtml(DIST);
const first = (re, html) => (html.match(re) || [])[1];

const sitemapPath = join(DIST, 'sitemap.xml');
const robotsPath = join(DIST, 'robots.txt');
if (!existsSync(sitemapPath)) fail('sitemap.xml is missing from dist/');
if (!existsSync(robotsPath)) fail('robots.txt is missing from dist/');

const sitemap = existsSync(sitemapPath) ? readFileSync(sitemapPath, 'utf8') : '';
const robots = existsSync(robotsPath) ? readFileSync(robotsPath, 'utf8') : '';
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);

// A production build must never ship a site-wide crawl block. This is the single
// most common catastrophic migration mistake.
if (/^\s*User-agent:\s*\*\s*$[\r\n]+\s*Disallow:\s*\/\s*$/m.test(robots)) {
  fail('robots.txt blocks all crawling (User-agent: * / Disallow: /) — check SITE.indexable.');
}

const titles = new Map();
const descriptions = new Map();
const canonicals = new Set();

for (const file of pages) {
  const rel = `/${relative(DIST, file).replace(/\\/g, '/')}`;
  const html = readFileSync(file, 'utf8');
  const is404 = rel === '/404.html';

  // ── Third-party hosts: images and fonts are self-hosted ──
  // Hotlinked art can vanish or be swapped by its host, and every external
  // origin is an extra connection and a privacy-policy entry.
  for (const host of ['googleusercontent.com', 'fonts.googleapis.com', 'fonts.gstatic.com']) {
    if (html.includes(host)) fail(`${rel}: references third-party host ${host} — self-host it under /photos or /fonts.`);
  }

  // ── Rendered content: the check that catches an empty SPA shell ──
  // Vite hoists the module script into <head>, so #root runs to </body>. A volume
  // heuristic is enough here: the failure being guarded against is "empty shell",
  // not a precise DOM boundary.
  const root = first(/<div id="root">([\s\S]*)<\/body>/i, html) ?? '';
  const text = root.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < MIN_ROOT_CONTENT) {
    fail(`${rel}: only ${text.length} chars of rendered text inside #root — page is effectively empty to an HTML-only crawler.`);
  }

  // ── Title ──
  const title = first(/<title>([\s\S]*?)<\/title>/i, html);
  if (!title) fail(`${rel}: missing <title>`);
  else {
    // Length is what the SERP shows, so count "&amp;" as one character.
    const shown = title.replace(/&amp;/g, '&').length;
    if (shown > TITLE_MAX) fail(`${rel}: title ${shown} chars (>${TITLE_MAX}) — will be truncated.`);
    if (title.length < TITLE_MIN) warn(`${rel}: title only ${title.length} chars — under-using the space.`);
    // Same word-stem twice ("Rehab ... Rehabilitation") reads as keyword stuffing.
    // The brand suffix is stripped first: "Physiotherapy ... The Pet Physio Vet" is
    // the brand, not a repeat.
    const stems = new Map();
    for (const word of title.replace(/&amp;/g, '&').replace(/\|\s*The Pet Physio Vet\s*$/i, '').toLowerCase().match(/[a-z]{5,}/g) ?? []) {
      const stem = word.slice(0, 5);
      if (stems.has(stem) && stems.get(stem) !== word) fail(`${rel}: title repeats the word stem "${stem}" ("${stems.get(stem)}" / "${word}")`);
      else if (stems.has(stem)) fail(`${rel}: title repeats "${word}"`);
      stems.set(stem, word);
    }
    // Condition and treatment pages are local-intent pages.
    if (/^\/(conditions|treatments)\//.test(rel) && !/ahmedabad/i.test(title)) {
      fail(`${rel}: title lacks "Ahmedabad" — condition/treatment pages must carry the locality.`);
    }
    if (titles.has(title)) fail(`${rel}: duplicate title, also on ${titles.get(title)}`);
    else titles.set(title, rel);
  }
  if ((html.match(/<title>/gi) || []).length > 1) fail(`${rel}: more than one <title> tag`);

  // ── Description ──
  const desc = first(/<meta name="description" content="([^"]*)"/i, html);
  if (!desc) fail(`${rel}: missing meta description`);
  else {
    if (desc.length > DESC_MAX) fail(`${rel}: description ${desc.length} chars (>${DESC_MAX})`);
    if (desc.length < DESC_MIN) warn(`${rel}: description only ${desc.length} chars (target ${DESC_MIN}-${DESC_MAX}).`);
    if (descriptions.has(desc)) fail(`${rel}: duplicate description, also on ${descriptions.get(desc)}`);
    else descriptions.set(desc, rel);
  }

  // ── Canonical ──
  const canonical = first(/<link rel="canonical" href="([^"]*)"/i, html);
  if (is404) {
    // An error page claims no canonical URL and describes no entity (live QA D8).
    if (canonical) fail('/404.html must not carry a canonical link');
    if (/application\/ld\+json/i.test(html)) fail('/404.html must not carry JSON-LD');
  } else if (!canonical) fail(`${rel}: missing canonical`);
  else {
    if (!/^https:\/\//.test(canonical)) fail(`${rel}: canonical is not an absolute https URL (${canonical})`);
    if (!is404 && canonicals.has(canonical)) fail(`${rel}: canonical ${canonical} is claimed by another page too`);
    canonicals.add(canonical);
    if (!is404 && sitemapUrls.length && !sitemapUrls.includes(canonical)) {
      fail(`${rel}: canonical ${canonical} is not in sitemap.xml`);
    }
  }

  // ── Robots ──
  const robotsMeta = first(/<meta name="robots" content="([^"]*)"/i, html);
  if (!robotsMeta) fail(`${rel}: missing robots meta`);
  else if (!is404 && /noindex/i.test(robotsMeta)) {
    fail(`${rel}: page is noindex but is a production route — staging tag shipped?`);
  } else if (is404 && !/noindex/i.test(robotsMeta)) {
    fail('/404.html should be noindex');
  }

  // ── Treatment pages: depth. A warning, not a failure -- thin pages still index. ──
  if (/^\/treatments\//.test(rel)) {
    const words = text.split(' ').filter(Boolean).length;
    if (words < MIN_TREATMENT_WORDS) warn(`${rel}: ${words} words in #root (target >= ${MIN_TREATMENT_WORDS}).`);
  }

  // ── Headings ──
  const h1s = (html.match(/<h1[\s>]/gi) || []).length;
  if (h1s === 0) fail(`${rel}: no <h1>`);
  if (h1s > 1) warn(`${rel}: ${h1s} <h1> elements — one per page is clearer for extraction.`);

  // ── Structured data ──
  const ld = first(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/, html);
  if (!ld) {
    if (!is404) fail(`${rel}: no JSON-LD block`);
  } else {
    try {
      const parsed = JSON.parse(ld.replace(/\\u003c/g, '<'));
      if (!parsed['@context']) fail(`${rel}: JSON-LD missing @context`);
      if (!Array.isArray(parsed['@graph']) || !parsed['@graph'].length) fail(`${rel}: JSON-LD @graph empty`);
    } catch (error) {
      fail(`${rel}: JSON-LD does not parse — ${error.message}`);
    }
  }

  // ── Open Graph ──
  // The 404 template has no URL of its own, so no og:url either.
  for (const prop of ['og:title', 'og:description', ...(is404 ? [] : ['og:url']), 'og:image', 'og:type']) {
    if (!html.includes(`property="${prop}"`)) fail(`${rel}: missing ${prop}`);
  }

  // ── Images: dimensions prevent layout shift ──
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const undimensioned = imgs.filter((tag) => !/\bwidth=/.test(tag) || !/\bheight=/.test(tag));
  if (undimensioned.length) {
    warn(`${rel}: ${undimensioned.length}/${imgs.length} <img> without width+height — CLS risk.`);
  }
  const noAlt = imgs.filter((tag) => !/\balt=/.test(tag));
  if (noAlt.length) fail(`${rel}: ${noAlt.length} <img> without an alt attribute`);
}

// ── Home page must say what / where / who in plain words ──
const homeFile = join(DIST, 'index.html');
if (existsSync(homeFile)) {
  const homeHtml = readFileSync(homeFile, 'utf8');
  const h1 = (first(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i, homeHtml) ?? '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (!/physiotherapy/i.test(h1) || !/ahmedabad/i.test(h1)) {
    fail(`/: <h1> must name the service and the city (Physiotherapy + Ahmedabad); got "${h1}"`);
  }
  const homeTitle = first(/<title[^>]*>([^<]*)<\/title>/i, homeHtml) ?? '';
  if (!homeTitle.includes('The Pet Physio Vet')) {
    fail(`/: <title> must contain the brand "The Pet Physio Vet"; got "${homeTitle}"`);
  }
}

// ── Required dedicated service pages must be in the sitemap ──
for (const path of REQUIRED_URLS) {
  if (!sitemapUrls.some((u) => new URL(u).pathname === path)) fail(`sitemap.xml does not list ${path}`);
}

// ── Sitemap must match what was actually built ──
for (const url of sitemapUrls) {
  const path = new URL(url).pathname;
  const expected = path === '/' ? join(DIST, 'index.html') : join(DIST, path.replace(/^\//, ''), 'index.html');
  if (!existsSync(expected)) fail(`sitemap lists ${url} but ${relative(DIST, expected)} was not generated`);
}
if (sitemapUrls.length && !robots.includes('Sitemap:')) fail('robots.txt does not reference the sitemap');

// ── Placeholder audit: everything is demo data until these change ──
const configSrc = readFileSync(join(ROOT, 'src/seo/siteConfig.ts'), 'utf8');
const placeholders = (configSrc.match(/PLACEHOLDER\(/g) || []).length;
if (placeholders) {
  warn(`src/seo/siteConfig.ts still has ${placeholders} PLACEHOLDER() values — replace them with real business data before launch (see SEO.md).`);
}
if (configSrc.includes("origin: PLACEHOLDER('https://www.petphysiovet.com')")) {
  warn('SITE.origin is still the placeholder domain — every canonical, OG url and sitemap entry points at it.');
}
if (/sameAs: PLACEHOLDER\(\[\s*(\/\/[^\n]*\n\s*)*\]\)/.test(configSrc)) {
  warn('SITE.sameAs is empty — no external profiles to resolve the brand as an entity.');
}
if (configSrc.includes("logo: PLACEHOLDER('')")) warn('SITE.images.logo is empty — no logo in Organization schema.');
if (configSrc.includes("ogImage: PLACEHOLDER('')")) warn('SITE.images.ogImage is empty — social shares fall back to the hero image.');
if (configSrc.includes("google: PLACEHOLDER('')")) warn('No Google Search Console verification token set.');
if (configSrc.includes("bing: PLACEHOLDER('')")) warn('No Bing Webmaster Tools token set — Bing is the index behind ChatGPT Search and Copilot.');

// ── Report ──
console.log(`\nSEO check — ${pages.length} pages, ${sitemapUrls.length} sitemap URLs\n`);
if (warnings.length) {
  console.log(`Warnings (${warnings.length}):`);
  warnings.forEach((w) => console.log(`  ! ${w}`));
  console.log('');
}
if (errors.length) {
  console.log(`Errors (${errors.length}):`);
  errors.forEach((e) => console.log(`  ✗ ${e}`));
  console.log('\nSEO check FAILED\n');
  process.exit(1);
}
console.log('All checks passed ✓\n');
