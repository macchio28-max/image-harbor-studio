// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

// LOMA_TARGET=android builds a static SPA shell (dist/client/index.html) for the Capacitor APK.
// The normal web deploy (no env var) is unchanged: SSR on the edge.
const android = process.env["LOMA_TARGET"] === "android";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
    ...(android ? { spa: { enabled: true, prerender: { outputPath: "/index.html" } } } : {}),
  },
  vite: {
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        filename: "sw.js",
        manifest: false,
        devOptions: { enabled: false },
        workbox: {
          navigateFallback: null,
          importScripts: ["/share-target-sw.js"],
          globPatterns: ["**/*.{js,css,png,svg,ico,webmanifest,woff2}"],
          runtimeCaching: [
            {
              urlPattern: ({ request, url }) =>
                request.mode === "navigate" && !url.pathname.startsWith("/~oauth"),
              handler: "NetworkFirst",
              options: { cacheName: "loma-pages", networkTimeoutSeconds: 3 },
            },
            {
              urlPattern: ({ url }) =>
                url.pathname.startsWith("/assets/") || url.pathname.startsWith("/__l5e/"),
              handler: "CacheFirst",
              options: { cacheName: "loma-assets" },
            },
          ],
        },
      }),
    ],
  },
});
