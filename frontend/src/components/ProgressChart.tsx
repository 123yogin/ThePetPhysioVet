import React from 'react';
import { ProgressNote } from '../lib/types';

type Measure = {
  key: 'pain_score' | 'lameness_score' | 'rom_degrees' | 'girth_cm';
  label: string;
  /** Which direction means the animal is getting better. Shown, because a
   *  falling pain line and a falling range-of-motion line mean opposite things. */
  better: 'lower' | 'higher';
  max?: number;
  unit?: string;
};

const MEASURES: Measure[] = [
  { key: 'pain_score', label: 'Pain', better: 'lower', max: 10 },
  { key: 'lameness_score', label: 'Lameness', better: 'lower', max: 4 },
  { key: 'rom_degrees', label: 'Range of motion', better: 'higher', unit: '°' },
  { key: 'girth_cm', label: 'Limb girth', better: 'higher', unit: 'cm' },
];

const W = 260;
const H = 90;
const PAD = { top: 14, right: 22, bottom: 18, left: 22 };

function Sparkline({ notes, measure }: { notes: ProgressNote[]; measure: Measure }) {
  const points = notes
    .map((n) => ({ session: n.session_no, value: Number(n[measure.key]) }))
    .filter((p) => Number.isFinite(p.value))
    .sort((a, b) => a.session - b.session);

  // One reading is a fact, not a trend. Nothing to plot.
  if (points.length < 2) return null;

  const values = points.map((p) => p.value);
  const lo = measure.max !== undefined ? 0 : Math.min(...values);
  const hi = measure.max ?? Math.max(...values);
  const span = hi - lo || 1;
  const sessions = points.map((p) => p.session);
  const sLo = Math.min(...sessions);
  const sSpan = Math.max(...sessions) - sLo || 1;

  const x = (s: number) => PAD.left + ((s - sLo) / sSpan) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - lo) / span) * (H - PAD.top - PAD.bottom);

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(p.session)},${y(p.value)}`).join(' ');
  const first = points[0];
  const last = points[points.length - 1];
  const fmt = (v: number) => `${Number.isInteger(v) ? v : v.toFixed(1)}${measure.unit ?? ''}`;

  return (
    <figure style={{ margin: 0, flex: '1 1 240px', minWidth: 0 }}>
      <figcaption style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brown-700)' }}>
        {measure.label}{' '}
        <span style={{ fontWeight: 400, color: 'var(--brown-500)' }}>
          ({measure.better} is better)
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`${measure.label} across sessions ${sLo} to ${last.session}: ${points.map((p) => fmt(p.value)).join(', ')}`}
        style={{ overflow: 'visible' }}
      >
        {/* Recessive frame: the floor and ceiling of the scale, nothing more. */}
        <line x1={PAD.left} y1={y(lo)} x2={W - PAD.right} y2={y(lo)} stroke="var(--brown-300)" strokeWidth="1" />
        <line x1={PAD.left} y1={y(hi)} x2={W - PAD.right} y2={y(hi)} stroke="var(--brown-300)" strokeWidth="1" strokeDasharray="2 3" />

        <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />

        {points.map((p) => (
          // A 2px surface ring keeps markers legible where the line doubles back.
          <circle key={p.session} cx={x(p.session)} cy={y(p.value)} r="4"
                  fill="var(--primary)" stroke="var(--cream)" strokeWidth="2">
            <title>{`Session ${p.session}: ${fmt(p.value)}`}</title>
          </circle>
        ))}

        {/* Label the ends only — a number on every point is noise. A point at
            the ceiling of the scale leaves no room above it, and the label
            lands on the caption; drop it below the marker instead. */}
        {[{ p: first, weight: 400, ink: 'var(--brown-700)' },
          { p: last, weight: 600, ink: 'var(--brown-900)' }].map(({ p, weight, ink }, i) => {
          const above = y(p.value) - PAD.top > 14;
          return (
            <text key={i} x={x(p.session)} y={y(p.value) + (above ? -9 : 15)}
                  textAnchor="middle" fontSize="11" fontWeight={weight} fill={ink}>
              {fmt(p.value)}
            </text>
          );
        })}

        <text x={PAD.left} y={H - 4} fontSize="10" fill="var(--brown-500)">S{first.session}</text>
        <text x={W - PAD.right} y={H - 4} textAnchor="end" fontSize="10" fill="var(--brown-500)">S{last.session}</text>
      </svg>
    </figure>
  );
}

/**
 * Objective progress across a course of treatment.
 *
 * Deliberately one small chart per measure rather than one combined chart:
 * pain runs 0-10 and lameness 0-4, and putting two scales on one pair of axes
 * is the classic way to imply a relationship that isn't there.
 */
export const ProgressChart: React.FC<{ notes: ProgressNote[] }> = ({ notes }) => {
  const charts = MEASURES.map((m) => <Sparkline key={m.key} notes={notes} measure={m} />).filter(Boolean);
  if (!charts.some(Boolean)) return null;

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', marginBottom: '16px' }}>
      {charts}
    </div>
  );
};
