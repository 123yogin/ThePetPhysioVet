import React from 'react';
import { PageShell } from './PageShell';
import { LegalDoc, LegalSection, NEEDS_CLINIC } from '../data/legalContent';

/**
 * Privacy and terms.
 *
 * The NEEDS_CLINIC callout is loud on purpose. A retention period or a
 * grievance officer is a commitment the business makes, not a fact that can be
 * read off the source, so the alternative to a visible gap is invented text
 * that reads like a promise nobody actually made. A blank that anyone can see
 * is safer than a sentence that sounds finished and is not.
 */

/**
 * The gap, named.
 *
 * Both callouts previously printed the identical sentence, so a reader met two
 * identical dashed boxes on one page and could not tell what was missing from
 * either. It now says which section it is standing in.
 */
const MissingFromClinic: React.FC<{ heading: string }> = ({ heading }) => (
  <p className="border border-dashed border-(--c-accent)/60 bg-(--c-surface) px-4 py-3 font-(family-name:--f-body) text-sm text-(--c-accent) leading-relaxed">
    <strong className="font-semibold">
      Still to be confirmed by the clinic: {heading.toLowerCase()}.
    </strong>{' '}
    Left blank on purpose rather than filled with boilerplate — this states a
    commitment only the practice can make.
  </p>
);

const Section: React.FC<{ section: LegalSection }> = ({ section }) => (
  <section className="mb-10">
    <h2 className="font-(family-name:--f-display) text-xl sm:text-2xl text-(--c-ink) font-medium mb-4">
      {section.heading}
    </h2>
    {section.body.map((para, i) =>
      para === NEEDS_CLINIC ? (
        <MissingFromClinic key={i} heading={section.heading} />
      ) : (
        <p
          key={i}
          className="font-(family-name:--f-body) text-sm sm:text-base text-(--c-body) font-light leading-relaxed mb-4"
        >
          {para}
        </p>
      ),
    )}
    {section.bullets && (
      <ul className="mt-2 space-y-2.5">
        {section.bullets.map((b) => (
          <li
            key={b}
            className="flex gap-3 font-(family-name:--f-body) text-sm text-(--c-body) font-light leading-relaxed"
          >
            <span aria-hidden="true" className="mt-2 w-1 h-1 bg-(--c-accent) shrink-0" />
            {b}
          </li>
        ))}
      </ul>
    )}
  </section>
);

export const LegalPage: React.FC<{ doc: LegalDoc }> = ({ doc }) => (
  <PageShell contentWidthClass="max-w-[760px]">
    <article className="max-w-[760px] mx-auto px-4 sm:px-8 pb-14 sm:pb-20 pt-4">
      <h1 style={{ ['--d' as string]: '280ms' }} className="hero-rise font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light mb-5">
        {doc.title}
      </h1>
      <p className="font-(family-name:--f-body) text-base sm:text-lg text-(--c-body) font-light leading-relaxed mb-4">
        {doc.intro}
      </p>
      {/* A policy with no date cannot be versioned, and a reader has no way to
          tell whether they are looking at the terms they agreed to. */}
      <p className="font-(family-name:--f-body) text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-12 pb-8 border-b border-(--c-line)/40">
        Last updated {doc.lastUpdated}
      </p>
      {doc.sections.map((s) => (
        <Section key={s.heading} section={s} />
      ))}
    </article>
  </PageShell>
);
