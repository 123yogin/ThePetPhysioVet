import React from 'react';
import { CONDITIONS, SERVICES } from '../data/clinicData';
import { PageShell } from './PageShell';
import { Link } from '../seo/router';
import { conditionPath, servicePath } from '../seo/routes';

/**
 * 404 template. Marked `noindex, follow` by the metadata layer so the URL drops
 * out of the index while the links on it stay crawlable.
 */
export const NotFoundPage: React.FC = () => (
  <PageShell>
    <div className="max-w-[1280px] mx-auto px-4 sm:px-8 py-16">
      <p className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-3">Error 404</p>
      <h1 style={{ ['--d' as string]: '280ms' }} className="hero-rise font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light mb-6">
        We couldn't find that page
      </h1>
      <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed max-w-xl mb-12">
        The page may have moved. Start from a rehabilitation programme or treatment below, or head back to the homepage.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
        <nav aria-labelledby="nf-conditions">
          <h2 id="nf-conditions" className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-4">
            Conditions we treat
          </h2>
          <ul className="space-y-2">
            {CONDITIONS.map((condition) => (
              <li key={condition.id}>
                <Link
                  to={conditionPath(condition.id)}
                  className="font-(family-name:--f-body) text-sm text-(--c-ink) hover:text-(--c-accent) transition-colors"
                >
                  {condition.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <nav aria-labelledby="nf-services">
          <h2 id="nf-services" className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-4">
            Treatments
          </h2>
          <ul className="space-y-2">
            {SERVICES.map((service) => (
              <li key={service.id}>
                <Link
                  to={servicePath(service.id)}
                  className="font-(family-name:--f-body) text-sm text-(--c-ink) hover:text-(--c-accent) transition-colors"
                >
                  {service.title}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  </PageShell>
);
