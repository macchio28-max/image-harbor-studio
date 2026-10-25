import { useState } from "react";
import { X } from "lucide-react";
import { type CloudKind, getCloudCfg, setCloudCfg, redirectUri } from "./cloud-upload";

const INFO: Record<CloudKind, { name: string; steps: string[] }> = {
  drive: {
    name: "Google Drive",
    steps: [
      "Apri console.cloud.google.com → crea un progetto → abilita \"Google Drive API\".",
      "Credenziali → Crea credenziali → ID client OAuth → tipo \"Applicazione web\".",
      "In \"Origini JavaScript autorizzate\" aggiungi l'indirizzo qui sotto.",
      "Copia l'ID client (finisce con .apps.googleusercontent.com) e incollalo qui.",
    ],
  },
  onedrive: {
    name: "OneDrive",
    steps: [
      "Apri portal.azure.com → \"Registrazioni app\" → Nuova registrazione.",
      "Tipi di account: \"Qualsiasi account... e account Microsoft personali\".",
      "URI di reindirizzamento: piattaforma \"Applicazione a pagina singola (SPA)\" con l'indirizzo qui sotto.",
      "Copia l'\"ID applicazione (client)\" e incollalo qui.",
    ],
  },
};

export function CloudSetup({ kind, onClose, onSaved }: { kind: CloudKind; onClose: () => void; onSaved: () => void }) {
  const init = getCloudCfg(kind);
  const [clientId, setClientId] = useState(init.clientId);
  const [folder, setFolder] = useState(init.folder);
  const info = INFO[kind];
  const origin = kind === "drive" ? window.location.origin : redirectUri();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/70 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Collega {info.name}</h2>
          <button onClick={onClose} className="rounded p-1 hover:bg-accent"><X className="h-4 w-4" /></button>
        </div>
        <p className="mb-2 text-sm text-muted-foreground">Configurazione da fare una sola volta. Poi il pulsante carica la foto direttamente nella cartella scelta.</p>
        <ol className="mb-3 list-decimal space-y-1 pl-5 text-xs text-muted-foreground">
          {info.steps.map((s) => <li key={s}>{s}</li>)}
        </ol>
        <div className="mb-3 rounded bg-secondary px-2 py-1.5 font-mono text-xs select-all">{origin}</div>
        <label className="mb-1 block text-xs font-medium">ID client</label>
        <input value={clientId} onChange={(e) => setClientId(e.target.value.trim())} className="mb-3 w-full rounded border border-border bg-background px-2 py-1.5 text-sm" placeholder="Incolla qui l'ID client" />
        <label className="mb-1 block text-xs font-medium">Cartella di destinazione su {info.name}</label>
        <input value={folder} onChange={(e) => setFolder(e.target.value)} className="mb-4 w-full rounded border border-border bg-background px-2 py-1.5 text-sm" placeholder="Es. Foto/LoMa (vuoto = cartella principale)" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded px-3 py-1.5 text-sm hover:bg-accent">Annulla</button>
          <button
            disabled={!clientId}
            onClick={() => { setCloudCfg(kind, { clientId, folder }); onSaved(); }}
            className="rounded bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
          >Salva e carica</button>
        </div>
      </div>
    </div>
  );
}
