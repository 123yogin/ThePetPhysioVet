import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { FlashStack } from './FlashStack';
import { ErrorBoundary } from './ErrorBoundary';

export const AppShell: React.FC = () => {
  const location = useLocation();
  return (
    <div className="app-shell">
      <FlashStack />
      <Sidebar />
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
