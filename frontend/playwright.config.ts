import { defineConfig, devices } from "@playwright/test";

// Pixel-parity harness: React (:5173) vs Django (:8000). Both servers must be
// running (see docs/UI_PARITY.md). Animations are killed via reduced-motion.
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:5173",
    colorScheme: "light",
    // vet.css honours prefers-reduced-motion:reduce -> disables slideIn/fadeUp.
    contextOptions: { reducedMotion: "reduce" },
  },
  projects: [
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } },
    },
  ],
});
