import React from 'react';
import { GALLERY_ITEMS } from '../data/clinicData';
import { GalleryItem } from '../types';
import { Maximize2 } from 'lucide-react';
import { SplitWords, VelocitySkew } from '../motion';
import { Pulse } from '../motion/extras';
import { LazyLoopVideo } from './LazyLoopVideo';

interface GallerySectionProps {
  onSelectImage: (item: GalleryItem) => void;
}

export const GallerySection: React.FC<GallerySectionProps> = ({ onSelectImage }) => {
  // Read once rather than per tile. matchMedia is unavailable during the
  // server render, so this starts false and corrects on hydration.
  const [prefersReducedMotion, setPrefersReducedMotion] = React.useState(false);
  React.useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setPrefersReducedMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  // Play the loops only while the gallery is on screen. Eight looping videos
  // kept decoding off-screen while the visitor read other sections -- a
  // steady CPU/battery drain on phones that competes with scroll smoothness.
  const sectionRef = React.useRef<HTMLElement>(null);
  React.useEffect(() => {
    const el = sectionRef.current;
    if (!el || prefersReducedMotion) return;
    const videos = (): HTMLVideoElement[] => Array.from(el.querySelectorAll('video'));
    const io = new IntersectionObserver(
      ([entry]) => {
        videos().forEach((v) => {
          if (entry.isIntersecting) v.play().catch(() => {});
          else v.pause();
        });
      },
      { rootMargin: '200px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [prefersReducedMotion]);

  return (
    <section ref={sectionRef} id="gallery" className="py-20 sm:py-28 bg-(--c-card) overflow-x-clip">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-8">
        {/* Header */}
        <div className="mb-16 grid grid-cols-1 md:grid-cols-12 gap-8 items-end border-b border-(--c-line)/30 pb-8">
          <div className="md:col-span-7">
            <span className="text-xs uppercase tracking-widest text-(--c-accent) font-semibold mb-2 flex items-center gap-3 font-(family-name:--f-body)">
            <Pulse />
              Patients and sessions
            </span>
            <SplitWords className="font-(family-name:--f-display) text-3xl sm:text-4xl lg:text-5xl text-(--c-ink) font-light">Our Clinic</SplitWords>
          </div>
          <div className="md:col-span-5 md:text-right">
            {/* This read "A serene, state-of-the-art sanctuary equipped with
                warm water aquatic suites, non-slip therapeutic flooring, and
                calm private therapy bays" -- a facility none of these pictures
                shows. What is actually below is the clinic's own patients, its
                pool and mats, and home visits, so the copy says that. */}
            <p className="font-(family-name:--f-body) text-base sm:text-lg text-(--c-body) font-light leading-relaxed">
              Real sessions at the Shilaj clinic and home visits across Ahmedabad
              — the pool, the mats, and the patients who use them.
            </p>
          </div>
        </div>

        {/* Two marquee rows drifting in opposite directions.

            Each row renders its items TWICE and translates by exactly -50%, so
            the second copy is under the cursor at the instant the first has
            finished -- that is what makes it seamless rather than snapping back.
            `aria-hidden` on the duplicate keeps a screen reader from reading the
            whole gallery twice.

            The animation is paused on hover, and the whole thing falls back to
            a plain wrapped row under prefers-reduced-motion. Neither is polish:
            the tiles open a lightbox on click, and clicking a moving target is
            genuinely hard -- and permanent motion on a page is a real problem
            for some people rather than a taste. */}
        {/* The rows lean with scroll speed and settle flat when the page stops,
            after the skewed cards of the reference site. */}
        <VelocitySkew max={5}>
        {/* Full-bleed: the rows run edge to edge of the screen rather than
            stopping at the content column, so tiles slide in from off-screen. */}
        <div className="mx-[calc(50%-50vw)] space-y-6 overflow-hidden motion-reduce:overflow-visible">
          {[0, 1].map((rowIndex) => {
            const row = GALLERY_ITEMS.filter((_, i) => i % 2 === rowIndex);
            return (
              <div
                key={rowIndex}
                className="group/row flex w-max gap-6 motion-safe:animate-marquee motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center hover:[animation-play-state:paused]"
                style={{
                  animationDirection: rowIndex === 1 ? 'reverse' : 'normal',
                  animationDuration: rowIndex === 1 ? '46s' : '38s',
                }}
              >
                {[...row, ...row].map((item, i) => (
                  <button
                    type="button"
                    key={`${item.id}-${i}`}
                    aria-hidden={i >= row.length}
                    // The marquee duplicates each tile for a seamless loop; the
                    // clones are aria-hidden AND removed from the tab order so
                    // keyboard users don't hit every item twice.
                    tabIndex={i >= row.length ? -1 : undefined}
                    onClick={() => onSelectImage(item)}
                    data-cursor={item.videoUrl ? 'Play' : 'Open'}
                    className="relative group shrink-0 w-[240px] sm:w-[300px] overflow-hidden bg-(--c-surface-3) cursor-pointer border border-(--c-line)/30 hover:border-(--c-ink) transition-all text-left block appearance-none"
                  >
                    {/* Portrait tiles, because every asset is portrait.

                        The tile used to be 380x260 landscape while the
                        photographs are 3:4 and the reels 9:16 -- so everything
                        in this gallery was being centre-cropped by a landscape
                        box, slicing heads off and cutting the reels' burned-in
                        captions mid-word. The tile is now 3:4, the photographs
                        fit it exactly, and the reel loops are re-encoded to the
                        same 3:4 rather than squeezed into it.

                        A reel plays its own small loop, continuously.

                        The loop is a separate, smaller rendition: 12 seconds,
                        360px wide, no audio, about 1.9MB for all four. Playing
                        the full reels here instead would have downloaded ~15MB
                        and decoded four audio tracks before anyone asked to
                        watch anything. The full reel, with sound, is fetched
                        only when the tile is opened.

                        autoPlay needs muted AND playsInline together or iOS and
                        Chrome both refuse it and the tile sits on a frozen
                        frame. Under prefers-reduced-motion it does not play at
                        all -- permanent motion is a genuine problem for some
                        people, and there is already a marquee moving. */}
                    {item.videoUrl ? (
                      <LazyLoopVideo
                        src={item.previewUrl || item.videoUrl}
                        label={item.altText}
                        reducedMotion={prefersReducedMotion}
                        className="w-full aspect-[3/4] object-cover bg-(--c-surface-3) grayscale-[25%] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700 ease-out"
                      />
                    ) : (
                      <img
                        src={item.imageUrl}
                        alt={item.altText}
                        width={600}
                        height={450}
                        loading="lazy"
                        decoding="async"
                        className="w-full aspect-[3/4] object-cover grayscale-[25%] group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700 ease-out"
                      />
                    )}

                    <div className="absolute inset-0 bg-gradient-to-t from-(--c-ink)/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-6 text-white">
                      <span className="text-[10px] uppercase tracking-widest text-(--c-accent-soft) font-semibold mb-1">
                        {item.category}
                      </span>
                      <h4 className="font-(family-name:--f-display) text-lg font-medium flex items-center justify-between">
                        <span>{item.title}</span>
                        <Maximize2 className="w-4 h-4 text-(--c-card)" />
                      </h4>
                    </div>
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        </VelocitySkew>
      </div>
    </section>
  );
};
