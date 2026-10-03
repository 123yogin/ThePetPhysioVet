import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './motion/motion.css';
import './lab/lab.css';

const container = document.getElementById('root')!;

const tree = (
  <StrictMode>
    <App />
  </StrictMode>
);

/**
 * Prerendered pages ship real markup inside #root, so hydrate it rather than
 * throwing it away — a createRoot() render would blank the server HTML on load
 * and hand back the empty-shell behaviour prerendering exists to remove.
 */
if (container.hasChildNodes()) {
  hydrateRoot(container, tree);
} else {
  createRoot(container).render(tree);
}

/**
 * Offline-capable caching for repeat visits (public/sw.js). Production only:
 * in development a caching worker would serve stale modules. Registered after
 * load so it never competes with the first paint. The worker ignores /app,
 * /api and /admin, so the clinic app on the same domain is untouched.
 */
if ((import.meta as any).env?.PROD && 'serviceWorker' in navigator && !location.pathname.startsWith('/app')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
  });
}
