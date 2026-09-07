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
 * Defined once because it appears in the sidebar and on all three auth screens,
 * and those four had drifted to a generic paw glyph while the real logo sat in
 * public/. `logo.svg` is referenced through BASE_URL so it resolves both in the
 * native bundle (served from /) and on the web (served from /app/).
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
