import React from 'react';

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
 * The box is sized by the caller's classes (e.g. aspect-[3/4]), so attaching
 * the source cannot shift layout.
 */
export const LazyLoopVideo: React.FC<{
  src: string;
  label: string;
  className?: string;
  reducedMotion: boolean;
}> = ({ src, label, className, reducedMotion }) => {
  const ref = React.useRef<HTMLVideoElement>(null);

  React.useEffect(() => {
    const video = ref.current;
    if (!video) return;
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
  }, [src, reducedMotion]);

  return (
    <video
      ref={ref}
      muted
      loop
      playsInline
      preload="none"
      aria-label={label}
      className={className}
    />
  );
};
