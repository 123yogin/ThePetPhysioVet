import React from 'react';
import { SUCCESS_STORIES } from '../data/clinicData';
import { Quote, Sparkles } from 'lucide-react';

export const SuccessStories: React.FC = () => {

  // "Real outcomes, restored joy" over an empty grid is worse than no section
  // at all. Hooks run first so this stays a legal early return.
  if (SUCCESS_STORIES.length === 0) return null;

  return (
    <section id="success" className="py-20 sm:py-28 bg-(--c-card)">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
        
        {/* Header */}
        <div className="mb-16 text-center max-w-2xl mx-auto">
          <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-2 block font-(family-name:--f-body)">
            Patient Transformation
          </span>
          <h2 className="font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light mb-4">
            Success Stories
          </h2>
          <p className="font-(family-name:--f-body) text-base sm:text-lg text-(--c-body) font-light">
            Real outcomes, restored joy, and active mobility recovered by our dedicated veterinary rehabilitation patients.
          </p>
        </div>

        {/* Stories Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 sm:gap-16">
          {SUCCESS_STORIES.map((story) => (
            <div
              key={story.id}
              className="border-l-2 border-(--c-ink)/30 pl-6 sm:pl-10 py-4 flex flex-col justify-between hover:border-(--c-ink) transition-all bg-(--c-surface)/30 p-6"
            >
              <div>
                <Quote className="w-8 h-8 text-(--c-accent)/40 mb-4" />
                <p className="font-(family-name:--f-body) text-base sm:text-lg text-(--c-body) italic font-light leading-relaxed mb-8">
                  {story.quote}
                </p>

                <div className="bg-(--c-card) p-4 border border-(--c-line)/30 mb-6 text-xs text-(--c-body)">
                  <span className="font-semibold text-(--c-ink) block mb-1">Clinical Outcome:</span>
                  {story.storyDetails}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 pt-4 border-t border-(--c-line)/20">
                <div className="flex items-center gap-4">
                  <img
                    src={story.imageUrl}
                    alt={story.altText}
                    width={56}
                    height={56}
                    loading="lazy"
                    decoding="async"
                    className="w-14 h-14 object-cover grayscale rounded-none border border-(--c-line)/40"
                  />
                  <div>
                    <h4 className="font-(family-name:--f-display) text-lg text-(--c-ink) font-medium">
                      {story.petName} <span className="text-xs text-(--c-accent) font-normal">({story.breed})</span>
                    </h4>
                    <p className="font-(family-name:--f-body) text-xs text-(--c-body) uppercase tracking-widest mt-0.5">
                      {story.condition} • {story.ownerName}
                    </p>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1 text-[11px] font-semibold bg-(--c-surface-2) text-(--c-ink) px-3 py-1 uppercase tracking-wider border border-(--c-line)/40 shrink-0">
                  <Sparkles className="w-3 h-3 text-(--c-accent)" />
                  {story.duration}
                </span>
              </div>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
};
