import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite dev server on :5173. /api is proxied to the Django dev server so the
// session cookie + CSRF token stay same-origin (no CORS needed in dev). /media
// is proxied too so uploaded diagnosis files (and DICOM "open in new tab")
// resolve from Django MEDIA in dev.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: false,
      },
      "/media": {
        target: "http://127.0.0.1:8000",
        changeOrigin: false,
      },
    },
  },
});
