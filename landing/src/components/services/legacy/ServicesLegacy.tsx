import React from 'react';
import { SERVICES } from '../../../data/clinicData';
import { ArrowUpRight, Activity, Waves, Zap, Hand, Dumbbell, Home, Sparkles, BedDouble, ChevronLeft, ChevronRight } from 'lucide-react';
import { EntityCardLink } from '../../EntityCardLink';
import { servicePath } from '../../../seo/routes';
import { useStagger } from '../../../motion';
import { pad2 } from '../../../lib/format';

/**
 * The Services layouts used before the expanding panels: card grid
 * (`current`), snap rail (`rail`) and stacking cards (`stack`). Moved out of
 * ServicesSection unchanged so the design lab can still compare them, loaded
 * only when ?svc= selects one.
 */

const renderServiceIcon = (iconName: string) => {
  switch (iconName) {
    case 'healing':
      return <Activity className="w-9 h-9 text-(--c-ink)" />;
    case 'pool':
      return <Waves className="w-9 h-9 text-(--c-ink)" />;
    case 'flashlight_on':
      return <Zap className="w-9 h-9 text-(--c-ink)" />;
    case 'front_hand':
      return <Hand className="w-9 h-9 text-(--c-ink)" />;
    case 'fitness_center':
      return <Dumbbell className="w-9 h-9 text-(--c-ink)" />;
    case 'home':
      return <Home className="w-9 h-9 text-(--c-ink)" />;
    case 'bolt':
      return <Zap className="w-9 h-9 text-(--c-ink)" />;
    case 'star':
      return <Waves className="w-9 h-9 text-(--c-ink)" />;
    case 'night_shelter':
      return <BedDouble className="w-9 h-9 text-(--c-ink)" />;
    case 'sparkles':
      return <Sparkles className="w-9 h-9 text-(--c-ink)" />;
    default:
      // An unmapped name lands here, which is how three services silently
      // shared one icon after the service list was rewritten -- the fallback
      // hid the miss instead of surfacing it. Every `icon` in clinicData
      // should be matched by a case above.
      return <Activity className="w-9 h-9 text-(--c-ink)" />;
  }
};

const ServicesLegacy: React.FC<{ svc: string }> = ({ svc }) => {
  const gridRef = useStagger<HTMLDivElement>({ step: 110 });
  const railRef = React.useRef<HTMLDivElement>(null);
  const nudge = (dir: 1 | -1) => railRef.current?.scrollBy({ left: dir * 360, behavior: 'smooth' });

  return (
    <>
      {svc === 'rail' ? (
          /* Horizontal snap rail: swipe on a phone, arrows or trackpad on a
             desktop. Every card is still a real link in reading order. */
          <div className="relative -mx-4 sm:-mx-8">
            <div
              ref={railRef}
              className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-px-4 sm:scroll-px-8 px-4 sm:px-8 pb-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {SERVICES.map((service, i) => (
                <EntityCardLink
                  key={service.id}
                  href={servicePath(service.id)}
                  aria-label={`${service.title} treatment details`}
                  data-cursor="View"
                  className="snap-start shrink-0 w-[82%] sm:w-[360px] bg-(--c-card) border border-(--c-line)/30 p-8 group flex flex-col justify-between min-h-[380px] hover:-translate-y-1 transition-transform duration-500"
                >
                  <div>
                    <div className="flex items-center justify-between mb-10">
                      <span className="font-(family-name:--f-display) italic text-4xl text-(--c-accent)/50">{pad2(i + 1)}</span>
                      <div className="icon-nudge p-3 bg-(--c-surface-2) rounded-full">{renderServiceIcon(service.icon)}</div>
                    </div>
                    <h3 className="font-(family-name:--f-display) text-2xl text-(--c-ink) mb-3 font-medium group-hover:text-(--c-accent) transition-colors">{service.title}</h3>
                    <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed">{service.shortDesc}</p>
                  </div>
                  <div className="pt-4 mt-8 border-t border-(--c-line)/30 flex items-center justify-between text-xs font-(family-name:--f-body) uppercase tracking-widest">
                    <span className="text-(--c-body)">{service.duration}</span>
                    <span className="text-(--c-accent) font-semibold">View →</span>
                  </div>
                </EntityCardLink>
              ))}
            </div>
            <div className="hidden md:flex gap-2 justify-end px-8 mt-2">
              <button type="button" onClick={() => nudge(-1)} aria-label="Previous services" className="w-11 h-11 border border-(--c-ink)/30 flex items-center justify-center hover:bg-(--c-ink) hover:text-(--c-bg) transition-colors"><ChevronLeft className="w-5 h-5" /></button>
              <button type="button" onClick={() => nudge(1)} aria-label="More services" className="w-11 h-11 border border-(--c-ink)/30 flex items-center justify-center hover:bg-(--c-ink) hover:text-(--c-bg) transition-colors"><ChevronRight className="w-5 h-5" /></button>
            </div>
          </div>
        ) : svc === 'stack' ? (
          /* Sticky stacking cards: each service pins a little lower than the
             last and the next one slides over it, so the five read as a
             sequence. Pure CSS (position: sticky). */
          <div className="flex flex-col gap-6">
            {SERVICES.map((service, i) => (
              <EntityCardLink
                key={service.id}
                href={servicePath(service.id)}
                aria-label={`${service.title} treatment details`}
                data-cursor="View"
                className="sticky group bg-(--c-card) border border-(--c-line)/40 shadow-[0_-12px_40px_-24px_rgba(60,33,23,0.35)] p-8 sm:p-12 grid md:grid-cols-12 gap-8 items-start"
                style={{ top: `calc(var(--nav-h, 100px) + 1.5rem + ${i * 18}px)` }}
              >
                <div className="md:col-span-5">
                  <span className="font-(family-name:--f-display) italic text-6xl text-(--c-accent)/40 leading-none">{pad2(i + 1)}</span>
                  <h3 className="mt-4 font-(family-name:--f-display) text-3xl sm:text-4xl text-(--c-ink) font-medium group-hover:text-(--c-accent) transition-colors">{service.title}</h3>
                  <p className="mt-3 font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed">{service.fullDesc}</p>
                </div>
                <div className="md:col-span-7">
                  <p className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-4">What it includes</p>
                  <ul className="flex flex-wrap gap-2">
                    {service.benefits.map((b) => (
                      <li key={b} className="px-3.5 py-1.5 bg-(--c-surface) border border-(--c-line)/50 text-sm text-(--c-body)">{b}</li>
                    ))}
                  </ul>
                  <div className="mt-8 flex items-center justify-between text-xs uppercase tracking-widest">
                    <span className="text-(--c-body)">Typical session: {service.duration}</span>
                    <span className="text-(--c-accent) font-semibold">View treatment →</span>
                  </div>
                </div>
              </EntityCardLink>
            ))}
          </div>
        ) : (
        <>
        {/* Modalities Grid */}
        <div ref={gridRef} className="flex flex-wrap justify-center gap-px">
          {/* Three per row, and a short final row centres under them.

              This was a 3-column grid whose hairlines came from a container
              background showing through 1px gaps. That works only while every
              cell is filled: five services left the sixth cell uncovered, and
              the divider colour showed through it as a solid block. Centring a
              short row the same way would just split that block to both ends.

              So the border moved onto the cards and the container became a
              centred flex-wrap. Any count now closes tidily, with the remainder
              centred rather than left-aligned against an empty gap. */}
          {SERVICES.map((service) => (
            <EntityCardLink
              key={service.id}
              href={servicePath(service.id)}
              aria-label={`${service.title} treatment details`}
              data-cursor="View"
              data-tilt
              className="bg-(--c-surface) border border-(--c-line)/30 p-8 sm:p-12 hover:bg-(--c-card) transition-all duration-500 group cursor-pointer flex flex-col justify-between grow-0 shrink-0 basis-full md:basis-[calc(50%-1px)] lg:basis-[calc(33.333%-1px)]"
            >
              <div>
                <div className="flex items-center justify-between mb-8">
                  <div className="icon-nudge p-3 bg-(--c-surface-2) rounded-full group-hover:bg-(--c-ink)/10 transition-colors">
                    {renderServiceIcon(service.icon)}
                  </div>
                  <span className="p-2 text-(--c-accent) opacity-0 group-hover:opacity-100 transition-opacity">
                    <ArrowUpRight className="w-5 h-5" />
                  </span>
                </div>

                <h3 className="font-(family-name:--f-display) text-xl sm:text-2xl text-(--c-ink) mb-4 font-medium group-hover:text-(--c-accent) transition-colors">
                  {service.title}
                </h3>

                <p className="font-(family-name:--f-body) text-sm sm:text-base text-(--c-body) font-light leading-relaxed mb-6">
                  {service.shortDesc}
                </p>
              </div>

              {/* flex-wrap and a real gap: `justify-between` alone let the two
                  labels butt straight into each other once a duration was
                  longer than the old "45-60 min". */}
              <div className="pt-4 border-t border-(--c-line)/20 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs font-(family-name:--f-body) uppercase tracking-widest text-(--c-body)">
                <span>Typical Session: {service.duration}</span>
                <span className="text-(--c-accent) font-semibold group-hover:underline whitespace-nowrap">View Modality →</span>
              </div>
            </EntityCardLink>
          ))}
        </div>

        </>
        )}
    </>
  );
};

export default ServicesLegacy;
