/**
 * The shipped design, kept apart from the lab's preset lists so ordinary
 * visitors never download those: presets.ts and the panel load on demand,
 * only when lab parameters are present in the URL.
 */
export type HeroId = 'current' | 'wordmark' | 'arch' | 'editorial' | 'glass';

export interface LabState {
  font: string;
  pal: string;
  shape: string;
  hero: HeroId;
  accent: string;
  nav: string;
  btn: string;
  eye: string;
  svc: string;
  jour: string;
  doc: string;
  foot: string;
}

/** The shipped design: the winner of each lab round (2026-09-27). */
export const DEFAULT_LAB: LabState = {
  font: 'frauncesfig', pal: 'peachhero', shape: 'round', hero: 'arch', accent: 'italic',
  nav: 'pill', btn: 'wipe', eye: 'pill', svc: 'panels', jour: 'rail', doc: 'story', foot: 'wordmark',
};

