import { useState } from "react";

export const WEBMAIL_PRESETS = [
  { name: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox?compose=new" },
  { name: "Outlook", url: "https://outlook.live.com/mail/0/deeplink/compose" },
  { name: "Yahoo", url: "https://mail.yahoo.com/d/compose/" },
  { name: "iCloud Mail", url: "https://www.icloud.com/mail/" },
];

export function MailChoice({ onClose, onPick }: { onClose: () => void; onPick: (mode: "app" | "web", url?: string) => void }) {
  const [url, setUrl] = useState(() => localStorage.getItem("loma.mail.url") || WEBMAIL_PRESETS[0]!.url);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-lg font-semibold">Come vuoi inviare le email?</h2>
        <p className="mb-4 text-sm text-muted-foreground">La scelta viene ricordata e si può cambiare in "App". La foto viene copiata negli appunti: incollala nel messaggio.</p>
        <button className="mb-4 w-full rounded bg-primary px-3 py-2 text-sm text-primary-foreground" onClick={() => onPick("app")}>
          App di posta installata sul computer (Mail, Outlook, Thunderbird...)
        </button>
        <div className="rounded border border-border p-3">
          <div className="mb-2 text-sm font-medium">Webmail nel browser</div>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {WEBMAIL_PRESETS.map((p) => (
              <button key={p.name} onClick={() => setUrl(p.url)} className={`rounded px-2 py-1 text-xs ${url === p.url ? "bg-primary text-primary-foreground" : "bg-secondary hover:bg-accent"}`}>{p.name}</button>
            ))}
          </div>
          <input value={url} onChange={(e) => setUrl(e.target.value)} className="mb-2 w-full rounded border border-input bg-background px-2 py-1.5 text-xs" placeholder="https://..." />
          <button disabled={!/^https?:\/\//.test(url)} onClick={() => onPick("web", url)} className="w-full rounded bg-secondary px-3 py-2 text-sm hover:bg-accent disabled:opacity-50">Usa questa webmail</button>
        </div>
      </div>
    </div>
  );
}
