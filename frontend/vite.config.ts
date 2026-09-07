import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  // A native bundle with no VITE_API_BASE resolves every request against the app
  // bundle instead of the API and fails with no error the user can see. Refuse to
  // produce that build rather than shipping it.
  if (mode === "mobile" && !loadEnv(mode, process.cwd(), "VITE_").VITE_API_BASE) {
    throw new Error(
      "VITE_API_BASE is required for a mobile build. Copy frontend/.env.mobile.example " +
        "to frontend/.env.mobile and set it to an API host the device can reach."
    );
  }

  const base = process.env.APP_BASE || '/';

  return {
    // Assets are served from /app/ in production (the marketing site owns
    // the root). Overridden per-build via APP_BASE; defaults to '/' so
    // `npm run dev` and the standalone Docker image are unchanged.
    base,
    plugins: [
      react(),
      {
        // Vite leaves plain hrefs in index.html alone, so the launch frame's
        // logo and the favicon stayed relative. On the web the SPA is served
        // from any depth, so `./logo.svg` resolved against /app/owner/pets/<id>
        // and 404'd. This substitutes the configured base at build time, which
        // is '/' for the native bundle and '/app/' for the web deploy.
        name: 'html-base-url',
        transformIndexHtml(html: string) {
          return html.replaceAll('%BASE_URL%', base);
        },
      },
    ],
    server: {
      host: "0.0.0.0",
      port: 5173,
      proxy: {
        "/api": {
          target: "http://127.0.0.1:8000",
          changeOrigin: true,
        },
      },
    },
  };
});
