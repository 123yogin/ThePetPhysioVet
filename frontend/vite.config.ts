import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // Assets are served from /app/ in production (the marketing site owns
  // the root). Overridden per-build via APP_BASE; defaults to '/' so
  // `npm run dev` and the standalone Docker image are unchanged.
  base: process.env.APP_BASE || '/',
  plugins: [react()],
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
});

