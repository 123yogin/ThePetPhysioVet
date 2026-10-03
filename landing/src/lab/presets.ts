/**
 * Design lab presets.
 *
 * Each dimension is auditioned independently on the real page with real
 * content, then the winners are combined. Sources are the award sites and
 * type references the research pass looked at; `current` is always the
 * shipped design so every comparison has its baseline.
 */

export interface FontPreset {
  id: string;
  label: string;
  /** Google Fonts css2 `family=` fragments, loaded only when auditioned. */
  google: string[];
  display: string;
  body: string;
  /** Headline weight and tracking that suit this face. */
  displayWeight: number;
  displayTracking: string;
  /** Italic accent face for mixed headlines, if the pairing has one. */
  italic?: string;
}

export const FONTS: FontPreset[] = [
  { id: 'current', label: 'Plus Jakarta Sans / Inter (previous)', google: ['Plus+Jakarta+Sans:wght@300..700', 'Inter:wght@300..600'], display: "'Plus Jakarta Sans', sans-serif", body: "'Inter', sans-serif", displayWeight: 300, displayTracking: '-0.03em' },
  { id: 'fraunces', label: 'Fraunces / Inter', google: ['Fraunces:ital,opsz,wght@0,9..144,300..700;1,9..144,300..700'], display: "'Fraunces', serif", body: "'Inter', sans-serif", displayWeight: 350, displayTracking: '-0.02em', italic: "'Fraunces', serif" },
  { id: 'instrument', label: 'Instrument Serif / Inter', google: ['Instrument+Serif:ital@0;1'], display: "'Instrument Serif', serif", body: "'Inter', sans-serif", displayWeight: 400, displayTracking: '-0.015em', italic: "'Instrument Serif', serif" },
  { id: 'dmserif', label: 'DM Serif Display / DM Sans', google: ['DM+Serif+Display:ital@0;1', 'DM+Sans:opsz,wght@9..40,300..700'], display: "'DM Serif Display', serif", body: "'DM Sans', sans-serif", displayWeight: 400, displayTracking: '-0.01em', italic: "'DM Serif Display', serif" },
  { id: 'newsreader', label: 'Newsreader / Inter', google: ['Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..700'], display: "'Newsreader', serif", body: "'Inter', sans-serif", displayWeight: 350, displayTracking: '-0.02em', italic: "'Newsreader', serif" },
  { id: 'youngserif', label: 'Young Serif / Figtree', google: ['Young+Serif', 'Figtree:wght@300..700'], display: "'Young Serif', serif", body: "'Figtree', sans-serif", displayWeight: 400, displayTracking: '-0.02em' },
  { id: 'gloock', label: 'Gloock / Manrope', google: ['Gloock', 'Manrope:wght@300..700'], display: "'Gloock', serif", body: "'Manrope', sans-serif", displayWeight: 400, displayTracking: '-0.01em' },
  { id: 'cormorant', label: 'Cormorant Garamond / Manrope', google: ['Cormorant+Garamond:ital,wght@0,300..700;1,300..700', 'Manrope:wght@300..700'], display: "'Cormorant Garamond', serif", body: "'Manrope', sans-serif", displayWeight: 500, displayTracking: '-0.015em', italic: "'Cormorant Garamond', serif" },
  { id: 'bricolage', label: 'Bricolage Grotesque / Inter', google: ['Bricolage+Grotesque:opsz,wght@12..96,300..800'], display: "'Bricolage Grotesque', sans-serif", body: "'Inter', sans-serif", displayWeight: 500, displayTracking: '-0.035em' },
  { id: 'outfit', label: 'Outfit / Inter', google: ['Outfit:wght@200..700'], display: "'Outfit', sans-serif", body: "'Inter', sans-serif", displayWeight: 300, displayTracking: '-0.03em' },
  { id: 'nunito', label: 'Nunito / Nunito Sans', google: ['Nunito:wght@300..800', 'Nunito+Sans:opsz,wght@6..12,300..700'], display: "'Nunito', sans-serif", body: "'Nunito Sans', sans-serif", displayWeight: 600, displayTracking: '-0.025em' },
  { id: 'frauncesfig', label: 'Fraunces (soft) / Figtree', google: [], display: "'Fraunces', serif", body: "'Figtree', sans-serif", displayWeight: 350, displayTracking: '-0.02em', italic: "'Fraunces', serif" },
  { id: 'jakartainstr', label: 'Jakarta + Instrument Serif italic accent', google: ['Instrument+Serif:ital@0;1'], display: "'Plus Jakarta Sans', sans-serif", body: "'Inter', sans-serif", displayWeight: 300, displayTracking: '-0.03em', italic: "'Instrument Serif', serif" },
  { id: 'newsfig', label: 'Newsreader / Figtree', google: ['Newsreader:ital,opsz,wght@0,6..72,300..700;1,6..72,300..700', 'Figtree:wght@300..700'], display: "'Newsreader', serif", body: "'Figtree', sans-serif", displayWeight: 350, displayTracking: '-0.02em', italic: "'Newsreader', serif" },
  { id: 'lora', label: 'Lora / Karla', google: ['Lora:ital,wght@0,400..700;1,400..700', 'Karla:wght@300..700'], display: "'Lora', serif", body: "'Karla', sans-serif", displayWeight: 500, displayTracking: '-0.02em', italic: "'Lora', serif" },
];

export interface PalettePreset {
  id: string;
  label: string;
  vars: Record<string, string>;
}

const CURRENT: Record<string, string> = {
  '--c-ink': '#3c2117', '--c-accent': '#84523e', '--c-accent-soft': '#ffbda5', '--c-body': '#504440',
  '--c-line': '#d4c3bd', '--c-card': '#ffffff', '--c-surface': '#f8f3ed', '--c-surface-2': '#f2ede7',
  '--c-surface-3': '#e6e2dc', '--c-bg': '#fef9f2', '--c-hover': '#ece7e2', '--c-mute': '#82746f', '--c-mute-2': '#a8988f',
  '--c-hero': '#f8f3ed',
};

export const PALETTES: PalettePreset[] = [
  { id: 'current', label: 'Cocoa & cream (previous)', vars: CURRENT },
  { id: 'peachhero', label: 'Cocoa & cream + peach hero', vars: { ...CURRENT, '--c-hero': '#fbe9d6' } },
  { id: 'sage', label: 'Sage clinic', vars: { ...CURRENT, '--c-ink': '#1f2d24', '--c-accent': '#4f6f52', '--c-accent-soft': '#cfe0c3', '--c-body': '#46524a', '--c-line': '#cfd8cc', '--c-surface': '#f1f4ee', '--c-surface-2': '#e8ede3', '--c-surface-3': '#dde4d7', '--c-bg': '#f8faf5', '--c-hover': '#e6ebe1', '--c-mute': '#6f7a70', '--c-mute-2': '#95a095' } },
  { id: 'terracotta', label: 'Terracotta warmth', vars: { ...CURRENT, '--c-ink': '#2b1a14', '--c-accent': '#c0572f', '--c-accent-soft': '#f6c7ae', '--c-body': '#5a4038', '--c-line': '#e8cfc2', '--c-surface': '#fbf0e9', '--c-surface-2': '#f6e6dc', '--c-surface-3': '#efd9cc', '--c-bg': '#fff8f3', '--c-hover': '#f3e2d7' } },
  { id: 'ink', label: 'Ink & paper', vars: { ...CURRENT, '--c-ink': '#161514', '--c-accent': '#8a5a3c', '--c-body': '#44403c', '--c-line': '#dcd8d2', '--c-surface': '#f4f2ee', '--c-surface-2': '#ece9e4', '--c-surface-3': '#e2ded7', '--c-bg': '#faf9f6', '--c-hover': '#ebe8e2' } },
  { id: 'forest', label: 'Forest & oat', vars: { ...CURRENT, '--c-ink': '#12301f', '--c-accent': '#b8742a', '--c-accent-soft': '#f1d3a8', '--c-body': '#3d4f43', '--c-line': '#d8d6c4', '--c-surface': '#f3f1e6', '--c-surface-2': '#ebe8da', '--c-surface-3': '#e0dccb', '--c-bg': '#faf8ef', '--c-hover': '#e9e6d6' } },
  { id: 'oat', label: 'Oat & umber (Nervana)', vars: { ...CURRENT, '--c-ink': '#393126', '--c-accent': '#8a5a3c', '--c-accent-soft': '#e7cfb4', '--c-body': '#554a3d', '--c-line': '#ddd1bd', '--c-surface': '#f3e9d8', '--c-surface-2': '#ece1cd', '--c-surface-3': '#e7ddcc', '--c-bg': '#f9f0e1', '--c-hover': '#efe4d0', '--c-mute': '#8a7e6b', '--c-mute-2': '#9c907d' } },
  { id: 'clinic', label: 'Terracotta clinic (Function Health)', vars: { ...CURRENT, '--c-ink': '#2a2b2f', '--c-accent': '#9a4b2c', '--c-accent-soft': '#f0cdb8', '--c-body': '#4a4b50', '--c-line': '#ddd6ca', '--c-surface': '#efe9df', '--c-surface-2': '#e8e1d5', '--c-surface-3': '#ddd6ca', '--c-bg': '#f4efe6', '--c-hover': '#e9e2d6', '--c-mute': '#77736c', '--c-mute-2': '#9a958c' } },
  { id: 'linen', label: 'Linen & espresso (Rejuvenation)', vars: { ...CURRENT, '--c-ink': '#2c1910', '--c-accent': '#8f4a36', '--c-accent-soft': '#f0cbbd', '--c-body': '#4f3b31', '--c-line': '#d9d1c1', '--c-card': '#f5f2ea', '--c-surface': '#ebe6d9', '--c-surface-2': '#e4ddce', '--c-surface-3': '#dad2c1', '--c-bg': '#f2eee4', '--c-hover': '#e2dbcb' } },
  { id: 'honey', label: 'Honey peach (House of Honey)', vars: { ...CURRENT, '--c-ink': '#2a1d17', '--c-accent': '#a85a36', '--c-accent-soft': '#edccbe', '--c-body': '#56423a', '--c-line': '#f0d9c4', '--c-surface': '#ffeacf', '--c-surface-2': '#fde2c2', '--c-surface-3': '#f6d6b4', '--c-bg': '#fff8ef', '--c-hover': '#fbe4ca' } },
  { id: 'olive', label: 'Olive & clay (Noho)', vars: { ...CURRENT, '--c-ink': '#2b2c17', '--c-accent': '#54562a', '--c-accent-soft': '#e6d2b8', '--c-body': '#4a4b35', '--c-line': '#dcdcc8', '--c-surface': '#eeeee0', '--c-surface-2': '#e6e7d6', '--c-surface-3': '#dcdcc8', '--c-bg': '#f6f4ec', '--c-hover': '#e7e7d7', '--c-mute': '#76775e', '--c-mute-2': '#9a9b82' } },
  { id: 'dusk', label: 'Dusk blue & sand', vars: { ...CURRENT, '--c-ink': '#1c2a3a', '--c-accent': '#a8643c', '--c-accent-soft': '#f0cdb4', '--c-body': '#46505c', '--c-line': '#d7d3cb', '--c-surface': '#f3f0ea', '--c-surface-2': '#ebe7df', '--c-surface-3': '#e0dbd1', '--c-bg': '#faf8f4', '--c-hover': '#e9e5dd' } },
];

export interface ShapePreset {
  id: string;
  label: string;
  card: string;
  btn: string;
  img: string;
}

export const SHAPES: ShapePreset[] = [
  { id: 'current', label: 'Square (previous)', card: '0px', btn: '0px', img: '0px' },
  { id: 'soft', label: 'Soft 12px', card: '14px', btn: '10px', img: '10px' },
  { id: 'round', label: 'Round + pill buttons', card: '24px', btn: '999px', img: '18px' },
  { id: 'arch', label: 'Arched images + pill', card: '20px', btn: '999px', img: 'arch' },
];

export const HEROES = [
  { id: 'current', label: 'Split: copy left, video right (previous)' },
  { id: 'wordmark', label: 'Full-bleed video, giant centred headline' },
  { id: 'arch', label: 'Copy left, video in an arch frame' },
  { id: 'editorial', label: 'Editorial: oversized headline over a wide video band' },
  { id: 'glass', label: 'Full-bleed video with a frosted copy card' },
] as const;

export type { HeroId } from './defaults';

export type { LabState } from './defaults';
export { DEFAULT_LAB } from './defaults';
import { DEFAULT_LAB, type LabState } from './defaults';

/** Section- and component-level alternatives. `current` is always the shipped one. */
export const SECTION_OPTIONS: Record<'nav' | 'btn' | 'eye' | 'svc' | 'jour' | 'doc' | 'foot', { id: string; label: string }[]> = {
  nav: [
    { id: 'current', label: 'Full-width bar (previous)' },
    { id: 'pill', label: 'Floating pill nav (Heva)' },
  ],
  btn: [
    { id: 'current', label: 'Plain fill (previous)' },
    { id: 'wipe', label: 'Fill wipe + arrow swap' },
  ],
  eye: [
    { id: 'current', label: 'Heartbeat line (previous)' },
    { id: 'number', label: 'Numbered chapter "01 —"' },
    { id: 'pill', label: 'Pill tag' },
  ],
  svc: [
    { id: 'current', label: 'Card grid (previous)' },
    { id: 'rail', label: 'Horizontal snap rail' },
    { id: 'stack', label: 'Sticky stacking cards' },
    { id: 'index', label: 'Index list, cursor-follow photo' },
    { id: 'scrolly', label: 'Sticky scrollytelling' },
    { id: 'hscroll', label: 'Pinned horizontal scroll' },
    { id: 'panels', label: 'Expanding photo panels' },
    { id: 'bento', label: 'Bento grid' },
  ],
  jour: [
    { id: 'current', label: 'Horizontal steps + panel (previous)' },
    { id: 'rail', label: 'Vertical timeline rail' },
  ],
  doc: [
    { id: 'current', label: 'Profile card (previous)' },
    { id: 'story', label: 'Founder story, arch portrait' },
  ],
  foot: [
    { id: 'current', label: 'Columns footer (previous)' },
    { id: 'wordmark', label: 'Closing CTA band + giant wordmark' },
  ],
};

export const ACCENTS = [
  { id: 'none', label: 'Plain headline (previous)' },
  { id: 'italic', label: 'Italic serif accent word' },
  { id: 'marker', label: 'Hand-drawn marker highlight' },
  { id: 'underline', label: 'Drawn scribble underline' },
] as const;

/* ---- Runtime (loaded on demand with this module) ---- */

/** Read a lab choice from the query string, falling back to the shipped design. */
export function parseLab(q: URLSearchParams): LabState {
  const pick = <T extends { id: string }>(list: readonly T[], key: string, fallback: string) => {
    const v = q.get(key);
    return v && list.some((x) => x.id === v) ? v : fallback;
  };
  return {
    font: pick(FONTS, 'font', DEFAULT_LAB.font),
    pal: pick(PALETTES, 'pal', DEFAULT_LAB.pal),
    shape: pick(SHAPES, 'shape', DEFAULT_LAB.shape),
    hero: pick(HEROES, 'hero', DEFAULT_LAB.hero) as LabState['hero'],
    accent: pick(ACCENTS, 'accent', DEFAULT_LAB.accent),
    nav: pick(SECTION_OPTIONS.nav, 'nav', DEFAULT_LAB.nav),
    btn: pick(SECTION_OPTIONS.btn, 'btn', DEFAULT_LAB.btn),
    eye: pick(SECTION_OPTIONS.eye, 'eye', DEFAULT_LAB.eye),
    svc: pick(SECTION_OPTIONS.svc, 'svc', DEFAULT_LAB.svc),
    jour: pick(SECTION_OPTIONS.jour, 'jour', DEFAULT_LAB.jour),
    doc: pick(SECTION_OPTIONS.doc, 'doc', DEFAULT_LAB.doc),
    foot: pick(SECTION_OPTIONS.foot, 'foot', DEFAULT_LAB.foot),
  };
}

const loadedFonts = new Set<string>();
function loadGoogle(families: string[]) {
  const missing = families.filter((f) => !loadedFonts.has(f));
  if (!missing.length) return;
  missing.forEach((f) => loadedFonts.add(f));
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${missing.map((f) => `family=${f}`).join('&')}&display=swap`;
  document.head.appendChild(link);
}

/**
 * Apply a lab choice to the tokens and data-lab-* attributes on <html>.
 * Returns an undo that restores the shipped design.
 */
export function applyLab(state: LabState): () => void {
  const root = document.documentElement;
  const font = FONTS.find((f) => f.id === state.font)!;
  const pal = PALETTES.find((p) => p.id === state.pal)!;
  const shape = SHAPES.find((s) => s.id === state.shape)!;
  loadGoogle(font.google);
  const vars: Record<string, string> = {
    ...pal.vars,
    '--f-display': font.display,
    '--f-body': font.body,
    '--f-italic': font.italic ?? font.display,
    '--f-display-weight': String(font.displayWeight),
    '--f-display-tracking': font.displayTracking,
    '--lab-card': shape.card,
    '--lab-btn': shape.btn,
    '--lab-img': shape.img === 'arch' ? shape.card : shape.img,
  };
  const attrs: Record<string, string> = {
    labFont: state.font,
    labShape: state.shape,
    labPal: state.pal,
    labBtn: state.btn,
    labEye: state.eye,
  };
  const previous = Object.fromEntries(Object.keys(attrs).map((k) => [k, root.dataset[k]]));
  Object.entries(vars).forEach(([k, v]) => root.style.setProperty(k, v));
  Object.entries(attrs).forEach(([k, v]) => (root.dataset[k] = v));
  return () => {
    Object.keys(vars).forEach((k) => root.style.removeProperty(k));
    Object.entries(previous).forEach(([k, v]) => {
      if (v === undefined) delete root.dataset[k];
      else root.dataset[k] = v;
    });
  };
}
