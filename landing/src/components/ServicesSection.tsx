/// <reference types="vite/client" />
import React from 'react';
import { SplitWords, useStagger } from '../motion';
import { useLab } from '../lab/Lab';
import { Pulse } from '../motion/extras';
import ServicesPanels from './services/ServicesPanels';

// Design-lab candidates, one file each under ./services/, loaded only when
// ?svc=<name> selects them so none of them weighs on the main bundle.
// (The chosen default, `panels`, is imported statically above so it is in
// the prerendered HTML.)
const CANDIDATES: Record<string, string> = {
  index: './services/ServicesIndex.tsx',
  scrolly: './services/ServicesScrolly.tsx',
  hscroll: './services/ServicesHScroll.tsx',
  bento: './services/ServicesBento.tsx',
};
const candidateModules = import.meta.glob<{ default: React.ComponentType }>(['./services/*.tsx', '!./services/ServicesPanels.tsx']);
// The earlier layouts (card grid, snap rail, stacking cards), kept for
// comparison in the lab but out of the main bundle.
const LegacyLayouts = React.lazy(() => import('./services/legacy/ServicesLegacy'));
const lazyCache: Record<string, React.LazyExoticComponent<React.ComponentType>> = {};
const candidate = (id: string) => {
  const load = candidateModules[CANDIDATES[id]];
  if (!load) return null;
  return (lazyCache[id] ??= React.lazy(load));
};

export const ServicesSection: React.FC = () => {
  const headRef = useStagger<HTMLDivElement>({ step: 140 });
  const { svc } = useLab();

  return (
    <section id="services" className="py-20 sm:py-28 bg-(--c-surface)">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
        
        {/* Header */}
        <div ref={headRef} className="mb-16 grid grid-cols-1 md:grid-cols-12 gap-8 items-end border-b border-(--c-line)/30 pb-8">
          <div className="md:col-span-7">
            <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-2 flex items-center gap-3 font-(family-name:--f-body)">
            <Pulse />
              Treatment Modalities
            </span>
            <SplitWords className="font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light">Our Services</SplitWords>
          </div>
          <div className="md:col-span-5 md:text-right">
            <p className="font-(family-name:--f-body) text-base sm:text-lg text-(--c-body) font-light leading-relaxed">
              Cutting-edge, non-invasive therapeutic modalities performed by certified veterinary specialists.
            </p>
          </div>
        </div>

        {svc === 'panels' ? (
          <ServicesPanels />
        ) : CANDIDATES[svc] && candidate(svc) ? (
          <React.Suspense fallback={<div className="min-h-[60vh]" />}>
            {React.createElement(candidate(svc)!)}
          </React.Suspense>
        ) : (
          <React.Suspense fallback={<div className="min-h-[60vh]" />}>
            <LegacyLayouts svc={svc} />
          </React.Suspense>
        )}
      </div>
    </section>
  );
};
