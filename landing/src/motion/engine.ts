/**
 * The motion engine: one requestAnimationFrame loop for every scroll-driven
 * effect on the site.
 *
 * Why this exists. Each effect used to own its own scroll listener and rAF,
 * and each read layout (scrollY, getBoundingClientRect, offsetTop) whenever
 * it ran -- often straight after another effect had written a style. Every
 * such read forces the browser to flush style and layout synchronously. A
 * performance trace of the page load showed 220 ms of forced reflow, most of
 * it from exactly this interleaving.
 *
 * The rules this module enforces:
 *  1. READ, then WRITE. Each frame reads the scroll position and viewport
 *     once, then calls every subscriber, which may only write (styles, CSS
 *     variables). Nothing reads layout in the middle of a frame.
 *  2. Geometry is cached. An element's document position is measured when it
 *     is registered and again only when something actually resizes
 *     (ResizeObserver on the element and the document), never per frame.
 *  3. The loop sleeps. It runs only while the page is scrolling or while a
 *     subscriber has asked to keep animating (e.g. a marquee on screen), and
 *     stops as soon as neither is true.
 */

export interface Frame {
  /** Seconds since the previous frame, clamped. */
  dt: number;
  scrollY: number;
  /** Smoothed scroll velocity, px/s (positive = scrolling down). */
  velocity: number;
  vh: number;
  vw: number;
}

type Subscriber = (f: Frame) => boolean | void;

const subs = new Set<Subscriber>();
let raf = 0;
let lastT = 0;
let lastY = 0;
let velocity = 0;
let vh = 0;
let vw = 0;
let idleFrames = 0;

const isBrowser = typeof window !== 'undefined';

function measureViewport() {
  vh = window.innerHeight;
  vw = window.innerWidth;
}

function tick(t: number) {
  raf = 0;
  const dt = lastT ? Math.min(0.05, (t - lastT) / 1000) : 1 / 60;
  lastT = t;

  // READ (once per frame): newly tracked elements first, then scroll.
  if (dirty.size) {
    dirty.forEach((el) => measure(el));
    dirty.clear();
  }
  const y = window.scrollY;
  const raw = dt > 0 ? (y - lastY) / dt : 0;
  velocity += (raw - velocity) * Math.min(1, dt * 9);
  const moving = y !== lastY || Math.abs(velocity) > 2;
  lastY = y;

  // WRITE. A subscriber returns true to request another frame.
  const frame: Frame = { dt, scrollY: y, velocity, vh, vw };
  let wantsMore = false;
  subs.forEach((fn) => {
    if (fn(frame) === true) wantsMore = true;
  });

  idleFrames = moving || wantsMore ? 0 : idleFrames + 1;
  if (idleFrames < 3 && subs.size) raf = requestAnimationFrame(tick);
  else {
    velocity = 0;
    lastT = 0;
  }
}

/** Wake the loop (on scroll, resize, or a subscriber that needs frames). */
export function wake() {
  if (!isBrowser || raf || !subs.size) return;
  idleFrames = 0;
  raf = requestAnimationFrame(tick);
}

let listening = false;
function listen() {
  if (listening || !isBrowser) return;
  listening = true;
  measureViewport();
  lastY = window.scrollY;
  window.addEventListener('scroll', wake, { passive: true });
  window.addEventListener('resize', () => {
    measureViewport();
    invalidateAll();
    wake();
  });
}

/** Subscribe to frames. The callback must only WRITE. Returns an unsubscribe. */
export function onFrame(fn: Subscriber): () => void {
  if (!isBrowser) return () => {};
  listen();
  subs.add(fn);
  wake();
  return () => {
    subs.delete(fn);
  };
}

/* ---------------------------------------------------------- Geometry cache */

export interface Box {
  /** Distance from the top of the document to the element's top. */
  top: number;
  height: number;
  left: number;
  width: number;
}

const boxes = new Map<Element, Box>();
// Elements registered since the last frame. They are measured together at the
// start of the next frame (one read pass) instead of one by one at
// registration -- registration happens during React's commit, right after
// DOM writes, so measuring there forced a layout per element.
const dirty = new Set<Element>();
let ro: ResizeObserver | null = null;

function measure(el: Element): Box {
  const r = el.getBoundingClientRect();
  const box = { top: r.top + window.scrollY, height: r.height, left: r.left, width: r.width };
  boxes.set(el, box);
  return box;
}

function invalidateAll() {
  // Re-measure everything in one read pass (called outside the frame loop).
  boxes.forEach((_, el) => measure(el));
}

/**
 * Track an element's document position. The returned getter is free to call
 * inside a frame -- it returns the cached box, never touching layout.
 */
export function track(el: Element): { box: () => Box; release: () => void } {
  if (!isBrowser) return { box: () => ({ top: 0, height: 0, left: 0, width: 0 }), release: () => {} };
  listen();
  dirty.add(el);
  wake();
  if (!ro && typeof ResizeObserver !== 'undefined') {
    // Any tracked element or the page itself changing size can move every
    // other element, so a resize anywhere re-measures the lot -- batched into
    // the next frame by the observer itself.
    ro = new ResizeObserver(() => {
      invalidateAll();
      wake();
    });
    ro.observe(document.documentElement);
  }
  ro?.observe(el);
  return {
    box: () => boxes.get(el) ?? measure(el),
    release: () => {
      boxes.delete(el);
      dirty.delete(el);
      ro?.unobserve(el);
    },
  };
}

/**
 * Progress (0..1) of an element through the viewport, from cached geometry:
 * 0 when its top reaches `start` of the viewport height, 1 when it reaches
 * `end`. Pure arithmetic -- safe inside a frame.
 */
export function progress(box: Box, f: Frame, start = 0.85, end = 0.35): number {
  const top = box.top - f.scrollY;
  return Math.max(0, Math.min(1, (f.vh * start - top) / (f.vh * (start - end))));
}

export const prefersReducedMotion = () =>
  isBrowser && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
