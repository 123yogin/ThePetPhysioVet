import React from 'react';
import { ChevronDown } from 'lucide-react';
import { SERVICES } from '../../data/clinicData';
import { EntityCardLink } from '../EntityCardLink';
import { servicePath } from '../../seo/routes';
import { onFrame, track, prefersReducedMotion } from '../../motion/engine';

/**
 * One photo per service, picked from the clinic's own photo set (there are no
 * per-service shoots). Alt text describes only what each frame actually shows.
 */
type PanelPhoto = { src: string; alt: string; video?: string; poster?: string; focus?: string };

/*
 * `focus` is the CSS object-position of the subject's face. Panels are cropped
 * to very different shapes -- a near-square when open, a tall sliver when
 * closed, a short wide strip on phones -- so cropping from the centre cut off
 * eyes and heads. Each image is pinned to where its subject actually is.
 */
const PHOTOS: Record<string, PanelPhoto> = {
  'indoor-physiotherapy': {
    src: '/photos/clinic-german-shepherd.webp',
    alt: 'Dr. Dhanvi Patel hugging a German Shepherd on the therapy mats at the clinic',
    focus: '50% 55%',
  },
  'manual-therapy': {
    src: '/photos/services/manual-therapy-v2.webp',
    alt: 'Dr. Dhanvi Patel giving hands-on treatment to a golden dog at the clinic',
    focus: '50% 30%',
  },
  electrophysical: {
    src: '/photos/services/electrophysical-v2.webp',
    alt: 'Dr. Dhanvi Patel in laser safety goggles giving Class IV laser therapy to a kitten',
    focus: '50% 25%',
  },
  hydrotherapy: {
    src: '/photos/pool-swim-blue.webp',
    alt: 'A dog swimming in the clinic indoor hydrotherapy pool, treat-guided by the therapist',
    video: '/videos/hydrotherapy.mp4',
    poster: '/videos/hydrotherapy-poster.jpg',
    focus: '50% 40%',
  },
  acupuncture: {
    src: '/photos/services/acupuncture-v2.webp',
    alt: 'Dr. Dhanvi Patel, Certified Veterinary Acupuncturist, working treatment points along a Labrador',
    focus: '50% 8%',
  },
  'home-care': {
    src: '/photos/home-visit-labradors.webp',
    alt: 'Dr. Dhanvi Patel with two Labradors during a home visit',
    focus: '55% 30%',
  },
};

const num = (i: number) => String(i + 1).padStart(2, '0');

/** A panel shows a still photo unless it has a `video`, which then autoplays
 *  muted and looping (poster/photo is the fallback still). */
const PanelMedia: React.FC<{
  photo: PanelPhoto;
  className?: string; width: number; height: number;
}> = ({ photo, className, width, height }) =>
  photo.video ? (
    <video
      className={className}
      style={{ objectPosition: photo.focus }}
      src={photo.video}
      poster={photo.poster ?? photo.src}
      width={width}
      height={height}
      autoPlay
      muted
      loop
      playsInline
      preload="metadata"
      aria-label={photo.alt}
    />
  ) : (
    <img
      src={photo.src}
      alt={photo.alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      className={className}
      style={{ objectPosition: photo.focus }}
    />
  );

/*
 * Scroll-driven mode (desktop, motion allowed): the row pins while the page
 * scrolls, and the scroll position hands the open panel along the row. The
 * hand-off is continuous -- panel i's weight is 1 + 4 * (1 - distance from
 * the scroll position), so the open panel shrinks exactly as fast as the next
 * one grows and the row always sums to the same width.
 *
 * The runway height and sticky offset are CSS (lg: classes), so the section
 * has its final height in the prerendered HTML and nothing shifts on
 * hydration. JS only writes flex-grow. FRAME and stickyTop() must match them.
 */
const FRAME = 608; // row 560px + counter 48px
const stickyTop = (vh: number) => Math.max(112, vh / 2 - 260);
const HOLD = 0.08; // share of the runway spent resting on the first/last panel

const ServicesPanels: React.FC = () => {
  const [active, setActive] = React.useState(0);
  const [openMobile, setOpenMobile] = React.useState(0);
  // Hover intent: a pointer sweeping across the row would otherwise open
  // every panel it crosses, and each opening shifts the others under it.
  const intent = React.useRef<number | undefined>(undefined);
  const hover = (i: number) => {
    window.clearTimeout(intent.current);
    intent.current = window.setTimeout(() => setActive(i), 90);
  };
  React.useEffect(() => () => window.clearTimeout(intent.current), []);

  const runwayRef = React.useRef<HTMLDivElement>(null);
  const panelRefs = React.useRef<(HTMLDivElement | null)[]>([]);
  const barRef = React.useRef<HTMLSpanElement>(null);
  const countRef = React.useRef<HTMLSpanElement>(null);
  const scrollMode = React.useRef(false);
  const geo = React.useRef<{ box: () => { top: number; height: number } } | null>(null);

  React.useEffect(() => {
    const runway = runwayRef.current;
    if (!runway) return;
    const mq = window.matchMedia('(min-width: 1024px)');
    let stopFrames: (() => void) | null = null;
    let release: (() => void) | null = null;
    let lastIdx = -1;
    const n = SERVICES.length;

    const disable = () => {
      stopFrames?.();
      release?.();
      stopFrames = release = null;
      geo.current = null;
      scrollMode.current = false;
      panelRefs.current.forEach((el) => {
        if (el) {
          el.style.flexGrow = '';
          el.style.transition = '';
        }
      });
    };
    const enable = () => {
      if (stopFrames) return;
      scrollMode.current = true;
      panelRefs.current.forEach((el) => el && (el.style.transition = 'none'));
      const t = track(runway);
      geo.current = t;
      release = t.release;
      stopFrames = onFrame((f) => {
        const box = t.box();
        const range = Math.max(1, box.height - FRAME);
        const raw = (f.scrollY + stickyTop(f.vh) - box.top) / range;
        const q = Math.min(1, Math.max(0, (raw - HOLD) / (1 - 2 * HOLD)));
        const x = q * (n - 1);
        panelRefs.current.forEach((el, i) => {
          if (el) el.style.flexGrow = (1 + 4 * Math.max(0, 1 - Math.abs(x - i))).toFixed(3);
        });
        if (barRef.current) barRef.current.style.transform = `scaleX(${(q * (n - 1) + 1) / n})`;
        const idx = Math.round(x);
        if (idx !== lastIdx) {
          lastIdx = idx;
          if (countRef.current) countRef.current.textContent = `${num(idx)} / ${num(n - 1)}`;
          setActive(idx);
        }
      });
    };
    const sync = () => (mq.matches && !prefersReducedMotion() ? enable() : disable());
    sync();
    mq.addEventListener('change', sync);
    return () => {
      mq.removeEventListener('change', sync);
      disable();
    };
  }, []);

  // In scroll mode, focusing a panel scrolls to where the page opens it, so a
  // keyboard user reaches every service. Otherwise it simply opens.
  const focusPanel = (i: number) => {
    const t = geo.current;
    if (!scrollMode.current || !t) return setActive(i);
    const box = t.box();
    const range = Math.max(1, box.height - FRAME);
    const q = i / (SERVICES.length - 1);
    const y = box.top - stickyTop(window.innerHeight) + (q * (1 - 2 * HOLD) + HOLD) * range;
    window.scrollTo({ top: y, behavior: 'smooth' });
  };

  return (
    <>
      {/* Desktop: 5 tall panels. With motion allowed the row pins and scrolling
          opens each in turn; with reduced motion, hover or focus opens one. */}
      <div
        ref={runwayRef}
        className="hidden lg:block lg:h-[calc(608px+165vh)] motion-reduce:lg:h-auto"
      >
      <div className="lg:sticky lg:top-[max(112px,calc(50vh-260px))] motion-reduce:lg:static">
      <div className="flex gap-2 h-[560px]" role="list">
        {SERVICES.map((service, i) => {
          const isActive = active === i;
          const photo = PHOTOS[service.id];
          return (
            <div
              key={service.id}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              role="listitem"
              onMouseEnter={() => !scrollMode.current && hover(i)}
              onMouseLeave={() => window.clearTimeout(intent.current)}
              onFocus={() => focusPanel(i)}
              style={{ flexBasis: 0 }}
              className={`relative shrink-0 overflow-hidden rounded-[var(--lab-card)] transition-[flex-grow] duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] motion-reduce:transition-none ${isActive ? 'grow-[5]' : 'grow-[1]'}`}
            >
              <EntityCardLink
                href={servicePath(service.id)}
                aria-label={`${service.title} treatment details`}
                data-cursor="View"
                className="absolute inset-0 block focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-inset"
              >
                <PanelMedia
                  photo={photo}
                  width={800}
                  height={600}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-(--c-ink) via-(--c-ink)/35 to-(--c-ink)/5" />

                {/* Collapsed: vertical rotated title + number */}
                <div
                  className={`absolute inset-0 flex flex-col items-center justify-between p-4 transition-opacity duration-500 motion-reduce:transition-none ${isActive ? 'opacity-0' : 'opacity-100'}`}
                  aria-hidden={isActive}
                >
                  <span className="font-(family-name:--f-display) italic text-lg text-white/70">{num(i)}</span>
                  <span className="[writing-mode:vertical-rl] rotate-180 whitespace-nowrap font-(family-name:--f-display) text-lg text-white tracking-wide">
                    {service.title}
                  </span>
                </div>

                {/* Expanded content, staggered fade-up */}
                <div
                  className={`absolute inset-0 flex flex-col justify-end p-6 sm:p-8 transition-opacity duration-500 motion-reduce:transition-none ${isActive ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
                  aria-hidden={!isActive}
                >
                  <div className="w-[260px] max-w-[80vw]">
                    <span
                      className={`font-(family-name:--f-display) italic text-3xl text-white/60 transition-all duration-500 motion-reduce:transition-none motion-reduce:translate-y-0 ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
                    >
                      {num(i)}
                    </span>
                    <h3
                      className={`mt-3 font-(family-name:--f-display) text-2xl text-white font-medium leading-tight transition-all delay-75 duration-500 motion-reduce:transition-none motion-reduce:translate-y-0 ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
                    >
                      {service.title}
                    </h3>
                    <p
                      className={`mt-3 font-(family-name:--f-body) text-sm text-white/85 font-light leading-relaxed transition-all delay-150 duration-500 motion-reduce:transition-none motion-reduce:translate-y-0 ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
                    >
                      {service.shortDesc}
                    </p>
                    <ul
                      className={`mt-4 flex flex-wrap gap-1.5 transition-all delay-200 duration-500 motion-reduce:transition-none motion-reduce:translate-y-0 ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
                    >
                      {service.benefits.slice(0, 4).map((b) => (
                        <li key={b} className="whitespace-nowrap rounded-full border border-white/30 bg-white/10 px-2.5 py-1 text-[11px] text-white/90">
                          {b}
                        </li>
                      ))}
                    </ul>
                    <div
                      className={`mt-5 flex items-center justify-between gap-4 border-t border-white/25 pt-4 text-xs uppercase tracking-widest transition-all delay-300 duration-500 motion-reduce:transition-none motion-reduce:translate-y-0 ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'}`}
                    >
                      <span className="whitespace-nowrap text-white/70">{service.duration}</span>
                      <span className="whitespace-nowrap font-semibold text-white">View treatment →</span>
                    </div>
                  </div>
                </div>
              </EntityCardLink>
            </div>
          );
        })}
      </div>
      {/* Progress: which service the scroll has reached. */}
      <div aria-hidden="true" className="flex h-12 items-center gap-6 motion-reduce:hidden">
        <span ref={countRef} className="font-(family-name:--f-body) text-xs uppercase tracking-widest text-(--c-body) tabular-nums">
          {num(0)} / {num(SERVICES.length - 1)}
        </span>
        <span className="relative h-px flex-1 bg-(--c-line)/40">
          <span ref={barRef} className="absolute inset-0 origin-left bg-(--c-accent)" style={{ transform: `scaleX(${1 / SERVICES.length})` }} />
        </span>
        <span className="font-(family-name:--f-body) text-xs uppercase tracking-widest text-(--c-body)">Scroll</span>
      </div>
      </div>
      </div>

      {/* Phones / tablets: vertical accordion, one panel open at a time. */}
      <div className="flex flex-col gap-3 lg:hidden">
        {SERVICES.map((service, i) => {
          const isOpen = openMobile === i;
          const photo = PHOTOS[service.id];
          const panelId = `svc-panel-${service.id}`;
          return (
            <div key={service.id} className="overflow-hidden rounded-[var(--lab-card)] border border-(--c-line)/30 bg-(--c-card)">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpenMobile(isOpen ? -1 : i)}
                className="relative block h-[88px] w-full cursor-pointer text-left"
              >
                <PanelMedia
                  photo={photo}
                  width={800}
                  height={200}
                  className="absolute inset-0 h-full w-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-(--c-ink)/90 via-(--c-ink)/45 to-(--c-ink)/10" />
                <div className="relative flex h-full items-center gap-4 px-5">
                  <span className="font-(family-name:--f-display) italic text-xl text-white/70">{num(i)}</span>
                  <span className="flex-1 font-(family-name:--f-display) text-lg text-white font-medium">{service.title}</span>
                  <ChevronDown
                    aria-hidden="true"
                    className={`h-5 w-5 shrink-0 text-white/80 transition-transform duration-300 motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
                  />
                </div>
              </button>

              <div
                id={panelId}
                className={`grid transition-[grid-template-rows] duration-500 motion-reduce:transition-none ${isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}
              >
                <div className="overflow-hidden">
                  <div className="p-5 sm:p-6">
                    <p className="font-(family-name:--f-body) text-sm text-(--c-body) font-light leading-relaxed">
                      {service.shortDesc}
                    </p>
                    <ul className="mt-4 flex flex-wrap gap-1.5">
                      {service.benefits.slice(0, 4).map((b) => (
                        <li key={b} className="whitespace-nowrap rounded-full border border-(--c-line)/50 bg-(--c-surface) px-2.5 py-1 text-[11px] text-(--c-body)">
                          {b}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-5 flex items-center justify-between gap-4 border-t border-(--c-line)/30 pt-4 text-xs uppercase tracking-widest">
                      <span className="text-(--c-body)">{service.duration}</span>
                      <EntityCardLink
                        href={servicePath(service.id)}
                        aria-label={`${service.title} treatment details`}
                        data-cursor="View"
                        className="whitespace-nowrap font-semibold text-(--c-accent)"
                      >
                        View treatment →
                      </EntityCardLink>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
};

export default ServicesPanels;
