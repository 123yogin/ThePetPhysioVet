import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { FlashStack } from './FlashStack';
import { ErrorBoundary } from './ErrorBoundary';
import { Icon } from './Icon';

export const AppShell: React.FC = () => {
  const location = useLocation();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);

  // Close the drawer whenever the route changes -- otherwise it stays open
  // covering the screen the user just navigated to.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  // Dismissing via Escape or the backdrop must hand focus back to the toggle.
  // Without this the focus ring is left on an element that just became
  // `visibility: hidden`, and the browser drops focus to <body> -- so the next
  // Tab restarts from the top of the page.
  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    toggleRef.current?.focus();
  }, []);

  // Widening past the breakpoint must reset the drawer.
  //
  // The toggle is `display: none` at desktop, so a drawer left open while
  // resizing becomes unclosable: `sidebar-open` stays on <body>,
  // `aria-expanded="true"` keeps announcing an expanded control that no longer
  // exists, the Escape listener stays bound, and narrowing again makes the
  // menu silently reappear open.
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const sync = () => {
      if (!mq.matches) setDrawerOpen(false);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    document.body.classList.toggle('sidebar-open', drawerOpen);

    // The class lives on an element outside React's tree (document.body), so
    // it must be explicitly removed on unmount/toggle -- otherwise logging
    // out with the drawer open leaks it onto /login.
    return () => {
      document.body.classList.remove('sidebar-open');
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeDrawer();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [drawerOpen, closeDrawer]);

  return (
    <div className="app-shell">
      <FlashStack />
      {/* The toggle is rendered BEFORE the sidebar on purpose.
          It is `position: fixed` (bottom-right), so DOM order costs nothing
          visually -- but it decides the tab order. With the toggle after the
          sidebar, a keyboard user who opened the drawer and pressed Tab went
          straight into the main panel, walking past the navigation they had
          just asked for. Ordering it first means Tab flows toggle -> nav
          links naturally, with no focus() call to fight the browser over.
          When the drawer is closed the sidebar is `visibility: hidden`, so it
          is skipped and Tab continues into the page, which is also correct. */}
      <button
        ref={toggleRef}
        type="button"
        className="sidebar-toggle"
        aria-expanded={drawerOpen}
        aria-controls="app-sidebar"
        onClick={() => (drawerOpen ? closeDrawer() : setDrawerOpen(true))}
      >
        <Icon name={drawerOpen ? 'close' : 'list'} label={drawerOpen ? 'Close navigation' : 'Open navigation'} />
      </button>
      <Sidebar />
      {drawerOpen && (
        <div
          className="sidebar-backdrop"
          onClick={closeDrawer}
          aria-hidden="true"
        />
      )}
      <main className="main-panel">
        {/* key={location.pathname} lets "Try Again" recover by re-mounting the
            crashed screen if the user has since navigated away and back. */}
        <ErrorBoundary key={location.pathname} fullPage={false}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
};
