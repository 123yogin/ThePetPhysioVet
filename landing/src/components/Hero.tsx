import React from 'react';

/**
 * Hero background: the clinic's own footage.
 *
 * Both files are the practice's own -- shot at the Shilaj premises, showing its
 * real staff, patients and mats. That replaces a Pexels stock clip whose
 * subjects wore legible "VOLUNTEER" shirts and did not work here, which read as
 * this clinic's team on a page headlined "India's first pet rehabilitation
 * center".
 *
 * ENCODING MATTERS HERE. The camera original was 2160x3840, 29.5s, HEVC at
 * 55Mbps -- 203MB, with an audio track, fetched before anyone has scrolled, on
 * a site whose visitors are mostly on Indian mobile data. It was also HEVC,
 * which Chrome frequently cannot decode at all, so the raw file would simply
 * not have played for a large share of visitors.
 *
 * What ships is H.264 900x1600, 12s, 30fps, CRF 31, audio stripped: 1.7MB,
 * about a hundred and twentieth of the original. 900px wide is not arbitrary --
 * it matches the panel's own width on a desktop half-viewport and covers a
 * 390px phone at 2x, so every byte beyond it would be resampled away.
 *
 * Re-encode any replacement the same way rather than dropping a camera file in:
 *   ffmpeg -ss 10 -t 12 -i source.MP4 -vf "scale=900:-2,fps=30" \
 *     -c:v libx264 -profile:v high -preset slow -crf 31 -pix_fmt yuv420p \
 *     -an -movflags +faststart public/hero-loop.mp4
 *
 * `-an` is not an oversight: the element is muted, so an audio track is bytes
 * nobody can ever hear. `+faststart` moves the index to the front so playback
 * begins before the whole file has arrived. libx264 rather than HEVC for the
 * decoder support above.
 *
 * The poster is frame one of that same clip, so the still and the video are the
 * same moment -- no stock photograph flashing before the real footage loads.
 *   ffmpeg -ss 10 -i source.MP4 -frames:v 1 -vf "scale=1080:-2" -q:v 6 \
 *     public/hero-poster.jpg
 *
 * Set HERO_VIDEO to '' to fall back to the poster alone.
 */
const HERO_VIDEO = '/hero-loop.mp4';
const HERO_POSTER = '/hero-poster.jpg';

import { Calendar, ChevronRight, Activity } from 'lucide-react';
import { Roll } from '../motion';
import { ScrollCue, useHeroExit } from '../motion/extras';
import { useLab } from '../lab/Lab';
import { Link } from '../seo/router';
import { conditionPath } from '../seo/routes';

interface HeroProps {
  onOpenBooking: () => void;
}

/* ---- Shared hero parts (every layout variant uses the same content) ---- */

const HeroMedia: React.FC<{ overlay?: React.ReactNode; tint?: string }> = ({ overlay, tint = 'grayscale-[15%] opacity-90' }) => (
  <>
    {HERO_VIDEO ? (
      <video
        // muted + playsInline are load-bearing: without both, iOS and
        // Chrome refuse to autoplay and the poster is all anyone sees.
        autoPlay
        muted
        loop
        playsInline
        preload="none"
        poster={HERO_POSTER}
        aria-hidden="true"
        className={`w-full h-full object-cover ${tint} transition-opacity duration-700 motion-reduce:hidden`}
      >
        <source src={HERO_VIDEO} type="video/mp4" />
      </video>
    ) : null}

    {/* LCP element: eager + high priority, explicit dimensions to reserve space (CLS).
        Also the poster, and the whole hero for anyone who has asked their
        system for reduced motion -- autoplaying video is a genuine problem
        for some people, not a preference. */}
    <img
      src={HERO_POSTER}
      alt="A clinician steadying a white Indian Spitz on the padded mats at The Pet Physio Vet in Shilaj, Ahmedabad"
      width={1080}
      height={1920}
      loading="eager"
      fetchPriority="high"
      decoding="async"
      className={`w-full h-full object-cover ${tint} transition-opacity duration-700${
        HERO_VIDEO ? ' hidden motion-reduce:block' : ''
      }`}
    />
    {overlay}
  </>
);

const HeroBadge: React.FC<{ tone?: 'light' | 'dark' }> = ({ tone = 'light' }) => (
  <div
    style={{ ['--d' as string]: '100ms' }}
    className={`hero-rise inline-flex items-center gap-2 px-3.5 py-1.5 w-fit text-xs font-(family-name:--f-body) uppercase tracking-widest ${
      tone === 'dark'
        ? 'bg-white/10 border border-white/30 text-white/90 backdrop-blur-sm'
        : 'bg-(--c-surface-2) border border-(--c-line)/60 text-(--c-body)'
    }`}
  >
    <Activity className={`w-3.5 h-3.5 ${tone === 'dark' ? 'text-white' : 'text-(--c-accent)'}`} />
    <span>Dedicated pet physiotherapy &amp; rehabilitation in Ahmedabad</span>
  </div>
);

/** The slogan, demoted to a small eyebrow line directly above the H1. */
const HeroSlogan: React.FC<{ tone?: 'light' | 'dark' }> = ({ tone = 'light' }) => (
  <p
    style={{ ['--d' as string]: '150ms' }}
    className={`hero-rise text-xs font-(family-name:--f-body) uppercase tracking-widest ${
      tone === 'dark' ? 'text-white/90' : 'text-(--c-body)'
    }`}
  >
    Life is movement, movement is life.
  </p>
);

/** The headline, with the lab's optional accent on the key word. */
const HeroTitle: React.FC<{ className: string; accent: string; tone?: 'light' | 'dark' }> = ({ className, accent, tone }) => {
  const key = (word: string) => {
    if (accent === 'italic') return <em className="acc-italic">{word}</em>;
    if (accent === 'marker') return <span className="acc-marker">{word}</span>;
    if (accent === 'underline')
      return (
        <span className="acc-underline">
          {word}
          <svg viewBox="0 0 200 20" preserveAspectRatio="none" aria-hidden="true">
            <path pathLength={100} d="M2 14 C 40 6, 90 4, 130 9 S 185 15, 198 7" />
          </svg>
        </span>
      );
    return word;
  };
  return (
    <>
      <HeroSlogan tone={tone} />
      <h1 className={className}>
        {/* Two lines that rise out of their own clipping boxes. The text
            content is still a single sentence. */}
        <span className="hero-line"><span style={{ ['--d' as string]: '200ms' }}>Veterinary {key('physiotherapy')} and rehabilitation</span></span>{' '}
        <span className="hero-line"><span style={{ ['--d' as string]: '330ms' }}>for dogs and cats in Ahmedabad</span></span>
      </h1>
    </>
  );
};

const HeroCopy: React.FC<{ className?: string }> = ({ className = 'text-(--c-body)' }) => (
  <p style={{ ['--d' as string]: '480ms' }} className={`hero-rise font-(family-name:--f-body) text-lg sm:text-xl max-w-xl font-light leading-relaxed ${className}`}>
    Dr. Dhanvi Patel (M.V.Sc.) treats arthritis, IVDD and post-surgical recovery at our
    Shilaj clinic and on home visits across Ahmedabad.
  </p>
);

const HeroCtas: React.FC<{ onOpenBooking: () => void; tone?: 'light' | 'dark'; className?: string }> = ({
  onOpenBooking,
  tone = 'light',
  className = 'mt-4',
}) => (
  <div style={{ ['--d' as string]: '620ms' }} className={`hero-rise flex flex-col sm:flex-row gap-4 sm:gap-6 w-full sm:w-auto ${className}`}>
    <button
      data-magnetic
      onClick={onOpenBooking}
      className={`inline-flex justify-center items-center gap-2.5 h-14 px-8 sm:px-10 rounded-none font-(family-name:--f-body) text-xs uppercase tracking-widest font-medium transition-all cursor-pointer shadow-xs ${
        tone === 'dark' ? 'bg-(--c-bg) text-(--c-ink) hover:bg-white' : 'bg-(--c-ink) text-(--c-card) hover:bg-(--c-body)'
      }`}
    >
      <Calendar className="w-4 h-4" />
      <Roll>Book Assessment</Roll>
    </button>

    <a
      data-magnetic
      href="#services"
      className={`inline-flex justify-center items-center gap-2 h-14 px-8 sm:px-10 rounded-none bg-transparent border font-(family-name:--f-body) text-xs uppercase tracking-widest font-medium transition-colors ${
        tone === 'dark' ? 'border-white/70 text-white hover:bg-white/10' : 'border-(--c-ink) text-(--c-ink) hover:bg-(--c-hover)'
      }`}
    >
      <Roll>Explore Treatments</Roll>
      <ChevronRight className="w-4 h-4" />
    </a>
  </div>
);

/**
 * "Enter by symptom" (the Practo / VCA pattern): owners know what they see --
 * a limp, stiffness after rest -- not the name of a therapy. Each chip goes to
 * the existing condition page that covers it; no new claims are made here.
 */
const CONCERNS: { label: string; id: string }[] = [
  { label: 'Limping or stiff joints', id: 'arthritis' },
  { label: 'Recovering from surgery', id: 'post-surgical' },
  { label: 'Weak or wobbly back legs', id: 'ivdd' },
  { label: 'Slowing down with age', id: 'senior-mobility' },
];

const HeroConcerns: React.FC = () => (
  <div style={{ ['--d' as string]: '760ms' }} className="hero-rise mt-2">
    <p className="font-(family-name:--f-body) text-xs uppercase tracking-widest text-(--c-body)/80 mb-3">What are you noticing?</p>
    <ul className="flex flex-wrap gap-2">
      {CONCERNS.map((c) => (
        <li key={c.id}>
          <Link
            to={conditionPath(c.id)}
            data-cursor="View"
            className="concern-chip inline-flex items-center gap-1.5 px-3.5 py-2 rounded-full border border-(--c-ink)/15 bg-(--c-card)/60 text-sm text-(--c-ink) hover:bg-(--c-ink) hover:text-(--c-bg) transition-colors"
          >
            {c.label}
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </Link>
        </li>
      ))}
    </ul>
  </div>
);

const TITLE = 'font-(family-name:--f-display) text-(--c-ink) font-light leading-[1.12] tracking-tight';

export const Hero: React.FC<HeroProps> = ({ onOpenBooking }) => {
  const { sectionRef, panelRef } = useHeroExit<HTMLElement, HTMLDivElement>();
  const { hero, accent } = useLab();

  // Stop decoding the looping hero video once it has scrolled away; resume
  // when it comes back.
  React.useEffect(() => {
    const el = sectionRef.current;
    const video = el?.querySelector('video');
    if (!el || !video) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) video.play().catch(() => {});
      else video.pause();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [hero, sectionRef]);
  const navPad = { paddingTop: 'calc(var(--nav-h, 113px) + 2rem)' };

  /* ---- Full-bleed video, giant centred headline ---- */
  if (hero === 'wordmark') {
    return (
      <section ref={sectionRef} id="home" className="relative w-full min-h-[100svh] flex items-center justify-center overflow-hidden bg-(--c-ink) pb-16" style={navPad}>
        <div ref={panelRef} className="absolute inset-0 z-0 hero-wipe overflow-hidden origin-top">
          <HeroMedia
            tint="opacity-100"
            overlay={<div className="absolute inset-0 bg-gradient-to-b from-(--c-ink)/55 via-(--c-ink)/35 to-(--c-ink)/80" />}
          />
        </div>
        <div className="relative z-10 px-4 sm:px-8 max-w-[1200px] mx-auto w-full flex flex-col items-center text-center gap-7">
          <HeroBadge tone="dark" />
          <HeroTitle tone="dark" accent={accent} className="font-(family-name:--f-display) text-white font-light leading-[1.02] tracking-tight text-5xl sm:text-7xl lg:text-[120px]" />
          <HeroCopy className="text-white/85 mx-auto" />
          <HeroCtas onOpenBooking={onOpenBooking} tone="dark" className="mt-2 justify-center" />
        </div>
        <ScrollCue className="hidden lg:flex absolute bottom-8 left-1/2 -translate-x-1/2 z-10 hero-rise [&_*]:!text-white/80" />
      </section>
    );
  }

  /* ---- Copy left, video inside an arch ---- */
  if (hero === 'arch') {
    return (
      <section ref={sectionRef} id="home" className="relative w-full min-h-[85vh] lg:min-h-[760px] overflow-hidden bg-(--c-hero) pb-16" style={navPad}>
        <div className="relative z-10 px-4 sm:px-8 max-w-[1280px] mx-auto w-full grid lg:grid-cols-12 gap-10 lg:gap-16 items-center">
          <div className="lg:col-span-7 flex flex-col gap-6 sm:gap-8">
            <HeroBadge />
            <HeroTitle accent={accent} className={`${TITLE} text-4xl sm:text-5xl lg:text-7xl`} />
            <HeroCopy />
            <HeroCtas onOpenBooking={onOpenBooking} />
            <HeroConcerns />
          </div>
          <div className="lg:col-span-5">
            <div ref={panelRef} className="hero-wipe relative mx-auto w-full max-w-[440px] aspect-[4/5] rounded-t-[999px] overflow-hidden border border-(--c-line) shadow-[0_40px_80px_-30px_rgba(60,33,23,0.35)]">
              <HeroMedia tint="opacity-100" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  /* ---- Editorial: oversized headline over a wide video band ---- */
  if (hero === 'editorial') {
    return (
      <section ref={sectionRef} id="home" className="relative w-full overflow-hidden bg-(--c-bg) pb-16" style={navPad}>
        <div className="px-4 sm:px-8 max-w-[1400px] mx-auto w-full">
          <div className="flex flex-col gap-6">
            <HeroBadge />
            <HeroTitle accent={accent} className={`${TITLE} text-5xl sm:text-7xl lg:text-[128px] leading-[0.98]`} />
          </div>
          <div className="mt-10 grid lg:grid-cols-12 gap-8 items-end">
            <div ref={panelRef} className="lg:col-span-8 hero-wipe relative aspect-[16/9] lg:aspect-[16/8] overflow-hidden">
              <HeroMedia tint="opacity-100" />
            </div>
            <div className="lg:col-span-4 flex flex-col gap-6">
              <HeroCopy />
              <HeroCtas onOpenBooking={onOpenBooking} className="mt-0 sm:flex-col lg:flex-col" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  /* ---- Full-bleed video, frosted copy card ---- */
  if (hero === 'glass') {
    return (
      <section ref={sectionRef} id="home" className="relative w-full min-h-[100svh] flex items-end overflow-hidden bg-(--c-ink) pb-8 sm:pb-12" style={navPad}>
        <div ref={panelRef} className="absolute inset-0 z-0 hero-wipe overflow-hidden origin-top">
          <HeroMedia tint="opacity-100" overlay={<div className="absolute inset-0 bg-gradient-to-t from-(--c-ink)/60 to-transparent" />} />
        </div>
        <div className="relative z-10 px-4 sm:px-8 max-w-[1280px] mx-auto w-full">
          <div className="max-w-2xl flex flex-col gap-6 p-6 sm:p-10 bg-(--c-bg)/80 backdrop-blur-xl border border-white/40 shadow-2xl">
            <HeroBadge />
            <HeroTitle accent={accent} className={`${TITLE} text-4xl sm:text-5xl lg:text-6xl`} />
            <HeroCopy />
            <HeroCtas onOpenBooking={onOpenBooking} className="mt-2" />
          </div>
        </div>
      </section>
    );
  }

  /* ---- Current: copy left, video right ---- */
  return (
    <section
      ref={sectionRef}
      id="home"
      className="relative w-full min-h-[85vh] lg:min-h-[720px] flex items-center justify-center overflow-hidden bg-(--c-hero) pb-16 lg:pb-0"
      // Clears the fixed navbar at every breakpoint and in both its scrolled
      // and unscrolled states. --nav-h is published by Navbar from its own
      // measured height; the CSS fallback covers the server-rendered HTML
      // before hydration.
      style={navPad}
    >
      {/* Entrance: the footage wipes in from the right while it settles from a
          slight zoom. CSS keyframes, so it plays on first paint without
          waiting for hydration; it waits for the intro when one is showing. */}
      <div ref={panelRef} className="absolute inset-0 z-0 w-full lg:w-1/2 lg:left-1/2 hero-wipe overflow-hidden origin-top">
        <HeroMedia
          overlay={<div className="absolute inset-0 bg-gradient-to-t lg:bg-gradient-to-r from-(--c-hero) via-(--c-hero)/60 to-transparent"></div>}
        />
      </div>

      <div className="relative z-10 px-4 sm:px-8 max-w-[1280px] mx-auto w-full flex items-center">
        <div className="max-w-3xl flex flex-col gap-6 sm:gap-8 pr-0 lg:pr-8">
          <HeroBadge />
          <HeroTitle accent={accent} className={`${TITLE} text-4xl sm:text-5xl lg:text-6xl`} />
          <HeroCopy />
          <HeroCtas onOpenBooking={onOpenBooking} />
        </div>
      </div>

      {/* Paw prints stepping down: the scroll cue award sites put under a
          hero, in the clinic's own terms. Desktop only -- on a phone the hero
          is already taller than the screen and the thumb knows what to do. */}
      <ScrollCue className="hidden lg:flex absolute bottom-8 left-[calc(50%+2.5rem)] z-10 hero-rise" />
    </section>
  );
};
