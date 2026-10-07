/**
 * JSON-LD generators. Every value comes from siteConfig.ts or clinicData.ts —
 * nothing here is hardcoded content, so swapping the data swaps the markup.
 *
 * Design notes grounded in current guidance:
 *  • One connected @graph per page with stable @id values, rather than several
 *    disconnected blobs — this is what lets the business, its pages, its services
 *    and its people resolve as one entity cluster.
 *  • Markup mirrors content that is actually visible on the page. Marking up
 *    invisible content is a spam-policy violation.
 *  • FAQPage is still emitted for machine comprehension even though Google removed
 *    FAQ *rich results* in May 2026 — it costs nothing and no longer promises a SERP
 *    accordion. Do not treat it as a visibility feature.
 *  • AggregateRating / Review ARE emitted now: SUCCESS_STORIES in
 *    data/clinicData.ts holds genuine, verbatim excerpts from the clinic's
 *    Google Business Profile, published at the business owner's direction
 *    (the owner manages that profile). GOOGLE_RATING in the same file is the
 *    live ratingValue/reviewCount — it is a hand-kept fact, not derived from
 *    SUCCESS_STORIES, and MUST be kept in sync with the live Google listing
 *    by whoever updates clinicData.ts. Still never mark up a rating you
 *    don't have: if SUCCESS_STORIES is ever emptied again, both are omitted.
 */

import { SITE, absoluteUrl } from './siteConfig';
import { matchRoute, conditionPath, servicePath, specialistPath, type RouteEntity } from './routes';
import { getPageMeta } from './metadata';
import {
  CONDITIONS,
  FAQS,
  SERVICES,
  SPECIALISTS,
  SUCCESS_STORIES,
  GOOGLE_RATING,
  HERO_IMAGE,
  servicesForCondition,
  CONTENT_REVIEWED_DATE,
} from '../data/clinicData';
import { conditionFaqs } from '../data/conditionFaqs';
import { TREATMENT_CONTENT, plainText } from '../data/treatmentContent';
import type { ConditionItem, ServiceItem, Specialist, SuccessStory } from '../types';

/** Loosely-typed JSON-LD node. */
type Node = Record<string, unknown>;

// Stable @id anchors. Fragment ids make the graph addressable across pages.
const ID = {
  business: () => `${SITE.origin}/#business`,
  organization: () => `${SITE.origin}/#organization`,
  website: () => `${SITE.origin}/#website`,
  webpage: (path: string) => `${absoluteUrl(path)}#webpage`,
  breadcrumb: (path: string) => `${absoluteUrl(path)}#breadcrumb`,
  service: (id: string) => `${absoluteUrl(servicePath(id))}#service`,
  condition: (id: string) => `${absoluteUrl(conditionPath(id))}#condition`,
  person: (id: string) => `${absoluteUrl(specialistPath(id))}#person`,
  area: (name: string) => `${SITE.origin}/#area-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`,
  faq: (path: string) => `${absoluteUrl(path)}#faq`,
};

const isCondition = (e: RouteEntity): e is ConditionItem => !!e && 'symptoms' in e;
const isService = (e: RouteEntity): e is ServiceItem => !!e && 'benefits' in e;
const isSpecialist = (e: RouteEntity): e is Specialist => !!e && 'credentials' in e;

function openingHoursSpecification(): Node[] {
  return SITE.openingHours
    .filter((slot) => slot.opens && slot.closes)
    .map((slot) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: slot.days.map((d) => `https://schema.org/${d}`),
      opens: slot.opens,
      closes: slot.closes,
    }));
}

/**
 * A single genuine review as a schema.org Review node, nested under the
 * business node's `review` property. `itemReviewed` references the business
 * node's own @id rather than duplicating it — both live in the same @graph.
 */
function reviewNode(story: SuccessStory): Node {
  return {
    '@type': 'Review',
    itemReviewed: { '@id': ID.business() },
    author: { '@type': 'Person', name: story.ownerName },
    reviewRating: {
      '@type': 'Rating',
      ratingValue: story.rating,
      bestRating: 5,
    },
    reviewBody: story.quote,
  };
}

/** The business node — the anchor of the whole entity graph. */

/**
 * Strip empty values from the graph before it is emitted.
 *
 * Schema.org properties are optional; an EMPTY one is not "no answer", it is a
 * wrong answer. Before this, unknown business facts serialised as
 * `"email": ""`, `"openingHoursSpecification": []` and — worst — an unknown
 * founding year became `"foundingDate": "0"`, publishing the claim that the
 * practice was established in year zero.
 *
 * Pruning centrally rather than guarding each field means the next unknown
 * fact disappears instead of leaking. Zero is kept where it is a real number
 * (a latitude, a count); only empty strings, empty arrays/objects, null and
 * undefined are dropped.
 */
function prune<T>(value: T): T {
  if (Array.isArray(value)) {
    const arr = value.map(prune).filter((v) => v !== undefined);
    return (arr.length ? arr : undefined) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const cleaned = prune(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return (Object.keys(out).length ? out : undefined) as unknown as T;
  }
  if (value === '' || value === null || value === undefined) return undefined as unknown as T;
  return value;
}

export function businessNode(): Node {
  const logo = SITE.images.logo ? absoluteUrl(SITE.images.logo) : undefined;
  return {
    '@type': [SITE.schemaType, ...SITE.additionalSchemaTypes],
    '@id': ID.business(),
    name: SITE.brandName,
    legalName: SITE.legalName,
    description: SITE.description,
    slogan: SITE.tagline,
    url: `${SITE.origin}/`,
    telephone: SITE.contact.phone,
    email: SITE.contact.email,
    priceRange: SITE.priceRange,
    currenciesAccepted: SITE.currency,
    // 0 in siteConfig means "unknown" — emit an empty string so prune()
    // drops it, rather than claiming the practice was founded in year zero.
    foundingDate: SITE.foundingYear ? String(SITE.foundingYear) : '',
    image: absoluteUrl(SITE.images.ogImage || HERO_IMAGE),
    ...(logo ? { logo: { '@type': 'ImageObject', url: logo } } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: SITE.address.streetAddress,
      addressLocality: SITE.address.addressLocality,
      addressRegion: SITE.address.addressRegion,
      postalCode: SITE.address.postalCode,
      addressCountry: SITE.address.addressCountry,
    },
    geo: { '@type': 'GeoCoordinates', latitude: SITE.geo.latitude, longitude: SITE.geo.longitude },
    areaServed: SITE.areaServed.map((name) => ({ '@type': 'AdministrativeArea', '@id': ID.area(name), name })),
    openingHoursSpecification: openingHoursSpecification(),
    // Points search engines at the clinic's own Google listing, which is the
    // authoritative source for the pin and the hours this file cannot assert.
    ...(SITE.mapUrl ? { hasMap: SITE.mapUrl } : {}),
    ...(SITE.sameAs.length ? { sameAs: SITE.sameAs } : {}),
    // Real, permissioned reviews only (see SUCCESS_STORIES) — gated on the
    // array actually holding entries so an emptied list omits both rather
    // than publishing a rating with no reviews behind it.
    ...(SUCCESS_STORIES.length
      ? {
          aggregateRating: {
            '@type': 'AggregateRating',
            ratingValue: GOOGLE_RATING.ratingValue,
            bestRating: GOOGLE_RATING.bestRating,
            reviewCount: GOOGLE_RATING.reviewCount,
          },
          review: SUCCESS_STORIES.map(reviewNode),
        }
      : {}),
    employee: SPECIALISTS.map((p) => ({ '@id': ID.person(p.id) })),
    // Mirrors the visible treatment list, so the graph matches the page.
    hasOfferCatalog: {
      '@type': 'OfferCatalog',
      name: `${SITE.brandName} treatment modalities`,
      itemListElement: SERVICES.map((s) => ({
        '@type': 'Offer',
        itemOffered: { '@id': ID.service(s.id) },
      })),
    },
    availableService: SERVICES.map((s) => ({ '@id': ID.service(s.id) })),
    knowsAbout: CONDITIONS.map((c) => c.title),
    potentialAction: {
      '@type': 'ReserveAction',
      target: {
        '@type': 'EntryPoint',
        // The reserve action points at the service tiles, which is where a
        // visitor can actually book; #contact is the address and phone.
        urlTemplate: `${SITE.origin}/#book`,
        actionPlatform: [
          'https://schema.org/DesktopWebPlatform',
          'https://schema.org/MobileWebPlatform',
        ],
      },
      result: { '@type': 'Reservation', name: 'Initial rehabilitation assessment' },
    },
  };
}

export function organizationNode(): Node {
  return {
    '@type': 'Organization',
    '@id': ID.organization(),
    name: SITE.brandName,
    url: `${SITE.origin}/`,
    description: SITE.organizationNote,
    ...(SITE.images.logo ? { logo: { '@type': 'ImageObject', url: absoluteUrl(SITE.images.logo) } } : {}),
    ...(SITE.sameAs.length ? { sameAs: SITE.sameAs } : {}),
    contactPoint: [
      {
        '@type': 'ContactPoint',
        contactType: 'customer service',
        telephone: SITE.contact.phone,
        email: SITE.contact.email,
        areaServed: SITE.address.addressCountry,
        availableLanguage: SITE.lang,
      },
      {
        '@type': 'ContactPoint',
        contactType: 'emergency',
        name: SITE.contact.emergencyName,
        telephone: SITE.contact.emergencyPhone,
      },
    ],
  };
}

export function websiteNode(): Node {
  return {
    '@type': 'WebSite',
    '@id': ID.website(),
    url: `${SITE.origin}/`,
    name: SITE.brandName,
    description: SITE.description,
    inLanguage: SITE.lang,
    publisher: { '@id': ID.organization() },
  };
}

function webPageNode(path: string): Node {
  const meta = getPageMeta(path);
  const isConditionPage = matchRoute(path).route.kind === 'condition';
  return {
    // Condition pages are health content, so they are MedicalWebPage (a stronger
    // E-E-A-T signal for AI/Google on health topics) with an explicit reviewer
    // and review date; every other page stays a plain WebPage.
    '@type': isConditionPage ? 'MedicalWebPage' : 'WebPage',
    '@id': ID.webpage(path),
    url: meta.canonical,
    name: meta.title,
    description: meta.description,
    inLanguage: SITE.lang,
    isPartOf: { '@id': ID.website() },
    about: { '@id': ID.business() },
    primaryImageOfPage: { '@type': 'ImageObject', url: meta.image, caption: meta.imageAlt },
    breadcrumb: { '@id': ID.breadcrumb(path) },
    // Which parts an assistant should read aloud / is safe to quote. Headings
    // carry the page's question-and-answer structure, so they point AI answer
    // engines straight at the citable passages.
    speakable: { '@type': 'SpeakableSpecification', cssSelector: ['h1', 'h2', 'h3'] },
    // Guard SPECIALISTS[0]: if the clinicians list is ever emptied, emit a plain
    // MedicalWebPage rather than throwing on `SPECIALISTS[0].id` and taking down
    // the whole graph build. (The sibling person-node push is guarded the same way.)
    ...(isConditionPage && SPECIALISTS[0]
      ? { reviewedBy: { '@id': ID.person(SPECIALISTS[0].id) }, lastReviewed: CONTENT_REVIEWED_DATE }
      : {}),
  };
}

function breadcrumbNode(path: string): Node {
  const meta = getPageMeta(path);
  return {
    '@type': 'BreadcrumbList',
    '@id': ID.breadcrumb(path),
    itemListElement: meta.breadcrumbs.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path.split('#')[0] || '/'),
    })),
  };
}

/** A treatment modality as a schema.org Service. */
export function serviceNode(service: ServiceItem): Node {
  return {
    '@type': 'Service',
    '@id': ID.service(service.id),
    name: service.title,
    description: service.fullDesc,
    url: absoluteUrl(servicePath(service.id)),
    serviceType: service.title,
    category: 'Veterinary rehabilitation',
    provider: { '@id': ID.business() },
    // Reference the AdministrativeArea nodes defined once on the business node
    // (always in the same graph) instead of repeating them for every Service.
    areaServed: SITE.areaServed.map((name) => ({ '@id': ID.area(name) })),
    // audienceType names a group of people, not conditions or animals.
    audience: { '@type': 'Audience', audienceType: 'Pet owners' },
    hoursAvailable: openingHoursSpecification(),
    additionalProperty: [
      { '@type': 'PropertyValue', name: 'Typical session length', value: service.duration },
      ...service.benefits.map((b) => ({ '@type': 'PropertyValue', name: 'Benefit', value: b })),
    ],
  };
}

/**
 * A treated condition. MedicalCondition carries the clinical semantics, and the
 * page is typed as MedicalWebPage so the health context is explicit.
 */
export function conditionNode(condition: ConditionItem): Node {
  return {
    '@type': 'MedicalCondition',
    '@id': ID.condition(condition.id),
    name: condition.title,
    description: condition.fullDesc,
    url: absoluteUrl(conditionPath(condition.id)),
    signOrSymptom: condition.symptoms.map((s) => ({ '@type': 'MedicalSignOrSymptom', name: s })),
    possibleTreatment: condition.recommendedTherapies.map((t) => ({
      '@type': 'MedicalTherapy',
      name: t,
    })),
    expectedPrognosis: condition.expectedRecoveryTime,
  };
}

/** A clinician. Credentials are split out so E-E-A-T signals are machine-readable. */
export function personNode(person: Specialist): Node {
  return {
    '@type': 'Person',
    '@id': ID.person(person.id),
    name: person.name,
    url: absoluteUrl(specialistPath(person.id)),
    jobTitle: person.role,
    description: person.bio,
    // `absoluteUrl('')` resolves to the site origin, which is a non-empty
    // string and would survive prune() — publishing the homepage URL as this
    // person's photograph. Guard before, not after.
    image: person.imageUrl ? absoluteUrl(person.imageUrl) : '',
    worksFor: { '@id': ID.business() },
    knowsAbout: person.specialties,
    // Split on ';', not ','. Real qualifications contain commas -- "M.V.Sc. in
    // Veterinary Clinical Medicine, Ethics and Jurisprudence" is one credential,
    // and comma-splitting published its halves to Google as two separate
    // EducationalOccupationalCredential claims about a named clinician.
    hasCredential: person.credentials
      .split(';')
      .map((c) => c.trim())
      .filter(Boolean)
      .map((credential) => ({
        '@type': 'EducationalOccupationalCredential',
        credentialCategory: 'professional certification',
        name: credential,
      })),
  };
}

export function faqNode(path: string): Node {
  return {
    '@type': 'FAQPage',
    '@id': ID.faq(path),
    isPartOf: { '@id': ID.webpage(path) },
    mainEntity: FAQS.map((faq) => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: { '@type': 'Answer', text: faq.answer },
    })),
  };
}

/** FAQPage for a condition page, built from the SAME generator that renders the
 *  visible Q&A (see data/conditionFaqs.ts), so structured data and page text
 *  always match. */
export function conditionFaqNode(condition: ConditionItem, path: string): Node {
  return {
    '@type': 'FAQPage',
    '@id': ID.faq(path),
    isPartOf: { '@id': ID.webpage(path) },
    mainEntity: conditionFaqs(condition).map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: faq.a },
    })),
  };
}

/** FAQPage for a treatment page, from the same data that renders the visible Q&A. */
export function serviceFaqNode(service: ServiceItem, path: string): Node | null {
  const faqs = TREATMENT_CONTENT[service.id]?.faqs ?? [];
  if (!faqs.length) return null;
  return {
    '@type': 'FAQPage',
    '@id': ID.faq(path),
    isPartOf: { '@id': ID.webpage(path) },
    mainEntity: faqs.map((faq) => ({
      '@type': 'Question',
      name: faq.q,
      acceptedAnswer: { '@type': 'Answer', text: plainText(faq.a) },
    })),
  };
}

/**
 * Assemble the full @graph for a pathname. One script tag per page.
 */
export function buildGraph(pathname: string): Node {
  const { route, entity } = matchRoute(pathname);
  const path = route.path;
  const graph: Node[] = [organizationNode(), websiteNode(), businessNode(), webPageNode(path), breadcrumbNode(path)];

  if (route.kind === 'home') {
    // The home route renders every service, specialist and FAQ, so all are marked up.
    graph.push(...SERVICES.map(serviceNode), ...SPECIALISTS.map(personNode), faqNode(path));
  }

  if (isCondition(entity)) {
    graph.push(conditionNode(entity));
    // The on-page "Common questions" answer blocks, marked up so AI engines can
    // match the visible passages to structured Q&A.
    graph.push(conditionFaqNode(entity, path));
    // The vet who reviewed this medical content — referenced by the
    // MedicalWebPage's reviewedBy, so the @id resolves within this page's graph.
    if (SPECIALISTS[0]) graph.push(personNode(SPECIALISTS[0]));
    // Therapies named on the page, linked to the real service entities where they
    // match — via the SAME matcher the condition page renders (servicesForCondition),
    // so the JSON-LD related services and the visible "Treatments used" list agree.
    graph.push(...servicesForCondition(entity).map(serviceNode));
  }

  if (isService(entity)) {
    graph.push(serviceNode(entity));
    const faq = serviceFaqNode(entity, path);
    if (faq) graph.push(faq);
  }

  if (isSpecialist(entity)) {
    graph.push(personNode(entity));
  }

  return prune({ '@context': 'https://schema.org', '@graph': graph });
}

/** Serialise for a <script type="application/ld+json"> tag, XSS-safe. */
export function serializeGraph(pathname: string): string {
  return JSON.stringify(buildGraph(pathname)).replace(/</g, '\\u003c');
}
