import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { useAuth } from '../lib/auth';
import type { Brand, Order, OrderReference, Video } from '../types';
import {
  ArrowRight, CheckCircle2, Clock, ExternalLink, Film, Link2, Lock, MessageSquare, Palette,
  PlayCircle, Plus, RefreshCw, Save, Sparkles, StickyNote, Trash2, UserCircle2,
} from 'lucide-react';

const isDelivered = (v: Video) => Boolean(v.publishedToClient || v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente');
const toReview = (v: Video) => isDelivered(v) && v.qc !== 'aprobado_cliente' && v.qc !== 'correcciones';
const briefLocked = (o: Order) => Boolean(o.clipperId);

function brandOf(order: Order, brands: Brand[]): Brand | undefined {
  return brands.find(b => b.id === `brand-${order.id}`) || brands.find(b => b.videos.some(v => v.orderId === order.id));
}

function SyncBadge() {
  const { clientPendingCount } = useStore();
  if (clientPendingCount === 0) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-amber bg-amber-dim border border-amber/30 rounded-full px-2.5 py-1" title="Tus cambios ya se ven aquí; el equipo SENDA los recibe en cuanto se conecta">
      <RefreshCw size={11} className="animate-spin" /> Enviando {clientPendingCount} cambio(s) a SENDA
    </span>
  );
}

// =====================================================================
// INICIO DEL CLIENTE
// =====================================================================
export function ClientHome() {
  const { orders, brands, setView, clientViewReady } = useStore();
  const { user } = useAuth();
  const allVideos = brands.flatMap(b => b.videos);
  const pendingReview = allVideos.filter(toReview).length;
  const approved = allVideos.filter(v => v.qc === 'aprobado_cliente').length;
  const inCorrection = allVideos.filter(v => isDelivered(v) && v.qc === 'correcciones').length;
  const nextDelivery = orders
    .filter(o => o.deliveryDate && o.status !== 'finalizado')
    .sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate))[0];
  const briefsMissing = orders.filter(o => !o.briefConfirmedAt && !briefLocked(o));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6 animate-fadeIn">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-wider text-accent">Portal de clientes SENDA</p>
          <h2 className="font-display text-3xl font-bold mt-1">Hola, {user?.name?.split(' ')[0] || 'bienvenido'}</h2>
          <p className="text-sm text-muted mt-1">Aquí ves tus proyectos, revisas tus videos y nos dejas tu feedback con el segundo exacto.</p>
        </div>
        <SyncBadge />
      </div>

      {!clientViewReady ? (
        <div className="bg-surface-2 border border-line rounded-2xl p-10 text-center text-sm text-muted">Cargando tus proyectos…</div>
      ) : orders.length === 0 ? (
        <div className="bg-surface-2 border border-dashed border-line rounded-3xl py-16 px-6 text-center">
          <Sparkles size={30} className="text-accent mx-auto mb-3" />
          <p className="font-display text-lg font-semibold">Aún no tienes proyectos</p>
          <p className="text-sm text-muted mt-1 max-w-md mx-auto">Cuando el equipo SENDA vincule tu pedido a esta cuenta, aparecerá aquí para que elijas avatar, estilo y referencias.</p>
          <button type="button" onClick={() => setView('chat')} className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold bg-accent text-on-accent rounded-xl px-4 py-2.5">
            <MessageSquare size={14} /> Escribir a SENDA
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi icon={Film} label="Proyectos" value={orders.length} tone="accent" />
            <Kpi icon={PlayCircle} label="Por revisar" value={pendingReview} tone="amber" onClick={pendingReview > 0 ? () => setView('revision') : undefined} />
            <Kpi icon={RefreshCw} label="En corrección" value={inCorrection} tone="violet" />
            <Kpi icon={CheckCircle2} label="Aprobados" value={approved} tone="mint" />
          </div>

          {(pendingReview > 0 || briefsMissing.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {pendingReview > 0 && (
                <button type="button" onClick={() => setView('revision')}
                  className="text-left bg-accent/10 border border-accent/40 rounded-2xl p-4 flex items-center gap-3 hover:bg-accent/15 transition-colors">
                  <span className="w-10 h-10 rounded-xl bg-accent text-on-accent flex items-center justify-center shrink-0"><PlayCircle size={20} /></span>
                  <span className="flex-1">
                    <span className="block font-semibold">Tienes {pendingReview} video(s) listos para revisar</span>
                    <span className="block text-xs text-muted">Apruébalos o márcanos correcciones en la línea de tiempo.</span>
                  </span>
                  <ArrowRight size={18} className="text-accent" />
                </button>
              )}
              {briefsMissing.length > 0 && (
                <button type="button" onClick={() => setView('brief')}
                  className="text-left bg-amber/10 border border-amber/40 rounded-2xl p-4 flex items-center gap-3 hover:bg-amber/15 transition-colors">
                  <span className="w-10 h-10 rounded-xl bg-amber text-on-accent flex items-center justify-center shrink-0"><Palette size={20} /></span>
                  <span className="flex-1">
                    <span className="block font-semibold">Completa el brief de {briefsMissing.length} proyecto(s)</span>
                    <span className="block text-xs text-muted">Elige avatar, estilo de edición y referencias.</span>
                  </span>
                  <ArrowRight size={18} className="text-amber" />
                </button>
              )}
            </div>
          )}

          <div className="bg-surface-2 border border-line rounded-3xl overflow-hidden">
            <div className="px-5 py-4 border-b border-line flex items-center justify-between gap-3 flex-wrap">
              <h3 className="font-display text-lg font-semibold">Tus proyectos</h3>
              {nextDelivery && (
                <span className="text-xs text-muted flex items-center gap-1.5"><Clock size={13} className="text-accent" /> Próxima entrega: <strong className="text-text">{nextDelivery.brand}</strong> · {nextDelivery.deliveryDate}</span>
              )}
            </div>
            <div className="divide-y divide-line">
              {orders.map(o => {
                const vids = brandOf(o, brands)?.videos || [];
                const total = Math.max(o.videoCount || 0, vids.length) || 1;
                const done = vids.filter(v => v.qc === 'aprobado_cliente').length;
                const delivered = vids.filter(isDelivered).length;
                return (
                  <div key={o.id} className="px-5 py-4 flex items-center gap-4 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <p className="font-semibold">{o.brand}</p>
                      <p className="text-xs text-muted-2">{total} videos · entrega {o.deliveryDate || 'por definir'}</p>
                      <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-3 mt-2 max-w-sm">
                        <span className="bg-mint" style={{ width: `${(done / total) * 100}%` }} />
                        <span className="bg-accent" style={{ width: `${((delivered - done) / total) * 100}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-tech text-muted-2"><span className="text-accent">{delivered}</span> entregados · <span className="text-mint">{done}</span> aprobados</span>
                    {!o.briefConfirmedAt && !briefLocked(o) ? (
                      <button type="button" onClick={() => setView('brief')} className="text-xs font-semibold text-amber border border-amber/40 rounded-lg px-3 py-1.5 hover:bg-amber/10">Completar brief</button>
                    ) : delivered > done ? (
                      <button type="button" onClick={() => setView('revision')} className="text-xs font-semibold text-accent border border-accent/40 rounded-lg px-3 py-1.5 hover:bg-accent/10">Revisar videos</button>
                    ) : (
                      <span className="text-xs text-muted-2">{briefLocked(o) ? 'En producción' : 'Brief confirmado'}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Kpi({ icon: Icon, label, value, tone, onClick }: { icon: typeof Film; label: string; value: number; tone: 'accent' | 'amber' | 'mint' | 'violet'; onClick?: () => void }) {
  const toneCls = { accent: 'text-accent bg-accent-dim', amber: 'text-amber bg-amber-dim', mint: 'text-mint bg-mint-dim', violet: 'text-violet bg-violet-dim' }[tone];
  return (
    <button type="button" onClick={onClick} disabled={!onClick}
      className="text-left bg-surface-2 border border-line rounded-2xl p-4 enabled:hover:border-accent/40 transition-colors disabled:cursor-default">
      <span className={`w-9 h-9 rounded-lg flex items-center justify-center ${toneCls}`}><Icon size={17} /></span>
      <p className="font-display text-2xl font-bold mt-2.5">{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </button>
  );
}

// =====================================================================
// MIS PROYECTOS (BRIEF)
// =====================================================================
export function ClientBriefs() {
  const { orders, clientViewReady, setView } = useStore();
  const [openId, setOpenId] = useState<string | null>(null);
  const sorted = useMemo(
    () => orders.slice().sort((a, b) => Number(Boolean(a.briefConfirmedAt)) - Number(Boolean(b.briefConfirmedAt)) || (a.deliveryDate || '').localeCompare(b.deliveryDate || '')),
    [orders]
  );
  const active = sorted.find(o => o.id === openId) || sorted[0] || null;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5 animate-fadeIn">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold">Mis proyectos</h2>
          <p className="text-sm text-muted mt-1">Elige el avatar, el estilo de edición y tus referencias. Puedes cambiarlos hasta que el proyecto entre a producción.</p>
        </div>
        <SyncBadge />
      </div>

      {!clientViewReady ? (
        <div className="bg-surface-2 border border-line rounded-2xl p-10 text-center text-sm text-muted">Cargando…</div>
      ) : !active ? (
        <div className="bg-surface-2 border border-dashed border-line rounded-3xl py-16 text-center">
          <p className="font-display text-lg font-semibold">Aún no tienes proyectos</p>
          <button type="button" onClick={() => setView('chat')} className="mt-4 text-xs font-semibold text-accent">Escribir a SENDA →</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-4 space-y-2">
            {sorted.map(o => {
              const locked = briefLocked(o);
              const status = locked ? { label: 'En producción', cls: 'bg-surface-3 text-muted' }
                : o.briefConfirmedAt ? { label: 'Brief confirmado', cls: 'bg-mint-dim text-mint' }
                : { label: 'Brief pendiente', cls: 'bg-amber-dim text-amber' };
              return (
                <button key={o.id} type="button" onClick={() => setOpenId(o.id)}
                  className={`w-full text-left rounded-2xl border p-4 transition-all ${active.id === o.id ? 'bg-accent/10 border-accent ring-1 ring-accent/30' : 'bg-surface-2 border-line hover:border-accent/40'}`}>
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-display font-bold truncate">{o.brand}</p>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${status.cls}`}>{status.label}</span>
                  </div>
                  <p className="text-xs text-muted-2 mt-1">{o.videoCount} videos · entrega {o.deliveryDate || 'por definir'}</p>
                </button>
              );
            })}
          </div>
          <div className="lg:col-span-8">
            <BriefEditor key={active.id} order={active} />
          </div>
        </div>
      )}
    </div>
  );
}

function BriefEditor({ order }: { order: Order }) {
  const { clientCatalog, updateOrder, setView } = useStore();
  const locked = briefLocked(order);
  const [avatarId, setAvatarId] = useState<string | null>(order.avatarId ?? null);
  const [avatarName, setAvatarName] = useState(order.avatarName || '');
  const [styleId, setStyleId] = useState<string | null>(order.editingStyleId ?? null);
  const [refs, setRefs] = useState<OrderReference[]>(order.references || []);
  const [refName, setRefName] = useState('');
  const [refUrl, setRefUrl] = useState('');
  const [notes, setNotes] = useState(order.clientNotes || '');
  const [saved, setSaved] = useState<'draft' | 'confirmed' | null>(null);

  useEffect(() => { setSaved(null); }, [order.id]);

  const style = clientCatalog.styles.find(s => s.id === styleId) || null;
  const avatar = clientCatalog.avatars.find(a => a.id === avatarId) || null;
  const refUrlValid = /^https?:\/\/\S+\.\S+/.test(refUrl.trim());
  const steps = [Boolean(avatarId || avatarName.trim()), Boolean(styleId), refs.length > 0];
  const complete = steps.every(Boolean);

  const addRef = () => {
    if (!refUrlValid) return;
    setRefs(r => [...r, { id: `ref-${Date.now()}`, name: refName.trim() || `Referencia ${r.length + 1}`, url: refUrl.trim() }]);
    setRefName('');
    setRefUrl('');
  };

  const save = (confirm: boolean) => {
    updateOrder(order.id, {
      avatarId,
      avatarName: avatar?.name || avatarName.trim() || null,
      editingStyleId: styleId,
      editingStyleName: style?.name || null,
      references: refs,
      clientNotes: notes.trim() || null,
      briefConfirmedAt: confirm ? new Date().toISOString() : order.briefConfirmedAt ?? null,
    });
    setSaved(confirm ? 'confirmed' : 'draft');
    setTimeout(() => setSaved(null), 2500);
  };

  return (
    <div className="bg-surface-2 border border-line rounded-3xl overflow-hidden">
      <div className="p-5 border-b border-line flex items-center justify-between gap-3 flex-wrap bg-gradient-to-br from-accent/5 to-transparent">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-wider text-accent">Brief del proyecto</p>
          <h3 className="font-display text-2xl font-bold">{order.brand}</h3>
        </div>
        <div className="flex items-center gap-1.5">
          {['Avatar', 'Estilo', 'Referencias'].map((label, i) => (
            <span key={label} className={`text-[10px] font-semibold px-2 py-1 rounded-full flex items-center gap-1 ${steps[i] ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted-2'}`}>
              {steps[i] ? <CheckCircle2 size={11} /> : <span className="w-2.5 h-2.5 rounded-full border border-current" />} {label}
            </span>
          ))}
        </div>
      </div>

      {locked && (
        <div className="mx-5 mt-5 flex items-start gap-2.5 bg-surface-3 border border-line rounded-xl px-4 py-3 text-xs text-muted">
          <Lock size={15} className="text-amber shrink-0 mt-0.5" />
          <span className="flex-1">Tu proyecto ya está en producción y el brief quedó fijo. Si necesitas cambiar algo, escríbenos por el chat.</span>
          <button type="button" onClick={() => setView('chat')} className="text-accent font-semibold shrink-0">Ir al chat</button>
        </div>
      )}

      <fieldset disabled={locked} className="p-5 space-y-6 disabled:opacity-70">
        {/* 1. Avatar */}
        <section className="space-y-3">
          <SectionTitle n={1} icon={UserCircle2} title="Elige el avatar" hint="La persona o personaje que aparecerá en tus videos." />
          {clientCatalog.avatars.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {clientCatalog.avatars.map(a => {
                const on = avatarId === a.id;
                return (
                  <button key={a.id} type="button" onClick={() => setAvatarId(on ? null : a.id)}
                    className={`relative text-left rounded-2xl border overflow-hidden transition-all ${on ? 'border-accent ring-2 ring-accent/40' : 'border-line hover:border-accent/40'}`}>
                    <div className="aspect-[4/5] bg-surface-3 flex items-center justify-center">
                      {a.imageUrl ? <img src={a.imageUrl} alt={a.name} className="w-full h-full object-cover" /> : <UserCircle2 size={36} className="text-muted-2" />}
                    </div>
                    <div className="px-3 py-2">
                      <p className="text-sm font-semibold truncate">{a.name}</p>
                      {a.description && <p className="text-[11px] text-muted-2 line-clamp-2">{a.description}</p>}
                    </div>
                    {on && <CheckCircle2 size={20} className="absolute top-2 right-2 text-accent bg-surface rounded-full" />}
                  </button>
                );
              })}
            </div>
          ) : (
            <input value={avatarName} onChange={e => setAvatarName(e.target.value)} placeholder="Describe el avatar que quieres (ej. mujer 25-30, estilo casual)"
              className="w-full bg-surface-3 border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-accent placeholder:text-muted-2" />
          )}
        </section>

        {/* 2. Estilo */}
        <section className="space-y-3">
          <SectionTitle n={2} icon={Palette} title="Estilo de edición" hint="Ritmo, subtítulos, transiciones y música." />
          {clientCatalog.styles.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {clientCatalog.styles.map(st => {
                const on = styleId === st.id;
                return (
                  <button key={st.id} type="button" onClick={() => setStyleId(on ? null : st.id)}
                    className={`text-left rounded-2xl border p-4 transition-all ${on ? 'bg-accent/10 border-accent ring-1 ring-accent/30' : 'bg-surface-3/60 border-line hover:border-accent/40'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-semibold">{st.name}</p>
                      {on ? <CheckCircle2 size={17} className="text-accent" /> : <span className="w-4 h-4 rounded-full border border-line" />}
                    </div>
                    <p className="text-xs text-muted mt-1 leading-snug">{st.description}</p>
                    {st.exampleUrl && (
                      <a href={st.exampleUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-accent hover:underline">
                        Ver ejemplo <ExternalLink size={11} />
                      </a>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-xs text-muted-2 bg-surface-3 border border-dashed border-line rounded-xl px-4 py-3">El equipo SENDA aún no publicó estilos. Cuéntanos el estilo que buscas en las notas.</p>
          )}
        </section>

        {/* 3. Referencias */}
        <section className="space-y-3">
          <SectionTitle n={3} icon={Link2} title="Referencias" hint="Videos o cuentas que te gusten (TikTok, Reels, YouTube, Drive…)." />
          {refs.length > 0 && (
            <ul className="space-y-1.5">
              {refs.map(r => (
                <li key={r.id} className="flex items-center gap-2 bg-surface-3/70 border border-line rounded-xl px-3 py-2">
                  <Link2 size={13} className="text-accent shrink-0" />
                  <a href={r.url} target="_blank" rel="noreferrer" className="flex-1 min-w-0 text-sm truncate hover:text-accent">{r.name}<span className="text-muted-2 text-xs ml-2">{r.url}</span></a>
                  <button type="button" onClick={() => setRefs(list => list.filter(x => x.id !== r.id))} title="Quitar" className="text-muted-2 hover:text-red-400"><Trash2 size={13} /></button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2 flex-wrap">
            <input value={refName} onChange={e => setRefName(e.target.value)} placeholder="Nombre (opcional)"
              className="w-40 bg-surface-3 border border-line rounded-xl px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-2" />
            <input value={refUrl} onChange={e => setRefUrl(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addRef(); }} placeholder="https://…"
              className={`flex-1 min-w-[180px] bg-surface-3 border rounded-xl px-3 py-2 text-sm outline-none placeholder:text-muted-2 ${refUrl && !refUrlValid ? 'border-red-500/60' : 'border-line focus:border-accent'}`} />
            <button type="button" onClick={addRef} disabled={!refUrlValid}
              className="px-3.5 rounded-xl bg-surface-3 border border-line text-accent text-sm font-semibold flex items-center gap-1 hover:border-accent/50 disabled:opacity-40">
              <Plus size={14} /> Añadir
            </button>
          </div>
        </section>

        {/* 4. Notas */}
        <section className="space-y-3">
          <SectionTitle n={4} icon={StickyNote} title="Notas para el equipo" hint="Mensajes clave, ofertas, lo que NO quieres ver…" />
          <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Escribe aquí cualquier detalle importante"
            className="w-full bg-surface-3 border border-line rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-accent placeholder:text-muted-2 resize-y" />
        </section>
      </fieldset>

      {!locked && (
        <div className="px-5 py-4 border-t border-line bg-surface-3/40 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs">
            {saved === 'confirmed' ? <span className="text-mint flex items-center gap-1.5"><CheckCircle2 size={14} /> Brief confirmado y enviado a SENDA</span>
              : saved === 'draft' ? <span className="text-mint flex items-center gap-1.5"><CheckCircle2 size={14} /> Borrador guardado</span>
              : order.briefConfirmedAt ? <span className="text-muted-2">Confirmado el {order.briefConfirmedAt.slice(0, 10)} · puedes seguir ajustándolo</span>
              : <span className="text-muted-2">{complete ? 'Todo listo para confirmar' : 'Completa avatar, estilo y al menos una referencia'}</span>}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => save(false)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-medium bg-surface-3 border border-line text-muted hover:text-text">
              <Save size={13} /> Guardar borrador
            </button>
            <button type="button" onClick={() => save(true)} disabled={!complete}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed">
              <CheckCircle2 size={13} /> Confirmar brief
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionTitle({ n, icon: Icon, title, hint }: { n: number; icon: typeof Film; title: string; hint: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="w-7 h-7 rounded-lg bg-accent-dim text-accent font-tech text-xs font-bold flex items-center justify-center shrink-0">{n}</span>
      <div>
        <p className="font-semibold flex items-center gap-1.5"><Icon size={15} className="text-accent" /> {title}</p>
        <p className="text-xs text-muted-2">{hint}</p>
      </div>
    </div>
  );
}
