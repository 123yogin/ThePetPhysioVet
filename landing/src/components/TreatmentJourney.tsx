import React, { useRef, useState } from 'react';
import { SplitWords, useReveal, useSectionProgress, useStagger } from '../motion';
import { Pulse, PawTrail, setPawTrail } from '../motion/extras';
import { JOURNEY_STEPS } from '../data/clinicData';
import { CheckCircle2, ChevronRight } from 'lucide-react';
import { useLab } from '../lab/Lab';

export const TreatmentJourney: React.FC = () => {
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const activeStep = JOURNEY_STEPS[activeStepIndex];

  // Paw prints walk the line joining the five steps as the section scrolls
  // through. Quantised so React re-renders once per paw, not once per scroll
  // event.
  const pawRef = useRef<HTMLDivElement>(null);
  const sectionRef = useSectionProgress<HTMLElement>((p) => setPawTrail(pawRef.current, p));
  const stepsRef = useStagger<HTMLDivElement>({ step: 120, selector: ':scope > div.relative' });
  const panelRef = useReveal<HTMLDivElement>({ delay: 150 });

  // Timeline variant: a vertical rail that fills over a longer scroll range
  // (the list is tall), lighting each step as the reader passes it.
  const { jour } = useLab();
  // Written straight to the DOM from the motion engine -- this used to set
  // React state on scroll and re-render the whole section every frame.
  const railLine = useRef<HTMLSpanElement>(null);
  const railPaws = useRef<HTMLDivElement>(null);
  const railCount = useRef<HTMLSpanElement>(null);
  const railRef = useSectionProgress<HTMLOListElement>((p) => {
    if (railLine.current) railLine.current.style.transform = `scaleY(${p})`;
    setPawTrail(railPaws.current, p);
    const n = JOURNEY_STEPS.length;
    if (railCount.current) railCount.current.textContent = String(Math.min(n, Math.max(1, Math.ceil(p * n)))).padStart(2, '0');
    railRef.current?.querySelectorAll<HTMLElement>('[data-step]').forEach((el, idx) => {
      el.classList.toggle('is-lit', p >= idx / n);
    });
  }, 0.75, -0.55);

  if (jour === 'rail') {
    return (
      <section id="journey" className="py-20 sm:py-28 bg-(--c-card) border-y border-(--c-line)/30">
        <div className="max-w-[1280px] mx-auto px-4 sm:px-8 grid lg:grid-cols-12 gap-12 lg:gap-16">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-[calc(var(--nav-h,100px)+3rem)]">
              <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-2 flex items-center gap-3 font-(family-name:--f-body)">
                <Pulse />
                Step-by-Step Care
              </span>
              <SplitWords className="font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light mb-4">The Healing Journey</SplitWords>
              <p className="font-(family-name:--f-body) text-base sm:text-lg text-(--c-body) font-light max-w-md">
                A clear, evidence-based roadmap guiding your companion from initial intake to full functional recovery.
              </p>
              <p className="mt-8 font-(family-name:--f-display) italic text-6xl text-(--c-accent)/40 leading-none" aria-hidden="true">
                <span ref={railCount}>01</span>
                <span className="text-2xl not-italic text-(--c-line)"> / {String(JOURNEY_STEPS.length).padStart(2, '0')}</span>
              </p>
            </div>
          </div>
          <ol ref={railRef} className="lg:col-span-7 relative pl-12 sm:pl-16">
            <span aria-hidden="true" className="absolute left-[19px] sm:left-[23px] top-2 bottom-2 w-px bg-(--c-line)/60" />
            <span
              ref={railLine}
              aria-hidden="true"
              className="absolute left-[19px] sm:left-[23px] top-2 bottom-2 w-px bg-(--c-ink) origin-top"
              style={{ transform: 'scaleY(0)' }}
            />
            <PawTrail ref={railPaws} vertical count={16} className="absolute left-[19px] sm:left-[23px] top-16 bottom-10 w-0" />
            {JOURNEY_STEPS.map((step) => {
              return (
                <li key={step.number} className="relative pb-14 last:pb-0">
                  <span
                    data-step
                    className="step-dot absolute -left-12 sm:-left-16 top-0 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-(family-name:--f-display) text-base border transition-colors duration-500"
                  >
                    {step.number}
                  </span>
                  <h3 className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-medium mb-2">{step.title}</h3>
                  <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed mb-4 max-w-xl">{step.details}</p>
                  <ul className="flex flex-wrap gap-2">
                    {step.whatToExpect.map((w) => (
                      <li key={w} className="px-3 py-1 bg-(--c-surface) border border-(--c-line)/50 text-xs text-(--c-body)">{w}</li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ol>
        </div>
      </section>
    );
  }

  return (
    <section ref={sectionRef} id="journey" className="py-20 sm:py-28 bg-(--c-card) border-y border-(--c-line)/30">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
        
        {/* Header */}
        <div className="mb-16 text-center max-w-3xl mx-auto">
          <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-2 flex items-center gap-3 justify-center font-(family-name:--f-body)">
            <Pulse />
            Step-by-Step Care
          </span>
          <SplitWords className="font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light mb-4">The Healing Journey</SplitWords>
          <p className="font-(family-name:--f-body) text-base sm:text-lg text-(--c-body) font-light">
            A clear, evidence-based roadmap guiding your companion from initial intake to full functional recovery.
          </p>
        </div>

        {/* Steps Grid Header Bar */}
        <div ref={stepsRef} className="flex flex-col md:flex-row justify-between items-start gap-8 relative px-2 mb-12">
          {/* Connecting Line (Desktop) */}
          <div className="hidden md:block absolute top-8 left-12 right-12 h-px bg-(--c-line)/40 z-0" />
          <PawTrail ref={pawRef} className="hidden md:block absolute top-8 left-12 right-12 h-0 z-[5]" />

          {JOURNEY_STEPS.map((step, idx) => {
            const isSelected = activeStepIndex === idx;
            return (
              <div
                key={step.number}
                onClick={() => setActiveStepIndex(idx)}
                className="relative z-10 flex flex-col items-center md:items-start w-full md:w-1/5 cursor-pointer group"
              >
                <div
                  className={`w-16 h-16 rounded-none flex items-center justify-center font-(family-name:--f-display) text-xl mb-4 transition-all duration-300 ${
                    isSelected
                      ? 'bg-(--c-ink) text-(--c-card) shadow-md border-2 border-(--c-ink) scale-105'
                      : 'bg-(--c-surface) border border-(--c-ink) text-(--c-ink) group-hover:bg-(--c-ink) group-hover:text-white'
                  }`}
                >
                  <span className="font-light">{step.number}</span>
                </div>

                <h3 className={`font-(family-name:--f-display) text-lg mb-1 text-center md:text-left transition-colors ${
                  isSelected ? 'text-(--c-ink) font-semibold' : 'text-(--c-body) font-medium group-hover:text-(--c-ink)'
                }`}>
                  {step.title}
                </h3>

                <p className="font-(family-name:--f-body) text-xs text-(--c-body) font-light leading-relaxed text-center md:text-left hidden lg:block">
                  {step.desc}
                </p>
              </div>
            );
          })}
        </div>

        {/* Active Step Detailed Showcase Panel */}
        <div ref={panelRef} className="bg-(--c-surface) p-6 sm:p-10 border border-(--c-line)/50 mt-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Keyed by step so each change replays a short cross-fade. */}
          <div key={`a${activeStepIndex}`} className="lg:col-span-7 step-swap">
            <div className="flex items-center gap-3 mb-3">
              <span className="bg-(--c-ink) text-white px-3 py-1 text-xs uppercase tracking-widest font-semibold">
                Stage {activeStep.number}
              </span>
              <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold">
                Clinical Workflow
              </span>
            </div>

            <h3 className="font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-medium mb-3">
              {activeStep.title} Phase
            </h3>

            <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed mb-6">
              {activeStep.details}
            </p>

            <div className="flex items-center gap-2">
              {JOURNEY_STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveStepIndex(i)}
                  className={`h-2 transition-all ${
                    activeStepIndex === i ? 'w-8 bg-(--c-ink)' : 'w-2 bg-(--c-line) hover:bg-(--c-accent)'
                  }`}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <div key={`b${activeStepIndex}`} style={{ animationDelay: '80ms' }} className="lg:col-span-5 bg-(--c-card) p-6 border border-(--c-line)/30 step-swap">
            <h4 className="font-(family-name:--f-display) text-base text-(--c-ink) font-semibold uppercase tracking-wider mb-4 border-b border-(--c-line)/30 pb-2">
              What To Expect
            </h4>
            <ul className="space-y-3 font-(family-name:--f-body) text-sm text-(--c-body) font-light">
              {activeStep.whatToExpect.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-(--c-accent) mt-0.5 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => setActiveStepIndex((prev) => (prev + 1) % JOURNEY_STEPS.length)}
              className="mt-6 w-full py-2.5 bg-(--c-surface-2) hover:bg-(--c-surface-3) text-(--c-ink) font-(family-name:--f-body) text-xs uppercase tracking-widest font-medium flex items-center justify-center gap-2 border border-(--c-line)/50 cursor-pointer"
            >
              <span>Next Stage ({JOURNEY_STEPS[(activeStepIndex + 1) % JOURNEY_STEPS.length].title})</span>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </section>
  );
};
