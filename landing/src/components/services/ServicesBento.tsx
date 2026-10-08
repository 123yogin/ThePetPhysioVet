import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { ArrowUpRight, Activity, Waves, Zap, Hand, Home, BedDouble } from 'lucide-react';
import { SERVICES } from '../../data/clinicData';
import { EntityCardLink } from '../EntityCardLink';
import { servicePath } from '../../seo/routes';
import { useStagger } from '../../motion';
import type { ServiceItem } from '../../types';

/**
 * Bento variant of "Our Services": one big feature tile (the first service,
 * full photo) plus four supporting tiles, alternating photo and typographic
 * treatments. Six services, six tiles, no empty cells at any breakpoint.
 *
 * Pointer/hover effects (spotlight, image scale, arrow rotate) live on a plain
 * wrapper `<div>` around each `EntityCardLink` -- its typed props do not
 * declare `onPointerMove`, and that div is also what carries `group` for the
 * `group-hover:*` utilities used throughout.
 */

const ICONS: Record<string, LucideIcon> = {
  night_shelter: BedDouble,
  front_hand: Hand,
  bolt: Zap,
  star: Waves,
  home: Home,
};
const getIcon = (name: string): LucideIcon => ICONS[name] ?? Activity;

interface Photo {
  src: string;
  alt: string;
  w: number;
  h: number;
}

// No per-service photography exists yet -- these are the clinic's own general
// photographs, chosen for what they actually show (verified by eye), not
// claimed to document each specific modality in action.
const PHOTOS: Record<string, Photo> = {
  'indoor-physiotherapy': {
    src: '/photos/clinic-german-shepherd.webp',
    alt: 'Dr. Dhanvi Patel holding a German Shepherd on the padded therapy mats at the Shilaj clinic',
    w: 900,
    h: 1200,
  },
  'manual-therapy': {
    src: '/photos/therapy-ramp.webp',
    alt: 'A Labrador retriever on the clinic therapy mat, head lowered toward the camera',
    w: 800,
    h: 600,
  },
  hydrotherapy: {
    src: '/photos/pool-swim-blue.webp',
    alt: 'A Golden Retriever swimming with a support harness in the clinic indoor hydrotherapy pool',
    w: 800,
    h: 600,
  },
  acupuncture: {
    src: '/photos/dhanvi-patel.webp',
    alt: 'Dr. Dhanvi Patel sitting on the therapy mats at the clinic, holding a beagle',
    w: 600,
    h: 800,
  },
};

/** Writes --mx/--my as the pointer moves, read by the tile's own spotlight
 *  gradient. No React state, so a moving cursor never triggers a re-render. */
function handleSpotlight(e: React.PointerEvent<HTMLDivElement>) {
  const el = e.currentTarget;
  const rect = el.getBoundingClientRect();
  el.style.setProperty('--mx', `${((e.clientX - rect.left) / rect.width) * 100}%`);
  el.style.setProperty('--my', `${((e.clientY - rect.top) / rect.height) * 100}%`);
}

const Arrow: React.FC<{ tone: 'light' | 'dark' }> = ({ tone }) => (
  <span
    className={`mt-4 inline-flex h-10 w-10 shrink-0 items-center justify-center self-end rounded-full rotate-[-45deg] border transition-transform duration-500 group-hover:rotate-0 ${
      tone === 'light' ? 'border-(--c-card)/50 text-(--c-card)' : 'border-(--c-ink)/25 text-(--c-ink)'
    }`}
  >
    <ArrowUpRight className="h-4 w-4" />
  </span>
);

const SpotlightLight = (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 z-[5] opacity-0 transition-opacity duration-500 group-hover:opacity-100 motion-reduce:hidden"
    style={{ background: 'radial-gradient(420px circle at var(--mx,50%) var(--my,50%), rgba(255,255,255,0.24), transparent 70%)' }}
  />
);

const SpotlightTint = (
  <div
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 z-[5] opacity-0 transition-opacity duration-500 group-hover:opacity-45 motion-reduce:hidden"
    style={{ background: 'radial-gradient(360px circle at var(--mx,50%) var(--my,50%), var(--c-accent-soft), transparent 70%)' }}
  />
);

const PhotoImg: React.FC<{ photo: Photo; top?: boolean }> = ({ photo, top }) => (
  <img
    src={photo.src}
    alt={photo.alt}
    width={photo.w}
    height={photo.h}
    loading="lazy"
    decoding="async"
    className={`absolute inset-0 h-full w-full object-cover ${top ? 'object-top' : ''} transition-transform duration-700 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100`}
  />
);

const tileBase =
  'group relative isolate overflow-hidden rounded-[var(--lab-card)] border border-(--c-line)/30';

const FeatureTile: React.FC<{ service: ServiceItem }> = ({ service }) => {
  const photo = PHOTOS[service.id];
  return (
    <div
      onPointerMove={handleSpotlight}
      className={`${tileBase} h-[420px] sm:col-span-2 sm:h-[440px] lg:col-span-7 lg:row-span-2 lg:h-auto`}
    >
      <PhotoImg photo={photo} top />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,transparent_25%,var(--c-ink)_95%)] opacity-90"
      />
      {SpotlightLight}
      <EntityCardLink
        href={servicePath(service.id)}
        aria-label={`${service.title} treatment details`}
        data-cursor="View"
        className="relative z-10 flex h-full flex-col justify-end p-7 sm:p-10"
      >
        <span className="font-(family-name:--f-display) italic text-4xl text-(--c-card)/60">01</span>
        <h3 className="mt-2 font-(family-name:--f-display) text-2xl font-medium text-(--c-card) sm:text-3xl lg:text-4xl">
          {service.title}
        </h3>
        <p className="mt-3 max-w-lg font-(family-name:--f-body) text-sm font-light leading-relaxed text-(--c-card)/85 sm:text-base">
          {service.fullDesc}
        </p>
        <ul className="mt-5 flex flex-wrap gap-2">
          {service.benefits.slice(0, 3).map((b) => (
            <li
              key={b}
              className="rounded-full border border-(--c-card)/40 bg-(--c-ink)/25 px-3.5 py-1.5 text-xs text-(--c-card) backdrop-blur-sm"
            >
              {b}
            </li>
          ))}
        </ul>
        <Arrow tone="light" />
      </EntityCardLink>
    </div>
  );
};

const PhotoTile: React.FC<{ service: ServiceItem; index: number; span: string }> = ({ service, index, span }) => {
  const photo = PHOTOS[service.id];
  return (
    <div onPointerMove={handleSpotlight} className={`${tileBase} h-[220px] sm:h-[240px] lg:h-auto ${span}`}>
      <PhotoImg photo={photo} />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-[linear-gradient(180deg,transparent_35%,var(--c-ink)_100%)] opacity-85"
      />
      {SpotlightLight}
      <EntityCardLink
        href={servicePath(service.id)}
        aria-label={`${service.title} treatment details`}
        data-cursor="View"
        className="relative z-10 flex h-full flex-col justify-end p-6 sm:p-7"
      >
        <span className="font-(family-name:--f-display) italic text-2xl text-(--c-card)/60">
          {String(index + 1).padStart(2, '0')}
        </span>
        <h3 className="mt-1 font-(family-name:--f-display) text-xl font-medium text-(--c-card) sm:text-2xl">
          {service.title}
        </h3>
        <p className="mt-1.5 max-w-md font-(family-name:--f-body) text-sm font-light leading-relaxed text-(--c-card)/85">
          {service.shortDesc}
        </p>
        <Arrow tone="light" />
      </EntityCardLink>
    </div>
  );
};

const TypeTile: React.FC<{ service: ServiceItem; index: number; span: string; bg: string }> = ({
  service,
  index,
  span,
  bg,
}) => {
  const Icon = getIcon(service.icon);
  return (
    <div onPointerMove={handleSpotlight} className={`${tileBase} ${bg} h-[220px] sm:h-[240px] lg:h-auto ${span}`}>
      {SpotlightTint}
      <EntityCardLink
        href={servicePath(service.id)}
        aria-label={`${service.title} treatment details`}
        data-cursor="View"
        className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-7"
      >
        <div className="flex items-start justify-between">
          <Icon className="h-11 w-11 text-(--c-ink)/70 sm:h-14 sm:w-14" aria-hidden="true" />
          <span className="font-(family-name:--f-display) italic text-3xl text-(--c-accent)/40">
            {String(index + 1).padStart(2, '0')}
          </span>
        </div>
        <div>
          <h3 className="font-(family-name:--f-display) text-xl font-medium text-(--c-ink) transition-colors group-hover:text-(--c-accent) sm:text-2xl">
            {service.title}
          </h3>
          <p className="mt-1.5 font-(family-name:--f-body) text-sm font-light leading-relaxed text-(--c-body)">
            {service.shortDesc}
          </p>
          <Arrow tone="dark" />
        </div>
      </EntityCardLink>
    </div>
  );
};

const ServicesBento: React.FC = () => {
  const gridRef = useStagger<HTMLDivElement>({ step: 110 });
  const [feature, manual, electro, hydro, acupuncture, homeCare] = SERVICES;

  return (
    <div ref={gridRef} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:auto-rows-[260px]">
      <FeatureTile service={feature} />
      <PhotoTile service={manual} index={1} span="lg:col-span-5 lg:row-span-1" />
      <TypeTile service={electro} index={2} span="lg:col-span-5 lg:row-span-1" bg="bg-(--c-hero)" />
      <PhotoTile service={hydro} index={3} span="lg:col-span-7 lg:row-span-1" />
      <PhotoTile service={acupuncture} index={4} span="lg:col-span-5 lg:row-span-1" />
      <TypeTile service={homeCare} index={5} span="sm:col-span-2 lg:col-span-12 lg:row-span-1" bg="bg-(--c-card)" />
    </div>
  );
};

export default ServicesBento;
