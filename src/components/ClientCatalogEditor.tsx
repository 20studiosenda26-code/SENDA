import { useState } from 'react';
import { ExternalLink, ImagePlus, Loader2, Palette, Plus, Trash2, UserCircle2 } from 'lucide-react';
import { useStore } from '../store';
import { uploadSharedFile } from '../lib/supabaseClient';

/** Catálogo que ven los clientes al armar su brief: avatares y estilos de edición. */
export function ClientCatalogEditor() {
  const { clientCatalog, updateClientCatalog } = useStore();
  const [aName, setAName] = useState('');
  const [aDesc, setADesc] = useState('');
  const [aImage, setAImage] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sName, setSName] = useState('');
  const [sDesc, setSDesc] = useState('');
  const [sUrl, setSUrl] = useState('');

  const addAvatar = () => {
    if (!aName.trim()) return;
    updateClientCatalog({
      ...clientCatalog,
      avatars: [...clientCatalog.avatars, { id: `av-${Date.now()}`, name: aName.trim(), description: aDesc.trim(), imageUrl: aImage }],
    });
    setAName(''); setADesc(''); setAImage(null);
  };
  const addStyle = () => {
    if (!sName.trim()) return;
    updateClientCatalog({
      ...clientCatalog,
      styles: [...clientCatalog.styles, { id: `st-${Date.now()}`, name: sName.trim(), description: sDesc.trim(), exampleUrl: sUrl.trim() || null }],
    });
    setSName(''); setSDesc(''); setSUrl('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Avatares */}
      <div className="bg-surface-3/60 border border-line rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-1.5"><UserCircle2 size={15} className="text-accent" /> Avatares ({clientCatalog.avatars.length})</p>
        <div className="grid grid-cols-3 gap-2">
          {clientCatalog.avatars.map(a => (
            <div key={a.id} className="relative group rounded-lg border border-line overflow-hidden bg-surface-2">
              <div className="aspect-[4/5] bg-surface-3 flex items-center justify-center">
                {a.imageUrl ? <img src={a.imageUrl} alt={a.name} className="w-full h-full object-cover" /> : <UserCircle2 size={26} className="text-muted-2" />}
              </div>
              <p className="text-[11px] font-medium px-2 py-1 truncate">{a.name}</p>
              <button type="button" title="Quitar avatar"
                onClick={() => updateClientCatalog({ ...clientCatalog, avatars: clientCatalog.avatars.filter(x => x.id !== a.id) })}
                className="absolute top-1 right-1 w-6 h-6 rounded-md bg-black/60 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          {clientCatalog.avatars.length === 0 && <p className="col-span-3 text-[11px] text-muted-2">Sin avatares. Sin catálogo, el cliente lo describe con texto.</p>}
        </div>
        <div className="space-y-2 pt-2 border-t border-line">
          <div className="flex gap-2">
            <label className={`w-16 h-16 rounded-lg border border-dashed border-line flex items-center justify-center cursor-pointer overflow-hidden shrink-0 hover:border-accent ${uploading ? 'opacity-60' : ''}`} title="Foto del avatar">
              {uploading ? <Loader2 size={16} className="animate-spin text-accent" /> : aImage ? <img src={aImage} alt="" className="w-full h-full object-cover" /> : <ImagePlus size={18} className="text-muted-2" />}
              <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={async e => {
                const f = e.target.files?.[0];
                if (!f) return;
                setUploading(true);
                try { setAImage(await uploadSharedFile(f, 'catalog/avatars')); } finally { setUploading(false); e.target.value = ''; }
              }} />
            </label>
            <div className="flex-1 space-y-2">
              <input value={aName} onChange={e => setAName(e.target.value)} placeholder="Nombre del avatar"
                className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent placeholder:text-muted-2" />
              <input value={aDesc} onChange={e => setADesc(e.target.value)} placeholder="Descripción corta (opcional)"
                className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent placeholder:text-muted-2" />
            </div>
          </div>
          <button type="button" onClick={addAvatar} disabled={!aName.trim() || uploading}
            className="w-full py-2 rounded-lg bg-accent text-on-accent text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-40">
            <Plus size={13} /> Agregar avatar
          </button>
        </div>
      </div>

      {/* Estilos */}
      <div className="bg-surface-3/60 border border-line rounded-xl p-4 space-y-3">
        <p className="text-sm font-semibold flex items-center gap-1.5"><Palette size={15} className="text-accent" /> Estilos de edición ({clientCatalog.styles.length})</p>
        <ul className="space-y-1.5">
          {clientCatalog.styles.map(st => (
            <li key={st.id} className="flex items-start gap-2 bg-surface-2 border border-line rounded-lg px-3 py-2">
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold">{st.name}</p>
                {st.description && <p className="text-[11px] text-muted-2 line-clamp-2">{st.description}</p>}
              </div>
              {st.exampleUrl && <a href={st.exampleUrl} target="_blank" rel="noreferrer" title="Ver ejemplo" className="text-muted hover:text-accent"><ExternalLink size={13} /></a>}
              <button type="button" title="Quitar estilo"
                onClick={() => updateClientCatalog({ ...clientCatalog, styles: clientCatalog.styles.filter(x => x.id !== st.id) })}
                className="text-muted-2 hover:text-red-400"><Trash2 size={13} /></button>
            </li>
          ))}
          {clientCatalog.styles.length === 0 && <p className="text-[11px] text-muted-2">Sin estilos todavía.</p>}
        </ul>
        <div className="space-y-2 pt-2 border-t border-line">
          <input value={sName} onChange={e => setSName(e.target.value)} placeholder="Nombre (ej. Dinámico UGC, Minimal premium)"
            className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent placeholder:text-muted-2" />
          <textarea value={sDesc} onChange={e => setSDesc(e.target.value)} rows={2} placeholder="Qué incluye: ritmo, subtítulos, transiciones, música…"
            className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent placeholder:text-muted-2 resize-none" />
          <input value={sUrl} onChange={e => setSUrl(e.target.value)} placeholder="Enlace a un video de ejemplo (opcional)"
            className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-xs outline-none focus:border-accent placeholder:text-muted-2" />
          <button type="button" onClick={addStyle} disabled={!sName.trim()}
            className="w-full py-2 rounded-lg bg-accent text-on-accent text-xs font-semibold flex items-center justify-center gap-1 disabled:opacity-40">
            <Plus size={13} /> Agregar estilo
          </button>
        </div>
      </div>
    </div>
  );
}
