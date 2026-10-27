import type { CapacitorConfig } from "@capacitor/cli";

// The APK bundles the static SPA export (run `npm run build:android` → dist/client/index.html).
// Set LOMA_URL only to fall back to loading the published site instead of local assets.
const remote = process.env.LOMA_URL;
const config: CapacitorConfig = {
  appId: "com.loma.viewer",
  appName: "LoMa VIEWER",
  webDir: "dist/client",
  backgroundColor: "#0b0f17",
  server: remote
    ? { url: remote, cleartext: false, androidScheme: "https" }
    : { androidScheme: "https" },
  android: { allowMixedContent: false },
};

export default config;
