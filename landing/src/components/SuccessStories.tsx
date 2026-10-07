import React from 'react';
import { SUCCESS_STORIES, GOOGLE_RATING } from '../data/clinicData';
import { Quote, Star } from 'lucide-react';

/**
 * Reviews as a single-row, auto-scrolling marquee. The track holds the reviews
 * duplicated so translateX(-50%) lands exactly on the start of the second copy —
 * a seamless, gapless loop. It pauses on hover and stops entirely under
 * prefers-reduced-motion (keyframes + the reduced-motion guard live in the
 * scoped <style> below so the whole effect is self-contained in this file).
 */
export const SuccessStories: React.FC = () => {
  // "Loved by pet parents" over an empty row is worse than no section at all.
  if (SUCCESS_STORIES.length === 0) return null;

  // Repeat the set so one copy already overflows the viewport (few reviews),
  // then duplicate that copy once more so the -50% scroll loops seamlessly.
  const base = [...SUCCESS_STORIES, ...SUCCESS_STORIES];
  const loop = [...base, ...base];

  return (
    <section id="success" className="py-20 sm:py-28 bg-(--c-card) overflow-hidden">
      {/* Header */}
      <div className="max-w-2xl mx-auto px-4 sm:px-8 mb-12 sm:mb-16 text-center">
        <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-2 block font-(family-name:--f-body)">
          What pet parents say
        </span>
        <h2 className="font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light text-balance">
          Loved by Ahmedabad pet parents
        </h2>
        <div className="mt-5 inline-flex items-center gap-2 font-(family-name:--f-body) text-sm text-(--c-body)">
          <span className="flex items-center gap-0.5" aria-hidden="true">
            {Array.from({ length: 5 }).map((_, i) => (
              <Star key={i} className="w-4 h-4 fill-(--c-accent) text-(--c-accent)" />
            ))}
          </span>
          <span>
            Rated {Number(GOOGLE_RATING.ratingValue).toFixed(1)} from{' '}
            {GOOGLE_RATING.reviewCount} reviews on Google
          </span>
        </div>
      </div>

      {/* Marquee */}
      <div className="testi-marquee relative">
        {/* Edge fades */}
        <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 sm:w-40 bg-gradient-to-r from-(--c-card) to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 sm:w-40 bg-gradient-to-l from-(--c-card) to-transparent" />

        <ul className="marquee-track flex w-max gap-5 sm:gap-6 px-4 sm:px-8" aria-label="Reviews from Google">
          {loop.map((story, i) => (
            <li
              key={i}
              aria-hidden={i >= SUCCESS_STORIES.length ? true : undefined}
              className="w-[280px] sm:w-[360px] shrink-0 flex flex-col justify-between bg-(--c-surface)/40 border border-(--c-line)/30 p-6 sm:p-7 transition-colors hover:border-(--c-accent)/50"
            >
              <div>
                <div
                  className="flex items-center gap-0.5 mb-4"
                  aria-label={`${story.rating} out of 5 stars`}
                >
                  {Array.from({ length: story.rating }).map((_, s) => (
                    <Star key={s} className="w-3.5 h-3.5 fill-(--c-accent) text-(--c-accent)" />
                  ))}
                </div>
                <Quote className="w-6 h-6 text-(--c-accent)/30 mb-3" aria-hidden="true" />
                <p className="font-(family-name:--f-body) text-base text-(--c-ink) font-light leading-relaxed">
                  {story.quote}
                </p>
              </div>
              <figcaption className="mt-6 pt-4 border-t border-(--c-line)/20 flex items-center gap-2 text-[11px] uppercase tracking-widest">
                <span className="font-semibold text-(--c-ink)">
                  {[story.petName, story.ownerName].filter(Boolean).join(' • ')}
                </span>
                <span className="text-(--c-accent)">· {story.source}</span>
              </figcaption>
            </li>
          ))}
        </ul>
      </div>

      <style>{`
        .marquee-track { animation: testimonial-scroll 48s linear infinite; }
        .testi-marquee:hover .marquee-track { animation-play-state: paused; }
        @keyframes testimonial-scroll { from { transform: translateX(0); } to { transform: translateX(-50%); } }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track { animation: none; transform: none; }
          .testi-marquee { overflow-x: auto; }
        }
      `}</style>
    </section>
  );
};
