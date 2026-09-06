import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AppRoutes } from './routes';
import { loadTokens } from './lib/tokens';
import './styles/vet.css';

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = createRoot(rootElement);
  // RequireAuth and RoleLanding read the token synchronously while deciding what
  // to render, so the store has to be in memory before the first render.
  loadTokens()
    .catch((error) => {
      // An unreadable store means no usable session, which RequireAuth already
      // handles by sending the user to /login. Rendering anyway beats a blank screen.
      console.error('Could not restore the saved session', error);
    })
    .finally(() => {
      root.render(
        <StrictMode>
          <AppRoutes />
        </StrictMode>
      );
    });
}
