import React from 'react';

interface BrandMarkProps {
  /** Diameter of the mark in px. */
  size?: number;
  /** Rendered beside the mark; omit for the mark alone. */
  label?: string;
  /** Stack the label under the mark instead of beside it. */
  stacked?: boolean;
  labelSize?: number;
}

/**
 * The clinic lockup: the mark plus, usually, the name.
 *
 * `logo.svg` is referenced through BASE_URL so it resolves both in the native
 * bundle (served from /) and on the web (served from /app/).
 *
 * SIZE FLOOR: do not use this below ~64px. The mark is a detailed
 * illustration -- a vet with a bird on her head, a dog and a cat -- and its
 * smallest features are a few units across on a 900-unit artboard. It was
 * tried in the sidebar header at 28px and the animals collapsed into noise, so
 * that spot keeps the paw glyph, which is drawn to read at 20px. Every use here
 * is 84px. If a small placement ever needs the mark rather than the paw, it
 * needs a purpose-drawn reduced version, not this one scaled down.
 */
export const BrandMark: React.FC<BrandMarkProps> = ({
  size = 20,
  label,
  stacked = false,
  labelSize,
}) => {
  const img = (
    <img
      src={`${import.meta.env.BASE_URL}logo.svg`}
      alt=""
      width={size}
      height={size}
      style={{ display: 'block', borderRadius: '50%', flexShrink: 0 }}
    />
  );

  if (!label) return img;

  return (
    <span
      style={{
        display: 'flex',
        flexDirection: stacked ? 'column' : 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: stacked ? '10px' : '8px',
        ...(labelSize ? { fontSize: `${labelSize}px` } : {}),
      }}
    >
      {img}
      <span>{label}</span>
    </span>
  );
};
