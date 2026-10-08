/**
 * SINGLE SOURCE OF TRUTH for every business fact used by the SEO layer.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * STATUS (2026-09-19): the NAP is REAL. Name, address, phone, email, the map
 * listing and the Instagram profile were supplied by the clinic and are live.
 *
 * What is still NOT settled, and must not be invented:
 *   - which DAYS the 9:30–13:30 window applies to (see `openingHours`)
 *   - any out-of-hours / emergency number (see `contact.emergencyName`)
 *   - `verification` tokens, and `foundingYear` (still 0)
 *
 * Nothing in the SEO layer hardcodes any of this — titles, descriptions,
 * canonicals, Open Graph tags, JSON-LD, robots.txt, sitemap.xml and llms.txt are
 * all DERIVED from this file plus `src/data/clinicData.ts`.
 *
 * To go live with real data you edit ONLY two places:
 *   1. this file (business identity / NAP / hours / geo / socials / origin)
 *   2. src/data/clinicData.ts (conditions, services, specialists, FAQs, …)
 *
 * Then run `npm run build`. Every route, tag, schema block and sitemap entry
 * regenerates automatically. See SEO.md.
 *
 * Anything still unswapped is tagged `@placeholder`, so `npm run seo:check` can
 * find it before you deploy.
 * ─────────────────────────────────────────────────────────────────────────────
 */

export interface OpeningHours {
  /** schema.org DayOfWeek short names */
  days: Array<'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday' | 'Sunday'>;
  /** 24h "HH:MM", or null when closed */
  opens: string | null;
  closes: string | null;
}

export interface SiteConfig {
  brandName: string;
  legalName: string;
  /** Short trailing brand used in <title> suffixes. Keep it short — titles cap at ~60 chars. */
  titleSuffix: string;
  tagline: string;
  description: string;
  /** A complete ~150-char sentence for the home page's meta/OG description, so it
      reads whole in search results instead of truncating the longer `description`. */
  metaDescription: string;
  /** Absolute origin, NO trailing slash. Drives every canonical, OG url and sitemap entry. */
  origin: string;
  locale: string;
  lang: string;
  /** schema.org type for the business. VeterinaryCare is a LocalBusiness subtype. */
  schemaType: string;
  /** Extra @type values merged into the business node. */
  additionalSchemaTypes: string[];
  foundingYear: number;
  priceRange: string;
  currency: string;
  contact: {
    phone: string;
    phoneDisplay: string;
    email: string;
    emergencyName: string;
    emergencyPhone: string;
    emergencyPhoneDisplay: string;
  };
  address: {
    streetAddress: string;
    addressLocality: string;
    addressRegion: string;
    postalCode: string;
    addressCountry: string;
  };
  geo: { latitude: number; longitude: number };
  /** Cities / regions actually served. Used for areaServed + local relevance copy. */
  areaServed: string[];
  openingHours: OpeningHours[];
  /**
   * Hours as the clinic has actually stated them, for when the per-day
   * breakdown is not yet established. Rendered as visible copy only -- it
   * deliberately does NOT feed openingHoursSpecification, because schema needs
   * days and inventing them is how someone ends up at a closed door.
   */
  serviceHours: {
    /** What the window covers, e.g. 'Physiotherapy'. */
    label: string;
    /** Human window, e.g. '9:30 AM \u2013 1:30 PM'. Empty = nothing stated. */
    window: string;
    /** Visits are booked in advance rather than walk-in. */
    appointmentOnly: boolean;
  };
  /** Canonical map listing for the premises. Empty = no directions link. */
  mapUrl: string;
  /** Profiles that establish the brand as a resolvable entity (schema `sameAs`). */
  sameAs: string[];
  images: {
    logo: string;
    /** 1200x630 recommended. Falls back to the hero image when empty. */
    ogImage: string;
    ogImageWidth: number;
    ogImageHeight: number;
  };
  /** Search-console ownership tokens. Empty string = tag omitted. */
  verification: { google: string; bing: string };
  /** Toggle indexing off for staging. `false` emits site-wide noindex + a blocking robots.txt. */
  indexable: boolean;
  /** Search crawlers get full access; training crawlers are a separate decision. See SEO.md. */
  allowAiTrainingCrawlers: boolean;
  organizationNote: string;
}

/** Marker for values that must be replaced before launch. @placeholder */
const PLACEHOLDER = <T,>(value: T): T => value;

export const SITE: SiteConfig = {
  brandName: 'The Pet Physio Vet',
  legalName: 'The Pet Physio Vet',
  titleSuffix: 'The Pet Physio Vet',
  tagline: 'Helping pets move better, recover faster, live happier',
  description:
    'Veterinary physiotherapy and rehabilitation in Ahmedabad. Qualified veterinary '
    + 'physiotherapist (M.V.Sc.) treating mobility problems, post-surgical recovery, '
    + 'arthritis and injury in dogs and cats, with avian and exotic experience. '
    + 'Clinic visits at Shilaj, Ahmedabad, and home visits across the city.',
  // No "&" — it becomes "&amp;" in the HTML attribute, which pushed the rendered
  // length past Google's 160-char limit even though the source read shorter.
  metaDescription:
    'Veterinary physiotherapy and rehabilitation in Ahmedabad — arthritis, IVDD, '
    + 'post-surgery and mobility care for dogs and cats by a qualified vet physio.',

  // Must be the real production origin — every canonical URL is built from it.
  // The primary domain is www (the apex 308-redirects to it), so canonicals use
  // www to avoid a redirect hop on the canonical URL itself.
  origin: 'https://www.thepetphysiovet.com',

  locale: 'en_IN',
  lang: 'en-IN',

  // VeterinaryCare is the most specific LocalBusiness subtype for this vertical.
  schemaType: 'VeterinaryCare',
  additionalSchemaTypes: ['MedicalBusiness', 'LocalBusiness'],

  foundingYear: 0,
  priceRange: '₹₹',
  currency: 'INR',

  contact: {
    phone: '+917284073241',
    phoneDisplay: '+91 72840 73241',
    email: 'contact@thepetphysiovet.com',

    // The clinic confirmed (2026-09-19) that out-of-hours enquiries go to the
    // same number. It is published, but the footer keeps the line saying this
    // is not a 24-hour hospital: a physiotherapy practice open 09:30-13:30 on
    // weekdays cannot be someone's plan for a dog in distress at midnight, and
    // a number presented as an emergency line is read as a promise to answer.
    emergencyName: 'The Pet Physio Vet',
    emergencyPhone: '+917284073241',
    emergencyPhoneDisplay: '+91 72840 73241',
  },

  address: {
    // Spelling follows the clinic's own Google Business Profile
    // ("Avaneesh Heights"), not the message it was sent in ("Avneesh"), because
    // the listing is what Google matches this address against -- a NAP that
    // disagrees with the GBP weakens both.
    streetAddress:
      'Shop No. 1 & 2, Ground Floor, Avaneesh Heights, Thaltej \u2013 Shilaj Road, '
      + 'near Dine in the Clouds restaurant, Shilaj Circle, Shilaj',
    addressLocality: 'Ahmedabad',
    addressRegion: 'Gujarat',
    postalCode: '380059',
    addressCountry: 'IN',
  },

  // Road-level, not door-level: OpenStreetMap resolves "Thaltej Road, Shilaj,
  // 380059" here, which is the clinic's road and postcode. The previous value
  // pointed at the old Sola premises roughly 5km away, so this is a correction
  // rather than a refinement. The authoritative pin is the Google Business
  // Profile linked in `mapUrl`; replace these with the exact coordinates from
  // that listing when convenient.
  geo: { latitude: 23.0526146, longitude: 72.4817156 },

  areaServed: ['Ahmedabad', 'Shilaj', 'Thaltej', 'Bodakdev', 'Science City', 'Sola', 'Gota'],

  // Deliberately empty, and this is a judgement not an omission.
  //
  // Google Business Profile is the authoritative source for opening hours — it
  // is what Maps, the local pack and the knowledge panel actually read, and the
  // owner can change it in seconds without a deploy. The only hour I could
  // verify from the live listing was "closes 7:30 pm" on one weekday; the rest
  // would have been invented.
  //
  // Publishing guessed hours is strictly worse than publishing none: schema
  // that disagrees with the GBP is a conflicting signal Google has to resolve,
  // and someone reads it and turns up to a closed clinic. With this empty the
  // generator omits openingHoursSpecification entirely and Google uses the
  // profile. Fill it in once the real seven-day hours are known.
  //
  // UPDATE 2026-10-02: the clinic confirmed Monday to SATURDAY, 9:30 AM to 1:30
  // PM, appointment based only. That is now stated here and drives both the
  // visible hours and openingHoursSpecification, so the two cannot disagree.
  //
  // Sunday is deliberately ABSENT rather than listed as closed. The days array
  // answers which days the window covers; it is not the same statement as "we
  // are shut on Sunday". Add explicit closed days only if the clinic says so.
  openingHours: [
    {
      days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
      opens: '09:30',
      closes: '13:30',
    },
  ],

  serviceHours: {
    label: 'Physiotherapy',
    window: '9:30 AM \u2013 1:30 PM',
    appointmentOnly: true,
  },

  // The clinic's own Google listing, addressed by CID so the link survives any
  // rename or re-share (the shortlink it arrived as carried a tracking token).
  mapUrl: 'https://maps.google.com/?cid=16829298020285027612',

  sameAs: [
    // Real, claimed profiles only. Every entry is an entity-resolution signal;
    // a dead or wrong URL is worse than an absent one.
    //
    // Both were supplied with tracking parameters attached (`?utm_source=qr`
    // plus an `stkn` share token on the Instagram link, `?g_st=aw` on the map
    // shortlink). Those are stripped deliberately: a share token is tied to
    // whoever generated it and has no business being published, and sameAs is
    // meant to be the canonical profile URL, not one visitor's referral.
    'https://www.instagram.com/thepetphysiovet/',
    'https://maps.google.com/?cid=16829298020285027612',
  ],

  images: {
    logo: '/logo.png',
    ogImage: '/og-image.png',
    ogImageWidth: 1200,
    ogImageHeight: 630,
  },

  verification: { google: PLACEHOLDER(''), bing: PLACEHOLDER('') },

  indexable: true,
  allowAiTrainingCrawlers: true,

  // Rendered in the visible NAP block, used as the business `description` in
  // the JSON-LD, and printed in llms.txt. It previously read "Board-certified
  // veterinary rehabilitation practitioners" — plural, describing the three
  // fabricated clinicians that used to be in clinicData, and asserting a
  // board certification this site cannot substantiate. Replaced with what is
  // verifiably true; restore a certification claim only with the certificate.
  organizationNote:
    'Veterinary physiotherapy and rehabilitation care in Ahmedabad, coordinated with your pet\u2019s primary veterinarian.',
};

/**
 * wa.me deep link derived from the clinic's published phone number, so the
 * Call and WhatsApp buttons can never point at different numbers. Strips
 * everything but digits (`+91 72840 73241` → `917284073241`); the number is
 * already stored with the 91 country code in `contact.phone`. An optional
 * pre-filled message is appended as the standard `?text=` query param.
 */
export function whatsappHref(message?: string): string {
  const digits = SITE.contact.phone.replace(/\D/g, '');
  const base = `https://wa.me/${digits}`;
  return message ? `${base}?text=${encodeURIComponent(message)}` : base;
}

/** Join an origin-relative path onto the configured origin. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${SITE.origin.replace(/\/$/, '')}${suffix === '/' ? '/' : suffix.replace(/\/$/, '')}`;
}

/** Human-readable one-line address — used in copy and in the NAP block. */
export function formattedAddress(): string {
  const a = SITE.address;
  return `${a.streetAddress}, ${a.addressLocality}, ${a.addressRegion} ${a.postalCode}`;
}

/** Primary service city, used to localise titles and descriptions. */
export function primaryLocality(): string {
  return SITE.address.addressLocality;
}

export function openingHoursSummary(): string {
  const short = (day: string) => day.slice(0, 3);
  return SITE.openingHours
    .filter((slot) => slot.opens && slot.closes)
    .map((slot) => {
      const label =
        slot.days.length === 1
          ? short(slot.days[0])
          : `${short(slot.days[0])}\u2013${short(slot.days[slot.days.length - 1])}`;
      return `${label} ${slot.opens}\u2013${slot.closes}`;
    })
    .join(' | ');
}
