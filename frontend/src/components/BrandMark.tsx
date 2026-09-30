import React from 'react';

interface BrandMarkProps {
  /** Approx. height driver in px (height renders at ~2×, keeping the old call sites). */
  size?: number;
  /** Accessible name; the wordmark itself is baked into the lockup art. */
  label?: string;
  /** Retained for call-site compatibility; the lockup is always stacked art. */
  stacked?: boolean;
  labelSize?: number;
}

/**
 * The clinic lockup — the full "THE PET PHYSIO VET" wordmark with the
 * illustration beneath it (public/logo-lockup.png, background removed so it sits
 * on any surface). Used on the auth screens (login / forgot / reset).
 *
 * The wordmark is part of the artwork, so this renders the image alone and needs
 * no separate text label; `label` is the accessible name.
 *
 * Resolved through BASE_URL so it works both in the native bundle (served from /)
 * and on the web (served from /app/).
 */
export const BrandMark: React.FC<BrandMarkProps> = ({ size = 84, label = 'The Pet Physio Vet' }) => (
  <img
    src={`${import.meta.env.BASE_URL}logo-lockup.png`}
    alt={label}
    style={{
      display: 'block',
      height: `${size * 2}px`,
      width: 'auto',
      maxWidth: '100%',
      margin: '0 auto',
      flexShrink: 0,
    }}
  />
);
