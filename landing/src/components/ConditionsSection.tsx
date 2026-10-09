import React, { useLayoutEffect, useRef, useState } from 'react';
import { CONDITIONS } from '../data/clinicData';
import { ArrowRight, Info, Play } from 'lucide-react';
import { EntityCardLink } from './EntityCardLink';
import { conditionPath } from '../seo/routes';
import { SplitWords, useReveal, useStagger } from '../motion';
import { Pulse } from '../motion/extras';

export const ConditionsSection: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = [
    { id: 'all', label: 'All Conditions' },
    { id: 'degenerative', label: 'Degenerative & Joint' },
    { id: 'post-op', label: 'Post-Surgical' },
    { id: 'neurological', label: 'Neurological & Spinal' },
    { id: 'lifestyle', label: 'Senior & Lifestyle' },
  ];

  const headRef = useStagger<HTMLDivElement>({ step: 140 });
  // The chip row rises in as one block: staggering the chips individually
  // would carry them out from under the sliding pill while it stood still.
  const chipsRef = useReveal<HTMLDivElement>({ delay: 120 });
  const chipRowRef = useRef<HTMLDivElement>(null);
  const [pill, setPill] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  useLayoutEffect(() => {
    const row = chipRowRef.current;
    if (!row) return;
    const measure = () => {
      const el = row.querySelector<HTMLElement>(`[data-cat="${selectedCategory}"]`);
      if (!el) return;
      const next = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      // Only re-render when the geometry actually changed: the resize
      // observer fires repeatedly while fonts and images settle.
      setPill((prev) =>
        prev && prev.x === next.x && prev.y === next.y && prev.w === next.w && prev.h === next.h ? prev : next,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    return () => ro.disconnect();
  }, [selectedCategory]);
  // Re-armed per filter, so a newly shown set of cards arrives the same way.
  const gridRef = useStagger<HTMLDivElement>({ step: 90 }, [selectedCategory]);
  const imgRef = useStagger<HTMLDivElement>({ step: 90, variant: 'wipe', selector: '.rv-img' }, [selectedCategory]);

  const filteredConditions = selectedCategory === 'all'
    ? CONDITIONS
    : CONDITIONS.filter(c => c.category === selectedCategory);

  return (
    <section id="conditions" className="py-20 sm:py-28 bg-(--c-surface)">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
        
        {/* Header */}
        <div ref={headRef} className="mb-12 sm:mb-16 grid grid-cols-1 md:grid-cols-12 gap-6 items-end border-b border-(--c-line)/30 pb-8">
          <div className="md:col-span-7">
            <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-2 flex items-center gap-3 font-(family-name:--f-body)">
            <Pulse />
              Targeted Rehabilitation
            </span>
            <SplitWords className="font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light">Conditions We Treat</SplitWords>
          </div>
          <div className="md:col-span-5 md:text-right">
            <p className="font-(family-name:--f-body) text-base sm:text-lg text-(--c-body) font-light leading-relaxed">
              Rehabilitation plans built around what your vet has already told us about your pet.
            </p>
          </div>
        </div>

        {/* Category Filter Tabs */}
        {/* A brown pill slides from chip to chip. It is measured after
            mount; until then (and on the server) the selected chip paints its
            own brown background, so the static page looks exactly as before. */}
        <div ref={chipsRef} className="relative mb-12">
          <span
            aria-hidden="true"
            className="absolute bg-(--c-ink) shadow-xs transition-[left,top,width,height] duration-500 ease-[cubic-bezier(0.7,0,0.2,1)] motion-reduce:transition-none"
            style={pill ? { left: pill.x, top: pill.y, width: pill.w, height: pill.h } : { display: 'none' }}
          />
          <div ref={chipRowRef} className="relative flex flex-wrap gap-2 sm:gap-3">
            {categories.map((cat) => {
              const active = selectedCategory === cat.id;
              return (
                <button
                  key={cat.id}
                  data-cat={cat.id}
                  aria-pressed={active}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 sm:px-5 py-2 sm:py-2.5 text-xs uppercase tracking-widest transition-colors duration-300 font-(family-name:--f-body) cursor-pointer border ${
                    active
                      ? `${pill ? 'bg-transparent border-transparent' : 'bg-(--c-ink) border-(--c-ink)'} text-(--c-card) font-medium`
                      : 'bg-(--c-card) text-(--c-body) hover:bg-(--c-hover) border-(--c-line)/40'
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Conditions Grid */}
        <div
          ref={(el) => {
            gridRef.current = el;
            imgRef.current = el;
          }}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-8 gap-y-12 sm:gap-y-16"
        >
          {filteredConditions.map((condition) => (
            <EntityCardLink
              key={condition.id}
              href={conditionPath(condition.id)}
              aria-label={`${condition.title} rehabilitation`}
              data-cursor="View"
              className="group cursor-pointer flex flex-col justify-between h-full bg-(--c-card) p-4 sm:p-5 border border-(--c-line)/30 hover:border-(--c-ink) transition-all hover:shadow-md"
            >
              <div>
                {/* The whole frame is conditional, not just the <img>.
                    Guarding only the image leaves an empty 238x179 grey panel
                    on every card -- eight blank rectangles that read as failed
                    loads rather than as cards awaiting a photograph. */}
                {condition.imageUrl && (
                  <div data-drift className="rv-img aspect-[4/3] relative overflow-hidden mb-5 bg-(--c-surface-3)">
                    <img
                      src={condition.imageUrl}
                      alt={condition.altText}
                      width={400}
                      height={300}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 ease-out grayscale-[10%]"
                    />
                    {condition.videoUrl && (
                      <div className="absolute bottom-3 left-3 flex items-center gap-1.5 bg-(--c-ink)/80 text-white text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full">
                        <Play className="w-3 h-3 fill-white" /> Watch
                      </div>
                    )}
                    <div className="absolute top-3 right-3 bg-(--c-bg)/90 backdrop-blur-xs p-1.5 rounded-full text-(--c-ink) opacity-0 group-hover:opacity-100 transition-opacity">
                      <Info className="w-4 h-4" />
                    </div>
                  </div>
                )}

                <span className="text-[10px] uppercase tracking-widest text-(--c-accent) font-semibold mb-1 block">
                  {condition.category}
                </span>

                <h3 className="font-(family-name:--f-display) text-xl sm:text-2xl text-(--c-ink) mb-2 font-medium group-hover:text-(--c-accent) transition-colors">
                  {condition.title}
                </h3>

                <p className="font-(family-name:--f-body) text-sm text-(--c-body) font-light leading-relaxed mb-4">
                  {condition.shortDesc}
                </p>
              </div>

              <div className="pt-3 border-t border-(--c-line)/20 flex items-center justify-between text-xs font-medium text-(--c-ink) group-hover:translate-x-1 transition-transform">
                <span className="uppercase tracking-wider">Learn Protocol</span>
                <ArrowRight className="w-4 h-4 text-(--c-accent)" />
              </div>
            </EntityCardLink>
          ))}
        </div>

      </div>
    </section>
  );
};
