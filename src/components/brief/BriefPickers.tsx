import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowLeft, CheckCircle2, ExternalLink, ImagePlus, Loader2, Palette, Play, Sparkles, UserCircle2, X } from 'lucide-react';
import { useStore } from '../../store';
import { uploadSharedFile } from '../../lib/supabaseClient';
import type { CatalogAvatar, CatalogStyle } from '../../types';

export interface AvatarChoice {
  avatarId?: string | null;
  avatarName?: string | null;
  customText?: string | null;
  refUrl?: string | null;
}
export interface StyleChoice {
  styleId?: string | null;
  styleName?: string | null;
}

export const avatarChosen = (c: AvatarChoice) => Boolean(c.avatarId || c.customText?.trim() || c.refUrl);

/** Ventana grande para las galerías (Escape o clic fuera la cierran). */
function Sheet({ title, icon, onClose, children, footer }: { title: string; icon: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 animate-fadeIn" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}
        className="bg-surface-2 border border-line rounded-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-line bg-gradient-to-br from-accent/5 to-transparent">
          <h3 className="font-display text-xl font-bold flex items-center gap-2 min-w-0">{icon}<span className="truncate">{title}</span></h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-9 h-9 rounded-lg bg-surface-3 border border-line text-muted hover:text-text flex items-center justify-center"><X size={16} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <div className="px-5 py-3.5 border-t border-line bg-surface-3/40">{footer}</div>}
      </div>
    </div>
  );
}

// ============================ AVATAR ============================
export function AvatarPicker({ value, onChange, compact }: { value: AvatarChoice; onChange: (v: AvatarChoice) => void; compact?: boolean }) {
  const { clientCatalog } = useStore();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<'todos' | 'mujer' | 'hombre'>('todos');
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState(value.customText || '');
  const [ref, setRef] = useState(value.refUrl || '');
  const [uploading, setUploading] = useState(false);
  const [upErr, setUpErr] = useState<string | null>(null);

  const selected = value.avatarId ? clientCatalog.avatars.find(a => a.id === value.avatarId) || null : null;
  const list = useMemo(() => clientCatalog.avatars.filter(a => filter === 'todos' || a.gender === filter), [clientCatalog.avatars, filter]);
  const counts = { mujer: clientCatalog.avatars.filter(a => a.gender === 'mujer').length, hombre: clientCatalog.avatars.filter(a => a.gender === 'hombre').length };

  const pick = (a: CatalogAvatar) => {
    onChange({ avatarId: a.id, avatarName: a.name, customText: null, refUrl: null });
    setOpen(false);
  };
  const saveCustom = () => {
    if (!text.trim() && !ref.trim()) return;
    onChange({ avatarId: null, avatarName: null, customText: text.trim() || null, refUrl: ref.trim() || null });
    setOpen(false);
  };

  return (
    <>
      <div className={`flex items-center gap-3 bg-surface-3/60 border rounded-xl p-2.5 ${avatarChosen(value) ? 'border-accent/40' : 'border-line border-dashed'}`}>
        <div className={`${compact ? 'w-11' : 'w-14'} aspect-[9/16] rounded-lg bg-surface-3 border border-line overflow-hidden flex items-center justify-center shrink-0`}>
          {selected?.imageUrl ? <img src={selected.imageUrl} alt={selected.name} className="w-full h-full object-cover" />
            : value.refUrl ? <img src={value.refUrl} alt="Referencia" className="w-full h-full object-cover" />
            : <UserCircle2 size={22} className="text-muted-2" />}
        </div>
        <div className="flex-1 min-w-0">
          {selected ? <><p className="text-sm font-semibold truncate">{selected.name}</p><p className="text-[11px] text-muted-2 capitalize">{selected.gender || 'Avatar'} de la galería SENDA</p></>
            : value.customText || value.refUrl ? <><p className="text-sm font-semibold">Avatar propio</p><p className="text-[11px] text-muted-2 line-clamp-2">{value.customText || 'Con imagen de referencia'}</p></>
            : <p className="text-sm text-muted-2">Sin avatar elegido</p>}
        </div>
        <button type="button" onClick={() => setOpen(true)}
          className="px-3.5 py-2 rounded-lg bg-accent text-on-accent text-xs font-semibold hover:bg-accent-strong transition-colors shrink-0">
          {avatarChosen(value) ? 'Cambiar' : 'Elegir avatar'}
        </button>
      </div>

      {open && (
        <Sheet title="Galería de avatares SENDA" icon={<UserCircle2 size={20} className="text-accent" />} onClose={() => setOpen(false)}
          footer={
            <div className="space-y-3">
              <button type="button" onClick={() => setCustom(c => !c)}
                className="text-xs text-muted hover:text-accent flex items-center gap-1.5 transition-colors">
                <Sparkles size={13} /> {custom ? 'Ocultar' : 'Quiero otro estilo de avatar: describirlo o poner una imagen de referencia'}
              </button>
              {custom && (
                <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 animate-fadeIn">
                  <div className="space-y-2">
                    <textarea value={text} onChange={e => setText(e.target.value)} rows={2} placeholder="Descríbelo: edad, aspecto, ropa, ambiente… (ej. mujer de 28 años, estilo casual, pelo oscuro)"
                      className="w-full bg-surface-3 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-2 resize-none" />
                    <div className="flex gap-2">
                      <input value={ref} onChange={e => setRef(e.target.value)} placeholder="Imagen de referencia (pega el enlace)"
                        className="flex-1 bg-surface-3 border border-line rounded-xl px-3 py-2 text-xs outline-none focus:border-accent placeholder:text-muted-2" />
                      <label className={`px-3 rounded-xl bg-surface-3 border border-line text-accent text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:border-accent/50 ${uploading ? 'opacity-60 pointer-events-none' : ''}`}>
                        {uploading ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />} Subir
                        <input type="file" accept="image/*" className="hidden" onChange={async e => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          setUploading(true); setUpErr(null);
                          try { setRef(await uploadSharedFile(f, 'brief/avatar-refs')); } catch { setUpErr('No se pudo subir la imagen; pega un enlace.'); }
                          finally { setUploading(false); e.target.value = ''; }
                        }} />
                      </label>
                    </div>
                    {upErr && <p className="text-[11px] text-red-400">{upErr}</p>}
                  </div>
                  <button type="button" onClick={saveCustom} disabled={!text.trim() && !ref.trim()}
                    className="self-end px-5 py-2.5 rounded-xl bg-accent text-on-accent text-xs font-semibold disabled:opacity-40">Usar este avatar</button>
                </div>
              )}
            </div>
          }>
          {clientCatalog.avatars.length === 0 ? (
            <div className="text-center py-14">
              <UserCircle2 size={36} className="text-muted-2 mx-auto mb-3" />
              <p className="font-display font-semibold">La galería se está preparando</p>
              <p className="text-xs text-muted mt-1">Mientras tanto usa “Quiero otro estilo de avatar” y descríbelo abajo.</p>
            </div>
          ) : (
            <>
              <div className="flex gap-1.5 mb-4">
                {([['todos', `Todos (${clientCatalog.avatars.length})`], ['mujer', `Mujeres (${counts.mujer})`], ['hombre', `Hombres (${counts.hombre})`]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setFilter(k)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === k ? 'bg-accent text-on-accent' : 'bg-surface-3 border border-line text-muted hover:text-text'}`}>{l}</button>
                ))}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
                {list.map(a => {
                  const on = value.avatarId === a.id;
                  return (
                    <button key={a.id} type="button" onClick={() => pick(a)}
                      className={`group relative text-left rounded-xl border overflow-hidden transition-all hover:-translate-y-0.5 ${on ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-accent/50'}`}>
                      <div className="aspect-[9/16] bg-surface-3 flex items-center justify-center">
                        {a.imageUrl ? <img src={a.imageUrl} alt={a.name} loading="lazy" className="w-full h-full object-cover" /> : <UserCircle2 size={36} className="text-muted-2" />}
                      </div>
                      <div className="px-3 py-2 bg-surface-2">
                        <p className="text-sm font-semibold truncate">{a.name}</p>
                        {a.description && <p className="text-[11px] text-muted-2 line-clamp-2">{a.description}</p>}
                      </div>
                      {on && <CheckCircle2 size={22} className="absolute top-2 right-2 text-accent bg-surface rounded-full" />}
                    </button>
                  );
                })}
              </div>
              {list.length === 0 && <p className="text-sm text-muted text-center py-10">No hay avatares en este filtro.</p>}
            </>
          )}
        </Sheet>
      )}
    </>
  );
}

// ============================ ESTILO ============================
const playable = (url: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url) || url.includes('/storage/v1/object/');

export function StylePicker({ value, onChange, compact }: { value: StyleChoice; onChange: (v: StyleChoice) => void; compact?: boolean }) {
  const { clientCatalog } = useStore();
  const [open, setOpen] = useState(false);
  const [cat, setCat] = useState<CatalogStyle | null>(null);

  const selected = value.styleId ? clientCatalog.styles.find(s => s.id === value.styleId) || null : null;
  const close = () => { setOpen(false); setCat(null); };
  const videosOf = (s: CatalogStyle) => [...(s.videos || []), ...(s.exampleUrl ? [{ id: 'ex', name: 'Video de ejemplo', url: s.exampleUrl }] : [])];

  return (
    <>
      <div className={`flex items-center gap-3 bg-surface-3/60 border rounded-xl p-2.5 ${value.styleId ? 'border-accent/40' : 'border-line border-dashed'}`}>
        <div className={`${compact ? 'w-11 h-11' : 'w-14 h-14'} rounded-lg bg-surface-3 border border-line flex items-center justify-center shrink-0`}>
          <Palette size={20} className={value.styleId ? 'text-accent' : 'text-muted-2'} />
        </div>
        <div className="flex-1 min-w-0">
          {selected ? <><p className="text-sm font-semibold truncate">{selected.name}</p><p className="text-[11px] text-muted-2 line-clamp-1">{selected.description || 'Estilo de edición SENDA'}</p></>
            : <p className="text-sm text-muted-2">Sin estilo elegido</p>}
        </div>
        <button type="button" onClick={() => setOpen(true)}
          className="px-3.5 py-2 rounded-lg bg-accent text-on-accent text-xs font-semibold hover:bg-accent-strong transition-colors shrink-0">
          {value.styleId ? 'Cambiar' : 'Elegir estilo'}
        </button>
      </div>

      {open && (
        <Sheet title={cat ? cat.name : 'Estilos de edición'} icon={cat ? <Play size={19} className="text-accent" /> : <Palette size={20} className="text-accent" />} onClose={close}
          footer={cat ? (
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setCat(null)} className="text-xs text-muted hover:text-text flex items-center gap-1.5"><ArrowLeft size={14} /> Ver todos los estilos</button>
              <button type="button" onClick={() => { onChange({ styleId: cat.id, styleName: cat.name }); close(); }}
                className="px-5 py-2.5 rounded-xl bg-accent text-on-accent text-sm font-semibold hover:bg-accent-strong flex items-center gap-2">
                <CheckCircle2 size={15} /> {value.styleId === cat.id ? 'Estilo elegido' : 'Elegir este estilo'}
              </button>
            </div>
          ) : undefined}>
          {clientCatalog.styles.length === 0 ? (
            <div className="text-center py-14">
              <Palette size={36} className="text-muted-2 mx-auto mb-3" />
              <p className="font-display font-semibold">Aún no hay estilos publicados</p>
              <p className="text-xs text-muted mt-1">Cuéntanos el estilo que buscas en las notas para el equipo.</p>
            </div>
          ) : !cat ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {clientCatalog.styles.map(s => {
                const n = videosOf(s).length;
                const on = value.styleId === s.id;
                return (
                  <button key={s.id} type="button" onClick={() => setCat(s)}
                    className={`text-left rounded-2xl border p-5 transition-all hover:-translate-y-0.5 ${on ? 'bg-accent/10 border-accent ring-1 ring-accent/30' : 'bg-surface-3/60 border-line hover:border-accent/50'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="w-11 h-11 rounded-xl bg-accent-dim text-accent flex items-center justify-center"><Palette size={20} /></div>
                      {on && <CheckCircle2 size={20} className="text-accent" />}
                    </div>
                    <p className="font-display text-lg font-bold mt-3">{s.name}</p>
                    <p className="text-xs text-muted mt-1 leading-snug line-clamp-3">{s.description || 'Estilo de edición SENDA.'}</p>
                    <p className="text-[11px] font-semibold text-accent mt-3 flex items-center gap-1"><Play size={12} /> {n ? `Ver ${n} video${n === 1 ? '' : 's'}` : 'Ver estilo'}</p>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="space-y-4">
              {cat.description && <p className="text-sm text-muted leading-relaxed bg-surface-3/60 border border-line rounded-xl px-4 py-3">{cat.description}</p>}
              {videosOf(cat).length === 0 ? (
                <p className="text-sm text-muted-2 text-center py-8">Esta categoría aún no tiene videos de ejemplo, pero puedes elegirla igual.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
                  {videosOf(cat).map(v => (
                    <div key={v.id} className="rounded-xl border border-line overflow-hidden bg-black">
                      {playable(v.url)
                        ? <video src={v.url} controls preload="metadata" playsInline className="w-full aspect-[9/16] object-cover" />
                        : <a href={v.url} target="_blank" rel="noreferrer" className="w-full aspect-[9/16] bg-surface-3 flex flex-col items-center justify-center gap-2 text-accent text-xs font-semibold"><ExternalLink size={22} /> Ver video</a>}
                      <p className="text-[11px] px-2.5 py-1.5 bg-surface-2 truncate">{v.name}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}
