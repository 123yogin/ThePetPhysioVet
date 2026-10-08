import { useState, type CSSProperties } from 'react';
import { petEmoji } from '../lib/labels';

interface PetAvatarProps {
  name: string;
  species?: string | null;
  /** Signed URL from the API (expires after ~15 min; a refetch renews it). */
  photo?: string | null;
  size?: number;
  radius?: number | string;
  /** Background behind the emoji fallback. */
  background?: string;
}

/**
 * The pet's photo when one was uploaded, else the species emoji. A broken or
 * expired signed URL falls back to the emoji instead of a broken-image icon.
 */
export function PetAvatar({ name, species, photo, size = 32, radius = '50%', background }: PetAvatarProps) {
  const [failed, setFailed] = useState<string | null>(null);
  const showPhoto = !!photo && failed !== photo;
  const box: CSSProperties = {
    width: size,
    height: size,
    borderRadius: radius,
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    verticalAlign: 'middle',
    overflow: 'hidden',
  };
  if (showPhoto) {
    return (
      <img
        src={photo!}
        alt={`Photo of ${name}`}
        width={size}
        height={size}
        loading="lazy"
        onError={() => setFailed(photo!)}
        style={{ ...box, objectFit: 'cover' }}
      />
    );
  }
  return (
    <span aria-hidden="true" style={{ ...box, background, fontSize: Math.round(size * 0.6), lineHeight: 1 }}>
      {petEmoji(species)}
    </span>
  );
}
