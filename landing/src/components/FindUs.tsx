import React from 'react';
import { MapPin, Phone, MessageCircle, Clock } from 'lucide-react';
import { SITE, formattedAddress, whatsappHref } from '../seo/siteConfig';

/**
 * "Find us in Shilaj": the clinic's address, map link, phone, WhatsApp and
 * hours as one crawlable block, for local search and for the visitor working
 * out how to get here.
 *
 * Every value comes from siteConfig, the same source as the footer and the
 * JSON-LD, so the three cannot disagree. Hours are ONLY what siteConfig
 * states.
 *
 * TODO(owner): hours are stated three ways today -- siteConfig (Mon-Sat
 * 09:30-13:30, physiotherapy by appointment), bookableServices.ts (the Indoor
 * Facility is "24x7") and the Google Business Profile ("closes 7:30 pm" seen
 * on 2026-10-07). Once the clinic confirms its front-desk, boarding and
 * grooming/swimming hours, put them in siteConfig and show each line here.
 * Also add travel times from Thaltej / Bopal / SG Highway and a parking note
 * only when the clinic has verified them.
 */
export const FindUs: React.FC<{
  /** Heading level and text, so detail pages can nest it under their own H1. */
  heading?: string;
  headingId?: string;
  className?: string;
}> = ({ heading = 'Find us in Shilaj', headingId = 'find-us-heading', className = '' }) => {
  const slots = SITE.openingHours.filter((s) => s.opens && s.closes);
  const dayRange = (days: string[]) => (days.length === 1 ? days[0] : `${days[0]} to ${days[days.length - 1]}`);

  return (
    <section aria-labelledby={headingId} className={className}>
      <h2 id={headingId} className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-light mb-4">
        {heading}
      </h2>
      <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed mb-6 max-w-[65ch]">
        {SITE.brandName} is on Thaltej&ndash;Shilaj Road at Shilaj Circle, near Dine in the Clouds
        restaurant, in Shilaj, {SITE.address.addressLocality}. Physiotherapy, the hydrotherapy pool and
        the Indoor Facility for boarding are all here.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <address className="not-italic space-y-4 font-(family-name:--f-body) text-sm">
          <p className="flex gap-3 text-(--c-body) font-light leading-relaxed">
            <MapPin className="w-4 h-4 text-(--c-accent) shrink-0 mt-0.5" aria-hidden="true" />
            <span>{formattedAddress()}</span>
          </p>
          <ul className="flex flex-wrap gap-3">
            {SITE.mapUrl && (
              <li>
                <a
                  href={SITE.mapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 min-h-11 px-5 bg-(--c-ink) text-(--c-bg) text-xs uppercase tracking-widest font-medium hover:bg-(--c-accent) transition-colors"
                >
                  <MapPin className="w-4 h-4" aria-hidden="true" />
                  Get directions
                  <span className="sr-only">(opens Google Maps in a new tab)</span>
                </a>
              </li>
            )}
            <li>
              <a
                href={`tel:${SITE.contact.phone}`}
                className="inline-flex items-center gap-2 min-h-11 px-5 border border-(--c-ink) text-(--c-ink) text-xs uppercase tracking-widest font-medium hover:bg-(--c-ink) hover:text-(--c-bg) transition-colors"
              >
                <Phone className="w-4 h-4" aria-hidden="true" />
                Call {SITE.contact.phoneDisplay}
              </a>
            </li>
            <li>
              <a
                href={whatsappHref()}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 min-h-11 px-5 border border-(--c-ink) text-(--c-ink) text-xs uppercase tracking-widest font-medium hover:bg-(--c-ink) hover:text-(--c-bg) transition-colors"
              >
                <MessageCircle className="w-4 h-4" aria-hidden="true" />
                WhatsApp
                <span className="sr-only">(opens in a new tab)</span>
              </a>
            </li>
          </ul>
        </address>

        <div className="font-(family-name:--f-body) text-sm">
          <h3 className="flex items-center gap-2 text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-3">
            <Clock className="w-4 h-4" aria-hidden="true" />
            Hours
          </h3>
          {slots.length > 0 ? (
            <ul className="space-y-2">
              {slots.map((slot) => (
                <li key={slot.days.join('-')} className="flex flex-wrap justify-between gap-x-4 border-b border-(--c-ink)/10 pb-2 text-(--c-ink) font-light">
                  <span>{dayRange(slot.days)}</span>
                  <span>{slots.length === 1 && SITE.serviceHours.window ? SITE.serviceHours.window : `${slot.opens} – ${slot.closes}`}</span>
                </li>
              ))}
            </ul>
          ) : (
            SITE.serviceHours.window && <p className="text-(--c-ink) font-light">{SITE.serviceHours.window}</p>
          )}
          <p className="mt-3 text-(--c-body) font-light leading-relaxed">
            {SITE.serviceHours.label}
            {SITE.serviceHours.appointmentOnly ? ' by appointment only.' : '.'} Call to confirm a time before you travel.
          </p>
        </div>
      </div>
    </section>
  );
};
