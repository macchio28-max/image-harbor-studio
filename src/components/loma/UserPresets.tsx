import { useEffect, useState } from 'react';
import { BookmarkPlus, Star, Trash2, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { type Adjust } from './develop';
import { applyPreset, presetValues, readPresets, PRESET_KEY, type UserPreset } from './user-presets';

export function UserPresets({ adjust, onApply, disabled }: { adjust: Adjust; onApply: (a: Adjust) => void; disabled: boolean }) {
  const [presets, setPresets] = useState<UserPreset[]>([]);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  useEffect(() => { setPresets(readPresets(localStorage)); }, []);
  const save = (next: UserPreset[]) => {
    try { localStorage.setItem(PRESET_KEY, JSON.stringify(next)); setPresets(next); return true; }
    catch { toast.error('Impossibile salvare i preset sul dispositivo.'); return false; }
  };
  return <section className="shrink-0 border-t border-border px-3 py-2 space-y-2">
    <div className="flex items-center gap-1">
      <span className="flex-1 text-xs font-medium">Preset personali</span>
      <Button size="icon" variant={onlyFavorites ? 'secondary' : 'ghost'} title="Solo preferiti" aria-label="Solo preferiti" onClick={() => setOnlyFavorites(v => !v)} className="h-7 w-7"><Star className={onlyFavorites ? 'fill-primary text-primary' : ''} /></Button>
      <Button size="icon" variant="ghost" title="Salva regolazioni come preset" aria-label="Salva regolazioni come preset" disabled={disabled} onClick={() => setSaving(v => !v)} className="h-7 w-7"><BookmarkPlus /></Button>
    </div>
    {saving && <form className="flex gap-1" onSubmit={e => {
      e.preventDefault(); if (!name.trim()) return;
      const existing = presets.find(p => p.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase());
      const p = { id: existing?.id ?? crypto.randomUUID(), name: name.trim(), favorite: existing?.favorite ?? false, values: presetValues(adjust) };
      if (save(existing ? presets.map(x => x.id === p.id ? p : x) : [...presets, p])) { setSaving(false); setName(''); toast.success('Preset salvato', { duration: 1000 }); }
    }}>
      <input aria-label="Nome preset" className="sel min-w-0" maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="Nome preset" autoFocus />
      <Button size="icon" type="submit" title="Salva preset" disabled={!name.trim() || disabled} className="h-8 w-8 shrink-0"><Check /></Button>
      <Button size="icon" variant="ghost" title="Annulla preset" onClick={() => setSaving(false)} className="h-8 w-8 shrink-0"><X /></Button>
    </form>}
    <div className="max-h-28 overflow-y-auto space-y-1">
      {presets.filter(p => !onlyFavorites || p.favorite).sort((a,b) => Number(b.favorite) - Number(a.favorite)).map(p => <div key={p.id} className="flex items-center gap-1">
        <Button size="sm" variant="secondary" className="min-w-0 flex-1 justify-start" disabled={disabled} onClick={() => onApply(applyPreset(adjust, p))}><span className="truncate">{p.name}</span></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title={`Preferito: ${p.name}`} aria-label={`Preferito: ${p.name}`} aria-pressed={p.favorite} onClick={() => save(presets.map(x => x.id === p.id ? { ...x, favorite: !x.favorite } : x))}><Star className={p.favorite ? 'fill-primary text-primary' : ''} /></Button>
        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title={`Elimina preset: ${p.name}`} aria-label={`Elimina preset: ${p.name}`} onClick={() => save(presets.filter(x => x.id !== p.id))}><Trash2 /></Button>
      </div>)}
    </div>
  </section>;
}