import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {existsSync, readFileSync} from 'node:fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

/**
 * Serve the prerendered per-route HTML during `vite preview`.
 *
 * Vite's preview server does SPA fallback, so every path would return the root
 * index.html and hide the prerendered pages — making local verification lie about
 * what a crawler receives. Real static hosts (Netlify, Vercel, Cloudflare Pages,
 * nginx, S3+CloudFront) serve `/conditions/ivdd/index.html` for `/conditions/ivdd`,
 * so this makes preview behave the same way.
 *
 * The dev server keeps SPA fallback: prerendering does not run in dev, and client
 * routing already renders every route there.
 */
function servePrerendered(): Plugin {
  return {
    name: 'serve-prerendered-html',
    apply: 'serve',
    configurePreviewServer(server) {
      const dist = path.resolve(__dirname, 'dist');
      server.middlewares.use((req, res, next) => {
        const url = (req.url || '/').split('?')[0];
        if (url === '/' || path.extname(url)) return next();

        const candidate = path.join(dist, url.replace(/^\/+|\/+$/g, ''), 'index.html');
        if (existsSync(candidate)) {
          res.setHeader('Content-Type', 'text/html');
          res.end(readFileSync(candidate));
          return;
        }

        const notFound = path.join(dist, '404.html');
        if (existsSync(notFound)) {
          res.statusCode = 404;
          res.setHeader('Content-Type', 'text/html');
          res.end(readFileSync(notFound));
          return;
        }
        return next();
      });
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), servePrerendered()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      // Explicit budget so a dependency bloating the bundle shows up as a warning
      // rather than silently costing INP and LCP.
      chunkSizeWarningLimit: 400,
    },
    server: {
      // Proxy the clinic API so the booking form is same-origin in development,
      // exactly as it is in production (the landing page is served from the
      // clinic app's own domain). Without this the form would cross origins to
      // :8000 and need CORS, which production does not.
      proxy: {
        '/api': {
          target: process.env.CLINIC_API_TARGET || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
