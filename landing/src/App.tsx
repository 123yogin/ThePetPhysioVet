import React from 'react';
import { RouterProvider, useRouter } from './seo/router';
import { matchRoute } from './seo/routes';
import { HomePage } from './pages/HomePage';
import { ConditionPage } from './pages/ConditionPage';
import { ServicePage } from './pages/ServicePage';
import { CarePage } from './pages/CarePage';
import type { CareService } from './data/careServices';
import { SpecialistPage } from './pages/SpecialistPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { LegalPage } from './pages/LegalPage';
import { PRIVACY, TERMS } from './data/legalContent';
import type { ConditionItem, ServiceItem, Specialist } from './types';
import { SiteMotion } from './motion/SiteMotion';
import { LabProvider } from './lab/Lab';
import { MobileActionBar } from './components/MobileActionBar';

/** Resolve the active route to a page component. */
const RouteView: React.FC = () => {
  const { path } = useRouter();
  const { route, entity } = matchRoute(path);

  switch (route.kind) {
    case 'condition':
      return entity ? <ConditionPage condition={entity as ConditionItem} /> : <NotFoundPage />;
    case 'service':
      return entity ? <ServicePage service={entity as ServiceItem} /> : <NotFoundPage />;
    case 'care':
      return entity ? <CarePage service={entity as CareService} /> : <NotFoundPage />;
    case 'specialist':
      return entity ? <SpecialistPage specialist={entity as Specialist} /> : <NotFoundPage />;
    case 'privacy':
      return <LegalPage doc={PRIVACY} />;
    case 'terms':
      return <LegalPage doc={TERMS} />;
    case 'home':
      return <HomePage />;
    default:
      return <NotFoundPage />;
  }
};

/**
 * @param initialPath passed by the server renderer during prerendering; in the
 * browser the router reads window.location instead.
 */
export default function App({ initialPath }: { initialPath?: string }) {
  return (
    <RouterProvider initialPath={initialPath}>
      <LabProvider>
      <RouteView />
      {/* Site-wide decorative motion (smooth scroll, cursor trail/bubble,
          magnetic buttons, image drift/tilt/fade, scroll ticks, page curtain).
          Mounted after hydration + idle by SiteMotion so it never competes with
          first paint — behaviour only, nothing rendered at rest, no layout. */}
      <SiteMotion />
      <MobileActionBar />
      </LabProvider>
    </RouterProvider>
  );
}
