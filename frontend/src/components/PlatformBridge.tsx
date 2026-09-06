import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { setNavigator } from '../lib/navigation';

// Back from one of these leaves the app rather than walking back into the
// history that led here — from /dashboard that would be the login screen.
const ROOT_PATHS = ['/', '/login', '/dashboard', '/owner/home'];

/**
 * Connects the app to whatever is hosting it: the router, so code outside the
 * React tree can navigate, and on a device the native back button, status bar
 * and keyboard. Renders nothing.
 */
export const PlatformBridge: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  React.useEffect(() => {
    setNavigator(navigate);
  }, [navigate]);

  // Read through a ref so the listener is registered once instead of being torn
  // down and re-added on every navigation.
  const pathRef = React.useRef(location.pathname);
  pathRef.current = location.pathname;

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    const handle = App.addListener('backButton', () => {
      if (ROOT_PATHS.includes(pathRef.current)) {
        App.exitApp();
      } else {
        navigate(-1);
      }
    });

    return () => {
      handle.then((listener) => listener.remove());
    };
  }, [navigate]);

  React.useEffect(() => {
    if (!Capacitor.isNativePlatform()) {
      return;
    }

    // Dark text: every screen sits on the cream background.
    StatusBar.setStyle({ style: Style.Light });
    if (Capacitor.getPlatform() === 'android') {
      // Android draws the WebView under a transparent status bar, and reports
      // env(safe-area-inset-top) as 0 — so the safe-area padding cannot save it
      // and every page title was clipped behind the clock. Letting the system
      // own that strip is the fix; it also makes setBackgroundColor take effect,
      // which is a no-op while the status bar overlays.
      StatusBar.setOverlaysWebView({ overlay: false });
      // Already in the palette — the top stop of the body gradient.
      StatusBar.setBackgroundColor({ color: '#fff9f4' });
    }
  }, []);

  return null;
};
