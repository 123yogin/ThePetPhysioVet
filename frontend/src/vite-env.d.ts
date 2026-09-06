/// <reference types="vite/client" />

interface ImportMetaEnv {
  /**
   * Absolute origin of the API. Empty on web, where the Vite proxy (dev) or the
   * reverse proxy (prod) serves `/api` from the same origin. Native builds must
   * set it: their document origin is the app bundle, not the API host.
   */
  readonly VITE_API_BASE: string;
}
