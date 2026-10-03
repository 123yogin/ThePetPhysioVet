/**
 * Route registry — DERIVED FROM DATA, never hand-maintained.
 *
 * This one array is the source of truth for:
 *   • the client router          (src/seo/router.tsx)
 *   • per-route metadata         (src/seo/metadata.ts)
 *   • JSON-LD + breadcrumbs      (src/seo/schema.ts)
 *   • the prerendered HTML files (scripts/prerender.mjs)
 *   • sitemap.xml / llms.txt     (scripts/prerender.mjs)
 *
 * Add a condition/service/specialist to src/data/clinicData.ts and its page,
 * metadata, schema, prerendered HTML and sitemap entry all appear automatically.
 */

import { CONDITIONS, SERVICES, SPECIALISTS } from '../data/clinicData';
import type { ConditionItem, ServiceItem, Specialist } from '../types';

export type RouteKind = 'home' | 'condition' | 'service' | 'specialist' | 'privacy' | 'terms' | 'notfound';

export interface RouteDef {
  /** Origin-relative path, no trailing slash (except "/"). */
  path: string;
  kind: RouteKind;
  /** Entity id from clinicData, for detail routes. */
  entityId?: string;
  /** Sitemap hints. `priority` is advisory only — Google ignores it, Bing still reads it. */
  priority: number;
  changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
  /** Excluded from sitemap + prerender (e.g. the 404 template). */
  noindex?: boolean;
}

/** URL path segments, kept in one place so a rename propagates everywhere. */
export const SEGMENTS = {
  condition: 'conditions',
  service: 'treatments',
  specialist: 'team',
} as const;

export const conditionPath = (id: string) => `/${SEGMENTS.condition}/${id}`;
export const servicePath = (id: string) => `/${SEGMENTS.service}/${id}`;
export const specialistPath = (id: string) => `/${SEGMENTS.specialist}/${id}`;

export const ROUTES: RouteDef[] = [
  { path: '/', kind: 'home', priority: 1.0, changefreq: 'weekly' },

  ...CONDITIONS.map<RouteDef>((c) => ({
    path: conditionPath(c.id),
    kind: 'condition',
    entityId: c.id,
    priority: 0.8,
    changefreq: 'monthly',
  })),

  ...SERVICES.map<RouteDef>((s) => ({
    path: servicePath(s.id),
    kind: 'service',
    entityId: s.id,
    priority: 0.8,
    changefreq: 'monthly',
  })),

  ...SPECIALISTS.map<RouteDef>((p) => ({
    path: specialistPath(p.id),
    kind: 'specialist',
    entityId: p.id,
    priority: 0.6,
    changefreq: 'yearly',
  })),

  // Indexable but low priority. These exist so the footer links resolve -- both
  // pointed at "#" -- and so a visitor can find out what the booking form does
  // with their details before they fill it in.
  { path: '/privacy', kind: 'privacy', priority: 0.3, changefreq: 'yearly' },
  { path: '/terms', kind: 'terms', priority: 0.3, changefreq: 'yearly' },
];

/** Routes eligible for prerendering and the sitemap. */
export const indexableRoutes = (): RouteDef[] => ROUTES.filter((r) => !r.noindex);

export type RouteEntity = ConditionItem | ServiceItem | Specialist | null;

export interface RouteMatch {
  route: RouteDef;
  entity: RouteEntity;
}

/** Normalise a pathname: strip query/hash, collapse slashes, drop the trailing slash. */
export function normalizePath(pathname: string): string {
  const clean = (pathname || '/').split('?')[0].split('#')[0].replace(/\/{2,}/g, '/');
  if (clean === '/' || clean === '') return '/';
  return clean.replace(/\/+$/, '') || '/';
}

const NOT_FOUND: RouteDef = { path: '/404', kind: 'notfound', priority: 0, changefreq: 'yearly', noindex: true };

/** Resolve a pathname to its route definition and hydrated entity. */
export function matchRoute(pathname: string): RouteMatch {
  const path = normalizePath(pathname);
  const route = ROUTES.find((r) => r.path === path);
  if (!route) return { route: NOT_FOUND, entity: null };

  switch (route.kind) {
    case 'condition':
      return { route, entity: CONDITIONS.find((c) => c.id === route.entityId) ?? null };
    case 'service':
      return { route, entity: SERVICES.find((s) => s.id === route.entityId) ?? null };
    case 'specialist':
      return { route, entity: SPECIALISTS.find((p) => p.id === route.entityId) ?? null };
    default:
      return { route, entity: null };
  }
}

/** In-page section anchors on the home route, used by nav and the sitemap's llms.txt summary. */
export const HOME_SECTIONS = [
  { id: 'home', label: 'Home' },
  { id: 'conditions', label: 'Conditions We Treat' },
  { id: 'journey', label: 'The Healing Journey' },
  { id: 'services', label: 'Treatment Modalities' },
  { id: 'stories', label: 'Success Stories' },
  { id: 'about', label: 'Our Specialists' },
  { id: 'gallery', label: 'Our Clinic' },
  { id: 'faqs', label: 'Frequently Asked Questions' },
  { id: 'contact', label: 'Book an Appointment' },
] as const;
