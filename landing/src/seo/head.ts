/**
 * Head tag generation, used by BOTH render paths from one definition:
 *   • the prerender step serialises these to static HTML (scripts/prerender.mjs)
 *   • client-side navigation syncs the live DOM to the same values (useSeo)
 *
 * Having one generator is what stops the static HTML and the SPA drifting apart —
 * drift between what a crawler is served and what a user sees is the failure mode
 * that turns "prerendering" into "cloaking".
 */

import { SITE, absoluteUrl } from './siteConfig';
import { getPageMeta } from './metadata';
import { serializeGraph } from './schema';

export interface MetaTag {
  /** Attribute used to identify the tag for updates: name, property or httpEquiv. */
  key: 'name' | 'property';
  keyValue: string;
  content: string;
}

export interface HeadData {
  title: string;
  canonical: string;
  metas: MetaTag[];
  jsonLd: string;
}

export function buildHead(pathname: string): HeadData {
  const meta = getPageMeta(pathname);
  const metas: MetaTag[] = [
    { key: 'name', keyValue: 'description', content: meta.description },
    { key: 'name', keyValue: 'robots', content: meta.robots },

    // Open Graph
    { key: 'property', keyValue: 'og:type', content: meta.ogType },
    { key: 'property', keyValue: 'og:site_name', content: SITE.brandName },
    { key: 'property', keyValue: 'og:title', content: meta.title },
    { key: 'property', keyValue: 'og:description', content: meta.description },
    { key: 'property', keyValue: 'og:url', content: meta.canonical },
    { key: 'property', keyValue: 'og:locale', content: SITE.locale },
    { key: 'property', keyValue: 'og:image', content: meta.image },
    { key: 'property', keyValue: 'og:image:alt', content: meta.imageAlt },
    { key: 'property', keyValue: 'og:image:width', content: String(SITE.images.ogImageWidth) },
    { key: 'property', keyValue: 'og:image:height', content: String(SITE.images.ogImageHeight) },

    // Twitter/X
    { key: 'name', keyValue: 'twitter:card', content: 'summary_large_image' },
    { key: 'name', keyValue: 'twitter:title', content: meta.title },
    { key: 'name', keyValue: 'twitter:description', content: meta.description },
    { key: 'name', keyValue: 'twitter:image', content: meta.image },
    { key: 'name', keyValue: 'twitter:image:alt', content: meta.imageAlt },

    // Local relevance — geo meta is legacy, but it is cheap and still parsed by some
    // local aggregators. The authoritative signal is the JSON-LD GeoCoordinates.
    { key: 'name', keyValue: 'geo.region', content: `${SITE.address.addressCountry}-${SITE.address.addressRegion}` },
    { key: 'name', keyValue: 'geo.placename', content: SITE.address.addressLocality },
  ];

  if (SITE.verification.google) {
    metas.push({ key: 'name', keyValue: 'google-site-verification', content: SITE.verification.google });
  }
  if (SITE.verification.bing) {
    metas.push({ key: 'name', keyValue: 'msvalidate.01', content: SITE.verification.bing });
  }

  return { title: meta.title, canonical: meta.canonical, metas, jsonLd: serializeGraph(pathname) };
}

const escapeAttr = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

/** Serialise to HTML for the prerendered pages. */
export function renderHeadHtml(pathname: string): string {
  const head = buildHead(pathname);
  const lines = [
    `<title>${escapeAttr(head.title)}</title>`,
    `<link rel="canonical" href="${escapeAttr(head.canonical)}" />`,
    // Single-language site: a self-referencing hreflang plus x-default is the
    // correct, explicit signal (it tells search/AI engines the page targets this
    // language and is the default for all others), not an omission.
    `<link rel="alternate" hreflang="${escapeAttr(SITE.lang.toLowerCase())}" href="${escapeAttr(head.canonical)}" />`,
    `<link rel="alternate" hreflang="x-default" href="${escapeAttr(head.canonical)}" />`,
    ...head.metas.map((m) => `<meta ${m.key}="${m.keyValue}" content="${escapeAttr(m.content)}" />`),
    `<script type="application/ld+json">${head.jsonLd}</script>`,
  ];
  return lines.join('\n    ');
}

/**
 * Sync the live document head. Idempotent: tags this module owns are marked with
 * data-seo so a route change replaces exactly its own tags and nothing else.
 */
export function applyHead(pathname: string): void {
  if (typeof document === 'undefined') return;
  const head = buildHead(pathname);

  document.title = head.title;
  document.documentElement.lang = SITE.lang;

  const setMeta = (tag: MetaTag) => {
    const selector = `meta[${tag.key}="${tag.keyValue}"]`;
    let el = document.head.querySelector<HTMLMetaElement>(selector);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(tag.key, tag.keyValue);
      el.setAttribute('data-seo', 'managed');
      document.head.appendChild(el);
    }
    el.setAttribute('content', tag.content);
  };
  head.metas.forEach(setMeta);

  let canonical = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    canonical.setAttribute('data-seo', 'managed');
    document.head.appendChild(canonical);
  }
  canonical.href = head.canonical;

  let ld = document.head.querySelector<HTMLScriptElement>('script[type="application/ld+json"][data-seo="managed"]');
  if (!ld) {
    ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.setAttribute('data-seo', 'managed');
    document.head.appendChild(ld);
  }
  ld.textContent = head.jsonLd;
}

/** Preload hint for the LCP image of a given route. */
export function lcpPreloadHtml(imageUrl: string): string {
  return `<link rel="preload" as="image" href="${escapeAttr(absoluteUrl(imageUrl))}" fetchpriority="high" />`;
}
