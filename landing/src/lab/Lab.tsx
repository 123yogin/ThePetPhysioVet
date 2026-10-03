/**
 * Design lab runtime.
 *
 * With no lab parameters in the URL this is a context that hands every
 * component DEFAULT_LAB -- the shipped design, which the CSS tokens and the
 * data-lab-* attributes in index.html already describe. Nothing else loads.
 *
 * When the URL carries lab parameters (?font=&pal=&shape=&hero=&accent=&nav=
 * &btn=&eye=&svc=&jour=&doc=&foot=, or ?lab to show the switcher), the preset
 * lists and the panel are fetched as a separate chunk, the choice is applied
 * to the tokens on <html>, and the components re-render the chosen variants.
 */
import React, { createContext, lazy, Suspense, useContext, useEffect, useState } from 'react';
import { useRouter } from '../seo/router';
import { DEFAULT_LAB, type LabState } from './defaults';

const LabContext = createContext<LabState>(DEFAULT_LAB);
export const useLab = () => useContext(LabContext);

const LAB_KEYS = ['lab', 'font', 'pal', 'shape', 'hero', 'accent', 'nav', 'btn', 'eye', 'svc', 'jour', 'doc', 'foot'];
const LabPanel = lazy(() => import('./LabPanel'));

export const LabProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { search } = useRouter();
  const [state, setState] = useState<LabState>(DEFAULT_LAB);
  const [panel, setPanel] = useState(false);

  useEffect(() => {
    const q = new URLSearchParams(search);
    if (!LAB_KEYS.some((k) => q.has(k))) {
      setState(DEFAULT_LAB);
      setPanel(false);
      return;
    }
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    import('./presets').then(({ parseLab, applyLab }) => {
      if (cancelled) return;
      const next = parseLab(q);
      setState(next);
      setPanel(q.has('lab'));
      cleanup = applyLab(next);
    });
    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [search]);

  return (
    <LabContext.Provider value={state}>
      {children}
      {panel && (
        <Suspense fallback={null}>
          <LabPanel state={state} />
        </Suspense>
      )}
    </LabContext.Provider>
  );
};
