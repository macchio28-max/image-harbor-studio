import { useState } from "react";
import { Trash2, Plus } from "lucide-react";

export const WEBMAIL_PRESETS = [
  { name: "Gmail", url: "https://mail.google.com/mail/u/0/#inbox?compose=new" },
  { name: "Outlook", url: "https://outlook.live.com/mail/0/deeplink/compose" },
  { name: "Yahoo", url: "https://mail.yahoo.com/d/compose/" },
  { name: "iCloud Mail", url: "https://www.icloud.com/mail/" },
];

export type MailService = { id: string; name: string; pkg?: string; web: (email: string) => string };
export const MAIL_SERVICES: MailService[] = [
  { id: "gmail", name: "Gmail", pkg: "com.google.android.gm", web: (e) => `https://mail.google.com/mail/?authuser=${encodeURIComponent(e)}&view=cm&fs=1` },
  { id: "outlook", name: "Outlook / Hotmail", pkg: "com.microsoft.office.outlook", web: () => "https://outlook.live.com/mail/0/deeplink/compose" },
  { id: "outlook365", name: "Outlook aziendale (365)", pkg: "com.microsoft.office.outlook", web: () => "https://outlook.office.com/mail/deeplink/compose" },
  { id: "libero", name: "Libero Mail", pkg: "com.libero.mail", web: () => "https://login.libero.it/" },
  { id: "yahoo", name: "Yahoo Mail", pkg: "com.yahoo.mobile.client.android.mail", web: () => "https://mail.yahoo.com/d/compose/" },
  { id: "icloud", name: "iCloud Mail", web: () => "https://www.icloud.com/mail/" },
  { id: "app", name: "App di posta del dispositivo", web: () => "mailto:" },
];

export type MailAccount = { id: string; email: string; service: string };
const KEY = "loma.mail.accounts";
export const loadAccounts = (): MailAccount[] => { try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; } };
const saveAccounts = (a: MailAccount[]) => localStorage.setItem(KEY, JSON.stringify(a));
export const serviceOf = (a: MailAccount) => MAIL_SERVICES.find((s) => s.id === a.service) ?? MAIL_SERVICES[MAIL_SERVICES.length - 1]!;

/** Small popup: pick one of the saved mail accounts, or add/remove accounts (unlimited). */
export function MailChoice({ onClose, onPick }: { onClose: () => void; onPick: (a: MailAccount) => void }) {
  const [list, setList] = useState<MailAccount[]>(loadAccounts);
  const [adding, setAdding] = useState(list.length === 0);
  const [email, setEmail] = useState("");
  const [service, setService] = useState("gmail");
  const update = (l: MailAccount[]) => { setList(l); saveAccounts(l); };
  const add = () => {
    update([...list, { id: String(Date.now()), email: email.trim(), service }]);
    setEmail(""); setAdding(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 text-base font-semibold">Invia con quale email?</h2>
        {list.length > 0 && (
          <div className="mb-3 flex flex-col gap-1.5">
            {list.map((a) => (
              <div key={a.id} className="flex items-center gap-1.5">
                <button onClick={() => onPick(a)} className="flex-1 rounded bg-secondary px-3 py-2.5 text-left text-sm hover:bg-accent">
                  <div className="font-medium">{a.email || serviceOf(a).name}</div>
                  <div className="text-xs text-muted-foreground">{serviceOf(a).name}</div>
                </button>
                <button aria-label="Rimuovi" onClick={() => update(list.filter((x) => x.id !== a.id))} className="rounded p-2.5 text-muted-foreground hover:bg-accent">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
        {adding ? (
          <div className="rounded border border-border p-3">
            <div className="mb-2 text-sm font-medium">Aggiungi un indirizzo</div>
            <select value={service} onChange={(e) => setService(e.target.value)} className="mb-2 w-full rounded border border-input bg-background px-2 py-2 text-sm">
              {MAIL_SERVICES.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="nome@esempio.it" className="mb-2 w-full rounded border border-input bg-background px-2 py-2 text-sm" />
            <div className="flex gap-2">
              <button disabled={!email.includes("@")} onClick={add} className="flex-1 rounded bg-primary px-3 py-2 text-sm text-primary-foreground disabled:opacity-50">Salva</button>
              {list.length > 0 && <button onClick={() => setAdding(false)} className="rounded bg-secondary px-3 py-2 text-sm">Annulla</button>}
            </div>
          </div>
        ) : (
          <button onClick={() => setAdding(true)} className="flex w-full items-center justify-center gap-1.5 rounded border border-dashed border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent">
            <Plus className="h-4 w-4" /> Aggiungi indirizzo email
          </button>
        )}
      </div>
    </div>
  );
}
