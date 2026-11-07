import { useEffect, useState } from "react";
import { Copy, Plus, Save, Trash2, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import icon from "@/assets/loma-prompt-icon.png.asset.json";
import { LOMA_PROMPTS, type LomaPrompt } from "./loma-prompts";
import { copyPhotoPrompt, sendPhotoPrompt, PROMPT_TARGETS, type PromptTarget } from "./prompt-share";

const KEY = "loma.viewer.prompts.v1";
export function LomaPromptDialog({ open, onClose, getPhoto, getPng, onText }: {
  open: boolean; onClose: () => void; getPhoto: (() => Promise<File>) | undefined; getPng: (() => Promise<File>) | undefined; onText: (text: string) => void;
}) {
  const [list, setList] = useState<LomaPrompt[]>(LOMA_PROMPTS);
  const [selected, setSelected] = useState("");
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(KEY) || "null");
      if (Array.isArray(saved) && saved.every(p => p && typeof p.id === "string" && typeof p.title === "string" && typeof p.text === "string")) setList(saved);
    } catch { /* retain original presets offline */ }
  }, []);
  const pick = (prompt?: LomaPrompt) => {
    setSelected(prompt?.id || ""); setTitle(prompt?.title || ""); setText(prompt?.text || ""); onText(prompt?.text || "");
  };
  const persist = (next: LomaPrompt[]) => {
    try { localStorage.setItem(KEY, JSON.stringify(next)); setList(next); return true; }
    catch { toast.error("Impossibile salvare i prompt su questo dispositivo"); return false; }
  };
  const save = () => {
    if (!title.trim() || !text.trim()) return;
    const prompt = { id: selected || crypto.randomUUID(), title: title.trim(), text };
    const next = list.some(p => p.id === selected) ? list.map(p => p.id === selected ? prompt : p) : [...list, prompt];
    if (persist(next)) { setSelected(prompt.id); onText(text); toast.success("Prompt salvato"); }
  };
  const send = async (target?: PromptTarget) => {
    setBusy(true);
    const id = toast.loading(target ? `Apro ${target.name}…` : "Copio foto e prompt…");
    try {
      const result = target ? await sendPhotoPrompt(target, text, getPhoto ? await getPhoto() : null, getPng) : await copyPhotoPrompt(text, getPng);
      if (result === "cancelled") toast.dismiss(id);
      else if (result === "prefill") toast.success("Prompt già inserito: incolla la foto (Cmd/Ctrl+V) nella chat.", { id, duration: 8000 });
      else if (result === "image") toast.success("Foto copiata: incollala nella chat, poi premi “Copia prompt”.", { id, duration: 30000, action: { label: "Copia prompt", onClick: () => void navigator.clipboard.writeText(text).then(() => toast.success("Prompt copiato: incollalo nella chat.", { duration: 1000 })) } });
      else if (result === "text") toast.message("Prompt completo copiato; allega la foto nell’app scelta.", { id, duration: 8000 });
      else toast.success(result === "both" ? "Foto e prompt copiati: incollali nella chat." : "Foto e prompt inviati all’app scelta.", { id, duration: 6000 });
    } catch { toast.error("Invio non riuscito: foto e prompt restano disponibili.", { id }); }
    finally { setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent aria-describedby={undefined} className="max-h-[90dvh] w-[calc(100%-1rem)] max-w-2xl gap-3 overflow-y-auto rounded-lg bg-toolbar p-4 sm:p-6">
      <DialogTitle>LOMA PROMPTS</DialogTitle>
      <Button variant="outline" className="h-16 justify-start gap-3" onClick={() => window.open("https://loma-prompt.lovable.app/", "_blank", "noopener")}>
        <img src={icon.url} alt="LoMa Prompt" className="h-12 w-12 rounded-full object-cover" />
        <span className="min-w-0 flex-1 truncate text-left">Apri l’app LoMa Prompt</span><ExternalLink className="h-4 w-4" />
      </Button>
      <div className="flex flex-wrap gap-2">
        {list.map(p => <Button key={p.id} variant={selected === p.id ? "secondary" : "outline"} aria-pressed={selected === p.id} className="h-auto min-h-10 max-w-full whitespace-normal text-left text-xs" disabled={busy} onClick={() => pick(p)}>{p.title}</Button>)}
        <Button variant="outline" disabled={busy} onClick={() => pick()}><Plus />Nuovo</Button>
        <Button variant="ghost" disabled={busy || !selected} onClick={() => pick()}>Deseleziona</Button>
      </div>
      <input aria-label="Titolo prompt" value={title} disabled={busy} onChange={e => setTitle(e.target.value)} placeholder="Titolo prompt" className="min-h-11 w-full rounded border border-input bg-background px-3 text-sm" />
      <textarea aria-label="Prompt completo" value={text} disabled={busy} onChange={e => { setText(e.target.value); onText(e.target.value); }} placeholder="Scrivi il prompt…" className="min-h-40 w-full resize-y select-text rounded border border-input bg-background p-3 text-sm leading-relaxed" />
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={busy || !title.trim() || !text.trim()} onClick={save}><Save />Salva modifiche</Button>
        <Button variant="ghost" disabled={busy || !selected} onClick={() => { if (persist(list.filter(p => p.id !== selected))) pick(); }}><Trash2 className="text-destructive" />Elimina</Button>
        <Button variant="outline" disabled={busy || !text.trim()} onClick={() => void send()}><Copy />Copia foto e prompt</Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {PROMPT_TARGETS.map(target => <Button key={target.name} variant="outline" className="h-12 px-1" disabled={busy || (!text.trim() && !getPhoto)} onClick={() => void send(target)}>{target.name}</Button>)}
      </div>
    </DialogContent>
  </Dialog>;
}