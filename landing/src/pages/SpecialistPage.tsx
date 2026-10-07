import React from 'react';
import type { Specialist } from '../types';
import { SPECIALISTS } from '../data/clinicData';
import { PageShell, DetailCta, FactList } from './PageShell';
import { Link } from '../seo/router';
import { specialistPath } from '../seo/routes';
import { SITE } from '../seo/siteConfig';

/**
 * Clinician profile page.
 *
 * This template exists for E-E-A-T reasons as much as UX ones: pet-health content
 * is YMYL-adjacent, and Google's guidance for that territory expects named,
 * credentialed authors with verifiable bio pages that clinical claims can point at.
 * Credentials are rendered as visible text AND emitted as
 * EducationalOccupationalCredential nodes in the Person schema.
 */
export const SpecialistPage: React.FC<{ specialist: Specialist }> = ({ specialist }) => {
  const colleagues = SPECIALISTS.filter((person) => person.id !== specialist.id);
  const credentials = specialist.credentials
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean);

  return (
    <PageShell>
      <article className="max-w-[1280px] mx-auto px-4 sm:px-8 pb-16">
        <header className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-start border-b border-(--c-line)/30 pb-12 mb-12">
          {specialist.imageUrl && (
            <div className="lg:col-span-4">
              <img
                src={specialist.imageUrl}
                alt={specialist.altText}
                width={600}
                height={750}
                loading="eager"
                fetchPriority="high"
                decoding="async"
                className="w-full aspect-4/5 object-cover bg-(--c-surface-3) grayscale"
              />
            </div>
          )}

          <div className={specialist.imageUrl ? 'lg:col-span-8' : 'lg:col-span-12'}>
            {specialist.experienceYears > 0 && (
              <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-3 block">
                {specialist.experienceYears}+ years clinical practice
              </span>
            )}
            <h1 style={{ ['--d' as string]: '280ms' }} className="hero-rise font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light leading-tight tracking-tight mb-2">
              {specialist.seoH1 ?? specialist.name}
            </h1>
            {specialist.role && (
              <p className="font-(family-name:--f-body) text-base text-(--c-accent) uppercase tracking-widest font-semibold mb-6">
                {specialist.role}
              </p>
            )}
            {specialist.bio && (
              <p className="font-(family-name:--f-body) text-lg text-(--c-body) font-light leading-relaxed mb-8">
                {specialist.bio}
              </p>
            )}

            {/* An empty "Credentials" heading over an empty list reads as a
                clinician with none, which is worse than not asking. */}
            {credentials.length > 0 && (
              <div>
                <h2 className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-3">
                  Credentials
                </h2>
                <ul className="flex flex-wrap gap-2">
                  {credentials.map((credential) => (
                    <li
                      key={credential}
                      className="px-3 py-1.5 bg-white border border-(--c-line)/50 font-(family-name:--f-body) text-xs text-(--c-ink)"
                    >
                      {credential}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 lg:gap-16">
          {specialist.specialties.length > 0 && (
            <FactList title="Areas of focus" items={specialist.specialties} />
          )}
          <div>
            <h2 className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-4">Practising at</h2>
            <p className="font-(family-name:--f-body) text-sm text-(--c-body) font-light leading-relaxed">
              {specialist.name} practises at {SITE.brandName} in {SITE.address.addressLocality}
              {colleagues.length > 0 ? ', working alongside the wider rehabilitation team' : ''}, on referral
              cases coordinated with each patient&apos;s primary veterinarian.
            </p>
          </div>
        </div>

        {colleagues.length > 0 && (
          <section aria-labelledby="team" className="border-t border-(--c-line)/30 mt-16 pt-12">
            <h2 id="team" className="font-(family-name:--f-display) text-2xl text-(--c-ink) font-light mb-6">
              Meet the rest of the team
            </h2>
            <ul className="flex flex-wrap gap-3">
              {colleagues.map((person) => (
                <li key={person.id}>
                  <Link
                    to={specialistPath(person.id)}
                    className="inline-block px-4 py-2 border border-(--c-line) text-xs uppercase tracking-widest text-(--c-ink) hover:bg-(--c-ink) hover:text-white transition-colors"
                  >
                    {person.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <DetailCta label={`Request a consult with ${specialist.name}`} prefill={specialist.name} />
      </article>
    </PageShell>
  );
};
