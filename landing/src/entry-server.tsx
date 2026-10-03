/**
 * Server entry for the prerender step.
 *
 * Everything the build needs is re-exported here so scripts/prerender.mjs can load
 * ONE bundle and stay in sync with the app: no duplicated route lists, no
 * hand-copied site config, no second source of truth for metadata.
 */

import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import App from './App';

export { SITE } from './seo/siteConfig';
export { ROUTES, indexableRoutes, normalizePath } from './seo/routes';
export { getPageMeta } from './seo/metadata';
export { renderHeadHtml, lcpPreloadHtml } from './seo/head';
export { buildRobotsTxt, buildSitemapXml, buildLlmsTxt, buildLlmsFullTxt } from './seo/generators';

export interface RenderResult {
  html: string;
  head: string;
}

/** Render one route to static HTML. */
export function render(pathname: string): string {
  return renderToString(
    <StrictMode>
      <App initialPath={pathname} />
    </StrictMode>,
  );
}
