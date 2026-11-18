import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { useAuth } from '../lib/auth';
import type { Brand, Order, Video } from '../types';
import { GlowCard } from '../components/ui/spotlight-card';
import { AnimatedRadialChart } from '../components/ui/animated-radial-chart';
import { AttentionTile, countdownLabel, deadlineMs, fmtDate, FollowUpRow, Modal, VideoList } from '../components/home/home-bits';
import { setNavIntent } from '../lib/navIntent';
import { BriefEditor, briefLocked } from '../components/brief/BriefEditor';
import {
  ArrowRight, CheckCircle2, Clock, Film, MessageSquare, Palette,
  PlayCircle, RefreshCw, Sparkles, Receipt, Download,
} from 'lucide-react';

const isDelivered = (v: Video) => Boolean(v.publishedToClient || v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente');
const toReview = (v: Video) => isDelivered(v) && v.qc !== 'aprobado_cliente' && v.qc !== 'correcciones';

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
  const [panel, setPanel] = useState<'review' | null>(null);
  const allVideos = brands.flatMap(b => b.videos.map(v => ({ ...v, brandName: b.name, brandId: b.id })));
  const reviewList = allVideos.filter(toReview);
  const approved = allVideos.filter(v => v.qc === 'aprobado_cliente').length;
  const inCorrection = allVideos.filter(v => isDelivered(v) && v.qc === 'correcciones').length;
  const totalVideos = orders.reduce((s, o) => s + Math.max(o.videoCount || 0, brandOf(o, brands)?.videos.length || 0), 0);
  const inProduction = Math.max(0, totalVideos - allVideos.filter(isDelivered).length);
  const briefsMissing = orders.filter(o => !o.briefConfirmedAt && !briefLocked(o));
  const activeOrders = orders
    .filter(o => o.status !== 'finalizado')
    .sort((a, b) => (deadlineMs(a.deliveryDate, a.deliveryTime) || Infinity) - (deadlineMs(b.deliveryDate, b.deliveryTime) || Infinity));
  const nextDelivery = activeOrders.find(o => o.deliveryDate) || null;
  const invoices = orders.filter(o => o.invoiceFileUrl);
  const progressPct = totalVideos > 0 ? (approved / totalVideos) * 100 : 0;

  const openReview = (v: { id: string; brandId: string }) => {
    setNavIntent('revision', `${v.brandId}::${v.id}`);
    setView('revision');
  };
  const openReviews = () => {
    if (reviewList.length === 1) openReview(reviewList[0]);
    else if (reviewList.length > 1) setPanel('review');
  };

  return (
    <div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fadeIn">
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-[0.18em] text-accent">Portal de clientes SENDA</p>
          <h2 className="font-display text-3xl xl:text-4xl font-bold mt-1">Hola, {user?.name?.split(' ')[0] || 'bienvenido'}</h2>
          <p className="text-sm text-muted mt-1">Aquí ves el avance de tus proyectos, revisas tus videos y nos dejas tu feedback con el segundo exacto.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SyncBadge />
          <button type="button" onClick={() => setView('chat')} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-line bg-surface-2 text-sm font-medium hover:border-accent/50 hover:bg-surface-3 transition-colors">
            <MessageSquare size={15} className="text-accent" /> Escribir a SENDA
          </button>
          {reviewList.length > 0 && (
            <button type="button" onClick={openReviews} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-on-accent text-sm font-semibold hover:bg-accent-strong transition-all hover:-translate-y-0.5 shadow-[0_0_20px_-6px_rgba(53,214,228,0.6)]">
              <PlayCircle size={15} /> Revisar {reviewList.length} video{reviewList.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      </div>

      {!clientViewReady ? (
        <div className="bg-surface-2 border border-line rounded-xl p-10 text-center text-sm text-muted flex items-center justify-center gap-2">
          <RefreshCw size={15} className="animate-spin text-accent" /> Cargando tus proyectos…
        </div>
      ) : orders.length === 0 ? (
        <div className="bg-surface-2 border border-dashed border-line rounded-xl py-16 px-6 text-center">
          <Sparkles size={30} className="text-accent mx-auto mb-3" />
          <p className="font-display text-lg font-semibold">Aún no tienes proyectos</p>
          <p className="text-sm text-muted mt-1 max-w-md mx-auto">Cuando el equipo SENDA vincule tu pedido a esta cuenta, aparecerá aquí para que elijas avatar, estilo y referencias.</p>
          <button type="button" onClick={() => setView('chat')} className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold bg-accent text-on-accent rounded-xl px-4 py-2.5">
            <MessageSquare size={14} /> Escribir a SENDA
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-8 space-y-5">
            {/* Lo que necesitamos de ti */}
            <GlowCard contentClassName="p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                  <Sparkles size={18} className="text-accent shrink-0" /> Lo que necesitamos de ti
                </h3>
                {reviewList.length === 0 && briefsMissing.length === 0 && (
                  <span className="text-xs text-mint flex items-center gap-1"><CheckCircle2 size={14} /> Nada pendiente</span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <AttentionTile icon={<PlayCircle size={18} />} tone="accent" count={reviewList.length} label="Videos para revisar" hint="Apruébalos o márcanos correcciones en la línea de tiempo" onClick={openReviews} />
                <AttentionTile icon={<Palette size={18} />} tone="amber" count={briefsMissing.length} label="Briefs por completar" hint="Elige avatar, estilo de edición y referencias" onClick={() => setView('brief')} />
              </div>
              <div className="mt-3 pt-3 border-t border-line/60 grid grid-cols-1 md:grid-cols-2 gap-2">
                <FollowUpRow icon={<RefreshCw size={15} />} label="Aplicando tu feedback" count={inCorrection} onClick={() => setView('revision')} />
                <FollowUpRow icon={<Film size={15} />} label="Videos en producción" count={inProduction} onClick={() => setView('brief')} />
              </div>
            </GlowCard>

            {/* Proyectos con su etapa */}
            <GlowCard tone="amber" contentClassName="p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                  <Clock size={18} className="text-amber shrink-0" /> Tus proyectos
                  <span className="text-xs font-normal text-muted-2">{orders.length}</span>
                </h3>
              </div>
              <div className="space-y-2.5">
                {orders.map(o => {
                  const brand = brandOf(o, brands);
                  const vids = brand?.videos || [];
                  const total = Math.max(o.videoCount || 0, vids.length) || 1;
                  const done = vids.filter(v => v.qc === 'aprobado_cliente').length;
                  const delivered = vids.filter(isDelivered).length;
                  const toCheck = vids.filter(toReview);
                  const stage = done >= total ? 3 : delivered > 0 ? 2 : (!o.briefConfirmedAt && !briefLocked(o)) ? 0 : 1;
                  const dl = deadlineMs(o.deliveryDate, o.deliveryTime);
                  const late = stage < 3 && Number.isFinite(dl) && dl < Date.now();
                  return (
                    <div key={o.id} className="p-4 bg-surface-3 border border-line rounded-xl">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <p className="font-semibold truncate">{o.brand} <span className="text-muted-2 font-normal text-sm">· {total} video{total === 1 ? '' : 's'}</span></p>
                          <p className="text-[11px] text-muted-2 mt-0.5">
                            Entrega {fmtDate(o.deliveryDate, o.deliveryTime)}
                            {stage < 3 && Number.isFinite(dl) && <span className={`ml-1.5 font-medium ${late ? 'text-amber' : 'text-accent'}`}>· {late ? 'Ajustando la entrega con el equipo' : countdownLabel(dl)}</span>}
                          </p>
                        </div>
                        {stage === 0 ? (
                          <button type="button" onClick={() => setView('brief')} className="text-xs font-semibold text-amber border border-amber/40 rounded-lg px-3 py-1.5 hover:bg-amber/10">Completar brief</button>
                        ) : toCheck.length > 0 ? (
                          <button type="button" onClick={() => openReview({ id: toCheck[0].id, brandId: brand?.id || '' })} className="text-xs font-semibold text-on-accent bg-accent rounded-lg px-3 py-1.5 hover:bg-accent-strong">Revisar {toCheck.length} video{toCheck.length === 1 ? '' : 's'}</button>
                        ) : (
                          <button type="button" onClick={() => setView(delivered > 0 ? 'revision' : 'brief')} className="text-xs font-semibold text-accent border border-accent/40 rounded-lg px-3 py-1.5 hover:bg-accent/10">{delivered > 0 ? 'Ver entregas' : 'Ver brief'}</button>
                        )}
                      </div>
                      <StageTrack stage={stage} />
                      <div className="flex items-center gap-2 mt-2.5">
                        <div className="flex h-1.5 flex-1 rounded-full overflow-hidden bg-surface-2">
                          <span className="bg-mint transition-all duration-500" style={{ width: `${(done / total) * 100}%` }} />
                          <span className="bg-accent transition-all duration-500" style={{ width: `${(Math.max(0, delivered - done) / total) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-tech text-muted-2 whitespace-nowrap"><span className="text-accent">{delivered}</span> entregados · <span className="text-mint">{done}</span> aprobados</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </GlowCard>
          </div>

          <div className="lg:col-span-4 space-y-5">
            {/* Avance general */}
            <GlowCard tone="mint" contentClassName="p-5 flex flex-col items-center">
              <h3 className="font-display text-lg font-semibold self-start flex items-center gap-2">
                <CheckCircle2 size={18} className="text-mint shrink-0" /> Avance general
              </h3>
              <div className="pt-4">
                <AnimatedRadialChart value={progressPct} size={210} strokeWidth={14} showLabels={false} warnAt={101} caption={`${approved} de ${totalVideos} videos aprobados por ti`} />
              </div>
              {nextDelivery && (
                <div className="w-full mt-3 flex items-center gap-3 bg-surface-3 border border-line rounded-lg px-3 py-2.5">
                  <span className="w-8 h-8 rounded-lg bg-amber-dim text-amber flex items-center justify-center shrink-0"><Clock size={15} /></span>
                  <div className="min-w-0">
                    <p className="text-[11px] text-muted-2">Próxima entrega</p>
                    <p className="text-sm font-semibold truncate">{nextDelivery.brand} · {fmtDate(nextDelivery.deliveryDate, nextDelivery.deliveryTime)}</p>
                  </div>
                </div>
              )}
            </GlowCard>

            {/* Facturas */}
            <GlowCard contentClassName="p-5">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
                <Receipt size={18} className="text-accent shrink-0" /> Tus facturas
              </h3>
              {invoices.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">Aún no hay facturas disponibles.</p>
              ) : (
                <ul className="space-y-2">
                  {invoices.map(o => (
                    <li key={o.id} className="flex items-center justify-between gap-2 p-2.5 bg-surface-3 border border-line rounded-lg">
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{o.brand}</p>
                        <p className="text-[11px] text-muted-2 font-tech">{o.invoiceNumber || 'Factura'}{o.invoiceDate ? ` · ${o.invoiceDate}` : ''}</p>
                      </div>
                      <a href={o.invoiceFileUrl || '#'} target="_blank" rel="noreferrer" className="text-xs text-accent hover:text-accent-strong flex items-center gap-1 shrink-0">
                        <Download size={13} /> Abrir
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </GlowCard>

            {/* Cómo funciona */}
            <GlowCard tone="violet" contentClassName="p-5">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
                <MessageSquare size={18} className="text-violet shrink-0" /> Cómo trabajamos
              </h3>
              <ol className="space-y-2 text-xs text-muted">
                {['Completas el brief: avatar, estilo y referencias.', 'Producimos y te entregamos cada video aquí.', 'Lo apruebas o nos marcas correcciones en el segundo exacto (1 ronda por video).', 'Aplicamos tu feedback y te entregamos la versión final.'].map((t, i) => (
                  <li key={i} className="flex gap-2.5"><span className="w-5 h-5 rounded-full bg-surface-3 border border-line text-[10px] font-tech text-accent flex items-center justify-center shrink-0">{i + 1}</span><span className="pt-0.5">{t}</span></li>
                ))}
              </ol>
              <button type="button" onClick={() => setView('chat')} className="mt-4 w-full inline-flex items-center justify-center gap-2 text-xs font-semibold text-accent border border-accent/40 rounded-lg px-3 py-2 hover:bg-accent/10 transition-colors">
                ¿Dudas? Escríbenos <ArrowRight size={13} />
              </button>
            </GlowCard>
          </div>
        </div>
      )}

      {panel === 'review' && (
        <Modal title="Videos para revisar" icon={<PlayCircle size={18} className="text-accent" />} onClose={() => setPanel(null)}>
          <VideoList
            videos={reviewList}
            detail={v => `${(v.clientFeedbackMaxRounds ?? 1) - (v.clientFeedbackRoundsUsed ?? 0)} ronda(s) de feedback disponible(s)`}
            onOpen={v => { const r = reviewList.find(x => x.id === v.id); if (r) openReview(r); }}
          />
        </Modal>
      )}
    </div>
  );
}

const STAGES = ['Brief', 'Producción', 'Revisión', 'Aprobado'];

function StageTrack({ stage }: { stage: number }) {
  return (
    <div className="flex items-center gap-1.5 mt-3" aria-label={`Etapa: ${STAGES[stage]}`}>
      {STAGES.map((s, i) => (
        <div key={s} className="flex-1 min-w-0">
          <div className={`h-1 rounded-full ${i < stage ? 'bg-mint' : i === stage ? 'bg-accent animate-pulse' : 'bg-surface-2'}`} />
          <p className={`text-[10px] mt-1 truncate ${i === stage ? 'text-accent font-semibold' : i < stage ? 'text-mint' : 'text-muted-2'}`}>{s}</p>
        </div>
      ))}
    </div>
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
    <div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fadeIn">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold">Mis proyectos</h2>
          <p className="text-sm text-muted mt-1">Elige el avatar, el estilo de edición y tus referencias. Puedes cambiarlos hasta que el proyecto entre a producción.</p>
        </div>
        <SyncBadge />
      </div>

      {!clientViewReady ? (
        <div className="bg-surface-2 border border-line rounded-xl p-10 text-center text-sm text-muted">Cargando…</div>
      ) : !active ? (
        <div className="bg-surface-2 border border-dashed border-line rounded-xl py-16 text-center">
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
                  className={`glow-card w-full text-left rounded-xl border p-4 transition-all ${active.id === o.id ? 'bg-accent/10 border-accent ring-1 ring-accent/30' : 'bg-surface-2 border-line hover:border-accent/40'}`}>
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
