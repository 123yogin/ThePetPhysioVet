import React from 'react';
import type { CareService } from '../data/careServices';
import { BOARDING_PRICES, bookableByCode } from '../data/bookableServices';
import { PageShell } from './PageShell';
import { RichText } from './ServicePage';
import { FindUs } from '../components/FindUs';
import { useRouter } from '../seo/router';
import { bookingHref } from '../components/BookingPanel';
import { usePublicServiceCodes } from '../hooks/usePublicServiceCodes';
import { SITE, whatsappHref } from '../seo/siteConfig';
import { rupee } from '../lib/format';

/** Static price table for a care service. Only boarding has one today. */
const pricesFor = (service: CareService) => (service.bookingCode === 'IndoorFacility' ? BOARDING_PRICES : []);

/**
 * Care-service detail page (/services/<id>): boarding and the like.
 *
 * All content is static and prerendered. The Book button is gated on the
 * clinic's live /appointment-options, exactly like the homepage tiles; when
 * the code is not (or not yet) offered, the visitor still has Call and
 * WhatsApp, so there is always a next step.
 */
export const CarePage: React.FC<{ service: CareService }> = ({ service }) => {
  const { path, navigate } = useRouter();
  const codes = usePublicServiceCodes();
  const bookable = bookableByCode(service.bookingCode);
  const bookHref = codes.includes(service.bookingCode) ? bookingHref(path, { service: service.bookingCode }) : null;
  const prices = pricesFor(service);

  const onBook = (event: React.MouseEvent) => {
    if (!bookHref || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
    event.preventDefault();
    navigate(bookHref);
  };

  const actions = (
    // Fixed min height so the Book button arriving after the API call does
    // not push the content below it.
    <div className="flex flex-col sm:flex-row flex-wrap gap-3 min-h-11">
      {bookHref && (
        <a
          href={bookHref}
          onClick={onBook}
          className="inline-flex items-center justify-center gap-2 min-h-11 px-7 bg-(--c-ink) text-white text-xs uppercase tracking-widest font-medium hover:bg-(--c-accent) transition-colors"
        >
          Book {bookable?.title ?? service.title}
        </a>
      )}
      <a
        href={`tel:${SITE.contact.phone}`}
        className="inline-flex items-center justify-center gap-2 min-h-11 px-7 border border-(--c-ink) text-(--c-ink) text-xs uppercase tracking-widest font-medium hover:bg-(--c-ink) hover:text-white transition-colors"
      >
        Call {SITE.contact.phoneDisplay}
      </a>
      <a
        href={whatsappHref(`Hello, I would like to ask about ${service.title.toLowerCase()}.`)}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center justify-center gap-2 min-h-11 px-7 border border-(--c-ink) text-(--c-ink) text-xs uppercase tracking-widest font-medium hover:bg-(--c-ink) hover:text-white transition-colors"
      >
        WhatsApp<span className="sr-only"> (opens in a new tab)</span>
      </a>
    </div>
  );

  return (
    <PageShell>
      <article className="max-w-[1280px] mx-auto px-4 sm:px-8 pb-16">
        <header className="max-w-3xl border-b border-(--c-line)/30 pb-12 mb-12">
          <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-3 block">
            {bookable?.title ?? 'Care service'}
          </span>
          <h1 className="font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light leading-tight tracking-tight mb-6">
            {service.seoH1}
          </h1>
          <p className="font-(family-name:--f-body) text-lg text-(--c-body) font-light leading-relaxed mb-8">
            {service.intro}
          </p>
          {actions}
        </header>

        {service.sections.map((section, i) => (
          <section
            key={section.heading}
            id={section.id}
            aria-labelledby={`care-sec-${i}`}
            className="max-w-3xl mb-12 scroll-mt-32"
          >
            <h2 id={`care-sec-${i}`} className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-light mb-4">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed mb-4">
                <RichText text={paragraph} />
              </p>
            ))}
            {section.list && (
              <ul className="space-y-2.5 mb-4">
                {section.list.map((item) => (
                  <li key={item} className="flex gap-3 font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed">
                    <span aria-hidden="true" className="mt-2.5 w-1 h-1 bg-(--c-accent) shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            )}
            {section.showPrices && prices.length > 0 && (
              <table className="w-full max-w-md font-(family-name:--f-body) text-sm border-t border-(--c-line)/40">
                <caption className="sr-only">{service.title} prices by length of stay</caption>
                <thead>
                  <tr className="text-left text-xs uppercase tracking-widest text-(--c-accent)">
                    <th scope="col" className="py-2 font-semibold">Length of stay</th>
                    <th scope="col" className="py-2 font-semibold text-right">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {prices.map((p) => (
                    <tr key={p.label} className="border-t border-(--c-line)/30">
                      <th scope="row" className="py-2 font-light text-left text-(--c-body)">{p.label}</th>
                      <td className="py-2 text-right text-(--c-ink) font-medium whitespace-nowrap">{rupee(p.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        ))}

        {service.faqs.length > 0 && (
          <section aria-labelledby="care-faqs" className="border-t border-(--c-line)/30 mt-4 pt-12 mb-12">
            <h2 id="care-faqs" className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-light mb-8">
              Common questions about {service.title.toLowerCase()}
            </h2>
            <div className="grid grid-cols-1 gap-8 max-w-[820px]">
              {service.faqs.map((faq) => (
                <div key={faq.q}>
                  <h3 className="font-(family-name:--f-display) text-lg sm:text-xl text-(--c-ink) font-medium mb-2">{faq.q}</h3>
                  <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed"><RichText text={faq.a} /></p>
                </div>
              ))}
            </div>
          </section>
        )}

        <FindUs
          heading="Where to find us in Shilaj"
          headingId="care-location"
          className="border-t border-(--c-line)/30 pt-12 mb-12"
        />

        {actions}
      </article>
    </PageShell>
  );
};
