import React from 'react';
import type { ServiceItem } from '../types';
import { CONDITIONS, SERVICES } from '../data/clinicData';
import { PageShell, DetailCta, FactList } from './PageShell';
import { Link } from '../seo/router';
import { conditionPath, servicePath } from '../seo/routes';

/** Treatment modality detail page. */
export const ServicePage: React.FC<{ service: ServiceItem }> = ({ service }) => {
  const treatedConditions = CONDITIONS.filter((condition) =>
    condition.recommendedTherapies.some(
      (therapy) =>
        therapy.toLowerCase().includes(service.title.toLowerCase()) ||
        service.title.toLowerCase().includes(therapy.split(' ')[0].toLowerCase()),
    ),
  );

  const otherServices = SERVICES.filter((item) => item.id !== service.id).slice(0, 3);

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
                    height={300}
                    loading="lazy"
                    decoding="async"
                    className="w-full aspect-[4/3] object-cover bg-(--c-surface-3)"
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
