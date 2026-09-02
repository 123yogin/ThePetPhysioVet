import React from 'react';

/**
 * Interface icon set, rendered as inline SVG.
 *
 * Replaces OS emoji used as chrome/interface icons (nav links, buttons,
 * status markers) — emoji render inconsistently across operating systems,
 * don't inherit `currentColor`, and are announced unpredictably by screen
 * readers. Pet-species emoji (dog/cat) used as *content* next to a specific
 * pet's name are intentionally left alone — see screen-level comments.
 *
 * No icon library / CDN is used (offline builds + CSP forbid it) — every
 * path below is hand-drawn, single stroke, 24x24, stroke-width 2.
 */
export type IconName =
  | 'dashboard'
  | 'list'
  | 'calendar'
  | 'paw'
  | 'invoice'
  | 'chart'
  | 'chat'
  | 'bell'
  | 'settings'
  | 'logout'
  | 'edit'
  | 'paperclip'
  | 'plus'
  | 'stethoscope'
  | 'activity'
  | 'refresh'
  | 'check'
  | 'close'
  | 'arrowRight'
  | 'clock'
  | 'mail'
  | 'doctor'
  | 'celebrate'
  | 'phone'
  | 'info'
  | 'warning';

interface IconProps {
  name: IconName;
  size?: number;
  /** When the icon is the ONLY content of an interactive element (no
   * visible adjacent text), pass an accessible name here — it's rendered
   * as visually-hidden text so screen readers announce it. */
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}

const PATHS: Record<IconName, React.ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13" />
      <path d="M8 12h13" />
      <path d="M8 18h13" />
      <path d="M3 6h.01" />
      <path d="M3 12h.01" />
      <path d="M3 18h.01" />
    </>
  ),
  paw: (
    <>
      <ellipse cx="12" cy="16" rx="5" ry="4" />
      <ellipse cx="5.5" cy="9" rx="2" ry="2.5" />
      <ellipse cx="9.5" cy="5.5" rx="2" ry="2.5" />
      <ellipse cx="14.5" cy="5.5" rx="2" ry="2.5" />
      <ellipse cx="18.5" cy="9" rx="2" ry="2.5" />
    </>
  ),
  invoice: (
    <>
      <path d="M6 2h9l4 4v16H6z" />
      <path d="M15 2v4h4" />
      <path d="M9 12h6" />
      <path d="M9 16h6" />
      <path d="M9 8h2" />
    </>
  ),
  chart: (
    <>
      <path d="M3 20h18" />
      <path d="M6 20V10" />
      <path d="M12 20V4" />
      <path d="M18 20v-7" />
    </>
  ),
  chat: <path d="M4 4h16v12H8l-4 4z" />,
  bell: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" />
      <path d="M10 20a2 2 0 0 0 4 0" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 2.5v3M12 18.5v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2.5 12h3M18.5 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
    </>
  ),
  logout: (
    <>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </>
  ),
  edit: (
    <>
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" />
    </>
  ),
  paperclip: <path d="M21 11.5 12.5 20a4.5 4.5 0 0 1-6.4-6.4l8-8a3 3 0 0 1 4.3 4.3l-7.9 7.9a1.5 1.5 0 0 1-2.1-2.1l7.4-7.4" />,
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  stethoscope: (
    <>
      <path d="M5 3v6a4 4 0 0 0 8 0V3" />
      <path d="M9 13v2a5 5 0 0 0 10 0v-2.5" />
      <circle cx="19" cy="9.5" r="1.8" />
    </>
  ),
  activity: <path d="M3 12h4l2-7 4 14 2-7h6" />,
  refresh: (
    <>
      <path d="M21 12a9 9 0 1 1-3-6.7" />
      <path d="M21 3v6h-6" />
    </>
  ),
  check: <path d="M20 6 9 17l-5-5" />,
  close: (
    <>
      <path d="M18 6 6 18" />
      <path d="M6 6l12 12" />
    </>
  ),
  arrowRight: (
    <>
      <path d="M5 12h14" />
      <path d="M13 6l6 6-6 6" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </>
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </>
  ),
  doctor: (
    <>
      <circle cx="12" cy="7" r="3.2" />
      <path d="M5 21v-2a7 7 0 0 1 14 0v2" />
      <path d="M12 12v3" />
    </>
  ),
  celebrate: (
    <>
      <path d="M4 20l3-9 9-8 3 4-8 9z" />
      <path d="M14 5l1.5 1.5" />
      <path d="M17.5 3.5l1 1" />
      <path d="M19 7l1.5 1.5" />
    </>
  ),
  phone: <path d="M4 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L14 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 2 6a2 2 0 0 1 2-2z" />,
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5" />
      <path d="M12 8h.01" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2 20h20z" />
      <path d="M12 10v4" />
      <path d="M12 17h.01" />
    </>
  ),
};

export const Icon: React.FC<IconProps> = ({ name, size = 16, label, className, style }) => (
  <>
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ? `icon ${className}` : 'icon'}
      style={style}
    >
      {PATHS[name]}
    </svg>
    {label && <span className="visually-hidden">{label}</span>}
  </>
);
