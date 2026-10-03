/** The lab's switcher panel. Loaded only when `?lab` is in the URL. */
import React from 'react';
import { useRouter } from '../seo/router';
import { ACCENTS, FONTS, HEROES, PALETTES, SECTION_OPTIONS, SHAPES } from './presets';
import type { LabState } from './defaults';

const LabPanel: React.FC<{ state: LabState }> = ({ state }) => {
  const { path, navigate } = useRouter();
  const set = (key: keyof LabState, value: string) => {
    const q = new URLSearchParams(window.location.search);
    q.set(key, value);
    q.set('lab', '1');
    navigate(`${path}?${q.toString()}`, { replace: true, scroll: false });
  };
  const rows: [keyof LabState, readonly { id: string; label: string }[]][] = [
    ['font', FONTS],
    ['pal', PALETTES],
    ['shape', SHAPES],
    ['hero', HEROES],
    ['accent', ACCENTS],
    ...(Object.keys(SECTION_OPTIONS) as (keyof typeof SECTION_OPTIONS)[]).map(
      (k) => [k, SECTION_OPTIONS[k]] as [keyof LabState, readonly { id: string; label: string }[]],
    ),
  ];
  return (
    <div className="fixed left-4 bottom-4 z-[2000] w-72 max-h-[85vh] overflow-y-auto bg-black/85 text-white p-4 font-mono shadow-2xl backdrop-blur">
      <div className="text-[11px] uppercase tracking-widest mb-3">Design lab</div>
      {rows.map(([k, list]) => (
        <label key={k} className="block mb-2">
          <span className="block text-[10px] uppercase tracking-widest opacity-60 mb-0.5">{k}</span>
          <select
            value={state[k]}
            onChange={(e) => set(k, e.target.value)}
            className="w-full bg-white/10 border border-white/20 px-2 py-1 text-xs"
          >
            {list.map((o) => (
              <option key={o.id} value={o.id} className="text-black">
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
};

export default LabPanel;
