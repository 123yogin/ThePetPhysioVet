import React, { useEffect, useState } from 'react';
import { PageCurtain, CursorBubble, Magnetic, ImageDrift, Tilt, ImageFadeIn } from './extras';
import { SmoothScroll, CursorTrail, ScrollTicks } from './index';

/**
 * Site-wide decorative motion, mounted only after hydration has finished and the
 * main thread next goes idle.
 *
 * These nine behaviours are the single biggest contributor to the landing's
 * client-side "Processing" time: each one, on mount, sets up a RAF loop, pointer
 * tracking, or an IntersectionObserver wired across many elements, and running
 * all of that during hydration makes the page unresponsive for the exact window
 * a visitor is first trying to read and tap. None of it renders anything at rest
 * (CursorTrail/ScrollTicks aside), and none affects layout, so deferring it is
 * invisible except that the effects begin a beat after first paint instead of
 * fighting the first paint.
 *
 * Rendering null until `on` also keeps server and client markup identical: the
 * server never runs the effect, so its HTML omits the layer, and the client's
 * first render omits it too — no hydration mismatch. The behaviours appear once
 * requestIdleCallback fires (with a short setTimeout fallback for Safari).
 */
export const SiteMotion: React.FC = () => {
  const [on, setOn] = useState(false);

  useEffect(() => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const id = w.requestIdleCallback
      ? w.requestIdleCallback(() => setOn(true), { timeout: 1500 })
      : window.setTimeout(() => setOn(true), 150);
    return () => {
      if (w.cancelIdleCallback) w.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, []);

  if (!on) return null;

  return (
    <>
      <SmoothScroll />
      <CursorTrail />
      <ScrollTicks />
      <PageCurtain />
      <CursorBubble />
      <Magnetic />
      <ImageDrift />
      <Tilt />
      <ImageFadeIn />
    </>
  );
};
