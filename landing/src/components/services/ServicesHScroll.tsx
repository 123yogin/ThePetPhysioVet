import React from 'react';
import { SERVICES } from '../../data/clinicData';
import { EntityCardLink } from '../EntityCardLink';
import { servicePath } from '../../seo/routes';
import { onFrame, track, prefersReducedMotion, type Box } from '../../motion/engine';

/**
 * "hscroll" variant of the services section body: a pinned horizontal-scroll
 * track on desktop, a native scroll-snap rail on phones and under
 * prefers-reduced-motion. Renders only the body -- the parent keeps the
 * section header.
 */

// No per-service photography exists yet -- these map each service to the
// clinic's own photograph that is closest to what the service actually is,
// without claiming anything the frame does not show (no laser/ultrasound
// equipment shots exist, so "Electro-physical" gets the therapy platform,
// not an invented device photo).
const PHOTOS: Record<string, { src: string; alt: string }> = {
  'indoor-physiotherapy': {
    src: '/photos/therapy-ramp.webp',
    alt: 'A Labrador supported in a padded sling during a therapy session at the clinic',
  },
  'manual-therapy': {
    src: '/photos/clinic-german-shepherd.webp',
    alt: 'Dr. Dhanvi Patel holding a German Shepherd on the padded therapy mats at the Shilaj clinic',
  },
  electrophysical: {
    src: '/photos/therapy-platform.webp',
    alt: 'A Labrador supported upright in a sling harness on a raised therapy platform at the clinic',
  },
  hydrotherapy: {
    src: '/photos/pool-swim-blue.webp',
    alt: 'A Golden Retriever swimming in the indoor hydrotherapy pool, held at the poolside by a flotation harness',
  },
  acupuncture: {
    src: '/photos/dhanvi-patel.webp',
    alt: 'Dr. Dhanvi Patel sitting on the therapy mats at the clinic, holding a beagle',
  },
  'home-care': {
    src: '/photos/senior-beagle.webp',
    alt: 'Dr. Dhanvi Patel with a senior beagle, grey around the muzzle, during a home visit',
  },
};
const FALLBACK_PHOTO = { src: '/photos/home-visit-indie.webp', alt: 'A dog with Dr. Dhanvi Patel during a home visit' };
const pad2 = (n: number) => String(n).padStart(2, '0');

interface CardProps {
  id: string;
  title: string;
  shortDesc: string;
  duration: string;
  index: number;
  onFocusCard?: () => void;
  className: string;
}

const ServiceCard: React.FC<CardProps> = ({ id, title, shortDesc, duration, index, onFocusCard, className }) => {
  const photo = PHOTOS[id] ?? FALLBACK_PHOTO;
  return (
    <EntityCardLink
      href={servicePath(id)}
      aria-label={`${title} treatment details`}
      data-cursor="View"
      onFocus={onFocusCard}
      className={className}
    >
      <div className="relative h-[46%] sm:h-[52%] shrink-0 overflow-hidden bg-(--c-surface-2)">
        <img
          src={photo.src}
          alt={photo.alt}
          width={800}
          height={600}
          loading="lazy"
          decoding="async"
          data-parallax-img
          className="absolute inset-0 w-full h-full object-cover scale-[1.08] will-change-transform"
        />
      </div>
      <div className="flex-1 min-h-0 p-6 sm:p-8 flex flex-col justify-between">
        <div>
          <span className="font-(family-name:--f-display) italic text-3xl text-(--c-accent)/50">{pad2(index + 1)}</span>
          <h3 className="mt-2 font-(family-name:--f-display) text-2xl sm:text-3xl text-(--c-ink) font-medium">{title}</h3>
          <p className="mt-3 font-(family-name:--f-body) text-sm sm:text-base text-(--c-body) font-light leading-relaxed">
            {shortDesc}
          </p>
        </div>
        <div className="pt-4 mt-4 border-t border-(--c-line)/30 flex items-center justify-between text-xs font-(family-name:--f-body) uppercase tracking-widest">
          <span className="text-(--c-body)">{duration}</span>
          <span className="text-(--c-accent) font-semibold">View treatment &rarr;</span>
        </div>
      </div>
    </EntityCardLink>
  );
};

const ServicesHScroll: React.FC = () => {
  // Default (and SSR/no-JS) render is the native rail: safe on phones, safe
  // under reduced motion, safe with no JS at all. A desktop with an ordinary
  // motion preference upgrades to the pinned track after mount.
  const [pinned, setPinned] = React.useState(false);
  const [overflow, setOverflow] = React.useState(0);

  const wrapperRef = React.useRef<HTMLDivElement>(null);
  const frameRef = React.useRef<HTMLDivElement>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);
  const progressFillRef = React.useRef<HTMLDivElement>(null);
  const counterRef = React.useRef<HTMLSpanElement>(null);
  const cardLeftsRef = React.useRef<number[]>([]);
  const boxGetterRef = React.useRef<(() => Box) | null>(null);

  React.useEffect(() => {
    const mqMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const mqDesktop = window.matchMedia('(min-width: 768px)');
    const update = () => setPinned(mqDesktop.matches && !mqMotion.matches);
    update();
    mqMotion.addEventListener('change', update);
    mqDesktop.addEventListener('change', update);
    return () => {
      mqMotion.removeEventListener('change', update);
      mqDesktop.removeEventListener('change', update);
    };
  }, []);

  // Measure the track's overflow width and each card's left offset. Re-runs
  // on resize via ResizeObserver, never inside the frame loop.
  React.useEffect(() => {
    if (!pinned) return;
    const frame = frameRef.current;
    const trackEl = trackRef.current;
    if (!frame || !trackEl) return;

    const measure = () => {
      setOverflow(Math.max(0, trackEl.scrollWidth - frame.clientWidth));
      const trackLeft = trackEl.getBoundingClientRect().left;
      cardLeftsRef.current = Array.from<Element>(trackEl.children).map(
        (c) => c.getBoundingClientRect().left - trackLeft,
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(trackEl);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [pinned]);

  // Drive the transform, per-card parallax, progress bar and counter from
  // the shared frame loop. Only writes -- geometry comes from track()'s cache.
  React.useEffect(() => {
    if (!pinned) return;
    const wrapper = wrapperRef.current;
    const frame = frameRef.current;
    const trackEl = trackRef.current;
    if (!wrapper || !frame || !trackEl) return;

    const { box, release } = track(wrapper);
    boxGetterRef.current = box;
    const frameWidth = frame.clientWidth;
    const photoEls = Array.from<HTMLElement>(trackEl.querySelectorAll<HTMLElement>('[data-parallax-img]'));
    const cardWidths = Array.from<Element>(trackEl.children).map((c) => c.getBoundingClientRect().width);
    const total = SERVICES.length;

    const unsub = onFrame((f) => {
      const b = box();
      const span = b.height - f.vh;
      const p = span > 0 ? Math.max(0, Math.min(1, (f.scrollY - b.top) / span)) : 0;
      const x = -p * overflow;
      trackEl.style.transform = `translate3d(${x}px,0,0)`;

      photoEls.forEach((img, i) => {
        // Local progress: how far this card's centre sits from the frame's
        // centre right now, not how far the whole track has travelled -- so
        // each photo drifts a small, bounded amount as its own card crosses
        // the frame, at a rate that differs card to card.
        const cardCenter = (cardLeftsRef.current[i] ?? 0) + (cardWidths[i] ?? 0) / 2 + x;
        const local = Math.max(-1, Math.min(1, (frameWidth / 2 - cardCenter) / (frameWidth / 2)));
        const amp = 16 + (i % 3) * 10;
        img.style.transform = `translate3d(${local * amp}px,0,0) scale(1.08)`;
      });

      if (progressFillRef.current) progressFillRef.current.style.width = `${p * 100}%`;
      if (counterRef.current) {
        const idx = Math.min(total - 1, Math.round(p * (total - 1)));
        counterRef.current.textContent = `${pad2(idx + 1)} / ${pad2(total)}`;
      }
    });

    return () => {
      unsub();
      release();
      boxGetterRef.current = null;
    };
  }, [pinned, overflow]);

  const scrollCardIntoView = (i: number) => {
    if (!pinned || !boxGetterRef.current) return;
    const b = boxGetterRef.current();
    const p = overflow > 0 ? Math.max(0, Math.min(1, (cardLeftsRef.current[i] ?? 0) / overflow)) : 0;
    const targetY = b.top + p * (b.height - window.innerHeight);
    window.scrollTo({ top: targetY, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  };

  if (pinned) {
    return (
      <div ref={wrapperRef} style={{ height: `calc(100svh + ${overflow}px)` }}>
        <div
          ref={frameRef}
          className="sticky top-0 h-[100svh] w-screen mx-[calc(50%-50vw)] overflow-x-clip flex items-center"
        >
          <div ref={trackRef} className="flex items-center gap-6 sm:gap-10 pl-[6vw] pr-[10vw] will-change-transform">
            {SERVICES.map((service, i) => (
              <ServiceCard
                key={service.id}
                id={service.id}
                title={service.title}
                shortDesc={service.shortDesc}
                duration={service.duration}
                index={i}
                onFocusCard={() => scrollCardIntoView(i)}
                className="group shrink-0 w-[70vw] max-w-[720px] h-[68vh] sm:h-[74vh] max-h-[640px] bg-(--c-card) border border-(--c-line)/30 flex flex-col overflow-hidden"
              />
            ))}
          </div>

          <div className="absolute inset-x-[6vw] bottom-8 sm:bottom-12 flex flex-col gap-3 pointer-events-none">
            <div className="h-px w-full bg-(--c-line)">
              <div ref={progressFillRef} className="h-px bg-(--c-accent)" style={{ width: '0%' }} />
            </div>
            <div className="flex items-center justify-between text-xs font-(family-name:--f-body) uppercase tracking-widest text-(--c-body)">
              <span>Scroll to explore</span>
              <span ref={counterRef}>{`01 / ${pad2(SERVICES.length)}`}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Native rail: phones, and anyone with prefers-reduced-motion set.
  return (
    <div className="-mx-4 sm:-mx-8">
      <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory scroll-px-4 sm:scroll-px-8 px-4 sm:px-8 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SERVICES.map((service, i) => (
          <ServiceCard
            key={service.id}
            id={service.id}
            title={service.title}
            shortDesc={service.shortDesc}
            duration={service.duration}
            index={i}
            className="snap-start shrink-0 w-[82vw] sm:w-[420px] h-[520px] bg-(--c-card) border border-(--c-line)/30 flex flex-col overflow-hidden"
          />
        ))}
      </div>
    </div>
  );
};

export default ServicesHScroll;
