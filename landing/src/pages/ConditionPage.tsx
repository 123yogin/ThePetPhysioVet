import React from 'react';
import type { ConditionItem } from '../types';
import { CONDITIONS, SPECIALISTS, servicesForCondition, CONTENT_REVIEWED_DISPLAY } from '../data/clinicData';
import { conditionFaqs } from '../data/conditionFaqs';
import { PageShell, DetailCta, FactList } from './PageShell';
import { Link, servicePathLink } from './links';
import { conditionPath } from '../seo/routes';

/**
 * Condition detail page.
 *
 * Content order is deliberate for extraction: H1, then a direct one-sentence
 * answer, then the structured facts (symptoms, therapies, recovery outlook) as
 * self-contained blocks. Each section stands alone without needing the previous
 * one — that is what lets an answer engine lift a passage and attribute it.
 */
export const ConditionPage: React.FC<{ condition: ConditionItem }> = ({ condition }) => {
  // Shared with the JSON-LD graph (seo/schema.ts) so the visible list below and
  // the related-service structured data can never disagree.
  const relatedServices = servicesForCondition(condition);
  const reviewer = SPECIALISTS[0];

  const otherConditions = CONDITIONS.filter(
    (item) => item.id !== condition.id && item.category === condition.category,
  ).slice(0, 3);

  return (
    <PageShell>
      <article className="max-w-[1280px] mx-auto px-4 sm:px-8 pb-16">
        <header className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start border-b border-(--c-line)/30 pb-12 mb-12">
          <div className="lg:col-span-7">
            <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-3 block">
              {condition.category} condition
            </span>
            <h1 style={{ ['--d' as string]: '280ms' }} className="hero-rise font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light leading-tight tracking-tight mb-6">
              {condition.title} Rehabilitation
            </h1>
            {/* Direct answer, first 100 words. */}
            <p className="font-(family-name:--f-body) text-lg text-(--c-body) font-light leading-relaxed mb-4">
              {condition.shortDesc}
            </p>
            <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed">
              {condition.fullDesc}
            </p>
            <dl className="mt-8 inline-flex flex-col gap-1 border-l-2 border-(--c-accent) pl-4">
              <dt className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold">
                Expected recovery
              </dt>
              <dd className="font-(family-name:--f-body) text-sm text-(--c-ink)">{condition.expectedRecoveryTime}</dd>
            </dl>
            {/* Visible reviewer line backing the MedicalWebPage reviewedBy/lastReviewed
                JSON-LD (seo/schema.ts) — structured data must mirror on-page content. */}
            {reviewer && (
              <p className="mt-6 text-xs text-(--c-body)/70 font-(family-name:--f-body)">
                Medically reviewed by {reviewer.name} · {CONTENT_REVIEWED_DISPLAY}
              </p>
            )}
          </div>

          <div className="lg:col-span-5">
            {condition.imageUrl && (
              <img
              src={condition.imageUrl}
              alt={condition.altText}
              width={800}
              height={600}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              className="w-full aspect-[4/3] object-cover bg-(--c-surface-3)"
            />
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16 mb-16">
          <FactList title={`Signs of ${condition.title}`} items={condition.symptoms} />
          <FactList title="Therapies we use" items={condition.recommendedTherapies} />
        </div>

        {/* Citable answer blocks. Each question is a self-contained passage an
            answer engine can lift and attribute — direct answer first, a concrete
            fact, clinic + locality named. Mirrored exactly in the FAQPage schema
            (see seo/schema.ts) from the same source. */}
        <section aria-labelledby="condition-faqs" className="border-t border-(--c-line)/30 pt-12 mb-16">
          <h2
            id="condition-faqs"
            className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-light mb-8"
          >
            Common questions about {condition.title}
          </h2>
          <div className="grid grid-cols-1 gap-8 max-w-[820px]">
            {conditionFaqs(condition).map((faq) => (
              <div key={faq.q}>
                <h3 className="font-(family-name:--f-display) text-lg sm:text-xl text-(--c-ink) font-medium mb-2">
                  {faq.q}
                </h3>
                <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed">
                  {faq.a}
                </p>
              </div>
            ))}
          </div>
        </section>

        {relatedServices.length > 0 && (
          <section aria-labelledby="related-treatments" className="border-t border-(--c-line)/30 pt-12">
            <h2
              id="related-treatments"
              className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-light mb-8"
            >
              Treatments used for {condition.title}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {relatedServices.map((service) => (
                <Link
                  key={service.id}
                  to={servicePathLink(service.id)}
                  className="group block bg-white p-5 border border-(--c-line)/30 hover:border-(--c-ink) transition-colors"
                >
                  <h3 className="font-(family-name:--f-display) text-lg text-(--c-ink) mb-2 font-medium group-hover:text-(--c-accent) transition-colors">
                    {service.title}
                  </h3>
                  <p className="font-(family-name:--f-body) text-sm text-(--c-body) font-light leading-relaxed">
                    {service.shortDesc}
                  </p>
                  <span className="mt-4 block text-xs uppercase tracking-wider text-(--c-accent) font-medium">
                    Typical session {service.duration}
                  </span>
                </Link>
              ))}
            </div>
          </section>
        )}

        {otherConditions.length > 0 && (
          <section aria-labelledby="related-conditions" className="border-t border-(--c-line)/30 mt-16 pt-12">
            <h2
              id="related-conditions"
              className="font-(family-name:--f-display) text-2xl text-(--c-ink) font-light mb-6"
            >
              Related conditions
            </h2>
            <ul className="flex flex-wrap gap-3">
              {otherConditions.map((item) => (
                <li key={item.id}>
                  <Link
                    to={conditionPath(item.id)}
                    className="inline-block px-4 py-2 border border-(--c-line) text-xs uppercase tracking-widest text-(--c-ink) hover:bg-(--c-ink) hover:text-white transition-colors"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <DetailCta label={`Book an assessment for ${condition.title}`} prefill={condition.title} />
      </article>
    </PageShell>
  );
};
