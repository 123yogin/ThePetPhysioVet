import React, { useEffect, useRef } from 'react';
import { Phone, Calendar } from 'lucide-react';
import { useRouter } from '../seo/router';
import { bookingHref } from './BookingPanel';
import { SITE } from '../seo/siteConfig';
import { onFrame } from '../motion/engine';

/**
 * Sticky Call + Book bar for phones.
 *
 * The pattern the high-traffic health and pet sites share: the primary action
 * is always one thumb-reach away, whatever the scroll position (Zocdoc
 * reports over 70% of its bookings come from mobile; Chewy keeps its phone
 * line permanently visible). Calling is the preferred channel for many
 * owners here, so it sits beside Book as an equal.
 *
 * It slides away while the visitor scrolls down through content and returns
 * when they scroll up or stop, and it stays out of the hero, where the hero's
 * own buttons already do this job. Hidden while the booking panel is open.
 * Phones only (below md).
 */
export const MobileActionBar: React.FC = () => {
  const { path, search, navigate } = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const bookingOpen = new URLSearchParams(search).has('book');

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let shown: boolean | null = null;
    let lastY = window.scrollY;
    let calmFrames = 0;
    return onFrame((f) => {
      const dy = f.scrollY - lastY;
      lastY = f.scrollY;
      calmFrames = Math.abs(dy) < 1 ? calmFrames + 1 : 0;
      const pastHero = f.scrollY > f.vh * 0.6;
      // Show when past the hero and either scrolling up or at rest.
      const want = pastHero && (dy < -2 || calmFrames > 8 || f.velocity < -50);
      const hide = !pastHero || dy > 4;
      const next = want ? true : hide ? false : shown ?? false;
      if (next !== shown) {
        shown = next;
        el.dataset.shown = String(next);
      }
      // The engine sleeps a few frames after scrolling stops; stay awake just
      // long enough to notice the visitor has paused and bring the bar back.
      return pastHero && !shown && calmFrames <= 10;
    });
  }, []);

  if (bookingOpen) return null;

  const openBooking = (e: React.MouseEvent) => {
    if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
    e.preventDefault();
    navigate(bookingHref(path));
  };

  return (
    <div
      ref={ref}
      data-shown="false"
      className="mobile-action-bar md:hidden fixed inset-x-3 z-40 flex gap-2 p-2 rounded-full bg-(--c-bg)/90 backdrop-blur-xl border border-(--c-line)/60 shadow-[0_12px_40px_-12px_rgba(60,33,23,0.45)]"
      style={{ bottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
    >
      <a
        href={`tel:${SITE.contact.phone}`}
        className="flex-1 inline-flex items-center justify-center gap-2 h-12 rounded-full border border-(--c-ink)/30 text-(--c-ink) text-xs uppercase tracking-widest font-medium"
      >
        <Phone className="w-4 h-4" aria-hidden="true" />
        Call
      </a>
      <a
        href={bookingHref(path)}
        onClick={openBooking}
        className="flex-[1.6] inline-flex items-center justify-center gap-2 h-12 rounded-full bg-(--c-ink) text-(--c-bg) text-xs uppercase tracking-widest font-medium"
      >
        <Calendar className="w-4 h-4" aria-hidden="true" />
        Book assessment
      </a>
    </div>
  );
};
