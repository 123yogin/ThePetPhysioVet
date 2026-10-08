/**
 * Motion toolkit for the landing page.
 *
 * Inspired by scroll-story portfolio sites: things rise into place as they
 * arrive, headlines assemble word by word, numbers count up, big type drifts
 * with the scroll, and the page glides instead of stepping.
 *
 * Rules every helper here follows:
 *  - Hydration-safe. The server renders everything fully visible. Only after
 *    mount does an element that is still BELOW the fold get its "pending"
 *    state, so nothing that is already on screen ever blinks out, and a
 *    visitor without JavaScript sees the whole page.
 *  - Reduced motion wins. Under prefers-reduced-motion nothing is hidden,
 *    nothing counts, nothing drifts.
 *  - No layout changes. Helpers attach to existing elements through refs, so
 *    grids and flex rows keep their own children.
 */
import React, { useEffect, useLayoutEffect, useRef } from 'react';
import { onFrame, progress, track, wake } from './engine';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ------------------------------------------------------------ Reveal core -- */

let sharedObserver: IntersectionObserver | null = null;
// Several effects may watch one element (a card rises while its image wipes),
// so each element carries a set of callbacks rather than a single one.
const observed = new WeakMap<Element, Set<() => void>>();

function observe(el: Element, onEnter: () => void) {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const callbacks = observed.get(entry.target);
          observed.delete(entry.target);
          sharedObserver?.unobserve(entry.target);
          callbacks?.forEach((cb) => cb());
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.05 },
    );
  }
  let set = observed.get(el);
  if (!set) {
    set = new Set();
    observed.set(el, set);
  }
  set.add(onEnter);
  sharedObserver.observe(el);
  return () => {
    const current = observed.get(el);
    if (!current) return;
    current.delete(onEnter);
    if (current.size === 0) {
      observed.delete(el);
      sharedObserver?.unobserve(el);
    }
  };
}

/* Arming is batched. Every reveal on the page arms during the same commit;
   done one by one, each "is it below the fold?" read followed by a class
   write would force a fresh layout per element (the load trace showed this
   as forced reflow). Instead all jobs from a commit are collected, then
   flushed in one microtask: every read first, then every write. */
interface ArmJob {
  el: HTMLElement;
  pending: string;
  done: string;
  extra: string[];
  cancelled: boolean;
  armed: boolean;
  settled: boolean;
  stop?: () => void;
}
let armQueue: ArmJob[] = [];
let armScheduled = false;

function flushArms() {
  armScheduled = false;
  const jobs = armQueue.filter((j) => !j.cancelled);
  armQueue = [];
  const limit = window.innerHeight * 0.92;
  // READ pass.
  const below = jobs.map((j) => j.el.getBoundingClientRect().top >= limit);
  // WRITE pass.
  jobs.forEach((j, i) => {
    if (!below[i]) return;
    j.armed = true;
    j.el.classList.add(j.pending, ...j.extra);
    // A wiped frame is clipped to nothing while pending, and Chrome counts a
    // target's own clip-path when deciding visibility -- so it would never be
    // reported as entering. Watch its parent instead, which is not clipped.
    const watch = j.extra.includes('rv-wipe') && j.el.parentElement ? j.el.parentElement : j.el;
    j.stop = observe(watch, () => {
      // Two frames so the pending state is committed before the transition.
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          if (j.cancelled) return;
          j.settled = true;
          j.el.classList.remove(j.pending);
          j.el.classList.add(j.done);
        }),
      );
    });
  });
}

/** Hide `el` (with `pending`) only if it is below the fold, then reveal on entry. */
function arm(el: HTMLElement, pending: string, done: string, extra: string[] = []) {
  if (prefersReduced() || el.classList.contains(done)) return () => {};
  const job: ArmJob = { el, pending, done, extra, cancelled: false, armed: false, settled: false };
  armQueue.push(job);
  if (!armScheduled) {
    armScheduled = true;
    queueMicrotask(flushArms);
  }
  return () => {
    job.cancelled = true;
    job.stop?.();
    // Never leave an element hidden behind: StrictMode runs effects twice,
    // and a re-run that finds the element on screen would not re-arm it.
    if (job.armed && !job.settled) el.classList.remove(pending, ...extra);
  };
}

/** Ref for a single element that fades and rises in. `variant="wipe"` for images. */
export function useReveal<T extends HTMLElement = HTMLElement>(
  opts: { delay?: number; variant?: 'rise' | 'wipe' } = {},
) {
  const ref = useRef<T>(null);
  const { delay = 0, variant = 'rise' } = opts;
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (delay) el.style.setProperty('--rv-delay', `${delay}ms`);
    return arm(el, 'rv-pending', 'rv-in', variant === 'wipe' ? ['rv-wipe'] : []);
  }, [delay, variant]);
  return ref;
}

/**
 * Ref for a container whose DIRECT children reveal one after another.
 * Re-arms when `deps` change (e.g. a filter swaps the children).
 */
export function useStagger<T extends HTMLElement = HTMLElement>(
  opts: { step?: number; variant?: 'rise' | 'wipe'; selector?: string; trigger?: 'child' | 'container' } = {},
  deps: React.DependencyList = [],
) {
  const ref = useRef<T>(null);
  const { step = 90, variant = 'rise', selector, trigger = 'child' } = opts;
  useIsoLayoutEffect(() => {
    const root = ref.current;
    if (!root) return;
    const kids: HTMLElement[] = selector
      ? Array.from(root.querySelectorAll<HTMLElement>(selector))
      : (Array.from(root.children) as HTMLElement[]);
    kids.forEach((el, i) => el.style.setProperty('--rv-delay', `${(i % 6) * step}ms`));

    // `container`: all children reveal together (staggered) the moment the
    // GROUP enters view, instead of each waiting to scroll in on its own. For a
    // tall grid the per-child default leaves the lower rows blank while the top
    // is on screen — this keeps the whole block from ever looking half-empty.
    if (trigger === 'container') {
      if (prefersReduced()) return;
      const extra = variant === 'wipe' ? ['rv-wipe'] : [];
      // Hydration-safe: only hide the group if it is still fully below the fold.
      if (root.getBoundingClientRect().top < window.innerHeight * 0.92) return;
      kids.forEach((el) => el.classList.add('rv-pending', ...extra));
      let cancelled = false;
      const stop = observe(root, () => {
        requestAnimationFrame(() =>
          requestAnimationFrame(() => {
            if (cancelled) return;
            kids.forEach((el) => {
              el.classList.remove('rv-pending');
              el.classList.add('rv-in');
            });
          }),
        );
      });
      return () => {
        cancelled = true;
        stop();
        kids.forEach((el) => el.classList.remove('rv-pending', ...extra));
      };
    }

    const cleanups = kids.map((el) =>
      arm(el, 'rv-pending', 'rv-in', variant === 'wipe' ? ['rv-wipe'] : []),
    );
    return () => cleanups.forEach((c) => c());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

/* --------------------------------------------------------- Split headline -- */

/**
 * A headline whose words rise out of clipping boxes in sequence. Renders the
 * given tag with the words as inline spans, so the text a screen reader or a
 * crawler reads is unchanged.
 */
export const SplitWords: React.FC<{
  as?: React.ElementType;
  className?: string;
  children: string;
  delay?: number;
}> = ({ as: Tag = 'h2', className, children, delay = 0 }) => {
  const ref = useRef<HTMLElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (delay) el.style.setProperty('--rv-delay', `${delay}ms`);
    return arm(el, 'sw-pending', 'sw-in');
  }, [delay]);
  const words = children.split(' ');
  return (
    <Tag ref={ref} className={className}>
      {words.map((w, i) => (
        <React.Fragment key={i}>
          <span className="sw-word">
            <span className="sw-inner" style={{ ['--sw-i' as string]: i }}>
              {w}
            </span>
          </span>
          {i < words.length - 1 ? ' ' : null}
        </React.Fragment>
      ))}
    </Tag>
  );
};

/* ---------------------------------------------------------------- CountUp -- */

/**
 * Counts from zero to the number inside `value` ("500+", "10k", "98%") when
 * it scrolls into view. The server and first client render print the final
 * value, so the figure is never wrong if the animation never runs.
 */
export const CountUp: React.FC<{ value: string; className?: string; duration?: number }> = ({
  value,
  className,
  duration = 1800,
}) => {
  const ref = useRef<HTMLSpanElement>(null);
  const match = value.match(/^(\D*)([\d.,]+)(.*)$/);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !match || prefersReduced()) return;
    const [, pre, num, post] = match;
    const target = parseFloat(num.replace(/,/g, ''));
    const decimals = (num.split('.')[1] || '').length;
    const fmt = (n: number) => `${pre}${n.toFixed(decimals)}${post}`;
    let raf = 0;
    // Only drop to zero when the count actually starts, so the final value is
    // what is read until then (and by assistive tech / no-scroll viewers).
    const stop = observe(el, () => {
      el.textContent = fmt(0);
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / duration);
        const eased = 1 - Math.pow(1 - p, 4);
        el.textContent = fmt(target * eased);
        if (p < 1) raf = requestAnimationFrame(step);
        else el.textContent = value;
      };
      raf = requestAnimationFrame(step);
    });
    return () => {
      stop();
      cancelAnimationFrame(raf);
      el.textContent = value;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <span ref={ref} className={className} aria-label={value}>
      {value}
    </span>
  );
};

/* ----------------------------------------------------------- Smooth scroll -- */

/** Lenis inertia scrolling for the whole document. Mount once.
 *
 * Lenis is loaded with a dynamic import() rather than a static top-level one so
 * it ships as its own chunk, fetched only when this component mounts (after
 * hydration + idle, see SiteMotion) instead of weighing down the main bundle
 * that every page parses on first paint. Until it arrives the browser's native
 * scroll is used, so nothing is broken in the gap. */
export const SmoothScroll: React.FC = () => {
  useEffect(() => {
    if (prefersReduced()) return;
    const html = document.documentElement;
    const prev = html.style.scrollBehavior;
    // index.html sets `scroll-smooth`; the browser's own smoothing and Lenis
    // would otherwise both try to animate the same jump.
    html.style.scrollBehavior = 'auto';
    let lenis: { destroy: () => void } | null = null;
    let cancelled = false;
    import('lenis').then(({ default: Lenis }) => {
      if (cancelled) return;
      lenis = new Lenis({ autoRaf: true, lerp: 0.1, anchors: true });
    });
    return () => {
      cancelled = true;
      lenis?.destroy();
      html.style.scrollBehavior = prev;
    };
  }, []);
  return null;
};

/* ------------------------------------------------------------ Intro exit -- */

/**
 * Clears the intro overlay (static markup in index.html). Its CSS animation
 * already fades it out within ~0.55s with no JS at all, and the hero never
 * waits for it; this only takes it out of the render tree afterwards and drops
 * the html.intro class so later navigations are unaffected.
 */
export const IntroController: React.FC = () => {
  useEffect(() => {
    const html = document.documentElement;
    const intro = document.getElementById('intro');
    if (!intro || !html.classList.contains('intro')) return;
    const timer = window.setTimeout(() => {
      intro.style.display = 'none';
      html.classList.remove('intro');
    }, 700);
    return () => window.clearTimeout(timer);
  }, []);
  return null;
};

/* ---------------------------------------------------------- Cursor trail -- */

/**
 * A soft trail of warm smoke behind the pointer, in the page's own rust
 * brown. The native cursor stays. Fine pointers only; off under reduced motion.
 *
 * Performance: the soft puff is rendered ONCE into a small offscreen sprite
 * and stamped with drawImage + globalAlpha. The first version built a new
 * radial gradient for every particle on every frame -- up to 260 gradient
 * objects per frame while the mouse moved.
 */
export const CursorTrail: React.FC = () => {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || prefersReduced() || !window.matchMedia('(pointer: fine)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    // One pre-rendered puff, 64px, reused for every particle.
    const S = 64;
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = S;
    const sctx = sprite.getContext('2d')!;
    const accent = getComputedStyle(document.documentElement).getPropertyValue('--c-accent').trim() || '#84523e';
    const g = sctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    g.addColorStop(0, accent);
    g.addColorStop(1, 'transparent');
    sctx.fillStyle = g;
    sctx.fillRect(0, 0, S, S);

    type P = { x: number; y: number; r: number; life: number; vx: number; vy: number };
    const pts: P[] = [];
    let last: { x: number; y: number } | null = null;
    let raf = 0;

    const tick = () => {
      raf = 0;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      for (let i = pts.length - 1; i >= 0; i--) {
        const p = pts[i];
        p.life -= 0.03;
        if (p.life <= 0) {
          pts.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.r *= 1.015;
        ctx.globalAlpha = 0.12 * p.life;
        ctx.drawImage(sprite, p.x - p.r, p.y - p.r, p.r * 2, p.r * 2);
      }
      ctx.globalAlpha = 1;
      if (pts.length) raf = requestAnimationFrame(tick);
    };

    const onMove = (e: PointerEvent) => {
      const { clientX: x, clientY: y } = e;
      if (last) {
        const dx = x - last.x;
        const dy = y - last.y;
        const steps = Math.min(4, Math.ceil(Math.hypot(dx, dy) / 16));
        for (let i = 0; i < steps; i++) {
          pts.push({
            x: last.x + (dx * i) / steps,
            y: last.y + (dy * i) / steps,
            r: 10 + Math.random() * 12,
            life: 1,
            vx: dx * 0.015 + (Math.random() - 0.5) * 0.5,
            vy: dy * 0.015 + (Math.random() - 0.5) * 0.5 - 0.15,
          });
        }
        if (pts.length > 120) pts.splice(0, pts.length - 120);
      }
      last = { x, y };
      if (!raf) raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('resize', resize);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      className="fixed inset-0 w-screen h-screen pointer-events-none z-[45]"
      style={{ mixBlendMode: 'multiply' }}
    />
  );
};

/* ------------------------------------------------------- Scroll progress -- */

/**
 * A column of ticks in the right-hand margin, filling top to bottom with the
 * page's scroll position. Vertical and in the margin on purpose: the
 * reference site's bottom-left tick row sat on top of content.
 *
 * Driven by the motion engine with direct style writes -- it used to set
 * React state on scroll, re-rendering all 32 ticks every frame.
 */
export const ScrollTicks: React.FC<{ count?: number }> = ({ count = 32 }) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ticks = Array.from(el.children) as HTMLElement[];
    let lit = -1;
    let docH = document.documentElement.scrollHeight;
    const ro = new ResizeObserver(() => (docH = document.documentElement.scrollHeight));
    ro.observe(document.body);
    const stop = onFrame((f) => {
      const max = docH - f.vh;
      const n = max > 0 ? Math.round((f.scrollY / max) * count) : 0;
      if (n === lit) return;
      ticks.forEach((t, i) => t.classList.toggle('is-lit', i < n));
      lit = n;
    });
    return () => {
      stop();
      ro.disconnect();
    };
  }, [count]);
  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="scroll-ticks hidden xl:flex flex-col fixed right-5 top-1/2 -translate-y-1/2 z-40 gap-[4px] pointer-events-none"
    >
      {Array.from({ length: count }, (_, i) => (
        <span key={i} className="block w-3 h-[2px]" />
      ))}
    </div>
  );
};

/* ------------------------------------------------------- Scroll marquee -- */

/**
 * Oversized type that drifts sideways forever, speeds up with scroll velocity
 * and turns with the scroll direction. Decorative: aria-hidden. Runs on the
 * motion engine, and only requests frames while it is on screen.
 */
export const ScrollMarquee: React.FC<{
  text: string;
  /** Percent of the track per second; negative starts reversed. */
  baseSpeed?: number;
  className?: string;
  outline?: boolean;
}> = ({ text, baseSpeed = 3, className = '', outline = false }) => {
  const track = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = track.current;
    if (!el || prefersReduced()) return;
    let x = 0;
    let dir = 1;
    let visible = false;
    let stop: (() => void) | null = null;
    const start = () => {
      if (stop) return;
      stop = onFrame((f) => {
        const boost = Math.min(5, Math.abs(f.velocity) / 300);
        if (f.velocity > 40) dir = 1;
        else if (f.velocity < -40) dir = -1;
        x -= dir * baseSpeed * f.dt * (1 + boost);
        // Four copies; wrapping at -25% (one copy) keeps the loop seamless.
        x = ((x % 25) - 25) % 25;
        el.style.transform = `translate3d(${x.toFixed(3)}%,0,0)`;
        return visible; // keep animating only while on screen
      });
    };
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible) {
        start();
        wake();
      } else if (stop) {
        stop();
        stop = null;
      }
    });
    io.observe(el);
    return () => {
      stop?.();
      io.disconnect();
    };
  }, [baseSpeed]);

  const chunk = (
    <span className={`shrink-0 whitespace-nowrap pr-[0.3em] ${outline ? 'mq-outline' : ''}`}>{text}</span>
  );

  return (
    // Vertical padding in em so descenders (g, p, y) clear the clip at any size.
    <div aria-hidden="true" className={`overflow-hidden select-none py-[0.12em] ${className}`}>
      <div ref={track} className="flex w-max will-change-transform">
        {chunk}
        {chunk}
        {chunk}
        {chunk}
      </div>
    </div>
  );
};

/* ---------------------------------------------------------- Velocity skew -- */

/** Skews its content with scroll speed, settling flat when the page stops. */
export const VelocitySkew: React.FC<{ className?: string; max?: number; children: React.ReactNode }> = ({
  className,
  max = 6,
  children,
}) => {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;
    let current = 0;
    return onFrame((f) => {
      const target = Math.max(-max, Math.min(max, (-f.velocity / 2500) * max));
      current += (target - current) * Math.min(1, f.dt * 10);
      if (Math.abs(current) < 0.01 && target === 0) current = 0;
      el.style.transform = current ? `skewY(${current.toFixed(3)}deg)` : '';
      return current !== 0; // settle before the loop sleeps
    });
  }, [max]);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
};

/* ------------------------------------------------------ Section progress -- */

/**
 * Calls `apply(p)` with 0..1 as `target` travels from its top reaching
 * `startAt` of the viewport height to its top reaching `endAt`. Uses the
 * engine's cached geometry, so it never reads layout during scroll. `apply`
 * should write to the DOM directly rather than set React state.
 * Under reduced motion it is called once with 1.
 */
export function useSectionProgress<T extends HTMLElement>(
  apply: (p: number) => void,
  startAt = 0.85,
  endAt = 0.35,
) {
  const ref = useRef<T>(null);
  const applyRef = useRef(apply);
  applyRef.current = apply;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prefersReduced()) {
      applyRef.current(1);
      return;
    }
    const t = track(el);
    let last = -1;
    const stop = onFrame((f) => {
      const p = progress(t.box(), f, startAt, endAt);
      if (Math.abs(p - last) < 0.001) return;
      last = p;
      applyRef.current(p);
    });
    return () => {
      stop();
      t.release();
    };
  }, [startAt, endAt]);
  return ref;
}

/* --------------------------------------------------------------- Roll text -- */

/** Label that rolls up to a copy of itself on hover. Width and rest state unchanged. */
export const Roll: React.FC<{ children: string }> = ({ children }) => (
  <span className="roll">
    <span>{children}</span>
    <span aria-hidden="true">{children}</span>
  </span>
);

/* ------------------------------------------------------------ Scroll-spin -- */

/** Rotates an element with the page scroll (for the nav logo). */
export function useScrollSpin<T extends HTMLElement>(degreesPerScreen = 90) {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReduced()) return;
    return onFrame((f) => {
      el.style.rotate = `${((f.scrollY / f.vh) * degreesPerScreen).toFixed(2)}deg`;
    });
  }, [degreesPerScreen]);
  return ref;
}
