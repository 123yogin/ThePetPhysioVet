import React, { useEffect, useRef, useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { EntityCardLink } from '../EntityCardLink';
import { servicePath } from '../../seo/routes';
import { SERVICES } from '../../data/clinicData';
import { onFrame, wake, prefersReducedMotion } from '../../motion/engine';

/**
 * One photo per service, chosen from the clinic's own supplied set -- there is
 * no per-service photography, so each caption describes only what the frame
 * actually shows, never a claim about the specific modality.
 */
const PHOTOS: Record<string, { src: string; alt: string; w: number; h: number }> = {
  'indoor-physiotherapy': {
    src: '/photos/clinic-german-shepherd.webp',
    alt: 'A German Shepherd on the padded therapy mats at the Shilaj clinic',
    w: 900,
    h: 1200,
  },
  'manual-therapy': {
    src: '/photos/therapy-ramp.webp',
    alt: 'A Labrador resting on a padded therapy mat at the clinic during a session',
    w: 800,
    h: 600,
  },
  electrophysical: {
    src: '/photos/therapy-platform.webp',
    alt: 'A Labrador supported in a harness on a raised therapy platform at the clinic',
    w: 800,
    h: 600,
  },
  specialised: {
    src: '/photos/pool-swim-blue.webp',
    alt: 'A Golden Retriever swimming in the indoor hydrotherapy pool, supported at the edge',
    w: 800,
    h: 600,
  },
  'home-care': {
    src: '/photos/home-visit-labradors.webp',
    alt: "Dr. Dhanvi Patel sitting on the floor with two Labradors during a home visit",
    w: 900,
    h: 676,
  },
};

const ServicesIndex: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const floatRef = useRef<HTMLDivElement>(null);
  const imgRefs = useRef<Record<string, HTMLImageElement | null>>({});
  const pos = useRef({ x: 0, y: 0, tx: 0, ty: 0, rot: 0, active: false });
  const [interactive, setInteractive] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  // Cursor-follow is a desktop-with-fine-pointer thing, and it is motion this
  // page must be able to switch off -- both checked once on mount and kept in
  // sync if either changes (e.g. a hybrid laptop docks/undocks a mouse).
  useEffect(() => {
    const hoverMq = window.matchMedia('(hover: hover) and (pointer: fine)');
    const motionMq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setInteractive(hoverMq.matches && !prefersReducedMotion());
    update();
    hoverMq.addEventListener('change', update);
    motionMq.addEventListener('change', update);
    return () => {
      hoverMq.removeEventListener('change', update);
      motionMq.removeEventListener('change', update);
    };
  }, []);

  useEffect(() => {
    if (!interactive) return;
    return onFrame(() => {
      const el = floatRef.current;
      const p = pos.current;
      if (!el) return false;
      const dx = p.tx - p.x;
      const dy = p.ty - p.y;
      p.x += dx * 0.18;
      p.y += dy * 0.18;
      const targetRot = Math.max(-8, Math.min(8, dx * 0.06));
      p.rot += (targetRot - p.rot) * 0.25;
      el.style.transform = `translate3d(${p.x}px, ${p.y}px, 0) rotate(${p.rot}deg)`;
      return p.active || Math.abs(dx) > 0.3 || Math.abs(dy) > 0.3 || Math.abs(targetRot - p.rot) > 0.3;
    });
  }, [interactive]);

  const showPhoto = (id: string) => {
    Object.keys(imgRefs.current).forEach((key) => {
      const el = imgRefs.current[key];
      if (el) el.style.opacity = key === id ? '1' : '0';
    });
  };

  const handleMove = (e: React.PointerEvent) => {
    if (!interactive || e.pointerType !== 'mouse') return;
    const p = pos.current;
    p.tx = e.clientX;
    p.ty = e.clientY - 48;
    if (!p.active) {
      p.x = p.tx;
      p.y = p.ty;
      p.active = true;
      if (floatRef.current) floatRef.current.style.opacity = '1';
    }
    wake();
  };

  const handleLeaveArea = () => {
    pos.current.active = false;
    if (floatRef.current) floatRef.current.style.opacity = '0';
  };

  const handleRowFocus = (id: string, row: HTMLElement) => {
    showPhoto(id);
    if (!interactive || !floatRef.current) return;
    const rect = row.getBoundingClientRect();
    const p = pos.current;
    p.tx = rect.right - 96;
    p.ty = rect.top + rect.height / 2 - 48;
    p.x = p.tx;
    p.y = p.ty;
    p.active = true;
    floatRef.current.style.opacity = '1';
    floatRef.current.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`;
  };

  const handleContainerBlur = (e: React.FocusEvent) => {
    if (containerRef.current && e.relatedTarget instanceof Node && containerRef.current.contains(e.relatedTarget)) return;
    handleLeaveArea();
  };

  return (
    <div
      ref={containerRef}
      className="border-t border-(--c-line)/30"
      onPointerMove={handleMove}
      onPointerLeave={handleLeaveArea}
      onBlur={handleContainerBlur}
    >
      {interactive && (
        <div
          ref={floatRef}
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 z-40 h-64 w-48 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-300 will-change-transform"
        >
          <div className="relative h-full w-full overflow-hidden shadow-xl bg-(--c-surface-2)">
            {SERVICES.map((service) => {
              const photo = PHOTOS[service.id];
              return (
                <img
                  key={service.id}
                  ref={(el) => {
                    imgRefs.current[service.id] = el;
                  }}
                  src={photo.src}
                  alt=""
                  width={photo.w}
                  height={photo.h}
                  loading="lazy"
                  decoding="async"
                  className="absolute inset-0 h-full w-full object-cover transition-opacity duration-500"
                  style={{ opacity: 0 }}
                />
              );
            })}
          </div>
        </div>
      )}

      {SERVICES.map((service, i) => {
        const photo = PHOTOS[service.id];
        const isOpen = openId === service.id;
        const panelId = `svc-panel-${service.id}`;
        return (
          <div key={service.id} className="border-b border-(--c-line)/30">
            <EntityCardLink
              href={servicePath(service.id)}
              aria-label={`${service.title} treatment details`}
              aria-expanded={!interactive ? isOpen : undefined}
              aria-controls={!interactive ? panelId : undefined}
              data-cursor="View"
              onPointerEnter={() => {
                if (interactive) showPhoto(service.id);
              }}
              onFocus={(e: React.FocusEvent<HTMLAnchorElement>) => handleRowFocus(service.id, e.currentTarget)}
              onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                if (!interactive) {
                  e.preventDefault();
                  setOpenId((cur) => (cur === service.id ? null : service.id));
                }
              }}
              className="group relative flex items-center gap-4 py-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-(--c-accent) focus-visible:outline-offset-4 sm:gap-8 sm:py-8"
            >
              <span className="w-8 shrink-0 font-(family-name:--f-display) italic text-lg text-(--c-accent)/50 sm:w-14 sm:text-2xl">
                {String(i + 1).padStart(2, '0')}
              </span>
              <h3 className="min-w-0 flex-1 font-(family-name:--f-display) text-xl font-light text-(--c-ink) transition-all duration-300 group-hover:translate-x-3 group-hover:text-(--c-accent) group-focus-visible:translate-x-3 group-focus-visible:text-(--c-accent) sm:text-3xl lg:text-5xl">
                {service.title}
              </h3>
              <span className="hidden w-40 shrink-0 text-right font-(family-name:--f-body) text-xs uppercase tracking-widest text-(--c-body) sm:block">
                {service.duration}
              </span>
              <ArrowUpRight className="h-5 w-5 shrink-0 text-(--c-accent) transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 sm:h-7 sm:w-7" />
            </EntityCardLink>

            {!interactive && isOpen && (
              <div id={panelId} className="grid gap-6 pb-8 sm:grid-cols-2 sm:gap-10">
                <img
                  src={photo.src}
                  alt={photo.alt}
                  width={photo.w}
                  height={photo.h}
                  loading="lazy"
                  decoding="async"
                  className="h-48 w-full rounded-sm object-cover sm:h-full"
                />
                <div>
                  <p className="font-(family-name:--f-body) text-base font-light leading-relaxed text-(--c-body)">
                    {service.fullDesc}
                  </p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {service.benefits.map((b) => (
                      <li key={b} className="border border-(--c-line)/50 bg-(--c-surface) px-3.5 py-1.5 text-sm text-(--c-body)">
                        {b}
                      </li>
                    ))}
                  </ul>
                  <EntityCardLink
                    href={servicePath(service.id)}
                    className="mt-6 inline-block font-(family-name:--f-body) text-xs font-semibold uppercase tracking-widest text-(--c-accent) underline-offset-4 hover:underline"
                  >
                    View treatment &rarr;
                  </EntityCardLink>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default ServicesIndex;
