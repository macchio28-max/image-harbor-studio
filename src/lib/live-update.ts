/** Live-bridge APK: detect a newer published build and reload without reinstalling. */
const isNativeLive = () => typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.() && location.protocol === "https:" && !location.hostname.includes("localhost");

function scriptsOf(html: string) {
  return [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]).sort().join("|");
}
function currentScripts() {
  return [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map((s) => new URL(s.src).pathname).sort().join("|");
}

/** Hard reload bypassing caches (button "Aggiorna app"). */
export function forceReload() {
  const u = new URL(location.href); u.searchParams.set("_v", String(Date.now()));
  location.replace(u.toString());
}

/** True when the server publishes different entry scripts than the ones running now. */
export async function hasUpdate() {
  try {
    const r = await fetch(`/?_v=${Date.now()}`, { cache: "no-store" });
    if (!r.ok) return false;
    const next = scriptsOf(await r.text());
    return !!next && next !== currentScripts();
  } catch { return false; }
}

/** Checks on start and every time the app returns to foreground; reloads when a new version exists. */
export function startLiveUpdates() {
  if (!isNativeLive()) return () => {};
  const check = async () => { if (document.visibilityState === "visible" && await hasUpdate()) forceReload(); };
  void check();
  document.addEventListener("visibilitychange", check);
  return () => document.removeEventListener("visibilitychange", check);
}
