import React, { useRef } from 'react';
import { useSectionProgress } from '../motion';
import { SPECIALISTS } from '../data/clinicData';
import { useLab } from '../lab/Lab';

/**
 * Split-doors reveal over the clinician section — two cream doors part as the
 * page scrolls, uncovering the real "Meet your clinician" section behind them
 * (not a copy, so nothing appears twice), while the title lifts and dissolves.
 *
 * The reveal, made seam-proof. The original split-doors put the heading on BOTH
 * moving panels and let them meet at the centre; on a fractional-scaled display
 * that always misrendered — a hairline of the content bleeding through, or a
 * doubled glyph in the overlap. The fix separates the two jobs:
 *
 *  - The DOORS carry no text and OVERLAP at the centre by a comfortable margin.
 *    With nothing to double and a real overlap, the centre can never show a seam
 *    or a sliver of the content behind, at any device-pixel ratio or zoom.
 *  - The TITLE is a SINGLE element above the doors. It is never split, so it
 *    cannot double or seam; it just lifts and dissolves as the doors part.
 *
 * Both doors translate by the same number of pixels, so they open symmetrically
 * and read as one pair.
 *
 * Mechanics: the wrapped section is `position: sticky` inside a taller runway, so
 * it holds still while the doors open, then scrolls on. Progress comes from the
 * motion engine: cached geometry, style writes only, no React state on scroll.
 * aria-hidden and pointer-events-none throughout; the section keeps its own
 * heading. Under prefers-reduced-motion the engine reports progress 1 (open).
 */
export const SplitDoorsReveal: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { doc } = useLab();
  const enabled = doc === 'story' && SPECIALISTS.length === 1;

  // How far past the exact half each door reaches, in px — larger than any
  // subpixel rounding at any zoom, so the closed centre never opens onto content.
  const DOOR_OVERLAP = 24;

  const doorLeftRef = useRef<HTMLDivElement>(null);
  const doorRightRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const hintRef = useRef<HTMLParagraphElement>(null);

  // p: 0 when the runway's top reaches the top of the viewport, 1 half a
  // screen later -- inside the pin on phones (0.6 screens) and desktop (0.8).
  const wrapRef = useSectionProgress<HTMLDivElement>(
    (p) => {
      const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // ease in-out

      // One absolute distance for both doors so they open in lockstep; reaches
      // half the viewport plus the overlap, so each door fully clears the screen.
      const dist = e * (window.innerWidth / 2 + DOOR_OVERLAP);
      if (doorLeftRef.current) doorLeftRef.current.style.transform = `translate3d(${(-dist).toFixed(1)}px,0,0)`;
      if (doorRightRef.current) doorRightRef.current.style.transform = `translate3d(${dist.toFixed(1)}px,0,0)`;

      // The title leads the reveal: drifts up, grows a touch, and dissolves.
      if (titleRef.current) {
        titleRef.current.style.opacity = String(Math.max(0, 1 - e * 1.7));
        titleRef.current.style.transform = `translate3d(0,${(-e * 48).toFixed(1)}px,0) scale(${(1 + e * 0.06).toFixed(3)})`;
      }
      if (hintRef.current) hintRef.current.style.opacity = String(Math.max(0, 1 - e * 6));
    },
    0,
    -0.5,
  );

  if (!enabled) return <>{children}</>;

  return (
    // The #about anchor lives here (lab.css styles `#about .grid`, so it must
    // be an ancestor of the section). The negative scroll margin makes nav
    // jumps land half a screen in, where the doors are already open.
    <div id="about" ref={wrapRef} className="relative bg-(--c-surface) scroll-mt-[-50svh]">
      <div className="sticky top-0">
        {children}
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[100svh] overflow-hidden">
          {/* The two doors — plain cream, no text, overlapping the centre by
              DOOR_OVERLAP px so nothing behind can ever show through the seam. */}
          <div
            ref={doorLeftRef}
            style={{ width: `calc(50% + ${DOOR_OVERLAP}px)` }}
            className="absolute inset-y-0 left-0 bg-(--c-hero) will-change-transform"
          />
          <div
            ref={doorRightRef}
            style={{ width: `calc(50% + ${DOOR_OVERLAP}px)` }}
            className="absolute inset-y-0 right-0 bg-(--c-hero) will-change-transform"
          />

          {/* The title — one element, above the doors, never split. */}
          <div ref={titleRef} className="absolute inset-0 flex items-center justify-center will-change-[transform,opacity]">
            <p className="font-(family-name:--f-display) text-(--c-ink) font-light leading-[0.95] text-center text-[11.5vw] sm:text-[10vw] lg:text-[9.5vw] tracking-tight whitespace-nowrap">
              Meet the vet
              <br />
              behind <em className="acc-italic">every</em> step.
            </p>
          </div>

          <p ref={hintRef} className="absolute bottom-8 inset-x-0 text-center text-[10px] uppercase tracking-[0.3em] text-(--c-accent)">
            Keep scrolling
          </p>
        </div>
      </div>
      {/* The pin distance. A spacer, not padding: a sticky element can only
          travel within its parent's content box, which excludes padding. Sized
          to just past where the doors finish opening (~half a screen, matching
          the progress mapping's -0.5 end) plus a small buffer — more than that
          is dead scroll that reads as a big empty gap under the revealed
          section. */}
      <div aria-hidden="true" className="h-[55svh]" />
    </div>
  );
};
