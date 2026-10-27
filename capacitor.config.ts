import type { CapacitorConfig } from "@capacitor/cli";

// The web app is SSR (TanStack Start), so there is no static index.html to bundle.
// Like the Electron shell, the APK loads the published app (offline via its service worker);
// android-web/ is only a minimal fallback page required by Capacitor.
const config: CapacitorConfig = {
  appId: "com.loma.viewer",
  appName: "LoMa VIEWER",
  webDir: "android-web",
  backgroundColor: "#0b0f17",
  server: {
    url: process.env.LOMA_URL || "https://image-harbor-studio.lovable.app",
    cleartext: false,
    androidScheme: "https",
  },
  android: { allowMixedContent: false },
};

export default config;
