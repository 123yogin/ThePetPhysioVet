/**
 * robots.txt / sitemap.xml / llms.txt builders.
 *
 * All three are generated from ROUTES + SITE at build time, so adding a condition
 * to clinicData.ts adds its sitemap entry automatically. Nothing here is a static
 * file checked into the repo — a hand-maintained sitemap drifts out of sync with
 * the routes, and a stale sitemap is worse than none.
 */

import { SITE, absoluteUrl } from './siteConfig';
import { indexableRoutes, matchRoute } from './routes';
import { getPageMeta } from './metadata';
import { CONDITIONS, SERVICES, SPECIALISTS, FAQS } from '../data/clinicData';
import { conditionFaqs } from '../data/conditionFaqs';
import { conditionPath, servicePath, specialistPath } from './routes';


/**
 * AI crawlers, split by purpose.
 *
 * Search/citation crawlers are the ones that can send traffic and cite the clinic
 * in an answer, so they are always allowed — blocking them removes the site from
 * the citation pool entirely. Training crawlers are a separate business decision,
 * toggled by SITE.allowAiTrainingCrawlers.
 */
export const AI_CRAWLERS = {
  search: ['OAI-SearchBot', 'Claude-SearchBot', 'PerplexityBot', 'Bingbot', 'Applebot'],
  training: ['GPTBot', 'ClaudeBot', 'anthropic-ai', 'Google-Extended', 'CCBot', 'Applebot-Extended', 'meta-externalagent'],
} as const;

export function buildRobotsTxt(): string {
  const sitemapUrl = `${SITE.origin}/sitemap.xml`;

  // Staging / pre-launch: block everything and say so plainly.
  if (!SITE.indexable) {
    return [
      '# Non-production environment — indexing disabled via SITE.indexable in src/seo/siteConfig.ts',
      'User-agent: *',
      'Disallow: /',
      '',
    ].join('\n');
  }

  const lines: string[] = [
    `# robots.txt for ${SITE.brandName}`,
    '# Generated at build time from src/seo/siteConfig.ts + src/seo/routes.ts — do not edit dist/ by hand.',
    '',
    '# Default: allow crawling the marketing site. Nothing there needs hiding.',
    'User-agent: *',
    'Allow: /',
    '',
    '# The app portal, Django admin and JSON API share this origin but have no',
    '# crawlable/indexable value (SPA shell, login, raw JSON) — keep them out.',
    'Disallow: /app',
    'Disallow: /admin',
    'Disallow: /api',
    '',
    '# No crawlable value, and they burn crawl budget on duplicate URLs.',
    'Disallow: /*?*utm_',
    'Disallow: /*?*fbclid',
    'Disallow: /*?*gclid',
    'Disallow: /*/amp/',
    '',
    '# AI search & citation crawlers — explicitly allowed. These are the bots that can',
    '# cite the clinic in an AI answer; blocking them removes us from the candidate pool.',
  ];

  for (const bot of AI_CRAWLERS.search) {
    lines.push(`User-agent: ${bot}`, 'Allow: /', '');
  }

  lines.push(
    SITE.allowAiTrainingCrawlers
      ? '# Model-training crawlers — allowed (SITE.allowAiTrainingCrawlers = true).'
      : '# Model-training crawlers — disallowed (SITE.allowAiTrainingCrawlers = false).',
  );
  for (const bot of AI_CRAWLERS.training) {
    lines.push(`User-agent: ${bot}`, SITE.allowAiTrainingCrawlers ? 'Allow: /' : 'Disallow: /', '');
  }

  lines.push(`Sitemap: ${sitemapUrl}`, '');
  return lines.join('\n');
}

const xmlEscape = (value: string): string =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

/**
 * @param lastmod ISO date for every URL. Real per-page dates should come from the
 * CMS once content is live — an inaccurate lastmod teaches Google to ignore the field.
 */
export function buildSitemapXml(lastmod: string): string {
  if (!SITE.indexable) {
    return '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>\n';
  }

  const entries = indexableRoutes()
    .filter((route) => !getPageMeta(route.path).robots.startsWith('noindex'))
    .map((route) => {
      const loc = xmlEscape(absoluteUrl(route.path));
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastmod}</lastmod>`,
        `    <changefreq>${route.changefreq}</changefreq>`,
        `    <priority>${route.priority.toFixed(1)}</priority>`,
        '  </url>',
      ].join('\n');
    });

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    '</urlset>',
    '',
  ].join('\n');
}

/**
 * llms.txt — a curated map for AI agents.
 *
 * Adoption is around 10% of domains and no major engine has confirmed using it for
 * retrieval, so this is a cheap bet, not a strategy. It is generated rather than
 * written so it cannot go stale.
 */
export function buildLlmsTxt(): string {
  const line = (path: string, label: string, note: string) =>
    `- [${label}](${absoluteUrl(path)}): ${note.replace(/\s+/g, ' ').trim()}`;

  // Every section is built from the indexable route list (the same source as
  // sitemap.xml), so a route added there appears here with no further edit.
  const routesOf = (kind: string) =>
    indexableRoutes()
      .filter((r) => r.kind === kind)
      .map((route) => ({ route, entity: matchRoute(route.path).entity }))
      .filter((x) => x.entity);

  return [
    `# ${SITE.brandName}`,
    '',
    `> ${SITE.description}`,
    '',
    `${SITE.organizationNote}`,
    '',
    `Location: ${SITE.address.streetAddress}, ${SITE.address.addressLocality}, ${SITE.address.addressRegion} ${SITE.address.postalCode}, ${SITE.address.addressCountry}`,
    `Phone: ${SITE.contact.phoneDisplay} · Email: ${SITE.contact.email}`,
    `Areas served: ${SITE.areaServed.join(', ')}`,
    '',
    '## Conditions treated',
    '',
    ...routesOf('condition').map(({ route, entity }) => {
      const c = entity as (typeof CONDITIONS)[number];
      return line(route.path, c.title, `${c.shortDesc} Expected recovery: ${c.expectedRecoveryTime}.`);
    }),
    '',
    '## Treatment modalities',
    '',
    ...routesOf('service').map(({ route, entity }) => {
      const s = entity as (typeof SERVICES)[number];
      return line(route.path, s.title, `${s.shortDesc} Typical session: ${s.duration}.`);
    }),
    '',
    '## Clinicians',
    '',
    // Skip the parts we don't have rather than emitting ". ." as a description.
    ...routesOf('specialist').map(({ route, entity }) => {
      const p = entity as (typeof SPECIALISTS)[number];
      return line(route.path, p.name, [p.role, p.credentials].filter(Boolean).join('. '));
    }),
    '',
    '## Other pages',
    '',
    ...indexableRoutes()
      .filter((r) => !['condition', 'service', 'specialist'].includes(r.kind))
      .map((r) => {
        const m = getPageMeta(r.path);
        return line(r.path, r.kind === 'home' ? SITE.brandName : m.title, m.description);
      }),
    '',
    '## Notes',
    '',
    '- Content is served as fully rendered HTML; no JavaScript execution is required to read any page.',
    `- Canonical origin: ${SITE.origin}`,
    '',
  ].join('\n');
}

/**
 * llms-full.txt — the expanded companion to llms.txt.
 *
 * Where llms.txt is a one-line-per-page index, this carries the full text an AI
 * agent needs to answer about the clinic without fetching every page: each
 * condition's full description, signs, therapies, recovery outlook and Q&A; each
 * treatment's detail; clinician bios; and the site FAQ. Generated from the same
 * data, so it can never drift from the pages.
 */
export function buildLlmsFullTxt(): string {
  const clean = (s: string) => s.replace(/\s+/g, ' ').trim();
  const out: string[] = [
    `# ${SITE.brandName} — Full Reference`,
    '',
    `> ${SITE.description}`,
    '',
    SITE.organizationNote,
    '',
    `Location: ${SITE.address.streetAddress}, ${SITE.address.addressLocality}, ${SITE.address.addressRegion} ${SITE.address.postalCode}, ${SITE.address.addressCountry}`,
    `Phone: ${SITE.contact.phoneDisplay} · Email: ${SITE.contact.email}`,
    `Areas served: ${SITE.areaServed.join(', ')}`,
    '',
    '## Conditions treated',
    '',
  ];

  for (const c of CONDITIONS) {
    out.push(`### ${c.title}`);
    out.push(absoluteUrl(conditionPath(c.id)));
    out.push(clean(c.fullDesc));
    out.push(`Signs: ${c.symptoms.join('; ')}`);
    out.push(`Therapies used: ${c.recommendedTherapies.join(', ')}`);
    out.push(`Expected recovery: ${clean(c.expectedRecoveryTime)}`);
    for (const f of conditionFaqs(c)) out.push(`Q: ${clean(f.q)} A: ${clean(f.a)}`);
    out.push('');
  }

  out.push('## Treatment modalities', '');
  for (const s of SERVICES) {
    out.push(`### ${s.title}`);
    out.push(absoluteUrl(servicePath(s.id)));
    out.push(clean(s.fullDesc));
    if (s.duration) out.push(`Typical session: ${s.duration}`);
    out.push('');
  }

  out.push('## Clinicians', '');
  for (const p of SPECIALISTS) {
    out.push(`### ${p.name}`);
    out.push(absoluteUrl(specialistPath(p.id)));
    out.push([p.role, p.credentials].filter(Boolean).map(clean).join('. '));
    if (p.bio) out.push(clean(p.bio));
    out.push('');
  }

  out.push('## Frequently asked questions', '');
  for (const f of FAQS) out.push(`Q: ${clean(f.question)} A: ${clean(f.answer)}`);
  out.push('');

  out.push('## Notes', '', `- Canonical origin: ${SITE.origin}`, '- Fully rendered HTML; no JavaScript needed to read any page.', '');
  return out.join('\n');
}
