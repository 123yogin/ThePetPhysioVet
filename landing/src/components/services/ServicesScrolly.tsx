import React from 'react';
import { SERVICES } from '../../data/clinicData';
import { EntityCardLink } from '../EntityCardLink';
import { servicePath } from '../../seo/routes';
import { prefersReducedMotion } from '../../motion/engine';

/**
 * One photo per service. There are no per-service photographs, so each is
 * matched to whichever of the clinic's own photos most plausibly shows what
 * that service actually is -- alt text describes only what is in the frame.
 */
const PHOTO: Record<string, { src: string; alt: string; video?: string; poster?: string }> = {
  'indoor-physiotherapy': {
    src: '/photos/clinic-german-shepherd.webp',
    alt: 'Dr. Dhanvi Patel hugging a German Shepherd on the therapy mats at the clinic',
  },
  'manual-therapy': {
    src: '/photos/services/manual-therapy-v2.webp',
    alt: 'Dr. Dhanvi Patel giving hands-on treatment to a golden dog at the clinic',
  },
  electrophysical: {
    src: '/photos/services/electrophysical-v2.webp',
    alt: 'Dr. Dhanvi Patel in laser safety goggles giving Class IV laser therapy to a kitten',
  },
  hydrotherapy: {
    src: '/photos/pool-swim-blue.webp',
    alt: 'A dog swimming in the clinic indoor hydrotherapy pool, treat-guided by the therapist',
    video: '/videos/hydrotherapy.mp4',
    poster: '/videos/hydrotherapy-poster.jpg',
  },
  acupuncture: {
    src: '/photos/services/acupuncture-v2.webp',
    alt: 'Dr. Dhanvi Patel, Certified Veterinary Acupuncturist, working treatment points along a Labrador',
  },
  'home-care': {
    src: '/photos/home-visit-labradors.webp',
    alt: 'Dr. Dhanvi Patel sitting on the floor with two Labradors during a home visit',
  },
};
const FALLBACK_PHOTO = PHOTO[SERVICES[0]?.id] ?? { src: '/photos/clinic-german-shepherd.webp', alt: '' };

const photoFor = (id: string) => PHOTO[id] ?? FALLBACK_PHOTO;

type ServiceMediaData = { src: string; alt: string; video?: string; poster?: string };

/** A service tile is an image unless it has a `video`, in which case it plays a
 *  muted, looping clip (with the poster/photo as the still fallback). */
const ServiceMedia: React.FC<{
  photo: ServiceMediaData; className?: string; width: number; height: number;
}> = ({ photo, className, width, height }) => {
  if (photo.video) {
    return (
      <video
        className={className}
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
    );
  }
  return (
    <img
      src={photo.src}
      alt={photo.alt}
      width={width}
      height={height}
      loading="lazy"
      decoding="async"
      className={className}
    />
  );
}

const ServicesScrolly: React.FC = () => {
  const [active, setActive] = React.useState(0);
  const [reduced, setReduced] = React.useState(false);
  const chapterRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  React.useEffect(() => {
    setReduced(prefersReducedMotion());
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          const idx = Number((entry.target as HTMLElement).dataset.index);
          if (!Number.isNaN(idx)) setActive(idx);
        });
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: 0 },
    );
    chapterRefs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  const total = SERVICES.length;
  const transitionClass = reduced ? '' : 'transition-[opacity,transform] duration-700 ease-out';

  return (
    <div className="lg:grid lg:grid-cols-12 lg:gap-12">
      {/* Sticky visual column -- desktop/tablet only. No ancestor here carries
          overflow-hidden, which is what position: sticky needs to work. */}
      <div className="hidden lg:block lg:col-span-5">
        <div
          className="sticky flex flex-col items-start"
          style={{ top: 'calc(var(--nav-h, 100px) + 2rem)' }}
        >
          <div className="relative aspect-3/4 w-full max-w-[420px] rounded-t-[999px] overflow-hidden bg-(--c-surface-2) border border-(--c-line)/30">
            {SERVICES.map((service, i) => {
              const photo = photoFor(service.id);
              return (
                <ServiceMedia
                  key={service.id}
                  photo={photo}
                  width={900}
                  height={1200}
                  className={`absolute inset-0 w-full h-full object-cover ${transitionClass} ${
                    i === active ? 'opacity-100 scale-100' : 'opacity-0 scale-105'
                  }`}
                />
              );
            })}
          </div>

          <div className="mt-8 flex items-end justify-between gap-8 w-full max-w-[420px]">
            <span className="font-(family-name:--f-display) leading-none">
              <span className="acc-italic text-6xl text-(--c-accent)">
                {String(active + 1).padStart(2, '0')}
              </span>
              <span className="text-2xl text-(--c-body)/50">/{String(total).padStart(2, '0')}</span>
            </span>

            {/* Vertical progress bar: fill height reflects which chapter is active. */}
            <div className="relative w-1 h-24 bg-(--c-line)/40 shrink-0" aria-hidden="true">
              <div
                className={`absolute bottom-0 left-0 w-full bg-(--c-accent) ${reduced ? '' : 'transition-[height] duration-500 ease-out'}`}
                style={{ height: `${((active + 1) / total) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Chapters */}
      <div className="lg:col-span-7">
        {SERVICES.map((service, i) => {
          const photo = photoFor(service.id);
          const isActive = i === active;
          return (
            <div
              key={service.id}
              ref={(el) => {
                chapterRefs.current[i] = el;
              }}
              data-index={i}
              className={`py-10 lg:min-h-[70vh] lg:py-0 lg:flex lg:flex-col lg:justify-center transition-opacity duration-500 ${
                isActive ? 'opacity-100' : 'lg:opacity-35'
              }`}
            >
              <EntityCardLink
                href={servicePath(service.id)}
                aria-label={`${service.title} treatment details`}
                data-cursor="View"
                className="block group"
              >
                {/* Inline photo, phones/tablets only -- the sticky arch is a
                    desktop device, so each chapter carries its own image here. */}
                <div className="lg:hidden mb-6 aspect-4/3 w-full overflow-hidden rounded-t-[999px] bg-(--c-surface-2) border border-(--c-line)/30">
                  <ServiceMedia
                    photo={photo}
                    width={900}
                    height={675}
                    className="w-full h-full object-cover"
                  />
                </div>

                <span className="hidden lg:block font-(family-name:--f-display) italic text-3xl text-(--c-accent)/40 mb-3 leading-none">
                  {String(i + 1).padStart(2, '0')}
                </span>

                <h3 className="font-(family-name:--f-display) text-2xl sm:text-3xl lg:text-4xl text-(--c-ink) font-medium mb-4 group-hover:text-(--c-accent) transition-colors">
                  {service.title}
                </h3>

                <p className="font-(family-name:--f-body) text-base text-(--c-body) font-light leading-relaxed mb-6 max-w-prose">
                  {service.fullDesc}
                </p>

                <ul className="flex flex-wrap gap-2 mb-8">
                  {service.benefits.map((b) => (
                    <li
                      key={b}
                      className="px-3.5 py-1.5 bg-(--c-surface-2) border border-(--c-line)/40 text-sm text-(--c-body) font-(family-name:--f-body)"
                    >
                      {b}
                    </li>
                  ))}
                </ul>

                <div className="pt-4 border-t border-(--c-line)/30 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 text-xs font-(family-name:--f-body) uppercase tracking-widest">
                  <span className="text-(--c-body)">Typical session: {service.duration}</span>
                  <span className="text-(--c-accent) font-semibold group-hover:underline whitespace-nowrap">
                    View treatment →
                  </span>
                </div>
              </EntityCardLink>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ServicesScrolly;
