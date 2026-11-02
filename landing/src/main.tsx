import { StrictMode } from 'react';
import { createRoot, hydrateRoot } from 'react-dom/client';
import { inject } from '@vercel/analytics';
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
 * Vercel Web Analytics: cookieless page views, so no consent banner is needed.
 * Injected here rather than rendered in <App/> so the prerendered HTML and
 * hydration are untouched. The script loads from /_vercel/insights on this
 * origin (allowed by the CSP's 'self'), collects only on Vercel production,
 * and follows the client-side router's pushState navigations on its own.
 *
 * Query strings and hashes are dropped before sending: the booking panel's
 * `?book=1&for=...&service=...` state would otherwise split one page into many
 * rows, and URLs pasted from elsewhere can carry tokens we have no reason to log.
 * Custom events (e.g. booking submitted) need the Pro plan, so none are sent.
 */
inject({
  beforeSend: (event) => {
    const url = new URL(event.url);
    url.search = '';
    url.hash = '';
    return { ...event, url: url.toString() };
  },
});

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
