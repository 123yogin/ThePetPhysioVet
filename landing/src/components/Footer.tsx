import React from 'react';
import { Instagram, MapPin, Phone, Mail, MessageCircle, ArrowUpRight } from 'lucide-react';
import { SITE, formattedAddress, whatsappHref } from '../seo/siteConfig';
import { useStagger, useReveal, SplitWords, Roll } from '../motion';
import { Pulse } from '../motion/extras';
import { useRouter } from '../seo/router';
import { bookingHref } from './BookingPanel';

/**
 * Footer, rebuilt in the motion-graphic style the rest of the site borrows from
 * its reference: an oversized interactive contact block and columns that reveal
 * in sequence with roll-up links. The content is exactly what the previous
 * footer carried (the one crawlable name/address/phone, hours, emergency notice,
 * legal and staff login) — only the composition and the motion are new.
 */
export const Footer: React.FC = () => {
  const { path, navigate } = useRouter();

  const heroRef = useReveal<HTMLDivElement>({ variant: 'rise' });
  const colsRef = useStagger<HTMLDivElement>({ step: 90 });

  const go = (href: string) => (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault();
    navigate(href);
  };

  const instagram = SITE.sameAs.filter((url) => /instagram\.com/i.test(url));

  return (
    <footer
      id="contact"
      className="bg-(--c-surface) text-(--c-ink) font-(family-name:--f-body) w-full border-t border-(--c-line)/30 mt-auto overflow-hidden"
    >
      {/* 1 ── Oversized, interactive contact block ------------------------- */}
      <div ref={heroRef} className="max-w-[1280px] mx-auto px-4 sm:px-8 pt-20 sm:pt-28 pb-14">
        <span className="flex items-center gap-3 text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-8 font-(family-name:--f-body)">
          <Pulse />
          Get in touch
        </span>

        <SplitWords
          as="h2"
          className="font-(family-name:--f-display) text-5xl sm:text-7xl lg:text-8xl font-light leading-[0.98] mb-12"
        >
          Ready when they are.
        </SplitWords>

        <div className="grid lg:grid-cols-12 gap-10 lg:items-end">
          {/* Giant email + phone — the loudest thing a visitor can act on. */}
          <div className="lg:col-span-7 min-w-0">
            {SITE.contact.email && (
              <a
                href={`mailto:${SITE.contact.email}`}
                data-magnetic
                className="group flex items-center gap-3 font-(family-name:--f-display) font-light leading-tight text-(--c-ink) hover:text-(--c-accent) transition-colors"
              >
                {/* One line, always. No <Roll> (its overflow:hidden clipped the
                    ".com"). The address is kept on a single line with
                    whitespace-nowrap, and the font size is a fluid clamp so the
                    full "contact@thepetphysiovet.com" scales to fit its column
                    from mobile to desktop instead of wrapping or overflowing. */}
                <span className="min-w-0 whitespace-nowrap text-[clamp(1.05rem,4.8vw,2.75rem)]">
                  {SITE.contact.email}
                </span>
                <ArrowUpRight
                  aria-hidden="true"
                  className="w-6 h-6 sm:w-8 sm:h-8 shrink-0 opacity-50 transition-all group-hover:opacity-100 group-hover:translate-x-1 group-hover:-translate-y-1"
                />
              </a>
            )}
            <a
              href={`tel:${SITE.contact.phone}`}
              className="mt-5 inline-block font-(family-name:--f-display) text-xl sm:text-2xl font-light text-(--c-body) hover:text-(--c-accent) transition-colors"
            >
              <Roll>{SITE.contact.phoneDisplay}</Roll>
            </a>
            <p className="mt-8 max-w-md text-(--c-body) font-light leading-relaxed text-sm">
              Premium rehabilitation, hydrotherapy, and restorative care for your
              beloved companions.
            </p>
          </div>

          {/* Actions — book + the one real social profile. */}
          <div className="lg:col-span-5 flex flex-col sm:flex-row lg:flex-col lg:items-end gap-3">
            <a
              href={bookingHref(path)}
              onClick={go(bookingHref(path))}
              data-magnetic
              data-cursor="Book"
              className="inline-flex justify-center items-center gap-2 h-14 px-8 bg-(--c-ink) text-(--c-bg) text-xs uppercase tracking-widest font-medium hover:bg-(--c-accent) transition-colors"
            >
              <Roll>Book an assessment</Roll>
            </a>
            <div className="flex gap-3">
              <a
                href={`tel:${SITE.contact.phone}`}
                data-magnetic
                className="inline-flex justify-center items-center h-14 px-8 border border-(--c-line) text-(--c-ink) text-xs uppercase tracking-widest font-medium hover:bg-(--c-ink) hover:text-(--c-bg) transition-colors"
              >
                <Roll>Call</Roll>
              </a>
              {instagram.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="me noopener noreferrer"
                  data-magnetic
                  aria-label={`${SITE.brandName} on Instagram`}
                  className="inline-flex justify-center items-center h-14 w-14 border border-(--c-line) text-(--c-ink) hover:bg-(--c-ink) hover:text-(--c-bg) transition-colors"
                >
                  <Instagram className="w-5 h-5" />
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Detail columns, revealed in sequence ---------------------------- */}
      <div
        ref={colsRef}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 sm:gap-14 px-4 sm:px-8 py-16 sm:py-20 max-w-[1280px] mx-auto text-sm"
      >
        {/* Visit us */}
        <div>
          <h4 className="text-xs tracking-widest text-(--c-accent) mb-6 uppercase font-semibold">
            Visit us
          </h4>
          <address className="not-italic space-y-4">
            <div className="flex gap-3">
              <MapPin className="w-4 h-4 text-(--c-accent) shrink-0 mt-0.5" aria-hidden="true" />
              <span className="text-(--c-body) font-light leading-relaxed">
                {formattedAddress()}
                {SITE.mapUrl && (
                  <>
                    <br />
                    <a
                      href={SITE.mapUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block mt-2 text-(--c-accent) font-medium w-fit"
                    >
                      <Roll>Get directions</Roll>
                    </a>
                  </>
                )}
              </span>
            </div>
            <div className="flex gap-3">
              <Phone className="w-4 h-4 text-(--c-accent) shrink-0 mt-0.5" aria-hidden="true" />
              <a href={`tel:${SITE.contact.phone}`} className="text-(--c-ink) hover:text-(--c-accent) transition-colors">
                {SITE.contact.phoneDisplay}
              </a>
            </div>
            <div className="flex gap-3">
              <MessageCircle className="w-4 h-4 text-(--c-accent) shrink-0 mt-0.5" aria-hidden="true" />
              <a
                href={whatsappHref()}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chat on WhatsApp"
                className="text-(--c-ink) hover:text-(--c-accent) transition-colors"
              >
                WhatsApp
              </a>
            </div>
            {SITE.contact.email && (
              <div className="flex gap-3">
                <Mail className="w-4 h-4 text-(--c-accent) shrink-0 mt-0.5" aria-hidden="true" />
                <a
                  href={`mailto:${SITE.contact.email}`}
                  className="text-(--c-ink) hover:text-(--c-accent) transition-colors break-all"
                >
                  {SITE.contact.email}
                </a>
              </div>
            )}
          </address>
        </div>

        {/* Clinic hours */}
        <div>
          <h4 className="text-xs tracking-widest text-(--c-accent) mb-6 uppercase font-semibold">
            Clinic Hours
          </h4>
          <div className="text-(--c-ink) font-light space-y-3">
            {SITE.openingHours.length > 0 ? (
              <ul className="space-y-3">
                {SITE.openingHours.map((slot) => (
                  <li key={slot.days.join('-')} className="flex justify-between border-b border-(--c-ink)/10 pb-2">
                    <span>
                      {slot.days.length === 1 ? slot.days[0] : `${slot.days[0]} - ${slot.days[slot.days.length - 1]}`}
                    </span>{' '}
                    {slot.opens && slot.closes ? (
                      <span>{`${slot.opens} - ${slot.closes}`}</span>
                    ) : (
                      <span className="text-(--c-accent) font-medium">Closed</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              SITE.serviceHours.window && (
                <p className="border-b border-(--c-ink)/10 pb-2">
                  <span className="block text-(--c-body)">{SITE.serviceHours.label}</span>
                  <span className="font-medium">{SITE.serviceHours.window}</span>
                </p>
              )
            )}
            {SITE.serviceHours.appointmentOnly && (
              <p className="text-(--c-accent) font-medium">By appointment only</p>
            )}
            <p className="text-(--c-body) leading-relaxed">Call to confirm a time before you travel.</p>
            {SITE.areaServed.length > 0 && (
              <p className="text-(--c-body) leading-relaxed pt-2 text-xs">
                Serving {SITE.areaServed.join(', ')}.
              </p>
            )}
          </div>
        </div>

        {/* Emergency care */}
        <div>
          <h4 className="text-xs tracking-widest text-(--c-accent) mb-6 uppercase font-semibold">
            Emergency Care
          </h4>
          <p className="text-(--c-body) font-light mb-4 leading-relaxed">
            {SITE.contact.emergencyPhone
              ? 'For urgent questions about a patient of ours, outside clinic hours:'
              : 'If your pet needs urgent attention:'}
          </p>
          {SITE.contact.emergencyPhone && (
            <p className="font-medium text-(--c-ink) bg-(--c-card) p-3 border border-(--c-line)/40 mb-4">
              {SITE.contact.emergencyName}
              {SITE.contact.emergencyName && ': '}
              <br />
              <a href={`tel:${SITE.contact.emergencyPhone}`} className="text-(--c-accent) font-semibold">
                {SITE.contact.emergencyPhoneDisplay}
              </a>
            </p>
          )}
          <p className="text-(--c-body) font-light leading-relaxed">
            This is a physiotherapy and rehabilitation practice, not a 24-hour
            emergency hospital. If your pet is in distress, contact your regular
            veterinary surgeon or a nearby emergency hospital straight away rather
            than waiting for an appointment here.
          </p>
        </div>

        {/* Information */}
        <div className="flex flex-col gap-3">
          <h4 className="text-xs tracking-widest text-(--c-accent) mb-3 uppercase font-semibold">
            Information
          </h4>
          {[
            { href: '/#services', label: 'Treatment Modalities' },
            { href: '/#conditions', label: 'Conditions We Treat' },
            { href: '/treatments/hydrotherapy', label: 'Dog Hydrotherapy & Swimming' },
            { href: '/services/pet-boarding', label: 'Pet Boarding & Day Care' },
            { href: '/treatments/acupuncture', label: 'Acupuncture' },
            { href: '/#about', label: 'Our Specialists' },
            { href: '/privacy', label: 'Privacy Policy' },
            { href: '/terms', label: 'Terms of Service' },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-(--c-ink) hover:text-(--c-accent) transition-colors font-light w-fit"
            >
              <Roll>{link.label}</Roll>
            </a>
          ))}
        </div>
      </div>

      {/* Bottom bar ------------------------------------------------------ */}
      <div className="border-t border-(--c-line)/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-8 flex flex-col sm:flex-row gap-3 justify-between items-center text-xs text-(--c-body) font-light tracking-wide">
          <p>© {new Date().getFullYear()} {SITE.brandName}. All rights reserved.</p>
          {/* Pet owners and clinic staff share one login — the account's role
              decides which portal they land in. */}
          <a
            href="/app/login"
            className="underline underline-offset-4 hover:text-(--c-accent) transition-colors"
          >
            <Roll>Staff &amp; client login</Roll>
          </a>
        </div>
      </div>

    </footer>
  );
};
