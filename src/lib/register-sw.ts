// Single registration point for the offline service worker. Never registers in dev/preview.
export async function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const host = window.location.hostname.toLowerCase();
  const first = host.split(".")[0];
  const lovableHost = /\.(lovable\.app|gpt-eng\.com|gptengineer\.run)$/.test(host);
  const refused =
    !import.meta.env.PROD ||
    window.self !== window.top ||
    (lovableHost && /^(?:id-preview|preview)(?:-[a-z0-9]+)?--.+$/.test(first)) ||
    (lovableHost && /^project--.+-dev$/.test(first)) ||
    host === "lovableproject.com" || host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" || host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" || host.endsWith(".beta.lovable.dev") ||
    new URLSearchParams(window.location.search).get("sw") === "off";

  if (refused) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => r.active?.scriptURL.endsWith("/sw.js") || r.installing?.scriptURL.endsWith("/sw.js"))
        .map((r) => r.unregister()),
    );
    return;
  }
  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch (e) {
    console.warn("SW registration failed", e);
  }
}
