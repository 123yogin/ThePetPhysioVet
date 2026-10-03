import React from 'react';
import { SPECIALISTS } from '../data/clinicData';
import { Calendar } from 'lucide-react';
import { EntityCardLink } from './EntityCardLink';
import { specialistPath } from '../seo/routes';
import { SplitWords, useStagger } from '../motion';
import { Pulse, ScrollInk } from '../motion/extras';
import { useLab } from '../lab/Lab';

interface SpecialistsSectionProps {
  onOpenBookingWithSpecialist: (specialistName: string) => void;
}

export const SpecialistsSection: React.FC<SpecialistsSectionProps> = ({
  onOpenBookingWithSpecialist,
}) => {
  const cardsRef = useStagger<HTMLDivElement>({ step: 120 });
  const portraitRef = useStagger<HTMLDivElement>({ variant: 'wipe', selector: '.rv-img' });
  const { doc } = useLab();

  // Founder-story variant: one clinician told as a person, not a directory
  // entry. The arch frame repeats the hero's, so the two portraits rhyme.
  if (doc === 'story' && SPECIALISTS.length === 1) {
    const spec = SPECIALISTS[0];
    const [first, ...rest] = spec.name.split(' ');
    return (
      // No id here: this variant sits behind SplitDoorsReveal, whose wrapper
      // carries #about so a nav jump lands with the doors already open.
      <section className="py-20 sm:py-28 bg-(--c-surface) overflow-hidden">
        <div ref={portraitRef} className="max-w-[1280px] mx-auto px-4 sm:px-8 grid lg:grid-cols-12 gap-12 lg:gap-20 items-center">
          <div className="lg:col-span-5">
            {spec.imageUrl && (
              <div data-drift className="rv-img relative aspect-[4/5] rounded-t-[999px] overflow-hidden border border-(--c-line) max-w-[440px] mx-auto shadow-[0_40px_80px_-30px_rgba(60,33,23,0.35)]">
                <img src={spec.imageUrl} alt={spec.altText} width={600} height={800} loading="lazy" decoding="async" className="w-full h-full object-cover" />
              </div>
            )}
          </div>
          <div className="lg:col-span-7">
            <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-3 flex items-center gap-3 font-(family-name:--f-body)">
              <Pulse />
              Meet your clinician
            </span>
            <h2 className="font-(family-name:--f-display) text-4xl sm:text-5xl lg:text-6xl text-(--c-ink) font-light leading-[1.05]">
              {first} <em className="acc-italic">{rest.join(' ')}</em>
            </h2>
            <p className="mt-3 text-xs uppercase tracking-widest text-(--c-accent) font-semibold">{spec.role}</p>
            {(spec.credentialsShort || spec.credentials) && (
              <p className="mt-1 text-sm text-(--c-body) italic">{spec.credentialsShort || spec.credentials}</p>
            )}
            {spec.bio && (
              <ScrollInk text={spec.bio} className="mt-8 font-(family-name:--f-display) text-xl sm:text-2xl text-(--c-ink) font-light leading-snug max-w-2xl" />
            )}
            {spec.specialties.length > 0 && (
              <ul className="mt-8 flex flex-wrap gap-2">
                {spec.specialties.map((t) => (
                  <li key={t} className="px-3.5 py-1.5 bg-(--c-card) border border-(--c-line)/60 text-sm text-(--c-body)">{t}</li>
                ))}
              </ul>
            )}
            <div className="mt-10 flex flex-col sm:flex-row gap-3">
              <button
                data-magnetic
                onClick={() => onOpenBookingWithSpecialist(spec.name)}
                className="inline-flex justify-center items-center gap-2 h-12 px-8 bg-(--c-ink) text-(--c-card) text-xs uppercase tracking-widest font-medium"
              >
                <Calendar className="w-4 h-4" />
                <span>Request consult</span>
              </button>
              {(spec.bio || spec.credentials) && (
                <EntityCardLink
                  href={specialistPath(spec.id)}
                  className="inline-flex justify-center items-center h-12 px-8 border border-(--c-ink) text-(--c-ink) text-xs uppercase tracking-widest font-medium"
                >
                  Full bio &amp; credentials
                </EntityCardLink>
              )}
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section id="about" className="py-20 sm:py-28 bg-(--c-surface)">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
        {/* Header */}
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-2 flex items-center gap-3 justify-center font-(family-name:--f-body)">
            <Pulse />
            Veterinary Leadership
          </span>
          <SplitWords className="font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light mb-4">
            {SPECIALISTS.length === 1 ? 'Meet Your Clinician' : 'Meet Our Specialists'}
          </SplitWords>
          {/* "board-certified clinicians", plural, described three people who
              were never here. Neither the plural nor the certification claim
              is something this site can currently substantiate. */}
          <p className="font-(family-name:--f-body) text-base sm:text-lg text-(--c-body) font-light">
            Advanced veterinary science combined with gentle, hands-on rehabilitation.
          </p>
        </div>

        {/* Team Grid. Column count follows the real headcount — a fixed
            3-up grid left one clinician stranded beside two empty columns. */}
        <div
          ref={(el) => {
            cardsRef.current = el;
            portraitRef.current = el;
          }}
          className={`grid gap-12 sm:gap-16 ${
            SPECIALISTS.length === 1
              ? 'grid-cols-1 max-w-4xl mx-auto'
              : SPECIALISTS.length === 2
                ? 'grid-cols-1 md:grid-cols-2'
                : 'grid-cols-1 md:grid-cols-3'
          }`}
        >
          {SPECIALISTS.map((spec) => (
            <div
              key={spec.id}
              className={`text-left group bg-(--c-card) p-6 border border-(--c-line)/30 hover:border-(--c-ink) transition-all ${
                SPECIALISTS.length === 1
                  ? 'sm:grid sm:grid-cols-[minmax(0,280px)_1fr] sm:gap-10 sm:items-center sm:p-8'
                  : 'flex flex-col justify-between'
              }`}
            >
              {/* Portrait cell — first grid column when there is one clinician.

                  This cell owns the portrait whether or not a photograph
                  exists, which is the point: the image must not live inside
                  the details block here, or the day a real photo arrives the
                  grid's first column becomes the text and the whole card
                  collapses to 280px.

                  Until then, the frame carries the brand mark and says plainly
                  that a portrait is coming. A stock face is not an option under
                  a named person — that invents a real individual's likeness,
                  which is worse than the generic stock used elsewhere.

                  max-w on the small breakpoint: stacked at 390px an unbounded
                  3:4 frame is ~520px tall and pushes the clinician's name off
                  the screen entirely. */}
              {SPECIALISTS.length === 1 && (
                <div className="mb-6 sm:mb-0 max-w-[240px] sm:max-w-none mx-auto sm:mx-0 w-full">
                  {spec.imageUrl ? (
                    <div data-drift className="rv-img overflow-hidden aspect-[3/4] bg-(--c-surface-3) relative">
                      <img
                        src={spec.imageUrl}
                        alt={spec.altText}
                        width={600}
                        height={800}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                      {spec.experienceYears > 0 && (
                        <div className="absolute top-3 left-3 bg-(--c-ink) text-white text-[10px] uppercase tracking-widest px-2.5 py-1 font-semibold">
                          {spec.experienceYears}+ Yrs Clinical Practice
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="aspect-[3/4] bg-(--c-surface) border border-(--c-line)/40 flex flex-col items-center justify-center gap-4 text-center px-6">
                      <img
                        src="/logo.svg"
                        alt=""
                        aria-hidden="true"
                        width={96}
                        height={96}
                        className="w-20 h-20 sm:w-24 sm:h-24 rounded-full opacity-40"
                      />
                      <span className="font-(family-name:--f-body) text-[11px] uppercase tracking-widest text-(--c-accent) font-semibold">
                        Portrait to come
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Details and actions are one column, not two grid rows.

                  `contents` makes this wrapper vanish from layout, so with
                  several clinicians the two children are still the direct flex
                  items of the card and `justify-between` pins the buttons to
                  the bottom exactly as before. With one clinician it becomes
                  the second grid cell, and the buttons follow the bio instead
                  of being pushed to the foot of the taller portrait column. */}
              <div className={SPECIALISTS.length === 1 ? 'flex flex-col' : 'contents'}>
                <div>
                  {/* Multi-clinician layout only — the single-clinician card
                      renders its portrait in the grid cell above. No stock
                      photograph stands in for a clinician who has not supplied
                      one, and no "0+ Yrs Clinical Practice" badge. */}
                  {SPECIALISTS.length > 1 && spec.imageUrl && (
                    <div className="overflow-hidden mb-6 aspect-[3/4] bg-(--c-surface-3) relative">
                      <img
                        src={spec.imageUrl}
                        alt={spec.altText}
                        width={600}
                        height={800}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700 ease-out"
                      />
                      {spec.experienceYears > 0 && (
                        <div className="absolute top-3 left-3 bg-(--c-ink) text-white text-[10px] uppercase tracking-widest px-2.5 py-1 font-semibold">
                          {spec.experienceYears}+ Yrs Clinical Practice
                        </div>
                      )}
                    </div>
                  )}

                  <h3 className="font-(family-name:--f-display) text-2xl text-(--c-ink) mb-1 font-medium">
                    {spec.name}
                  </h3>

                  {spec.role && (
                    <p className="font-(family-name:--f-body) text-xs text-(--c-accent) mb-2 tracking-widest uppercase font-semibold">
                      {spec.role}
                    </p>
                  )}

                  {(spec.credentialsShort || spec.credentials) && (
                    <p className="font-(family-name:--f-body) text-xs text-(--c-body) mb-4 italic border-b border-(--c-line)/20 pb-3">
                      {spec.credentialsShort || spec.credentials}
                    </p>
                  )}

                  {spec.bio && (
                    <ScrollInk
                      text={spec.bio}
                      className="font-(family-name:--f-body) text-sm text-(--c-body) font-light leading-relaxed mb-6"
                    />
                  )}
                </div>

                <div
                  className={`pt-4 border-t border-(--c-line)/20 flex flex-col gap-2 ${
                    SPECIALISTS.length === 1 ? 'sm:flex-row sm:gap-3' : ''
                  }`}
                >
                  {/* Don't promise a bio and credentials the profile page has
                    nothing to show for. */}
                  {(spec.bio || spec.credentials) && (
                    <EntityCardLink
                      href={specialistPath(spec.id)}
                      className="w-full py-2 bg-(--c-surface-2) hover:bg-(--c-surface-3) text-(--c-ink) font-(family-name:--f-body) text-xs uppercase tracking-widest font-medium border border-(--c-line)/50 cursor-pointer text-center block"
                    >
                      View Full Bio &amp; Credentials
                    </EntityCardLink>
                  )}

                  <button
                    onClick={() => onOpenBookingWithSpecialist(spec.name)}
                    className="w-full py-2 bg-(--c-ink) text-white hover:bg-(--c-body) font-(family-name:--f-body) text-xs uppercase tracking-widest font-medium flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Calendar className="w-3.5 h-3.5" />
                    <span>Request Consult</span>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
