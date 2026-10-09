import React from 'react';
import type { ServiceItem } from '../types';
import { CONDITIONS, SERVICES, servicesForCondition } from '../data/clinicData';
import { TREATMENT_CONTENT } from '../data/treatmentContent';
import { PageShell, DetailCta, FactList } from './PageShell';
import { Link } from '../seo/router';
import { conditionPath, servicePath } from '../seo/routes';
import { useRouter } from '../seo/router';
import { bookableByCode } from '../data/bookableServices';
import { bookingHref } from '../components/BookingPanel';
import { usePublicServiceCodes } from '../hooks/usePublicServiceCodes';
import { rupee } from '../lib/format';

/** Treatment pages that also sell a priced, bookable service: page id -> booking code. */
const PRICED_BOOKING: Record<string, string> = { hydrotherapy: 'Hydrotherapy' };

/**
 * "Swimming sessions and prices" on the hydrotherapy page. The prices are the
 * Swimming card's own list in bookableServices.ts -- the same numbers the
 * homepage card and the booking panel show -- rendered statically so they are
 * in the prerendered HTML. Book appears only when the live API offers the code.
 */
const SwimmingPrices: React.FC<{ code: string }> = ({ code }) => {
  const { path, navigate } = useRouter();
  const codes = usePublicServiceCodes();
  const card = bookableByCode(code);
  const grooming = bookableByCode('Grooming');
  const combo = grooming?.priceList?.find((p) => /swim/i.test(p.label));
  if (!card?.priceList?.length) return null;
  const bookHref = codes.includes(code) ? bookingHref(path, { service: code }) : null;

  return (
    <section id="swimming-prices" aria-labelledby="swimming-prices-h" className="max-w-3xl mb-12 scroll-mt-32">
      <h2 id="swimming-prices-h" className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-light mb-4">
        Swimming sessions and prices
      </h2>
      <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed mb-4">
        {card.summary} {card.includes.join(', ')}. Book a single session, or a pack of five or eight
        sessions at a lower price per session. If your dog is recovering from surgery, injury or a
        spinal or joint problem, start with an assessment so the vet can plan hydrotherapy as part of
        their rehab.
      </p>
      <table className="w-full max-w-md font-(family-name:--f-body) text-sm border-t border-(--c-line)/40 mb-4">
        <caption className="sr-only">Dog swimming session prices</caption>
        <thead>
          <tr className="text-left text-xs uppercase tracking-widest text-(--c-accent)">
            <th scope="col" className="py-2 font-semibold">Session</th>
            <th scope="col" className="py-2 font-semibold text-right">Price</th>
          </tr>
        </thead>
        <tbody>
          {card.priceList.map((p) => (
            <tr key={p.label} className="border-t border-(--c-line)/30">
              <th scope="row" className="py-2 font-light text-left text-(--c-body)">{p.label}</th>
              <td className="py-2 text-right text-(--c-ink) font-medium whitespace-nowrap">{rupee(p.price)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {combo && (
        <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed mb-4">
          Swim, groom, shampoo and dry together for {rupee(combo.price)}: see{' '}
          <Link to="/#book" className="text-(--c-accent) underline underline-offset-2 hover:text-(--c-ink)">
            grooming and the other services
          </Link>
          .
        </p>
      )}
      <p className="font-(family-name:--f-body) text-sm text-(--c-body) font-light leading-relaxed mb-4">
        Paid at the clinic.
      </p>
      <div className="min-h-11">
        {bookHref && (
          <a
            href={bookHref}
            onClick={(event) => {
              if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              navigate(bookHref);
            }}
            className="inline-flex items-center justify-center min-h-11 px-7 bg-(--c-ink) text-white text-xs uppercase tracking-widest font-medium hover:bg-(--c-accent) transition-colors"
          >
            Book a swimming session
          </a>
        )}
      </div>
    </section>
  );
};

/** Render prose containing [[label|/path]] inline links as real, crawlable anchors. */
export const RichText: React.FC<{ text: string }> = ({ text }) => {
  const parts = text.split(/(\[\[[^|\]]+\|[^\]]+\]\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\[\[([^|\]]+)\|([^\]]+)\]\]$/);
        return m ? (
          <Link key={i} to={m[2]} className="text-(--c-accent) underline underline-offset-2 hover:text-(--c-ink)">
            {m[1]}
          </Link>
        ) : (
          <React.Fragment key={i}>{part}</React.Fragment>
        );
      })}
    </>
  );
};

/** Treatment modality detail page. */
export const ServicePage: React.FC<{ service: ServiceItem }> = ({ service }) => {
  // Same matcher as the condition pages and the JSON-LD, so the two directions agree.
  const treatedConditions = CONDITIONS.filter((condition) =>
    servicesForCondition(condition).some((item) => item.id === service.id),
  );
  const content = TREATMENT_CONTENT[service.id];

  const otherServices = SERVICES.filter((item) => item.id !== service.id);

  return (
    <PageShell>
      <article className="max-w-[1280px] mx-auto px-4 sm:px-8 pb-16">
        <header className="max-w-3xl border-b border-(--c-line)/30 pb-12 mb-12">
          <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-3 block">
            Treatment modality
          </span>
          <h1 style={{ ['--d' as string]: '280ms' }} className="hero-rise font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light leading-tight tracking-tight mb-6">
            {service.seoH1 ?? service.title}
          </h1>
          <p className="font-(family-name:--f-body) text-lg text-(--c-body) font-light leading-relaxed mb-4">
            {service.shortDesc}
          </p>
          <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed">
            {service.fullDesc}
          </p>
          <dl className="mt-8 inline-flex flex-col gap-1 border-l-2 border-(--c-accent) pl-4">
            <dt className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold">Typical session</dt>
            <dd className="font-(family-name:--f-body) text-sm text-(--c-ink)">{service.duration}</dd>
          </dl>
        </header>

        {content?.sections.map((section, i) => (
          <section key={section.heading} aria-labelledby={`sec-${i}`} className="max-w-3xl mb-12">
            <h2 id={`sec-${i}`} className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-light mb-4">
              {section.heading}
            </h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed mb-4">
                <RichText text={paragraph} />
              </p>
            ))}
          </section>
        ))}

        {PRICED_BOOKING[service.id] && <SwimmingPrices code={PRICED_BOOKING[service.id]} />}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 mb-16">
          <FactList title="What&rsquo;s included" items={service.benefits} />
          <FactList title="Suitable for" items={service.suitableFor} />
        </div>

        {treatedConditions.length > 0 && (
          <section aria-labelledby="treats" className="border-t border-(--c-line)/30 pt-12">
            <h2 id="treats" className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-light mb-8">
              Conditions treated with {service.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {treatedConditions.map((condition) => (
                <Link
                  key={condition.id}
                  to={conditionPath(condition.id)}
                  className="group block bg-white border border-(--c-line)/30 hover:border-(--c-ink) transition-colors"
                >
                  <img
                    src={condition.imageUrl}
                    alt={condition.altText}
                    width={400}
                    height={500}
                    loading="lazy"
                    decoding="async"
                    className="w-full aspect-[4/5] object-cover bg-(--c-surface-3)"
                  />
                  <div className="p-4">
                    <h3 className="font-(family-name:--f-display) text-lg text-(--c-ink) font-medium group-hover:text-(--c-accent) transition-colors">
                      {condition.title}
                    </h3>
                    <p className="mt-2 font-(family-name:--f-body) text-sm text-(--c-body) font-light leading-relaxed">
                      {condition.shortDesc}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {content && content.faqs.length > 0 && (
          <section aria-labelledby="service-faqs" className="border-t border-(--c-line)/30 mt-16 pt-12">
            <h2 id="service-faqs" className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-light mb-8">
              Common questions about {service.title.toLowerCase()}
            </h2>
            <div className="grid grid-cols-1 gap-8 max-w-[820px]">
              {content.faqs.map((faq) => (
                <div key={faq.q}>
                  <h3 className="font-(family-name:--f-display) text-lg sm:text-xl text-(--c-ink) font-medium mb-2">{faq.q}</h3>
                  <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed"><RichText text={faq.a} /></p>
                </div>
              ))}
            </div>
          </section>
        )}

        {otherServices.length > 0 && (
          <section aria-labelledby="other-treatments" className="border-t border-(--c-line)/30 mt-16 pt-12">
            <h2 id="other-treatments" className="font-(family-name:--f-display) text-2xl text-(--c-ink) font-light mb-6">
              Other treatments
            </h2>
            <ul className="flex flex-wrap gap-3">
              {otherServices.map((item) => (
                <li key={item.id}>
                  <Link
                    to={servicePath(item.id)}
                    className="inline-block px-4 py-2 border border-(--c-line) text-xs uppercase tracking-widest text-(--c-ink) hover:bg-(--c-ink) hover:text-white transition-colors"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <DetailCta label={`Book ${service.title}`} prefill={service.title} />
      </article>
    </PageShell>
  );
};
