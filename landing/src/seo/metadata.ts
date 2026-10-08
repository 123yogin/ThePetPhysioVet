/**
 * Per-route metadata, generated from data.
 *
 * Length discipline is enforced in code rather than trusted to whoever writes the
 * copy, because titles and descriptions are generated from placeholder data today
 * and real data later:
 *   • titles       50–60 chars  (front-loaded keyword, brand suffix dropped if it won't fit)
 *   • descriptions 150–160 chars (truncated on a word boundary, never mid-word)
 *
 * Google rewrites titles and descriptions it judges poor, duplicated or truncated,
 * so the generator's job is to always emit something clean and unique.
 */

import { SITE, absoluteUrl, primaryLocality } from './siteConfig';
import { matchRoute, type RouteEntity } from './routes';
import { HERO_IMAGE } from '../data/clinicData';
import { PRIVACY, TERMS } from '../data/legalContent';
import type { ConditionItem, ServiceItem, Specialist } from '../types';

export const TITLE_MAX = 60;
export const DESC_MAX = 160;
export const DESC_MIN = 130;

export interface PageMeta {
  title: string;
  description: string;
  canonical: string;
  /** Absolute URL of the social share image. */
  image: string;
  imageAlt: string;
  ogType: 'website' | 'article' | 'profile';
  robots: string;
  /** Breadcrumb trail, root-first. Drives both the visible trail and BreadcrumbList. */
  breadcrumbs: Array<{ name: string; path: string }>;
}

/** Truncate on a word boundary and add an ellipsis only if we actually cut. */
export function clamp(text: string, max: number): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  const cut = normalized.slice(0, max - 1);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[,;:.\-–]$/, '')}…`;
}

/**
 * Build a title as "<primary> | <brand>", dropping the brand suffix when the
 * primary part alone already fills the budget. Keyword stays front-loaded.
 */
export function buildTitle(primary: string): string {
  const head = primary.replace(/\s+/g, ' ').trim();
  const suffix = ` | ${SITE.titleSuffix}`;
  if (head.length + suffix.length <= TITLE_MAX) return head + suffix;
  if (head.length <= TITLE_MAX) return head;
  return clamp(head, TITLE_MAX);
}

/**
 * Pad a too-short description with real, non-repetitive context rather than filler.
 *
 * Descriptions below ~130 chars waste the snippet Google gives you; above 160 they
 * get truncated. Callers pass progressively more general context and the builder
 * stops as soon as it is inside the useful band.
 */
function buildDescription(primary: string, ...fallbacks: string[]): string {
  let text = primary.replace(/\s+/g, ' ').trim();
  const extras = [...fallbacks, `Veterinary rehabilitation in ${primaryLocality()}.`, `Book an assessment at ${SITE.brandName}.`];
  for (const extra of extras) {
    if (text.length >= DESC_MIN) break;
    const addition = extra.replace(/\s+/g, ' ').trim();
    if (addition && !text.includes(addition)) text = `${text} ${addition}`;
  }
  return clamp(text, DESC_MAX);
}

const socialImage = (candidate?: string): string =>
  absoluteUrl(candidate || SITE.images.ogImage || HERO_IMAGE);

const robotsValue = (noindex: boolean): string =>
  !SITE.indexable || noindex
    ? 'noindex, nofollow'
    : 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

const isCondition = (e: RouteEntity): e is ConditionItem => !!e && 'symptoms' in e;
const isService = (e: RouteEntity): e is ServiceItem => !!e && 'benefits' in e;
const isSpecialist = (e: RouteEntity): e is Specialist => !!e && 'credentials' in e;

/** Resolve full metadata for any pathname. Pure — safe on server and client. */
export function getPageMeta(pathname: string): PageMeta {
  const { route, entity } = matchRoute(pathname);
  const locality = primaryLocality();
  const base = {
    canonical: absoluteUrl(route.path),
    robots: robotsValue(!!route.noindex),
    breadcrumbs: [{ name: 'Home', path: '/' }],
  };

  if (isCondition(entity)) {
    return {
      ...base,
      // Hand-written copy wins; the template is only the fallback for an entity
      // that has none. Hand-written titles are used verbatim (no brand suffix added).
      title: entity.seoTitle ?? buildTitle(`${entity.title} Rehabilitation for Dogs`),
      description: entity.seoDescription ?? buildDescription(
        entity.shortDesc,
        `Recovery outlook: ${entity.expectedRecoveryTime}.`,
        `Referral-based care in ${locality}.`,
      ),
      image: socialImage(entity.imageUrl),
      imageAlt: entity.altText,
      ogType: 'article',
      breadcrumbs: [...base.breadcrumbs, { name: 'Conditions', path: '/#conditions' }, { name: entity.title, path: route.path }],
    };
  }

  if (isService(entity)) {
    return {
      ...base,
      title: entity.seoTitle ?? buildTitle(`${entity.title} for Pets`),
      description: entity.seoDescription ?? buildDescription(
        entity.shortDesc,
        `Typical session ${entity.duration}.`,
        `Delivered by certified veterinary rehabilitation specialists in ${locality}.`,
      ),
      image: socialImage(),
      imageAlt: `${entity.title} at ${SITE.brandName}`,
      ogType: 'article',
      breadcrumbs: [...base.breadcrumbs, { name: 'Treatments', path: '/#services' }, { name: entity.title, path: route.path }],
    };
  }

  if (isSpecialist(entity)) {
    return {
      ...base,
      title: entity.seoTitle ?? buildTitle(`${entity.name}, ${entity.role}`),
      description: buildDescription(
        `${entity.name} — ${entity.role} at ${SITE.brandName}. ${entity.credentials}.`,
        entity.bio,
      ),
      image: socialImage(entity.imageUrl),
      imageAlt: entity.altText,
      ogType: 'profile',
      breadcrumbs: [...base.breadcrumbs, { name: 'Our Team', path: '/#about' }, { name: entity.name, path: route.path }],
    };
  }

  // Privacy and Terms.
  //
  // These fell through to the Home branch, so three routes shipped the SAME
  // <title> and the SAME description -- "Pet Physiotherapy & Rehabilitation in
  // Ahmedabad" on all of them. Duplicate titles are one of the few things
  // Google will rewrite for you, and the legal pages are exactly where a
  // person scanning results needs the label to be literal.
  //
  // Title and intro come from the documents themselves, so the tab, the
  // snippet and the <h1> cannot drift apart.
  if (route.kind === 'privacy' || route.kind === 'terms') {
    const doc = route.kind === 'privacy' ? PRIVACY : TERMS;
    return {
      ...base,
      title: buildTitle(doc.title),
      description: buildDescription(doc.intro),
      image: socialImage(),
      imageAlt: SITE.brandName,
      ogType: 'website',
      breadcrumbs: [...base.breadcrumbs, { name: doc.title, path: route.path }],
    };
  }

  if (route.kind === 'notfound') {
    return {
      ...base,
      title: buildTitle('Page Not Found'),
      description: buildDescription(
        `The page you requested could not be found. Browse our rehabilitation programmes or contact the ${locality} clinic.`,
      ),
      image: socialImage(),
      imageAlt: SITE.brandName,
      ogType: 'website',
      robots: 'noindex, follow',
    };
  }

  // Home
  return {
    ...base,
    title: buildTitle(`Dog & Cat Physiotherapy in ${locality}`),
    description: buildDescription(SITE.metaDescription),
    image: socialImage(),
    imageAlt: `${SITE.brandName} rehabilitation clinic`,
    ogType: 'website',
    breadcrumbs: base.breadcrumbs,
  };
}
