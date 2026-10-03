/**
 * Minimal History-API router. No dependency added — the app only needs path
 * matching, and every extra client-side kilobyte is INP and LCP budget.
 *
 * The SEO-critical property: <Link> always renders a real <a href="…">. Crawlers
 * follow hrefs; they do not click div onClick handlers. Interception is a
 * progressive enhancement layered on top of a link that works without JS.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { normalizePath } from './routes';
import { applyHead } from './head';

interface RouterValue {
  path: string;
  /** Raw query string WITHOUT the leading "?" -- '' when there is none.
   *  Routes are matched on path alone; this carries UI intent such as
   *  "?book=1", which opens the booking panel. */
  search: string;
  navigate: (to: string, options?: { replace?: boolean; scroll?: boolean }) => void;
}

const RouterContext = createContext<RouterValue>({ path: '/', search: '', navigate: () => {} });

export const useRouter = (): RouterValue => useContext(RouterContext);

/**
 * @param initialPath supplied by the server renderer; the browser reads location instead.
 */
export const RouterProvider: React.FC<{ initialPath?: string; children: React.ReactNode }> = ({
  initialPath = '/',
  children,
}) => {
  const [path, setPath] = useState<string>(() =>
    typeof window === 'undefined' ? normalizePath(initialPath) : normalizePath(window.location.pathname),
  );
  const [search, setSearch] = useState<string>(() =>
    typeof window === 'undefined' ? '' : window.location.search.replace(/^\?/, ''),
  );

  const navigate = useCallback((to: string, options?: { replace?: boolean; scroll?: boolean }) => {
    if (typeof window === 'undefined') return;

    // In-page anchors stay on the current route and just scroll.
    if (to.startsWith('#')) {
      document.getElementById(to.slice(1))?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const [rawPath, hash] = to.split('#');
    const [pathPart, queryPart = ''] = (rawPath || '').split('?');
    const target = normalizePath(pathPart || window.location.pathname);

    // The query survives navigation. It used to be dropped on the floor here --
    // normalizePath strips it, and the URL was rebuilt from path + hash only --
    // so a link like "/?book=1#book" arrived with the intent removed.
    const url = `${target}${queryPart ? `?${queryPart}` : ''}${hash ? `#${hash}` : ''}`;
    const routeChanged = target !== path;
    const queryChanged = queryPart !== search;

    if (routeChanged || queryChanged) {
      window.history[options?.replace ? 'replaceState' : 'pushState']({}, '', url);
      setPath(target);
      setSearch(queryPart);
      // Only a real route change resets the scroll. Flipping a query flag on
      // the page you are already on must not yank the viewport to the top.
      if (routeChanged && options?.scroll !== false) {
        window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      }
      if (!routeChanged && hash) {
        document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      }
    } else if (hash) {
      document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [path, search]);

  // Back/forward buttons.
  useEffect(() => {
    const onPop = () => {
      setPath(normalizePath(window.location.pathname));
      setSearch(window.location.search.replace(/^\?/, ''));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  // Keep the document head in sync with the active route on every client navigation.
  useEffect(() => {
    applyHead(path);
  }, [path]);

  // Deferred hash scroll: the target section may not exist until the route renders.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.location.hash) return;
    const id = window.location.hash.slice(1);
    const timer = window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 80);
    return () => window.clearTimeout(timer);
  }, [path]);

  const value = useMemo<RouterValue>(() => ({ path, search, navigate }), [path, search, navigate]);
  return <RouterContext.Provider value={value}>{children}</RouterContext.Provider>;
};

export interface LinkProps extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  replace?: boolean;
  scroll?: boolean;
}

/**
 * A real anchor with SPA interception.
 *
 * Modified clicks (new tab, middle click, download, external target) are left to
 * the browser — hijacking them breaks user expectations and gains nothing.
 */
export const Link: React.FC<LinkProps> = ({ to, replace, scroll, onClick, children, ...rest }) => {
  const { navigate } = useRouter();

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented) return;
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (rest.target && rest.target !== '_self') return;
    if (/^(https?:)?\/\//i.test(to) || to.startsWith('mailto:') || to.startsWith('tel:')) return;

    event.preventDefault();
    navigate(to, { replace, scroll });
  };

  return (
    <a href={to} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
};
