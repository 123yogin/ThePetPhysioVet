/**
 * Second round of motion pieces, researched against award-listed pet-care and
 * health sites (Kindred Pet Care, Pomegranate, Heva Health on Awwwards):
 *
 *  - PawTrail     paw prints that walk along a path as the section scrolls
 *  - Pulse        a heartbeat line that draws itself beside section labels,
 *                 echoing the pulse icon in the hero badge
 *  - CursorBubble a "View" / "Play" / "Book" disc that follows the pointer
 *                 over cards, alongside (never instead of) the native cursor
 *  - Magnetic     primary buttons lean toward the pointer
 *  - ImageDrift   photographs drift inside their frames as the page scrolls
 *  - PageCurtain  a cream curtain that lifts off each newly opened page
 *
 * Same rules as index.tsx: server output is the finished page, reduced motion
 * turns everything off, and nothing changes layout at rest.
 */
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from '../seo/router';
import { onFrame, track, wake } from './engine';

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = () => typeof window !== 'undefined' && window.matchMedia('(pointer: fine)').matches;

/* ---------------------------------------------------------------- Paw -- */

/** One paw print: a main pad and four toes, pointing up (-y). */
export const PawPrint: React.FC<{ className?: string; style?: React.CSSProperties }> = ({ className, style }) => (
  <svg viewBox="0 0 24 24" className={className} style={style} aria-hidden="true" focusable="false">
    <g fill="currentColor">
      <path d="M12 12.6c-2.9 0-5.6 2.7-5.6 5.3 0 1.8 1.4 2.6 2.9 2.6 1.2 0 1.8-.6 2.7-.6s1.5.6 2.7.6c1.5 0 2.9-.8 2.9-2.6 0-2.6-2.7-5.3-5.6-5.3z" />
      <ellipse cx="5.6" cy="10.4" rx="1.9" ry="2.4" transform="rotate(-18 5.6 10.4)" />
      <ellipse cx="9.4" cy="6.6" rx="2" ry="2.6" transform="rotate(-6 9.4 6.6)" />
      <ellipse cx="14.6" cy="6.6" rx="2" ry="2.6" transform="rotate(6 14.6 6.6)" />
      <ellipse cx="18.4" cy="10.4" rx="1.9" ry="2.4" transform="rotate(18 18.4 10.4)" />
    </g>
  </svg>
);

/**
 * Paw prints stepping left to right across their container. `progress`
 * (0..1) decides how many are down; each lands with a small press.
 * Alternate prints sit either side of the centre line, like a real gait.
 */
export const PawTrail = React.forwardRef<HTMLDivElement, { count?: number; className?: string; vertical?: boolean }>(
  ({ count = 22, className = '', vertical = false }, ref) => (
    <div ref={ref} aria-hidden="true" className={`paw-trail pointer-events-none ${vertical ? 'is-vertical' : ''} ${className}`}>
      {Array.from({ length: count }, (_, i) => {
        const along = `${((i + 0.5) / count) * 100}%`;
        return (
          <PawPrint
            key={i}
            className="absolute w-4 h-4 text-(--c-accent)"
            style={{
              left: vertical ? '50%' : along,
              top: vertical ? along : '50%',
              ['--paw-y' as string]: `${i % 2 === 0 ? -8 : 8}px`,
            }}
          />
        );
      })}
    </div>
  ),
);
PawTrail.displayName = 'PawTrail';

/** Light the first `p` fraction of a PawTrail's prints. Direct DOM write, no re-render. */
export function setPawTrail(el: HTMLElement | null, p: number) {
  if (!el) return;
  const paws = el.children;
  const shown = Math.round(p * paws.length);
  for (let i = 0; i < paws.length; i++) paws[i].classList.toggle('is-on', i < shown);
}

/* -------------------------------------------------------------- Pulse -- */

/**
 * A short heartbeat trace that draws itself the first time it scrolls into
 * view, then sends a faint blip along its length every few seconds.
 */
export const Pulse: React.FC<{ className?: string }> = ({ className = '' }) => {
  const ref = useRef<SVGSVGElement>(null);
  const [drawn, setDrawn] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;
    const r = el.getBoundingClientRect();
    if (r.top < window.innerHeight * 0.9) return; // already visible: stay drawn
    setDrawn(false);
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setDrawn(true);
        io.disconnect();
      },
      { rootMargin: '0px 0px -10% 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      viewBox="0 0 64 16"
      className={`pulse-line ${drawn ? 'is-drawn' : ''} ${className}`}
      aria-hidden="true"
      focusable="false"
    >
      <path pathLength={100} d="M0 8 H18 L22 8 L25 2 L29 14 L32 5 L34 8 H64" />
      <path pathLength={100} className="pulse-blip" d="M0 8 H18 L22 8 L25 2 L29 14 L32 5 L34 8 H64" />
    </svg>
  );
};

/* ------------------------------------------------------ Cursor bubble -- */

/**
 * Any element with `data-cursor="Label"` shows a small disc carrying that
 * label beside the pointer while hovered. The system cursor is untouched, so
 * nobody loses track of where they are pointing.
 */
export const CursorBubble: React.FC = () => {
  const ref = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced() || !finePointer()) return;
    let tx = -100;
    let ty = -100;
    let x = tx;
    let y = ty;
    let active = false;
    let raf = 0;

    const tick = () => {
      x += (tx - x) * 0.2;
      y += (ty - y) * 0.2;
      el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${active ? 1 : 0})`;
      raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.3 || active ? requestAnimationFrame(tick) : 0;
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onMove = (e: PointerEvent) => {
      tx = e.clientX + 18;
      ty = e.clientY + 18;
      const target = (e.target as Element | null)?.closest?.('[data-cursor]') as HTMLElement | null;
      const next = !!target;
      if (target && labelRef.current) labelRef.current.textContent = target.dataset.cursor || '';
      if (next !== active) {
        active = next;
        if (active) {
          x = tx;
          y = ty;
        }
      }
      kick();
    };
    const onLeave = () => {
      active = false;
      kick();
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    window.addEventListener('scroll', onLeave, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerleave', onLeave);
      window.removeEventListener('scroll', onLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="fixed left-0 top-0 z-[60] pointer-events-none w-[72px] h-[72px] -ml-0 rounded-full bg-(--c-ink) text-white flex items-center justify-center transition-[transform] duration-0"
      style={{ transform: 'translate3d(-100px,-100px,0) scale(0)', transitionProperty: 'none' }}
    >
      <span ref={labelRef} className="font-(family-name:--f-body) text-[10px] uppercase tracking-widest font-medium" />
    </div>
  );
};

/* ----------------------------------------------------------- Magnetic -- */

/** Elements with `data-magnetic` lean toward the pointer, up to ~8px. */
export const Magnetic: React.FC = () => {
  useEffect(() => {
    if (prefersReduced() || !finePointer()) return;
    let current: HTMLElement | null = null;
    let rect: DOMRect | null = null;
    const release = (el: HTMLElement) => {
      el.style.transition = 'transform 0.6s cubic-bezier(0.2, 0.8, 0.2, 1)';
      el.style.transform = '';
    };
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-magnetic]') as HTMLElement | null;
      if (current && current !== el) release(current);
      // Measure once on entry: re-reading the rect on every move would force
      // a layout right after our own transform write, and include it.
      if (el && el !== current) rect = el.getBoundingClientRect();
      current = el;
      if (!el || !rect) return;
      const r = rect;
      const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      el.style.transition = 'transform 0.15s ease-out';
      el.style.transform = `translate(${(dx * 8).toFixed(1)}px, ${(dy * 6).toFixed(1)}px)`;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (current) release(current);
    };
  }, []);
  return null;
};

/* --------------------------------------------------------- Image drift -- */

/**
 * Every `[data-drift] img` moves a few pixels against the scroll while its
 * frame is on screen, so photographs read as windows rather than stickers.
 * The image is scaled up slightly to keep its edges out of view.
 */
export const ImageDrift: React.FC<{ amount?: number }> = ({ amount = 18 }) => {
  const { path } = useRouter();
  useEffect(() => {
    if (prefersReduced()) return;
    const frames = Array.from(document.querySelectorAll<HTMLElement>('[data-drift]'));
    if (!frames.length) return;
    // Cached geometry from the engine; only frames on screen are written.
    const items = frames.map((f) => ({ f, img: f.querySelector<HTMLElement>('img, video'), t: track(f), on: false }));
    const byEl = new Map(items.map((it) => [it.f, it]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        const it = byEl.get(e.target as HTMLElement);
        if (it) it.on = e.isIntersecting;
      });
      wake();
    });
    frames.forEach((f) => io.observe(f));
    items.forEach((it) => it.img && (it.img.style.scale = '1.12'));
    const stop = onFrame((fr) => {
      for (const it of items) {
        if (!it.on || !it.img) continue;
        const b = it.t.box();
        const center = b.top - fr.scrollY + b.height / 2;
        const p = (center - fr.vh / 2) / (fr.vh / 2 + b.height / 2); // -1..1
        it.img.style.translate = `0 ${(-p * amount).toFixed(1)}px`;
      }
    });
    return () => {
      stop();
      io.disconnect();
      items.forEach((it) => it.t.release());
    };
  }, [amount, path]);
  return null;
};

/* --------------------------------------------------------- Page curtain -- */

/**
 * When the route changes on the client, a cream panel carrying the clinic's
 * mark sits over the new page for a beat and then lifts away. It runs after
 * the route has already changed, so it never delays navigation, and it does
 * not run on the first load (the intro covers that).
 */
export const PageCurtain: React.FC = () => {
  const { path } = useRouter();
  const first = useRef(true);
  const [run, setRun] = useState(0);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (prefersReduced()) return;
    setRun((n) => n + 1);
  }, [path]);

  if (!run) return null;
  return (
    <div key={run} aria-hidden="true" className="page-curtain">
      <img src="/logo-144.webp" alt="" width={72} height={72} />
    </div>
  );
};

/* --------------------------------------------------------------- Tilt -- */

/**
 * Cards with `data-tilt` lean a few degrees toward the pointer, as if lifted
 * off the page. Resets on leave. Fine pointers only, off under reduced motion.
 */
export const Tilt: React.FC<{ max?: number }> = ({ max = 3.5 }) => {
  useEffect(() => {
    if (prefersReduced() || !finePointer()) return;
    let current: HTMLElement | null = null;
    let rect: DOMRect | null = null;
    const reset = (el: HTMLElement) => {
      el.style.transition = 'transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1)';
      el.style.transform = '';
    };
    const onMove = (e: PointerEvent) => {
      const el = (e.target as Element | null)?.closest?.('[data-tilt]') as HTMLElement | null;
      if (current && current !== el) reset(current);
      if (el && el !== current) rect = el.getBoundingClientRect();
      current = el;
      if (!el || !rect) return;
      const r = rect;
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transition = 'transform 0.2s ease-out';
      el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateY(-4px)`;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      if (current) reset(current);
    };
  }, [max]);
  return null;
};

/* ---------------------------------------------------------- Scroll cue -- */

/** "Scroll" with three paw prints stepping downward on a loop. */
export const ScrollCue: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div aria-hidden="true" className={`scroll-cue flex flex-col items-center gap-2 ${className}`}>
    <span className="font-(family-name:--f-body) text-[10px] uppercase tracking-[0.3em] text-(--c-accent)">Scroll</span>
    <span className="relative block w-8 h-16">
      {[0, 1, 2].map((i) => (
        <PawPrint
          key={i}
          className="scroll-cue-paw absolute w-3.5 h-3.5 text-(--c-accent)"
          style={{
            left: i % 2 ? '58%' : '14%',
            top: `${i * 30}%`,
            transform: 'rotate(180deg)',
            animationDelay: `${i * 0.35}s`,
          }}
        />
      ))}
    </span>
  </div>
);

/* ------------------------------------------------------------ Scroll ink -- */

/**
 * A paragraph whose words darken one by one as it scrolls up through the
 * viewport, so reading position and scroll position agree. The words start
 * at 25% opacity, never invisible, and the full text is real text throughout
 * (the server renders it fully dark; the fade is applied after mount).
 */
export const ScrollInk: React.FC<{ text: string; className?: string }> = ({ text, className }) => {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(' ');

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;
    const spans: HTMLElement[] = Array.from(el.querySelectorAll<HTMLElement>('[data-w]'));
    const t = track(el);
    let lastLit = -1;
    const stop = onFrame((f) => {
      const b = t.box();
      const top = b.top - f.scrollY;
      // 0 when the paragraph's top reaches 90% of the screen; fully inked
      // by the time it has risen to about the middle, where people read.
      const p = Math.max(0, Math.min(1, (f.vh * 0.9 - top) / (f.vh * 0.35 + b.height * 0.3)));
      const lit = Math.round(p * spans.length * 4) / 4;
      if (lit === lastLit) return;
      lastLit = lit;
      spans.forEach((s, i) => {
        s.style.opacity = String(Math.max(0.25, Math.min(1, lit - i + 1)));
      });
    });
    return () => {
      stop();
      t.release();
      spans.forEach((s) => (s.style.opacity = ''));
    };
  }, [text]);

  return (
    <p ref={ref} className={className}>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span data-w className="transition-opacity duration-200">
            {w}
          </span>
          {i < words.length - 1 ? ' ' : null}
        </React.Fragment>
      ))}
    </p>
  );
};

/* ------------------------------------------------------------ Hero exit -- */

/**
 * As the hero scrolls away, its media panel eases back: a slight scale-down
 * and rounded corners, like a card being set down. Returns a ref for the
 * section and a ref for the panel.
 */
export function useHeroExit<S extends HTMLElement, P extends HTMLElement>() {
  const sectionRef = useRef<S>(null);
  const panelRef = useRef<P>(null);
  useEffect(() => {
    const section = sectionRef.current;
    const panel = panelRef.current;
    if (!section || !panel || prefersReduced()) return;
    const t = track(section);
    let last = -1;
    // Scale only: it runs on the compositor. The first version also animated
    // border-radius, which repainted the video every frame -- and overwrote
    // the arch frame's own shape the moment the page scrolled.
    const stop = onFrame((f) => {
      const p = Math.max(0, Math.min(1, f.scrollY / (t.box().height || 1)));
      const q = Math.round(p * 200) / 200;
      if (q === last) return;
      last = q;
      panel.style.scale = q === 0 ? '' : String(1 - q * 0.07);
    });
    return () => {
      stop();
      t.release();
    };
  }, []);
  return { sectionRef, panelRef };
}

/* ------------------------------------------------------ Image fade-in -- */

/**
 * Lazy images that have not arrived yet fade in when they do, instead of
 * snapping into an empty frame. Only images still loading at mount (or added
 * later) are touched, so a cached image is never hidden, and a failed load
 * is shown as-is rather than left invisible.
 */
export const ImageFadeIn: React.FC = () => {
  const { path } = useRouter();
  useEffect(() => {
    if (prefersReduced()) return;
    const arm = (img: HTMLImageElement) => {
      if (img.dataset.fadeArmed || img.complete || img.loading !== 'lazy') return;
      img.dataset.fadeArmed = '1';
      img.style.opacity = '0';
      const done = () => {
        img.style.transition = 'opacity 0.8s ease';
        img.style.opacity = '';
      };
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
    };
    document.querySelectorAll('img').forEach(arm);
    const mo = new MutationObserver((records) => {
      records.forEach((r) =>
        r.addedNodes.forEach((n) => {
          if (n instanceof HTMLImageElement) arm(n);
          else if (n instanceof HTMLElement) n.querySelectorAll('img').forEach(arm);
        }),
      );
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [path]);
  return null;
};
