/**
 * The things a visitor can actually book, and what each one includes.
 *
 * This is a different list from SERVICES in clinicData.ts, and the difference
 * matters. SERVICES describes the clinic's *therapy menu* -- manual work,
 * electro-physical equipment, and so on -- which is what a clinician does.
 * This is what a pet owner asks for. "Grooming" and "Walking" are not
 * therapies at all, and "Physiotherapy" as a booking covers several of the
 * therapies listed over there.
 *
 * Every `code` is an Appointment.VISIT_TYPES value, so pressing Book on a card
 * selects that exact service in the form and the clinic receives a code its own
 * booking screen already understands. Codes are checked against the live
 * /appointment-options response at render time rather than trusted: a card for
 * a service the clinic has retired should disappear, not post a value the API
 * would reject.
 *
 * The inclusions are the clinic's own words from its service notes. Nothing
 * clinical is invented here -- where the notes say only "Physiotherapy", this
 * lists the therapies from the same notes rather than describing what they
 * achieve.
 */

export interface BookableService {
  /** Appointment.VISIT_TYPES code. */
  code: string;
  title: string;
  /** One line under the title. */
  summary: string;
  /** What the visitor gets. The clinic's wording. */
  includes: string[];
  /** Shown as a quiet note under the list; omit when there is nothing to add. */
  note?: string;
  /** lucide-react icon name, mapped in the section component. */
  icon: string;
  /**
   * Optional price menu, shown in the booking panel. Informational — the visit
   * is still reserved as a one-hour slot and paid at the clinic; these are what
   * the options cost.
   */
  priceList?: { label: string; price: number; compareAt?: number }[];
  /**
   * Set to 'per-session' when `priceList` prices the SAME service at
   * different session-count tiers (e.g. Swimming's single/5-session/
   * 8-session rates) — every lower price is a bulk discount off the single-
   * session (highest) rate, so the booking panel can show a "Save X%" badge.
   *
   * Leave unset for services whose `priceList` prices separate, unrelated
   * things (e.g. Grooming's Shampooing / Nail trimming / Hair clipping) —
   * there is no single baseline to discount against. A combo in such a list
   * can still carry a badge by setting `compareAt` on that one entry: the sum
   * of its parts' own prices, so the saving shown is real.
   */
  pricingMode?: 'per-session';
}

export const BOOKABLE_SERVICES: BookableService[] = [
  {
    code: 'IndoorFacility',
    title: 'Indoor Facility',
    summary: 'Boarding & day-care for your pet \u2014 24\u00d77, booked by the hour, day, week or month, with supervised care and walks.',
    includes: [
      'Supervised care, round the clock',
      'Six beds, booked by duration',
      'Walks and feeding to your preference',
    ],
    note: 'Pick a duration to see the price. Paid at the clinic; Aadhaar required at check-in.',
    icon: 'bed',
  },
  {
    code: 'Physiotherapy',
    title: 'Physiotherapy',
    summary: 'Hands-on and equipment-assisted rehabilitation, planned for one animal.',
    includes: [
      'Massage and therapeutic exercise',
      'Strength training and acupressure',
      'Pulsed electro-magnetic field (PEMF)',
      'Class IV laser and ultrasound therapy',
      'TENS, NMES and electro-acupuncture',
    ],
    icon: 'activity',
  },
  {
    code: 'Hydrotherapy',
    title: 'Swimming',
    summary: 'Supported swimming in the clinic’s indoor pool.',
    includes: [
      'Indoor swimming pool',
      'Lukewarm water',
      'Clean, filtered water',
      'Under the observation of the vet',
    ],
    priceList: [
      { label: 'Single session (swim & dry)', price: 1300 },
      { label: '5 sessions (per session)', price: 1100 },
      { label: '8 sessions (per session)', price: 900 },
    ],
    pricingMode: 'per-session',
    icon: 'waves',
  },
  {
    code: 'Grooming',
    title: 'Grooming',
    summary: 'Drying, coat care and a massage before the bath.',
    includes: [
      'After swimming — drying',
      'Geriatric dogs’ special grooming care',
      'Herbal care',
      'Oiling massage before bath',
    ],
    priceList: [
      { label: 'Shampooing', price: 1200 },
      { label: 'Nail trimming', price: 200 },
      { label: 'Hair clipping', price: 800 },
      // compareAt = what the parts cost separately: Swimming single session
      // (swim & dry) 1300 + Shampooing 1200 + Hair clipping 800 + Nail
      // trimming 200 = 3500 ("groom" = clipping + nails, confirmed by the
      // clinic 2026-10-08). Update it if any of those prices change.
      { label: 'Swim + groom + shampoo + dry', price: 2500, compareAt: 3500 },
    ],
    icon: 'sparkles',
  },
  {
    code: 'Walking',
    title: 'Walking',
    summary: 'Walks with professional walkers who watch how your pet is doing.',
    includes: [
      'Professional walkers',
      'Urine and faeces observed',
      'No cellphone while walking',
    ],
    icon: 'footprints',
  },
];
