import React from 'react';
import { prefersReducedMotion } from '../motion/engine';

/**
 * A silent looping preview that costs nothing until it is about to be seen.
 *
 * The four gallery reel loops (~3.7 MB together) used to carry `src` +
 * `autoPlay` in the server HTML, so every visitor downloaded all of them on
 * first load, phones included, long before scrolling anywhere near the
 * gallery. Now the element ships with no source and preload="none"; the
 * source is attached when the tile comes within a screen of the viewport, and
 * playback pauses again when it leaves.
 *
 * Under reduced motion it still loads (metadata only, so the first frame is
 * the tile's picture) but never plays.
 *
 * The box is sized by the caller's classes (e.g. aspect-[3/4]) or by
 * width/height, so attaching the source cannot shift layout. Pass `poster` to
 * show a still until the clip loads.
 *
 * `reducedMotion` may be omitted, in which case the user's
 * prefers-reduced-motion setting is read when the observer is set up.
 */
export const LazyLoopVideo: React.FC<{
  src: string;
  label: string;
  className?: string;
  reducedMotion?: boolean;
  poster?: string;
  width?: number;
  height?: number;
  style?: React.CSSProperties;
}> = ({ src, label, className, reducedMotion: reducedMotionProp, poster, width, height, style }) => {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const reducedMotion = reducedMotionProp ?? prefersReducedMotion();
    if (typeof IntersectionObserver === 'undefined') {
      video.src = src;
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          if (video.getAttribute('src') !== src) {
            video.preload = reducedMotion ? 'metadata' : 'auto';
            video.src = src;
          }
          if (!reducedMotion) video.play().catch(() => {});
        } else if (!video.paused) {
          video.pause();
        }
      },
      { rootMargin: '300px' },
    );
    io.observe(video);
    return () => io.disconnect();
  }, [src, reducedMotionProp]);

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload="none"
      aria-label={label}
      className={className}
      poster={poster}
      width={width}
      height={height}
      style={style}
    />
  );
};
