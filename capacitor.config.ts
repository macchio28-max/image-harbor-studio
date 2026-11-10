import type { CapacitorConfig } from "@capacitor/cli";

// Live bridge (default): the APK loads the published app so every publish reaches the tablet
// without reinstalling; native bridges (LomaAndroid) are injected into that page by MainActivity.
// Offline: Capacitor falls back to the bundled static SPA (webDir) via errorPath.
// Set LOMA_LOCAL=1 to build a purely local APK, or LOMA_URL to point at another host.
const local = process.env["LOMA_LOCAL"] === "1";
const remote = process.env["LOMA_URL"] || "https://image-harbor-studio.lovable.app";
const config: CapacitorConfig = {
  appId: "com.loma.viewer",
  appName: "LoMa VIEWER",
  webDir: "dist/client",
  backgroundColor: "#0b0f17",
  server: local
    ? { androidScheme: "https" }
    : { url: remote, cleartext: false, androidScheme: "https", errorPath: "index.html" },
  android: { allowMixedContent: false },
};

export default config;
