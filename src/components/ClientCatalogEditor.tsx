import { useState } from 'react';
import { ChevronDown, ChevronUp, ImagePlus, Loader2, Palette, Plus, Trash2, UserCircle2, Video, X } from 'lucide-react';
import { useStore } from '../store';
import { uploadSharedFile } from '../lib/supabaseClient';
import type { CatalogAvatar } from '../types';

const GENDERS: { key: NonNullable<CatalogAvatar['gender']>; label: string }[] = [
  { key: 'mujer', label: 'Mujer' },
  { key: 'hombre', label: 'Hombre' },
  { key: 'otro', label: 'Otro' },
];

/** Catálogo que ven los clientes al armar su brief: galería de avatares (9:16) y estilos de edición por categoría. */
export function ClientCatalogEditor() {
  const { clientCatalog, updateClientCatalog } = useStore();

  // ---------- Avatares ----------
  const [aGender, setAGender] = useState<NonNullable<CatalogAvatar['gender']>>('mujer');
  const [aBg, setABg] = useState('');
  const [aBusy, setABusy] = useState(false);
  const [aMsg, setAMsg] = useState<string | null>(null);

  // Se pueden subir varias imágenes de una vez: cada una queda como un avatar (el nombre sale del archivo)
  const addAvatars = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setABusy(true);
    setAMsg(null);
    const added: CatalogAvatar[] = [];
    let failed = 0;
    for (const f of Array.from(files)) {
      try {
        const url = await uploadSharedFile(f, 'catalog/avatars');
        added.push({
          id: `av-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim() || 'Avatar',
          imageUrl: url, gender: aGender, background: aBg.trim() || undefined,
        });
      } catch { failed++; }
    }
    if (added.length) updateClientCatalog({ ...clientCatalog, avatars: [...clientCatalog.avatars, ...added] });
    setAMsg(failed ? `${added.length} subidos, ${failed} fallaron` : `${added.length} avatar(es) agregado(s)`);
    setABusy(false);
  };
  const patchAvatar = (id: string, patch: Partial<CatalogAvatar>) =>
    updateClientCatalog({ ...clientCatalog, avatars: clientCatalog.avatars.map(a => (a.id === id ? { ...a, ...patch } : a)) });

  // ---------- Estilos (categorías con videos) ----------
  const [sName, setSName] = useState('');
  const [sDesc, setSDesc] = useState('');
  const [openStyle, setOpenStyle] = useState<string | null>(null);
  const [vBusy, setVBusy] = useState<string | null>(null);
  const [vMsg, setVMsg] = useState<string | null>(null);

  const addStyle = () => {
    if (!sName.trim()) return;
    const id = `st-${Date.now()}`;
    updateClientCatalog({ ...clientCatalog, styles: [...clientCatalog.styles, { id, name: sName.trim(), description: sDesc.trim(), videos: [] }] });
    setSName(''); setSDesc(''); setOpenStyle(id);
  };
  const addVideos = async (styleId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setVBusy(styleId);
    setVMsg(null);
    const added: { id: string; name: string; url: string }[] = [];
    let failed = 0;
    for (const f of Array.from(files)) {
      try {
        const url = await uploadSharedFile(f, `catalog/styles/${styleId}`);
        added.push({ id: `sv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: f.name.replace(/\.[^.]+$/, ''), url });
      } catch { failed++; }
    }
    if (added.length) {
      updateClientCatalog({
        ...clientCatalog,
        styles: clientCatalog.styles.map(s => (s.id === styleId ? { ...s, videos: [...(s.videos || []), ...added] } : s)),
      });
    }
    setVMsg(failed ? `${added.length} subidos, ${failed} fallaron (si es muy pesado, súbelo a Drive y pega el enlace)` : `${added.length} video(s) agregado(s)`);
    setVBusy(null);
  };
  const [linkInput, setLinkInput] = useState('');
  const addVideoLink = (styleId: string) => {
    const url = linkInput.trim();
    if (!/^https?:\/\/\S+\.\S+/.test(url)) return;
    updateClientCatalog({
      ...clientCatalog,
      styles: clientCatalog.styles.map(s => (s.id === styleId ? { ...s, videos: [...(s.videos || []), { id: `sv-${Date.now()}`, name: `Video ${(s.videos?.length || 0) + 1}`, url }] } : s)),
    });
    setLinkInput('');
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {/* Galería de avatares */}
      <div className="bg-surface-3/60 border border-line rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <UserCircle2 size={15} className="text-accent" /> Galería de avatares ({clientCatalog.avatars.length})
        </p>
        <p className="text-[11px] text-muted-2 leading-snug">
          Imágenes verticales <strong className="text-text">9:16</strong> con el avatar y todos sus ángulos, hechas con IA sobre fondo blanco, azul o el de SENDA.
          Puedes subir varias a la vez; el nombre sale del archivo y lo puedes cambiar después.
        </p>

        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
          {clientCatalog.avatars.map(a => (
            <div key={a.id} className="relative group rounded-lg border border-line overflow-hidden bg-surface-2">
              <div className="aspect-[9/16] bg-surface-3 flex items-center justify-center">
                {a.imageUrl ? <img src={a.imageUrl} alt={a.name} loading="lazy" className="w-full h-full object-cover" /> : <UserCircle2 size={26} className="text-muted-2" />}
              </div>
              <div className="p-1.5 space-y-1">
                <input value={a.name} onChange={e => patchAvatar(a.id, { name: e.target.value })}
                  className="w-full bg-transparent text-[11px] font-medium outline-none focus:text-accent truncate" title="Nombre del avatar" />
                <select value={a.gender || 'otro'} onChange={e => patchAvatar(a.id, { gender: e.target.value as CatalogAvatar['gender'] })}
                  className="w-full bg-surface-3 border border-line rounded text-[10px] py-0.5 text-muted outline-none">
                  {GENDERS.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select>
              </div>
              <button type="button" title="Quitar avatar"
                onClick={() => { if (window.confirm(`¿Quitar a "${a.name}" de la galería?`)) updateClientCatalog({ ...clientCatalog, avatars: clientCatalog.avatars.filter(x => x.id !== a.id) }); }}
                className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {clientCatalog.avatars.length === 0 && (
            <p className="col-span-full text-[11px] text-muted-2 bg-surface-2 border border-dashed border-line rounded-lg px-3 py-4 text-center">
              La galería está vacía. Sube las imágenes 9:16 y los clientes podrán elegir. Mientras tanto describen su avatar con texto.
            </p>
          )}
        </div>

        <div className="space-y-2 pt-3 border-t border-line">
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-[11px] text-muted">Las que subas ahora son:</span>
            {GENDERS.map(g => (
              <button key={g.key} type="button" onClick={() => setAGender(g.key)}
                className={`text-[11px] px-2.5 py-1 rounded-md border transition-colors ${aGender === g.key ? 'bg-accent text-on-accent border-accent' : 'bg-surface-2 border-line text-muted hover:text-text'}`}>{g.label}</button>
            ))}
            <input value={aBg} onChange={e => setABg(e.target.value)} placeholder="Fondo (ej. Blanco, Azul, SENDA)"
              className="flex-1 min-w-[140px] bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-[11px] outline-none focus:border-accent placeholder:text-muted-2" />
          </div>
          <label className={`w-full py-3 rounded-lg border border-dashed border-accent/50 text-accent text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-accent/5 transition-colors ${aBusy ? 'opacity-60 pointer-events-none' : ''}`}>
            {aBusy ? <><Loader2 size={14} className="animate-spin" /> Subiendo…</> : <><ImagePlus size={15} /> Subir imágenes de avatares (puedes elegir varias)</>}
            <input type="file" accept="image/*" multiple className="hidden" disabled={aBusy} onChange={e => { void addAvatars(e.target.files); e.target.value = ''; }} />
          </label>
          {aMsg && <p className="text-[11px] text-mint">{aMsg}</p>}
        </div>
      </div>

      {/* Estilos de edición por categorías */}
      <div className="bg-surface-3/60 border border-line rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-1.5">
          <Palette size={15} className="text-accent" /> Estilos de edición ({clientCatalog.styles.length})
        </p>
        <p className="text-[11px] text-muted-2 leading-snug">
          Cada estilo es una <strong className="text-text">categoría</strong> con varios videos de ejemplo subidos a la nube. El cliente solo ve los videos cuando abre la categoría.
        </p>

        <ul className="space-y-2">
          {clientCatalog.styles.map(st => {
            const open = openStyle === st.id;
            const vids = st.videos || [];
            return (
              <li key={st.id} className="bg-surface-2 border border-line rounded-lg overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button type="button" onClick={() => setOpenStyle(open ? null : st.id)} className="flex-1 min-w-0 flex items-center gap-2 text-left">
                    {open ? <ChevronUp size={14} className="text-accent shrink-0" /> : <ChevronDown size={14} className="text-muted-2 shrink-0" />}
                    <span className="min-w-0">
                      <span className="text-xs font-semibold block truncate">{st.name}</span>
                      <span className="text-[10px] text-muted-2">{vids.length} video(s)</span>
                    </span>
                  </button>
                  <button type="button" title="Quitar categoría"
                    onClick={() => { if (window.confirm(`¿Quitar el estilo "${st.name}" y sus videos de la lista?`)) updateClientCatalog({ ...clientCatalog, styles: clientCatalog.styles.filter(x => x.id !== st.id) }); }}
                    className="text-muted-2 hover:text-red-400"><Trash2 size={13} /></button>
                </div>
                {open && (
                  <div className="px-3 pb-3 space-y-2.5 border-t border-line pt-2.5 animate-fadeIn">
                    <input value={st.name} onChange={e => updateClientCatalog({ ...clientCatalog, styles: clientCatalog.styles.map(x => x.id === st.id ? { ...x, name: e.target.value } : x) })}
                      className="w-full bg-surface-3 border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent" />
                    <textarea value={st.description} rows={3} placeholder="Descripción detallada: ritmo, subtítulos, transiciones, música, color…"
                      onChange={e => updateClientCatalog({ ...clientCatalog, styles: clientCatalog.styles.map(x => x.id === st.id ? { ...x, description: e.target.value } : x) })}
                      className="w-full bg-surface-3 border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent resize-none placeholder:text-muted-2" />
                    {vids.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {vids.map(v => (
                          <div key={v.id} className="relative group rounded-lg overflow-hidden border border-line bg-black">
                            <video src={v.url} preload="metadata" controls className="w-full aspect-[9/16] object-cover" />
                            <p className="text-[10px] px-2 py-1 bg-surface-3 truncate">{v.name}</p>
                            <button type="button" title="Quitar video"
                              onClick={() => updateClientCatalog({ ...clientCatalog, styles: clientCatalog.styles.map(x => x.id === st.id ? { ...x, videos: (x.videos || []).filter(y => y.id !== v.id) } : x) })}
                              className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/70 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center"><X size={12} /></button>
                          </div>
                        ))}
                      </div>
                    )}
                    <label className={`w-full py-2.5 rounded-lg border border-dashed border-accent/50 text-accent text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer hover:bg-accent/5 ${vBusy === st.id ? 'opacity-60 pointer-events-none' : ''}`}>
                      {vBusy === st.id ? <><Loader2 size={14} className="animate-spin" /> Subiendo…</> : <><Video size={14} /> Subir videos de este estilo</>}
                      <input type="file" accept="video/*" multiple className="hidden" disabled={vBusy === st.id} onChange={e => { void addVideos(st.id, e.target.files); e.target.value = ''; }} />
                    </label>
                    <div className="flex gap-2">
                      <input value={linkInput} onChange={e => setLinkInput(e.target.value)} placeholder="…o pega un enlace de video (Drive, YouTube)"
                        className="flex-1 bg-surface-3 border border-line rounded-lg px-3 py-1.5 text-[11px] outline-none focus:border-accent placeholder:text-muted-2" />
                      <button type="button" onClick={() => addVideoLink(st.id)} className="px-3 rounded-lg bg-surface-3 border border-line text-accent text-xs font-semibold hover:border-accent/50"><Plus size={13} /></button>
                    </div>
                    {vMsg && <p className="text-[11px] text-mint">{vMsg}</p>}
                  </div>
                )}
              </li>
            );
          })}
          {clientCatalog.styles.length === 0 && <p className="text-[11px] text-muted-2 bg-surface-2 border border-dashed border-line rounded-lg px-3 py-4 text-center">Sin estilos todavía. Crea el primero (por ejemplo “Estilo Vidrio”).</p>}
        </ul>

        <div className="space-y-2 pt-3 border-t border-line">
          <input value={sName} onChange={e => setSName(e.target.value)} placeholder="Nombre de la categoría (ej. Estilo Vidrio)"
            className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent placeholder:text-muted-2" />
          <textarea value={sDesc} onChange={e => setSDesc(e.target.value)} rows={2} placeholder="Qué incluye: ritmo, subtítulos, transiciones, música…"
            className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent placeholder:text-muted-2 resize-none" />
          <button type="button" onClick={addStyle} disabled={!sName.trim()}
            className="w-full py-2 rounded-lg bg-accent text-on-accent text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-40">
            <Plus size={13} /> Crear categoría de estilo
          </button>
        </div>
      </div>
    </div>
  );
}
