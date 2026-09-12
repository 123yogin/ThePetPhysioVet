import type { CapacitorConfig } from '@capacitor/cli';
import { KeyboardResize } from '@capacitor/keyboard';

const config: CapacitorConfig = {
  appId: 'com.thepetphysiovet.app',
  appName: 'Pet Physio Vet',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      // The web layer hides this once its own matching frame is painted
      // (components/SplashScreen.tsx), so autoHide is off — otherwise the
      // native image disappears before the WebView has drawn anything and the
      // user sees a white flash between the two.
      launchAutoHide: false,
      backgroundColor: '#FAF6F1',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
    },
    Keyboard: {
      // iOS only — the plugin says so, and calling setResizeMode() at runtime on
      // Android returns UNIMPLEMENTED. Android resizes the WebView on its own.
      // The sidebar and toast stack are position: fixed, so resizing the body
      // instead would leave them pinned over the keyboard.
      resize: KeyboardResize.Native,
    },
  },
  android: {
    // Capacitor serves the bundle from https://localhost, so a dev API on plain
    // http is refused as mixed content — a separate rule from the cleartext
    // policy in src/debug. Off unless CAP_DEV is set, so a release sync can
    // never pick it up; production serves the API over https anyway.
    allowMixedContent: process.env.CAP_DEV === 'true',
  },
};

export default config;
