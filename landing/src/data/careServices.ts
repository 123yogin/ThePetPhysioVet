/**
 * Care services: things a pet stays or is looked after for, as opposed to the
 * therapy menu in clinicData.ts SERVICES. Each entry becomes a /services/<id>
 * route (see seo/routes.ts) with its own metadata, Service JSON-LD, sitemap and
 * llms.txt line.
 *
 * Content rule, same as treatmentContent.ts: every clinic-specific fact here is
 * restated from data the site already publishes -- bookableServices.ts (24x7
 * supervised care, six beds, booking by hour/day/week/month, walks and feeding
 * to preference, Aadhaar at check-in, paid at the clinic, the walking
 * inclusions, the duration prices) and siteConfig.ts (address, phone, hours).
 * Anything the clinic has not confirmed is a TODO comment, never public copy.
 *
 * Inline links use [[label|/path]], rendered by RichText; the FAQPage JSON-LD
 * uses the plain-text form so the visible answer and the markup agree.
 */

import { SITE } from '../seo/siteConfig';

/** "Monday to Saturday, 9:30 AM \u2013 1:30 PM" from siteConfig, so the copy cannot drift from the footer. */
const physioHours = (): string => {
  const slot = SITE.openingHours[0];
  const days = slot ? (slot.days.length > 1 ? `${slot.days[0]} to ${slot.days[slot.days.length - 1]}` : slot.days[0]) : '';
  return [days, SITE.serviceHours.window].filter(Boolean).join(', ');
};

export interface CareSection {
  /** Optional fragment id, for links such as /services/pet-boarding#dog-walking. */
  id?: string;
  heading: string;
  paragraphs: string[];
  /** Optional bullet list under the paragraphs. */
  list?: string[];
  /** Render the static price table for this service under this section. */
  showPrices?: boolean;
}

export interface CareService {
  id: string;
  /** Appointment.VISIT_TYPES code the Book button opens. */
  bookingCode: string;
  /** Short name, used in breadcrumbs, nav and schema `name`. */
  title: string;
  /** schema.org Service.serviceType. */
  serviceType: string;
  seoTitle: string;
  seoH1: string;
  seoDescription: string;
  /** Opening paragraph; carries the primary term in the first 100 words. */
  intro: string;
  sections: CareSection[];
  faqs: Array<{ q: string; a: string }>;
}

export const CARE_SERVICES: CareService[] = [
  {
    id: 'pet-boarding',
    bookingCode: 'IndoorFacility',
    title: 'Pet boarding',
    serviceType: 'Pet boarding',
    // Hand-written, no brand suffix: the locality is the point of this title.
    // "Physiotherapy" must never appear in the title or H1 -- that term belongs
    // to /treatments/indoor-physiotherapy (see the cannibalisation check in
    // docs/agency/local-seo-plan-2026-10-08.md section 5).
    seoTitle: 'Pet Boarding & Day Care in Shilaj, Ahmedabad',
    seoH1: 'Pet boarding and day care in Shilaj, Ahmedabad, inside a vet physio clinic',
    seoDescription:
      'Indoor pet boarding and day care in Shilaj, Ahmedabad: six beds, 24x7 supervised care, '
      + 'walks and feeding your way, at a vet physiotherapy clinic.',
    intro:
      'Our indoor pet boarding in Shilaj, Ahmedabad, looks after your dog by the hour, day, week '
      + 'or month, round the clock, in a six-bed indoor facility at The Pet Physio Vet on '
      + 'Thaltej–Shilaj Road. We call it the Indoor Facility: supervised care, walks and '
      + 'feeding to your preference, booked for exactly as long as you need.',
    sections: [
      {
        heading: 'What is included',
        paragraphs: [
          'Every stay, from an hour of day care to a month away, includes the same things:',
        ],
        list: [
          'Supervised care, round the clock',
          'Six beds, booked by duration',
          'Walks and feeding to your preference',
        ],
        // TODO(owner): who brings food, utensils, medicines and a blanket (the
        // booking API records each as owner or clinic, but the site does not yet
        // say what the clinic can provide). Add a line here once confirmed.
      },
      {
        heading: 'Day care by the hour, or a longer stay',
        paragraphs: [
          'Day care is booked by the hour: one hour, eight hours or twelve hours, for a busy day or an evening out. For travel or a holiday, book 24 or 48 hours, a week or a month. You choose the length and a check-in date when you book, and you see the price before you send the request.',
          'Beds are limited to six, so a date that is already full cannot be booked; choose another date or length.',
        ],
      },
      {
        heading: 'Boarding prices',
        paragraphs: [
          'Prices are per stay, paid at the clinic.',
        ],
        showPrices: true,
      },
      {
        heading: 'What to bring and checking in',
        paragraphs: [
          'Bring your Aadhaar card: an Aadhaar number is needed to confirm the booking, and the card is checked at check-in. Payment is made at the clinic.',
          // TODO(owner): vaccination record requirement, check-in/check-out
          // times, and whether cats are accepted. Do not publish until confirmed.
        ],
      },
      {
        id: 'dog-walking',
        heading: 'Dog walking',
        paragraphs: [
          'Walks during a stay are arranged at the times you prefer. Our walkers are professionals, and they keep an eye on how your dog is doing:',
          // TODO(owner): say whether walking is sold on its own (to dogs that
          // are not boarding), and the walk lengths, once confirmed.
        ],
        list: [
          'Professional walkers',
          'Urine and faeces observed',
          'No cellphone while walking',
        ],
      },
      {
        heading: 'Swimming and physiotherapy at the same clinic',
        paragraphs: [
          'The Indoor Facility is part of a veterinary physiotherapy clinic. Our indoor, lukewarm pool is used for [[dog hydrotherapy and swimming sessions|/treatments/hydrotherapy]], which are booked separately. Ask us when you book a stay if you would like to add a swim.',
          // TODO(owner): confirm whether physiotherapy or swimming can be added
          // to a boarding stay for senior, post-surgery and special-needs pets,
          // and on what terms, before writing a section about it.
        ],
      },
      {
        heading: 'How boarding differs from residential physiotherapy',
        paragraphs: [
          'Boarding is for any pet that needs looking after while you are away or busy. [[Residential physiotherapy|/treatments/indoor-physiotherapy]] is different: it is a course of treatment for patients travelling from outside the city, who stay at the clinic for their physiotherapy. If your pet needs rehab rather than a place to stay, start with [[dog physiotherapy in Ahmedabad|/]].',
        ],
      },
    ],
    faqs: [
      {
        q: 'Is the Indoor Facility open 24x7?',
        a: 'Care is supervised round the clock, and stays can be booked by the hour, day, week or month. Call the clinic to arrange your check-in time.',
        // TODO(owner): check-in/check-out hours, then answer with them here.
      },
      {
        q: 'How much does pet boarding cost?',
        a: 'From ₹100 for one hour of day care to ₹1,200 for 24 hours, ₹6,000 for a week and ₹21,000 for a month. The full price list is on this page, and you are paid at the clinic.',
      },
      {
        q: 'Do I need Aadhaar to board my pet?',
        a: 'Yes. An Aadhaar number is needed to confirm the booking, and the card is checked at check-in.',
      },
      {
        q: 'Can my dog swim during the stay?',
        a: 'Swimming in our indoor, lukewarm pool is a separate service, from ₹1,300 for a single session. Ask us when you book the stay and we will tell you what can be arranged.',
      },
      {
        q: 'Is a vet at the clinic?',
        a: `The Indoor Facility is part of The Pet Physio Vet, the veterinary physiotherapy clinic of Dr. Dhanvi Patel. Physiotherapy appointments run ${physioHours()}, by appointment. Care for boarders is supervised round the clock.`,
        // TODO(owner): who is on site overnight (staff vs vet), then state it.
      },
    ],
  },
];

export const careServiceById = (id: string): CareService | undefined =>
  CARE_SERVICES.find((c) => c.id === id);
