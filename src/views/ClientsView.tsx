import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { uploadSharedFile } from '../lib/supabaseClient';
import { buildWorkUnits, spreadLoad } from '../lib/capacity';
import { ClientPortal } from './ClientPortal';
import { ClientAccountField } from '../components/ClientAccountField';
import { DriveFolderField } from '../components/DriveFolderField';
import { OrderBriefPanel } from '../components/brief/OrderBriefPanel';
import { addDaysIso, fmtMoney, todayIso, unitEconomics } from '../lib/economics';
import { AttentionTile, fmtDate } from '../components/home/home-bits';
import { GlowCard } from '../components/ui/spotlight-card';
import NumberTicker, { CountTicker } from '../components/ui/number-ticker';
import { setNavIntent, takeNavIntent } from '../lib/navIntent';
import type { Order, Video } from '../types';
import {
  AlertTriangle, ArrowRight, Briefcase, Calendar, CheckCircle2, Clock, Cpu, ExternalLink,
  FileText, FolderOpen, Layers, Loader2, Lock, Play, PlusCircle, Printer, Receipt, Search, Trash2,
  Upload, UserCircle2, Users, X,
  Inbox, UserPlus, MessageSquareWarning, Link2Off,
} from 'lucide-react';

type Tab = 'portal_videos' | 'nuevo_pedido' | 'cartera';
type Priority = 'normal' | 'prioritario' | 'urgente' | 'critico';
type ClientFilter = 'todos' | 'activos' | 'por_cobrar';

const baseBrand = (name: string) => name.split(' · Tanda ')[0].trim();
const isPaid = (o: Order) => o.paymentStatus !== 'incompleto';
const isDelivered = (v: Video) => Boolean(v.publishedToClient || v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente');

function formatHour(h: number): string {
  const clamped = Math.max(0, Math.min(23, Math.floor(h)));
  const mins = Math.round((h - Math.floor(h)) * 60);
  return `${String(clamped).padStart(2, '0')}:${mins >= 30 ? '30' : '00'}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

/** Folio consecutivo y estable: FAC-AAAAMMDD-MARC-0007 */
function nextInvoiceCode(orders: Order[], brand: string, dateIso: string): string {
  const clean = brand.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 4) || 'CLI';
  const seq = orders.reduce((max, o) => {
    const m = /-(\d{3,})$/.exec(o.invoiceNumber || '');
    return m ? Math.max(max, Number(m[1])) : max;
  }, 0) + 1;
  return `FAC-${dateIso.replace(/-/g, '')}-${clean}-${String(seq).padStart(4, '0')}`;
}

const PRIORITY_STYLE: Record<Priority, string> = {
  critico: 'bg-red-500/15 text-red-400 border-red-500/40',
  urgente: 'bg-amber-dim text-amber border-amber/40',
  prioritario: 'bg-accent-dim text-accent border-accent/40',
  normal: 'bg-mint-dim text-mint border-mint/30',
};
const PRIORITY_LABEL: Record<Priority, string> = { critico: 'Crítica', urgente: 'Urgente', prioritario: 'Prioritaria', normal: 'Normal' };

export function ClientsView() {
  const { orders, brands, financeSettings, setView } = useStore();
  // Destino al abrir: pestaña y, si viene del cotizador de Capacidad, datos del pedido ("nuevo_pedido|videos|complejidad|fecha")
  const [intent] = useState(() => takeNavIntent('clientes') || '');
  const [tab, setTab] = useState<Tab>(() => {
    const key = intent.split('|')[0];
    return key === 'nuevo_pedido' || key === 'cartera' ? key : 'portal_videos';
  });
  const prefill = intent.startsWith('nuevo_pedido|') ? intent.split('|') : null;
  const [focusBrand, setFocusBrand] = useState<string | null>(null);

  const allVideos = useMemo(() => brands.flatMap(b => b.videos), [brands]);
  const summary = useMemo(() => {
    const active = orders.filter(o => o.status !== 'finalizado');
    const pending = orders.filter(o => !isPaid(o));
    const amount = (o: Order) => Math.max(1, o.videoCount || 1) * unitEconomics(null, o, financeSettings).price;
    return {
      clients: new Set(orders.map(o => baseBrand(o.brand).toLowerCase()).filter(Boolean)).size,
      active: active.length,
      waitingClient: allVideos.filter(v => isDelivered(v) && v.qc !== 'aprobado_cliente' && v.qc !== 'correcciones').length,
      clientFeedback: allVideos.filter(v => v.qc === 'correcciones' && v.corrections.some(c => c.author === 'cliente' && !c.resolved)).length,
      briefReady: active.filter(o => o.briefConfirmedAt && !o.clipperId).length,
      noAccount: active.filter(o => !o.clientId).length,
      toCollect: pending.reduce((s, o) => s + amount(o), 0),
      pendingCount: pending.length,
      billed: orders.filter(isPaid).reduce((s, o) => s + amount(o), 0),
    };
  }, [orders, allVideos, financeSettings]);

  const openFile = (brand: string) => { setFocusBrand(brand); setTab('cartera'); };
  const goTasks = (folder: 'disponibles' | 'iniciados') => { setNavIntent('tareas', folder); setView('tareas'); };

  const TABS: { key: Tab; label: string; icon: typeof Play; count: number }[] = [
    { key: 'portal_videos', label: 'Entregas y feedback', icon: Play, count: summary.waitingClient },
    { key: 'nuevo_pedido', label: 'Nuevo pedido', icon: PlusCircle, count: 0 },
    { key: 'cartera', label: 'Expedientes', icon: FolderOpen, count: summary.clients },
  ];
  const attentionTotal = summary.pendingCount + summary.briefReady + summary.clientFeedback + summary.noAccount;

  return (
    <div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fadeIn">
      {/* Encabezado */}
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-[0.18em] text-accent flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" /> En vivo
          </p>
          <h2 className="font-display text-3xl xl:text-4xl font-bold mt-1">Clientes y pedidos</h2>
          <p className="text-sm text-muted mt-1">Registra pedidos, vincula la cuenta del cliente y sigue sus entregas, feedback y pagos.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatChip label="Clientes" value={<CountTicker value={summary.clients} />} tone="accent" onClick={() => setTab('cartera')} />
          <StatChip label="Pedidos activos" value={<CountTicker value={summary.active} />} tone="accent" onClick={() => goTasks('iniciados')} />
          <StatChip label="Por cobrar" value={<NumberTicker value={summary.toCollect} />} tone={summary.pendingCount ? 'amber' : 'muted'} onClick={() => setTab('cartera')} />
          <StatChip label="Facturado y pagado" value={<NumberTicker value={summary.billed} />} tone="mint" />
        </div>
      </div>

      {/* Requiere tu atención */}
      <GlowCard contentClassName="p-5">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">
            <Inbox size={18} className="text-accent shrink-0" /> Requiere tu atención
            {attentionTotal > 0 && <span className="font-tech text-xs px-2 py-0.5 rounded-full bg-accent-dim text-accent">{attentionTotal}</span>}
          </h3>
          {attentionTotal === 0 && <span className="text-xs text-mint flex items-center gap-1"><CheckCircle2 size={14} /> Todo al día</span>}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
          <AttentionTile icon={<Receipt size={18} />} tone="amber" count={summary.pendingCount} label="Pagos por confirmar" hint={summary.pendingCount ? `${fmtMoney(summary.toCollect)} por cobrar` : 'Pedidos con pago pendiente'} onClick={() => setTab('cartera')} />
          <AttentionTile icon={<UserPlus size={18} />} tone="accent" count={summary.briefReady} label="Briefs listos" hint="El cliente confirmó: asigna responsable" onClick={() => goTasks('disponibles')} />
          <AttentionTile icon={<MessageSquareWarning size={18} />} tone="red" count={summary.clientFeedback} label="Feedback del cliente" hint="Correcciones por aplicar" onClick={() => goTasks('iniciados')} />
          <AttentionTile icon={<Link2Off size={18} />} tone="amber" count={summary.noAccount} label="Sin cuenta de cliente" hint="El cliente no ve estos pedidos" onClick={() => setTab('cartera')} />
        </div>
      </GlowCard>

      {/* Pestañas */}
      <div className="flex items-center gap-1 bg-surface-2 border border-line rounded-xl p-1 w-fit" role="tablist">
        {TABS.map(t => {
          const Icon = t.icon;
          const on = tab === t.key;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={on} onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${on ? 'bg-accent text-on-accent shadow-[0_0_16px_-6px_rgba(53,214,228,0.7)]' : 'text-muted hover:text-text'}`}>
              <Icon size={15} /> {t.label}
              {t.count > 0 && <span className={`font-tech text-[11px] px-1.5 rounded ${on ? 'bg-black/20' : 'bg-surface-3'}`}>{t.count}</span>}
            </button>
          );
        })}
      </div>

      {tab === 'portal_videos' && <ClientPortal />}
      {tab === 'nuevo_pedido' && <NewOrderForm onOpenFile={openFile} prefill={prefill ? { videos: Number(prefill[1]) || 5, complexity: prefill[2], date: prefill[3] } : null} />}
      {tab === 'cartera' && <ClientFiles focusBrand={focusBrand} onNewOrder={() => setTab('nuevo_pedido')} />}
    </div>
  );
}

function StatChip({ label, value, tone, onClick }: { label: string; value: React.ReactNode; tone: 'accent' | 'amber' | 'mint' | 'muted'; onClick?: () => void }) {
  const cls = { accent: 'text-accent', amber: 'text-amber', mint: 'text-mint', muted: 'text-muted-2' }[tone];
  const body = (
    <>
      <p className={`font-display text-xl font-bold leading-none ${cls}`}>{value}</p>
      <p className="text-[11px] text-muted mt-1">{label}</p>
    </>
  );
  const base = 'glow-card text-left bg-surface-2 border border-line rounded-xl px-3.5 py-2 min-w-[140px]';
  return onClick
    ? <button type="button" onClick={onClick} className={`${base} hover:border-accent/40 transition-colors`}>{body}</button>
    : <div className={base}>{body}</div>;
}

// =====================================================================
// NUEVO PEDIDO
// =====================================================================
function NewOrderForm({ onOpenFile, prefill }: { onOpenFile: (brand: string) => void; prefill?: { videos: number; complexity: string; date: string } | null }) {
  const { orders, brands, workers, financeSettings, capacityConfig, getWorkerCapacity, addOrder, clientProfiles, setView } = useStore();

  const [brandName, setBrandName] = useState('');
  const [clientId, setClientId] = useState('');
  const [videoCount, setVideoCount] = useState(() => prefill?.videos || 5);
  const [deliveryDate, setDeliveryDate] = useState(() => prefill?.date || addDaysIso(todayIso(), 3));
  const [deliveryTime, setDeliveryTime] = useState('18:00');
  const [complexity, setComplexity] = useState<'simple' | 'estandar' | 'alta'>(() => (prefill?.complexity === 'simple' || prefill?.complexity === 'alta' ? prefill.complexity : 'estandar'));
  const [unitPriceClient, setUnitPriceClient] = useState(() => financeSettings.clientPricePerVideo || 25);
  const [creatorPay, setCreatorPay] = useState(() => financeSettings.payPerVideo ?? 5);
  const [clientNotes, setClientNotes] = useState('');
  const [briefFile, setBriefFile] = useState<{ name: string; url: string } | null>(null);
  const [invoiceFile, setInvoiceFile] = useState<{ name: string; url: string } | null>(null);
  const [uploading, setUploading] = useState<'brief' | 'invoice' | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ brand: string; paid: boolean; linked: boolean } | null>(null);
  const briefRef = useRef<HTMLInputElement | null>(null);
  const invoiceRef = useRef<HTMLInputElement | null>(null);

  const knownBrands = useMemo(
    () => Array.from(new Set([...orders.map(o => baseBrand(o.brand)), ...brands.map(b => b.name.trim())].filter(Boolean))).sort(),
    [orders, brands]
  );

  // Si la marca ya tiene pedidos con cuenta de cliente, se propone la misma cuenta
  useEffect(() => {
    const key = brandName.trim().toLowerCase();
    if (!key || clientId) return;
    const prev = orders.find(o => baseBrand(o.brand).toLowerCase() === key && o.clientId);
    if (prev?.clientId) setClientId(prev.clientId);
  }, [brandName, orders, clientId]);

  const capacity = useMemo(() => {
    const safety = Math.max(0.5, (100 - capacityConfig.safetyMarginPct) / 100);
    const physical = workers.reduce((s, w) => s + getWorkerCapacity(w.id), 0);
    const dailyLimit = Math.max(1, Math.floor(physical * safety));
    const load = spreadLoad(buildWorkUnits(orders.filter(o => o.status !== 'finalizado'), brands), u => u.editRemaining);
    const committed: Record<string, number> = {};
    for (const [d, n] of Object.entries(load)) committed[d] = Math.ceil(n);

    const target = deliveryDate || todayIso();
    const mult = complexity === 'alta' ? 1.3 : complexity === 'simple' ? 0.85 : 1;
    const committedOnTarget = committed[target] || 0;
    const freeOnTarget = Math.max(0, Math.floor(Math.max(0, dailyLimit - committedOnTarget) / mult));
    const fits = videoCount <= freeOnTarget;
    const hoursLeft = Math.max(1, Math.round((new Date(`${target}T${deliveryTime || '18:00'}:00`).getTime() - Date.now()) / 3600000));
    const loadRatio = (committedOnTarget + videoCount * mult) / dailyLimit;

    let priority: Priority = 'normal';
    let reason = 'Hay holgura suficiente y la carga del equipo está dentro de lo normal.';
    if (hoursLeft <= capacityConfig.urgentThresholdHours || (target <= todayIso() && !fits)) {
      priority = 'critico';
      reason = `Entrega en ~${hoursLeft} h con el cupo del día casi lleno.`;
    } else if (hoursLeft <= 24 || !fits || (complexity === 'alta' && videoCount >= 10)) {
      priority = 'urgente';
      reason = !fits ? 'El volumen supera el cupo libre del día: se reparte en tandas.' : `Quedan menos de 24 h (${hoursLeft} h).`;
    } else if (hoursLeft <= 48 || loadRatio >= 0.75 || complexity === 'alta') {
      priority = 'prioritario';
      reason = `Ocupación proyectada del ${Math.min(100, Math.round(loadRatio * 100))}% en la fecha de entrega.`;
    }

    // Reparto por tandas desde la fecha de entrega
    const batches: { date: string; videos: number }[] = [];
    let remaining = Math.max(1, videoCount);
    for (let i = 0; remaining > 0 && i < 20; i++) {
      const d = addDaysIso(target, i);
      const free = Math.max(i === 0 ? 0 : 1, Math.floor(Math.max(0, dailyLimit - (committed[d] || 0)) / mult));
      if (free > 0) {
        const n = Math.min(remaining, free);
        batches.push({ date: d, videos: n });
        remaining -= n;
      }
    }
    const workHours = Math.max(4, capacityConfig.workdayEndHour - capacityConfig.workdayStartHour);
    const last = batches[batches.length - 1];
    const ratio = last ? Math.min(1, last.videos / dailyLimit) : 0.5;
    const start = Math.min(capacityConfig.workdayEndHour - 2, Math.max(capacityConfig.workdayStartHour + 1, capacityConfig.workdayStartHour + Math.max(1.5, ratio * (workHours - 2))));
    const finalDate = last?.date || target;
    const perPerson = Math.max(1, capacityConfig.defaultClipperDailyVideos || 4);
    return {
      dailyLimit, freeOnTarget, fits, priority, reason, batches,
      eta: `${finalDate === todayIso() ? 'Hoy' : fmtDate(finalDate)} entre ${formatHour(start)} y ${formatHour(Math.min(capacityConfig.workdayEndHour, start + 2))}`,
      people: Math.min(Math.max(1, workers.length), Math.max(1, Math.ceil(((batches[0]?.videos || videoCount) * mult) / perPerson))),
      saturation: Math.min(100, Math.round(((committedOnTarget + (batches[0]?.videos || videoCount)) / dailyLimit) * 100)),
    };
  }, [workers, getWorkerCapacity, capacityConfig, orders, brands, deliveryDate, deliveryTime, complexity, videoCount]);

  const money = useMemo(() => {
    const gross = videoCount * unitPriceClient;
    const team = videoCount * creatorPay;
    return { gross, team, net: gross - team, pct: gross > 0 ? Math.round(((gross - team) / gross) * 100) : 0 };
  }, [videoCount, unitPriceClient, creatorPay]);

  const upload = async (kind: 'brief' | 'invoice', f: File | undefined) => {
    if (!f) return;
    setUploading(kind);
    setUploadError(null);
    try {
      const url = await uploadSharedFile(f, kind === 'brief' ? 'client-briefs' : 'client-invoices');
      (kind === 'brief' ? setBriefFile : setInvoiceFile)({ name: f.name, url });
    } catch {
      setUploadError(`No se pudo subir ${kind === 'brief' ? 'el brief' : 'la factura'}. Intenta de nuevo.`);
    } finally {
      setUploading(null);
    }
  };

  const pastDate = deliveryDate < todayIso();
  const canSubmit = Boolean(brandName.trim()) && videoCount > 0 && !uploading && !pastDate;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    const brand = brandName.trim();
    addOrder({
      brand,
      videoCount,
      deliveryDate,
      deliveryTime,
      status: 'sin_asignar',
      assignedWorkerIds: [],
      clipperId: null,
      editorId: null,
      unitPriceClient,
      creatorPayPerVideo: creatorPay,
      complexity,
      priority: capacity.priority,
      paymentStatus: invoiceFile ? 'completado' : 'incompleto',
      invoiceNumber: nextInvoiceCode(orders, brand, todayIso()),
      invoiceDate: todayIso(),
      invoiceFileName: invoiceFile?.name || null,
      invoiceFileUrl: invoiceFile?.url || null,
      briefFileName: briefFile?.name || null,
      briefFileUrl: briefFile?.url || null,
      clientNotes: clientNotes.trim() || null,
      clientId: clientId || null,
    });
    setCreated({ brand, paid: Boolean(invoiceFile), linked: Boolean(clientId) });
    setBrandName('');
    setClientId('');
    setClientNotes('');
    setBriefFile(null);
    setInvoiceFile(null);
  };

  const input = 'w-full bg-surface-3 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-2';

  return (
    <div className="space-y-4">
      {created && (
        <div className="bg-mint-dim border border-mint/40 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap animate-fadeIn">
          <CheckCircle2 size={18} className="text-mint shrink-0" />
          <p className="text-sm flex-1 min-w-[220px]">
            <strong>Pedido de {created.brand} registrado.</strong>{' '}
            <span className="text-muted">
              {created.paid ? 'Pago verificado.' : 'Quedó con pago pendiente.'}{' '}
              {created.linked ? 'El cliente ya lo ve en su portal.' : 'Aún sin cuenta de cliente: vincúlala en Expedientes.'}
            </span>
          </p>
          <button type="button" onClick={() => onOpenFile(created.brand)} className="text-xs font-semibold text-accent border border-accent/40 rounded-lg px-3 py-1.5 hover:bg-accent/10">Ver expediente</button>
          <button type="button" onClick={() => setView('tareas')} className="text-xs font-semibold bg-accent text-on-accent rounded-lg px-3 py-1.5 hover:bg-accent-strong flex items-center gap-1">Asignar en Tareas <ArrowRight size={13} /></button>
          <button type="button" onClick={() => setCreated(null)} title="Cerrar" className="text-muted hover:text-text"><X size={15} /></button>
        </div>
      )}

      <form onSubmit={submit} className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 glow-card bg-surface-2 border border-line rounded-xl divide-y divide-line">
          {/* 1. Cliente */}
          <section className="p-5 space-y-3">
            <StepTitle n={1} title="Cliente y volumen" />
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label className="sm:col-span-5 block">
                <span className="text-xs text-muted block mb-1">Marca *</span>
                <input list="senda-brands" value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Nombre de la marca" required className={input} />
                <datalist id="senda-brands">{knownBrands.map(b => <option key={b} value={b} />)}</datalist>
              </label>
              <label className="sm:col-span-4 block">
                <span className="text-xs text-muted block mb-1">Cuenta del cliente</span>
                <select value={clientId} onChange={e => setClientId(e.target.value)} className={`${input} cursor-pointer`}>
                  <option value="">Sin vincular (no lo ve)</option>
                  {clientProfiles.map(c => <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>)}
                </select>
              </label>
              <label className="sm:col-span-3 block">
                <span className="text-xs text-muted block mb-1">Videos *</span>
                <input type="number" min={1} max={200} value={videoCount}
                  onChange={e => setVideoCount(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
                  className={`${input} font-tech font-bold text-accent`} />
              </label>
            </div>
            {clientProfiles.length === 0 && (
              <p className="text-[11px] text-muted-2 flex items-center gap-1.5">
                <UserCircle2 size={12} /> No hay cuentas con rol Cliente.
                <button type="button" onClick={() => setView('administracion')} className="text-accent hover:underline">Crear una en Admin</button>
              </p>
            )}
          </section>

          {/* 2. Entrega */}
          <section className="p-5 space-y-3">
            <StepTitle n={2} title="Entrega y complejidad" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted flex items-center gap-1 mb-1"><Calendar size={12} className="text-accent" /> Fecha y hora límite</span>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" min={todayIso()} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={`${input} font-tech ${pastDate ? 'border-red-500/60' : ''}`} />
                  <input type="time" value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)} className={`${input} font-tech`} />
                </div>
                {pastDate && <p className="text-[11px] text-red-400 mt-1">La fecha ya pasó.</p>}
              </div>
              <div>
                <span className="text-xs text-muted flex items-center gap-1 mb-1"><Layers size={12} className="text-accent" /> Complejidad</span>
                <div className="grid grid-cols-3 gap-1.5">
                  {([['simple', 'Simple'], ['estandar', 'Estándar'], ['alta', 'Compleja']] as const).map(([c, label]) => (
                    <button key={c} type="button" onClick={() => setComplexity(c)}
                      className={`py-2 rounded-lg text-xs font-semibold border transition-colors ${complexity === c ? 'bg-accent text-on-accent border-accent' : 'bg-surface-3 text-muted border-line hover:text-text'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* 3. Precio */}
          <section className="p-5 space-y-3">
            <StepTitle n={3} title="Precio y pago al equipo" />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-xs text-muted block mb-1">Cobro al cliente / video</span>
                <input type="number" min={0} step={0.5} value={unitPriceClient} onChange={e => setUnitPriceClient(Math.max(0, Number(e.target.value) || 0))} className={`${input} font-tech`} />
              </label>
              <label className="block">
                <span className="text-xs text-muted block mb-1">Pago al equipo / video</span>
                <input type="number" min={0} step={0.5} value={creatorPay} onChange={e => setCreatorPay(Math.max(0, Number(e.target.value) || 0))} className={`${input} font-tech text-accent`} />
              </label>
              <div>
                <span className="text-xs text-muted block mb-1">Se paga en 2 tramos</span>
                <p className="bg-surface-3/60 border border-dashed border-line rounded-lg px-3 py-2 text-[11px] font-tech text-muted leading-snug">
                  {fmtMoney(creatorPay / 2)} Aprobado Senda + {fmtMoney(creatorPay / 2)} Aprobado Cliente
                </p>
              </div>
            </div>
          </section>

          {/* 4. Archivos */}
          <section className="p-5 space-y-3">
            <StepTitle n={4} title="Factura, brief y notas" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input ref={invoiceRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e => { void upload('invoice', e.target.files?.[0]); e.target.value = ''; }} />
              <FileButton
                icon={<Receipt size={14} />} loading={uploading === 'invoice'} file={invoiceFile} tone="mint"
                empty="Subir factura del pago" hint="Sin factura queda “Pago pendiente”"
                onPick={() => invoiceRef.current?.click()} onClear={() => setInvoiceFile(null)}
              />
              <input ref={briefRef} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={e => { void upload('brief', e.target.files?.[0]); e.target.value = ''; }} />
              <FileButton
                icon={<FileText size={14} />} loading={uploading === 'brief'} file={briefFile} tone="accent"
                empty="Adjuntar brief (opcional)" hint="El cliente también lo completa en su portal"
                onPick={() => briefRef.current?.click()} onClear={() => setBriefFile(null)}
              />
            </div>
            {uploadError && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle size={13} /> {uploadError}</p>}
            <textarea value={clientNotes} onChange={e => setClientNotes(e.target.value)} rows={2}
              placeholder="Indicaciones de estilo, formato de entrega, enlaces del cliente…" className={`${input} resize-y`} />
          </section>
        </div>

        {/* Resumen en vivo */}
        <aside className="lg:col-span-5 lg:sticky lg:top-4 space-y-4">
          <div className="glow-card bg-surface-2 border border-line rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-semibold">Resumen del pedido</h3>
              <span className="font-tech text-xs text-mint">Margen {money.pct}%</span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <MoneyBox label="Cobro total" value={fmtMoney(money.gross)} />
              <MoneyBox label="Pago al equipo" value={fmtMoney(money.team)} cls="text-accent" />
              <MoneyBox label="Neto SENDA" value={fmtMoney(money.net)} cls="text-mint" highlight />
            </div>

            <div className={`rounded-lg border p-3.5 space-y-2.5 ${capacity.fits ? 'bg-mint/5 border-mint/30' : 'bg-amber/5 border-amber/40'}`}>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  {capacity.fits
                    ? <><CheckCircle2 size={15} className="text-mint" /> Cabe en la fecha pedida</>
                    : <><AlertTriangle size={15} className="text-amber" /> Supera el cupo del día ({capacity.freeOnTarget} libres)</>}
                </span>
                <span className={`font-tech text-[11px] font-bold px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[capacity.priority]}`}>
                  Prioridad {PRIORITY_LABEL[capacity.priority]}
                </span>
              </div>
              <p className="text-xs text-muted">{capacity.reason}</p>
              <div className="grid grid-cols-3 gap-2 text-center">
                <MiniStat icon={<Users size={12} />} label="Personas" value={String(capacity.people)} />
                <MiniStat icon={<Cpu size={12} />} label="Cupo diario" value={`${capacity.dailyLimit} vid`} />
                <MiniStat icon={<Clock size={12} />} label="Ocupación" value={`${capacity.saturation}%`} />
              </div>
              {capacity.batches.length > 1 && (
                <ul className="text-[11px] font-tech text-muted space-y-1 pt-1 border-t border-line/60">
                  {capacity.batches.map((b, i) => (
                    <li key={b.date} className="flex justify-between"><span>Tanda {i + 1} · {fmtDate(b.date)}</span><span className="text-text">{b.videos} videos</span></li>
                  ))}
                </ul>
              )}
              <p className="text-[11px] text-accent font-tech">Entrega estimada: {capacity.eta}</p>
            </div>

            <div className="space-y-1.5 text-xs">
              <Check ok={Boolean(brandName.trim())} label="Marca" />
              <Check ok={Boolean(clientId)} label="Cuenta del cliente vinculada" optional />
              <Check ok={Boolean(invoiceFile)} label="Factura del pago" optional />
            </div>

            <button type="submit" disabled={!canSubmit}
              className="w-full py-3 rounded-xl bg-accent text-on-accent font-display text-sm font-bold hover:bg-accent-strong transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed">
              {uploading ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
              {uploading ? 'Esperando la subida…' : invoiceFile ? 'Registrar pedido pagado' : 'Registrar con pago pendiente'}
            </button>
          </div>
        </aside>
      </form>
    </div>
  );
}

function StepTitle({ n, title }: { n: number; title: string }) {
  return (
    <p className="font-semibold flex items-center gap-2.5">
      <span className="w-6 h-6 rounded-md bg-accent-dim text-accent font-tech text-xs font-bold flex items-center justify-center">{n}</span>
      {title}
    </p>
  );
}

function FileButton({ icon, loading, file, tone, empty, hint, onPick, onClear }: {
  icon: React.ReactNode; loading: boolean; file: { name: string } | null; tone: 'mint' | 'accent';
  empty: string; hint: string; onPick: () => void; onClear: () => void;
}) {
  const on = tone === 'mint' ? 'bg-mint/5 border-mint/40 text-mint' : 'bg-accent/5 border-accent/40 text-accent';
  return (
    <div>
      <div className={`flex items-center gap-2 rounded-lg border px-3 py-2.5 text-xs ${file ? on : 'bg-surface-3 border-dashed border-line text-muted'}`}>
        {loading ? <Loader2 size={14} className="animate-spin shrink-0" /> : file ? <CheckCircle2 size={14} className="shrink-0" /> : icon}
        <button type="button" onClick={onPick} disabled={loading} className="flex-1 min-w-0 text-left truncate font-medium hover:text-text disabled:cursor-wait">
          {loading ? 'Subiendo…' : file ? file.name : empty}
        </button>
        {file && !loading && <button type="button" onClick={onClear} title="Quitar" className="text-muted-2 hover:text-red-400"><X size={13} /></button>}
        {!file && !loading && <Upload size={13} className="shrink-0" />}
      </div>
      <p className="text-[10px] text-muted-2 mt-1">{hint}</p>
    </div>
  );
}

function MoneyBox({ label, value, cls = 'text-text', highlight }: { label: string; value: string; cls?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${highlight ? 'bg-mint/5 border-mint/30' : 'bg-surface-3 border-line'}`}>
      <p className="text-[10px] text-muted-2">{label}</p>
      <p className={`font-tech text-base font-bold mt-0.5 truncate ${cls}`}>{value}</p>
    </div>
  );
}

function MiniStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="bg-surface-2 border border-line rounded-lg py-2">
      <p className="text-[10px] text-muted-2 flex items-center justify-center gap-1">{icon} {label}</p>
      <p className="font-tech text-xs font-bold mt-0.5">{value}</p>
    </div>
  );
}

function Check({ ok, label, optional }: { ok: boolean; label: string; optional?: boolean }) {
  return (
    <p className={`flex items-center gap-2 ${ok ? 'text-mint' : 'text-muted-2'}`}>
      {ok ? <CheckCircle2 size={13} /> : <span className="w-3 h-3 rounded-full border border-current" />}
      {label}{!ok && optional && <span className="text-[10px]">(opcional)</span>}
    </p>
  );
}

// =====================================================================
// EXPEDIENTES
// =====================================================================
interface ClientFile {
  brand: string;
  orders: Order[];
  videos: number;
  billed: number;
  net: number;
  pendingAmount: number;
  active: number;
  latest: string;
  linked: boolean;
}

function ClientFiles({ focusBrand, onNewOrder }: { focusBrand: string | null; onNewOrder: () => void }) {
  const { orders, financeSettings } = useStore();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('todos');
  const [selected, setSelected] = useState<string | null>(focusBrand);

  const files = useMemo<ClientFile[]>(() => {
    const map = new Map<string, ClientFile>();
    for (const o of orders) {
      const name = baseBrand(o.brand);
      if (!name) continue;
      const key = name.toLowerCase();
      const f = map.get(key) || { brand: name, orders: [], videos: 0, billed: 0, net: 0, pendingAmount: 0, active: 0, latest: '', linked: false };
      const count = Math.max(1, o.videoCount || 1);
      const eco = unitEconomics(null, o, financeSettings);
      f.orders.push(o);
      f.videos += count;
      if (isPaid(o)) f.billed += count * eco.price; else f.pendingAmount += count * eco.price;
      f.net += count * (eco.price - eco.creatorPay);
      if (o.status !== 'finalizado') f.active += 1;
      if (o.clientId) f.linked = true;
      if ((o.createdAt || '') > f.latest) f.latest = o.createdAt || '';
      map.set(key, f);
    }
    for (const f of map.values()) f.orders.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return Array.from(map.values()).sort((a, b) => b.latest.localeCompare(a.latest));
  }, [orders, financeSettings]);

  const visible = files.filter(f =>
    (!search.trim() || f.brand.toLowerCase().includes(search.trim().toLowerCase())) &&
    (filter === 'todos' || (filter === 'activos' ? f.active > 0 : f.pendingAmount > 0))
  );
  const active = visible.find(f => f.brand.toLowerCase() === selected?.toLowerCase()) || visible[0] || null;

  if (files.length === 0) {
    return (
      <div className="bg-surface-2 border border-dashed border-line rounded-xl py-16 text-center">
        <Briefcase size={30} className="text-muted-2 mx-auto mb-3" />
        <p className="font-display text-lg font-semibold">Aún no hay pedidos</p>
        <p className="text-sm text-muted mt-1">Registra el primero y aquí verás su expediente, factura y avance.</p>
        <button type="button" onClick={onNewOrder} className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold bg-accent text-on-accent rounded-lg px-4 py-2 hover:bg-accent-strong">
          <PlusCircle size={14} /> Nuevo pedido
        </button>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <div className="lg:col-span-4 space-y-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar marca…"
            className="w-full bg-surface-2 border border-line rounded-lg pl-8 pr-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-2" />
        </div>
        <div className="flex gap-1.5">
          {([['todos', 'Todos'], ['activos', 'Activos'], ['por_cobrar', 'Por cobrar']] as [ClientFilter, string][]).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filter === k ? 'bg-accent text-on-accent' : 'bg-surface-2 border border-line text-muted hover:text-text'}`}>{l}</button>
          ))}
        </div>
        <div className="space-y-2 lg:max-h-[calc(100vh-320px)] lg:overflow-y-auto lg:pr-1">
          {visible.length === 0 && <p className="text-sm text-muted text-center py-8">Ningún cliente coincide.</p>}
          {visible.map(f => {
            const on = active?.brand === f.brand;
            return (
              <button key={f.brand} type="button" onClick={() => setSelected(f.brand)}
                className={`glow-card w-full text-left p-3.5 rounded-xl border transition-colors ${on ? 'bg-accent/10 border-accent' : 'bg-surface-2 border-line hover:border-accent/40'}`}>
                <div className="flex items-center gap-3">
                  <span className="w-9 h-9 rounded-lg bg-accent-dim text-accent font-display font-bold flex items-center justify-center shrink-0">{f.brand.charAt(0).toUpperCase()}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{f.brand}</p>
                    <p className="text-[11px] text-muted-2 font-tech">{f.orders.length} pedido(s) · {f.videos} videos</p>
                  </div>
                  {f.pendingAmount > 0
                    ? <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-dim text-amber shrink-0">Por cobrar</span>
                    : !f.linked && <span title="Sin cuenta de cliente" className="text-muted-2 shrink-0"><UserCircle2 size={15} /></span>}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {active && <ClientDetail key={active.brand} file={active} />}
    </div>
  );
}

function ClientDetail({ file }: { file: ClientFile }) {
  return (
    <div className="lg:col-span-8 space-y-4">
      <div className="glow-card bg-surface-2 border border-line rounded-xl p-5 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-wider text-accent">Expediente</p>
          <h3 className="font-display text-2xl font-bold">{file.brand}</h3>
          <p className="text-xs text-muted mt-1">{file.orders.length} pedido(s) · {file.videos} videos · {file.active} activo(s)</p>
        </div>
        <div className="grid grid-cols-3 gap-2 min-w-[300px]">
          <MoneyBox label="Pagado" value={fmtMoney(file.billed)} />
          <MoneyBox label="Por cobrar" value={fmtMoney(file.pendingAmount)} cls={file.pendingAmount ? 'text-amber' : 'text-muted'} />
          <MoneyBox label="Neto SENDA" value={fmtMoney(file.net)} cls="text-mint" highlight />
        </div>
      </div>
      {file.orders.map((o, i) => <OrderCard key={o.id} order={o} number={file.orders.length - i} />)}
    </div>
  );
}

function OrderCard({ order, number }: { order: Order; number: number }) {
  const { orders, brands, financeSettings, updateOrder, deleteOrder, setView } = useStore();
  const [busy, setBusy] = useState<'brief' | 'invoice' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showBrief, setShowBrief] = useState(false);

  const count = Math.max(1, order.videoCount || 1);
  const eco = unitEconomics(null, order, financeSettings);
  const total = count * eco.price;
  const paid = isPaid(order);
  const videos = brands.flatMap(b => b.videos).filter(v => v.orderId === order.id || v.id === order.boardVideoId);
  const approved = videos.filter(v => v.qc === 'aprobado_cliente').length;
  const delivered = videos.filter(isDelivered).length;
  const soleOrderOfBrand = !orders.some(o => o.id !== order.id && baseBrand(o.brand).toLowerCase() === baseBrand(order.brand).toLowerCase());

  const uploadFile = async (kind: 'brief' | 'invoice', f: File | undefined) => {
    if (!f) return;
    setBusy(kind);
    setError(null);
    try {
      const url = await uploadSharedFile(f, kind === 'brief' ? 'client-briefs' : 'client-invoices');
      updateOrder(order.id, kind === 'brief'
        ? { briefFileName: f.name, briefFileUrl: url }
        : { invoiceFileName: f.name, invoiceFileUrl: url, paymentStatus: 'completado' });
    } catch {
      setError('No se pudo subir el archivo. Intenta de nuevo.');
    } finally {
      setBusy(null);
    }
  };

  const printInvoice = () => {
    let code = order.invoiceNumber;
    if (!code) {
      code = nextInvoiceCode(orders, order.brand, (order.createdAt || todayIso()).slice(0, 10));
      updateOrder(order.id, { invoiceNumber: code, invoiceDate: order.invoiceDate || todayIso() });
    }
    const win = window.open('', '_blank', 'width=840,height=760');
    if (!win) { setError('El navegador bloqueó la ventana. Permite ventanas emergentes para SENDA.'); return; }
    const b = escapeHtml(order.brand);
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Factura ${code} · SENDA</title>
<style>
body{font-family:Inter,-apple-system,sans-serif;background:#fff;color:#111;padding:40px;margin:0}
.card{max-width:720px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;padding:36px}
.row{display:flex;justify-content:space-between;align-items:flex-start;gap:16px}
.brand{font-size:22px;font-weight:800;letter-spacing:.08em;color:#0EA6B8}
.badge{display:inline-block;padding:5px 12px;border-radius:999px;font-size:11px;font-weight:700;text-transform:uppercase}
.ok{background:#e7faf4;color:#0f8a68;border:1px solid #6FE7C8}.pend{background:#fff7e0;color:#9a6a00;border:1px solid #FFC857}
table{width:100%;border-collapse:collapse;margin-top:28px}th,td{padding:12px;text-align:left;border-bottom:1px solid #e2e8f0;font-size:14px}
th{color:#64748b;font-size:11px;text-transform:uppercase;letter-spacing:.06em}.meta{color:#64748b;font-size:13px;line-height:1.6}
.total{font-size:22px;font-weight:800}
</style></head><body><div class="card">
<div class="row"><div><div class="brand">SENDA STUDIO</div><p class="meta">Factura de producción audiovisual<br/>Folio: <strong>${escapeHtml(code)}</strong></p></div>
<div style="text-align:right"><span class="badge ${paid ? 'ok' : 'pend'}">${paid ? 'Pagado' : 'Pago pendiente'}</span>
<p class="meta" style="margin-top:8px">Fecha: ${escapeHtml(order.invoiceDate || (order.createdAt || '').slice(0, 10))}<br/>Entrega: ${escapeHtml(fmtDate(order.deliveryDate, order.deliveryTime))}</p></div></div>
<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0"/>
<p class="meta" style="margin:0">CLIENTE</p><h2 style="margin:4px 0 0;font-size:20px">${b}</h2>
<table><thead><tr><th>Concepto</th><th>Cantidad</th><th>Tarifa</th><th>Subtotal</th></tr></thead>
<tbody><tr><td>Producción y edición de videos (${b})</td><td>${count}</td><td>${fmtMoney(eco.price)}</td><td><strong>${fmtMoney(total)}</strong></td></tr></tbody></table>
<div class="row" style="margin-top:24px;align-items:center"><div class="meta">Gracias por confiar en SENDA.</div>
<div style="text-align:right"><span class="meta">TOTAL</span><div class="total">${fmtMoney(total)}</div></div></div>
</div><script>setTimeout(function(){window.print()},300)</script></body></html>`);
    win.document.close();
  };

  const statusChip = order.status === 'finalizado' ? { l: 'Finalizado', c: 'bg-mint-dim text-mint' }
    : order.clipperId || order.status === 'asignado' ? { l: 'En producción', c: 'bg-accent-dim text-accent' }
    : { l: 'Sin asignar', c: 'bg-amber-dim text-amber' };

  return (
    <div className="glow-card bg-surface-2 border border-line rounded-xl p-5 space-y-4 hover:border-accent/30 transition-colors">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-display font-bold">Pedido #{number}</span>
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusChip.c}`}>{statusChip.l}</span>
            {order.priority && order.priority !== 'normal' && (
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[order.priority]}`}>{PRIORITY_LABEL[order.priority]}</span>
            )}
          </div>
          <p className="text-xs text-muted mt-1 font-tech">
            Entrega {fmtDate(order.deliveryDate, order.deliveryTime)}{order.invoiceNumber ? ` · ${order.invoiceNumber}` : ''}
          </p>
        </div>
        {paid ? (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-mint-dim text-mint flex items-center gap-1.5"><CheckCircle2 size={13} /> Pagado</span>
        ) : (
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-amber-dim text-amber flex items-center gap-1.5"><Lock size={13} /> Pago pendiente</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MoneyBox label={`${count} videos · ${fmtMoney(eco.price)} c/u`} value={fmtMoney(total)} />
        <MoneyBox label="Neto SENDA" value={fmtMoney(total - count * eco.creatorPay)} cls="text-mint" />
        <div className="bg-surface-3 border border-line rounded-lg p-3">
          <p className="text-[10px] text-muted-2">Avance</p>
          <div className="flex h-1.5 rounded-full overflow-hidden bg-surface-2 mt-2">
            <span className="bg-mint" style={{ width: `${(approved / count) * 100}%` }} />
            <span className="bg-accent" style={{ width: `${(Math.max(0, delivered - approved) / count) * 100}%` }} />
          </div>
          <p className="text-[10px] font-tech text-muted-2 mt-1.5"><span className="text-accent">{delivered}</span> entregados · <span className="text-mint">{approved}</span> aprobados de {count}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
        <ClientAccountField order={order} />
        <DriveFolderField order={order} compact />
      </div>

      {error && <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertTriangle size={13} /> {error}</p>}

      {showBrief && <OrderBriefPanel order={order} />}

      <div className="flex items-center gap-2 flex-wrap pt-3 border-t border-line/60">
        {order.briefFileUrl ? (
          <a href={order.briefFileUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-surface-3 border border-line text-xs font-medium flex items-center gap-1.5 hover:border-accent/40">
            <FileText size={13} className="text-accent" /> Brief <ExternalLink size={11} className="text-muted-2" />
          </a>
        ) : (
          <label className="px-3 py-1.5 rounded-lg bg-surface-3 border border-dashed border-line text-muted hover:text-text text-xs font-medium flex items-center gap-1.5 cursor-pointer">
            {busy === 'brief' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />} Subir brief
            <input type="file" className="hidden" accept=".pdf,.doc,.docx,image/*" onChange={e => { void uploadFile('brief', e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}

        {order.invoiceFileUrl && (
          <a href={order.invoiceFileUrl} target="_blank" rel="noreferrer" className="px-3 py-1.5 rounded-lg bg-surface-3 border border-line text-xs font-medium flex items-center gap-1.5 hover:border-mint/40">
            <Receipt size={13} className="text-mint" /> Comprobante <ExternalLink size={11} className="text-muted-2" />
          </a>
        )}
        <label className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer border ${paid ? 'bg-surface-3 border-line text-muted hover:text-text' : 'bg-amber-dim border-amber/40 text-amber hover:bg-amber/20'}`}>
          {busy === 'invoice' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
          {order.invoiceFileUrl ? 'Reemplazar comprobante' : 'Subir comprobante'}
          <input type="file" className="hidden" accept=".pdf,image/*" onChange={e => { void uploadFile('invoice', e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {!paid && (
          <button type="button" onClick={() => updateOrder(order.id, { paymentStatus: 'completado' })}
            className="px-3 py-1.5 rounded-lg bg-mint text-on-accent text-xs font-semibold flex items-center gap-1.5 hover:opacity-90">
            <CheckCircle2 size={13} /> Marcar pagado
          </button>
        )}

        <button type="button" onClick={printInvoice} className="px-3 py-1.5 rounded-lg bg-surface-3 border border-line text-xs font-medium flex items-center gap-1.5 hover:border-accent/40">
          <Printer size={13} className="text-accent" /> Factura PDF
        </button>
        <button type="button" onClick={() => setShowBrief(v => !v)}
          className={`px-3 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors ${showBrief ? 'bg-violet/15 border-violet/40 text-violet' : 'bg-surface-3 border-line text-text hover:border-violet/40'}`}>
          <FileText size={13} className="text-violet" /> Brief y guiones
        </button>
        <button type="button" onClick={() => setView('tareas')} className="px-3 py-1.5 rounded-lg bg-surface-3 border border-line text-accent text-xs font-medium flex items-center gap-1.5 hover:border-accent/40">
          Ir a Tareas <ArrowRight size={12} />
        </button>

        <div className="ml-auto">
          {confirmDelete ? (
            <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/40 rounded-lg px-2.5 py-1">
              <span className="text-[11px] text-red-400 font-semibold">
                {soleOrderOfBrand ? '¿Borrar pedido y sus videos?' : '¿Borrar pedido?'}
              </span>
              <button type="button" onClick={() => deleteOrder(order.id)} className="px-2 py-0.5 rounded bg-red-500 text-white text-[11px] font-bold hover:bg-red-600">Sí, borrar</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="px-2 py-0.5 rounded text-muted text-[11px] hover:text-text">Cancelar</button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} title="Borrar pedido"
              className="px-2.5 py-1.5 rounded-lg text-muted-2 hover:text-red-400 hover:bg-red-500/10 text-xs flex items-center gap-1 transition-colors">
              <Trash2 size={13} /> Borrar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
