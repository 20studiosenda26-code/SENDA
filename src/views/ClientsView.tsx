// Clientes y pedidos del Administrador (pensado para computador). Mismo lenguaje que Inicio y Tareas.
//   · Entregas y feedback → portal de revisión (lo mismo que ve el cliente, con ronda extra)
//   · Nuevo pedido        → tarjetas numeradas por paso + resumen en vivo (dinero y capacidad)
//   · Expedientes         → lista + detalle por cliente (pagos, cuenta, Drive, avance, factura)
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { uploadSharedFile } from '../lib/supabaseClient';
import { buildWorkUnits, spreadLoad } from '../lib/capacity';
import { ClientPortal } from './ClientPortal';
import { ClientAccountField } from '../components/ClientAccountField';
import { DriveFolderField } from '../components/DriveFolderField';
import { GlowCard } from '../components/ui/spotlight-card';
import NumberTicker from '../components/ui/number-ticker';
import { AnimatedRadialChart } from '../components/ui/animated-radial-chart';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';
import { countdownLabel, deadlineMs, EmptyState, fmtDate, MoneyCard, StatChip } from '../components/home/home-bits';
import { takeNavIntent } from '../lib/navIntent';
import { addDaysIso, fmtMoney, todayIso, unitEconomics } from '../lib/economics';
import type { Order, Video } from '../types';
import {
  AlertTriangle, ArrowRight, Briefcase, Calendar, CheckCircle2, ChevronRight, ClipboardCheck, DollarSign,
  ExternalLink, FileText, FolderOpen, Gauge, Layers, Loader2, Play, PlusCircle, Printer, Receipt, Search,
  Trash2, TrendingUp, Upload, UserCircle2, Users, Wallet, X,
} from 'lucide-react';

type Tab = 'portal_videos' | 'nuevo_pedido' | 'cartera';
type Priority = 'normal' | 'prioritario' | 'urgente' | 'critico';
type FileFilter = 'todos' | 'activos' | 'por_cobrar' | 'sin_cuenta';

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const baseBrand = (name: string) => name.split(' · Tanda ')[0].trim();
const isPaid = (o: Order) => o.paymentStatus !== 'incompleto';
const isDelivered = (v: Video) => Boolean(v.publishedToClient || v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente');
const waitingClient = (v: Video) => isDelivered(v) && v.qc !== 'aprobado_cliente' && v.qc !== 'correcciones';

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
  critico: 'bg-red-500/10 text-red-400 border-red-500/30',
  urgente: 'bg-amber-dim text-amber border-amber/30',
  prioritario: 'bg-accent-dim text-accent border-accent/30',
  normal: 'bg-mint-dim text-mint border-mint/30',
};
const PRIORITY_LABEL: Record<Priority, string> = { critico: 'Crítica', urgente: 'Urgente', prioritario: 'Prioritaria', normal: 'Normal' };

export function ClientsView() {
  const { orders, brands } = useStore();
  const [tab, setTab] = useState<Tab>(() => {
    const intent = takeNavIntent('clientes');
    return intent === 'nuevo_pedido' || intent === 'cartera' ? intent : 'portal_videos';
  });
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FileFilter>('todos');
  const [focusBrand, setFocusBrand] = useState<string | null>(null);

  const counts = useMemo(() => {
    const brandKeys = new Set(orders.map(o => baseBrand(o.brand).toLowerCase()).filter(Boolean));
    return {
      clients: brandKeys.size,
      waiting: brands.flatMap(b => b.videos).filter(waitingClient).length,
      unpaid: orders.filter(o => !isPaid(o)).length,
      unlinked: orders.filter(o => !o.clientId && o.status !== 'finalizado').length,
    };
  }, [orders, brands]);

  const goFiles = (f: FileFilter, brand: string | null = null) => { setFilter(f); setFocusBrand(brand); setTab('cartera'); };

  const tabs: { key: Tab; label: string; count?: number; icon: ReactNode }[] = [
    { key: 'portal_videos', label: 'Entregas y feedback', count: counts.waiting, icon: <Play size={15} /> },
    { key: 'cartera', label: 'Expedientes', count: counts.clients, icon: <FolderOpen size={15} /> },
    { key: 'nuevo_pedido', label: 'Nuevo pedido', icon: <PlusCircle size={15} /> },
  ];

  return (
    <div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fadeIn">
      {/* Encabezado */}
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-[0.18em] text-accent flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" /> En vivo
          </p>
          <h2 className="font-display text-3xl xl:text-4xl font-bold mt-1">Clientes y pedidos</h2>
          <p className="text-muted text-sm mt-1">Registra pedidos, vincula la cuenta de cada cliente y sigue sus entregas, feedback y pagos.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <StatChip label="Esperando al cliente" value={counts.waiting} tone="accent" onClick={() => setTab('portal_videos')} />
          <StatChip label="Pagos pendientes" value={counts.unpaid} tone="amber" onClick={() => goFiles('por_cobrar')} />
          <StatChip label="Sin cuenta de cliente" value={counts.unlinked} tone="red" onClick={() => goFiles('sin_cuenta')} />
          <StatChip label="Clientes" value={counts.clients} tone="mint" onClick={() => goFiles('todos')} />
        </div>
      </div>

      {/* Pestañas + buscador */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-1 bg-surface-2 border border-line rounded-xl p-1 w-fit" role="tablist">
          {tabs.map(t => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                tab === t.key ? 'bg-accent text-on-accent shadow-[0_0_16px_-6px_rgba(53,214,228,0.7)]' : 'text-muted hover:text-text'
              }`}
            >
              {t.icon} {t.label}
              {t.count !== undefined && (
                <span className={`font-tech text-[11px] px-1.5 rounded ${tab === t.key ? 'bg-black/20' : 'bg-surface-3'}`}>{t.count}</span>
              )}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {tab === 'cartera' && (
            <>
              <label className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-2" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar marca…"
                  className="w-56 bg-surface-2 border border-line rounded-lg pl-8 pr-8 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-2"
                />
                {search && (
                  <button type="button" onClick={() => setSearch('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-2 hover:text-text">
                    <X size={14} />
                  </button>
                )}
              </label>
              <select
                value={filter}
                onChange={e => setFilter(e.target.value as FileFilter)}
                aria-label="Filtrar expedientes"
                className="bg-surface-2 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="todos">Todos los clientes</option>
                <option value="activos">Con pedidos activos</option>
                <option value="por_cobrar">Con pagos pendientes</option>
                <option value="sin_cuenta">Sin cuenta de cliente</option>
              </select>
            </>
          )}
          {tab !== 'nuevo_pedido' && (
            <button
              type="button"
              onClick={() => setTab('nuevo_pedido')}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-on-accent text-sm font-semibold hover:bg-accent-strong transition-all hover:-translate-y-0.5 shadow-[0_0_20px_-6px_rgba(53,214,228,0.6)]"
            >
              <PlusCircle size={15} /> Nuevo pedido
            </button>
          )}
        </div>
      </div>

      {tab === 'portal_videos' && <ClientPortal />}
      {tab === 'nuevo_pedido' && <NewOrderForm onOpenFile={brand => goFiles('todos', brand)} />}
      {tab === 'cartera' && (
        <ClientFiles key={focusBrand || 'all'} search={search} filter={filter} focusBrand={focusBrand}
          onClearFilter={() => { setFilter('todos'); setSearch(''); }} onNewOrder={() => setTab('nuevo_pedido')} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Nuevo pedido: tarjetas numeradas (8) + resumen en vivo (4)
// ---------------------------------------------------------------------------
function NewOrderForm({ onOpenFile }: { onOpenFile: (brand: string) => void }) {
  const { orders, brands, workers, financeSettings, capacityConfig, getWorkerCapacity, addOrder, clientProfiles, setView } = useStore();

  const [brandName, setBrandName] = useState('');
  const [clientId, setClientId] = useState('');
  const [videoCount, setVideoCount] = useState(5);
  const [deliveryDate, setDeliveryDate] = useState(() => addDaysIso(todayIso(), 3));
  const [deliveryTime, setDeliveryTime] = useState('18:00');
  const [complexity, setComplexity] = useState<'simple' | 'estandar' | 'alta'>('estandar');
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

  const submit = () => {
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const input = 'w-full bg-surface-3 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent placeholder:text-muted-2 transition-colors';

  return (
    <div className="space-y-5">
      {created && (
        <div className="bg-mint-dim border border-mint/30 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap animate-fadeIn">
          <CheckCircle2 size={18} className="text-mint shrink-0" />
          <p className="text-sm flex-1 min-w-[220px]">
            <strong>Pedido de {created.brand} registrado.</strong>{' '}
            <span className="text-muted">
              {created.paid ? 'Pago verificado.' : 'Quedó con pago pendiente.'}{' '}
              {created.linked ? 'El cliente ya lo ve en su portal.' : 'Aún sin cuenta de cliente: vincúlala en el expediente.'}
            </span>
          </p>
          <button type="button" onClick={() => onOpenFile(created.brand)} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">Ver expediente <ChevronRight size={14} /></button>
          <button type="button" onClick={() => setView('tareas')} className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-accent text-on-accent text-sm font-semibold hover:bg-accent-strong transition-all">
            Asignar en Tareas <ArrowRight size={14} />
          </button>
          <button type="button" onClick={() => setCreated(null)} aria-label="Cerrar aviso" className="text-muted hover:text-text"><X size={15} /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8 space-y-5">
          {/* 1 · Cliente */}
          <GlowCard tone="violet" contentClassName="p-5">
            <StepHeader n={1} icon={<Users size={18} className="text-violet shrink-0" />} title="Cliente y volumen" hint="La marca y la cuenta con la que el cliente verá su proyecto." />
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
              <label className="sm:col-span-5 block">
                <span className="text-[11px] text-muted-2 block mb-1">Marca *</span>
                <input list="senda-brands" value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Nombre de la marca" className={input} />
                <datalist id="senda-brands">{knownBrands.map(b => <option key={b} value={b} />)}</datalist>
              </label>
              <label className="sm:col-span-4 block">
                <span className="text-[11px] text-muted-2 block mb-1">Cuenta del cliente</span>
                <select value={clientId} onChange={e => setClientId(e.target.value)} className={`${input} cursor-pointer`}>
                  <option value="">Sin vincular (no lo ve)</option>
                  {clientProfiles.map(c => <option key={c.id} value={c.id}>{c.name}{c.email ? ` · ${c.email}` : ''}</option>)}
                </select>
              </label>
              <label className="sm:col-span-3 block">
                <span className="text-[11px] text-muted-2 block mb-1">Videos *</span>
                <input type="number" min={1} max={200} value={videoCount}
                  onChange={e => setVideoCount(Math.min(200, Math.max(1, Number(e.target.value) || 1)))}
                  className={`${input} font-tech font-bold text-accent`} />
              </label>
            </div>
            {clientProfiles.length === 0 && (
              <p className="text-[11px] text-muted-2 flex items-center gap-1.5 mt-2">
                <UserCircle2 size={12} /> No hay cuentas con rol Cliente.
                <button type="button" onClick={() => setView('administracion')} className="text-accent hover:text-accent-strong">Crear una en Admin</button>
              </p>
            )}
          </GlowCard>

          {/* 2 · Entrega */}
          <GlowCard tone="amber" contentClassName="p-5">
            <StepHeader n={2} icon={<Calendar size={18} className="text-amber shrink-0" />} title="Entrega y complejidad"
              hint={Number.isFinite(deadlineMs(deliveryDate, deliveryTime)) && !pastDate ? countdownLabel(deadlineMs(deliveryDate, deliveryTime)) : 'Fecha límite del cliente'} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <span className="text-[11px] text-muted-2 block mb-1">Fecha y hora límite</span>
                <div className="grid grid-cols-2 gap-2">
                  <input type="date" min={todayIso()} value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} className={`${input} font-tech ${pastDate ? 'border-red-500/60' : ''}`} />
                  <input type="time" value={deliveryTime} onChange={e => setDeliveryTime(e.target.value)} className={`${input} font-tech`} />
                </div>
                {pastDate && <p className="text-[11px] text-red-400 mt-1">La fecha ya pasó.</p>}
              </div>
              <div>
                <span className="text-[11px] text-muted-2 block mb-1">Complejidad</span>
                <div className="grid grid-cols-3 gap-1 bg-surface-3 border border-line rounded-lg p-0.5">
                  {([['simple', 'Simple'], ['estandar', 'Estándar'], ['alta', 'Compleja']] as const).map(([c, label]) => (
                    <button key={c} type="button" onClick={() => setComplexity(c)}
                      className={`py-1.5 rounded-md text-xs font-medium transition-colors ${complexity === c ? 'bg-surface-2 text-accent' : 'text-muted hover:text-text'}`}>
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </GlowCard>

          {/* 3 · Precio */}
          <GlowCard tone="mint" contentClassName="p-5">
            <StepHeader n={3} icon={<DollarSign size={18} className="text-mint shrink-0" />} title="Precio y pago al equipo" hint={`Margen ${money.pct}%`} />
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[11px] text-muted-2 block mb-1">Cobro al cliente / video</span>
                <input type="number" min={0} step={0.5} value={unitPriceClient} onChange={e => setUnitPriceClient(Math.max(0, Number(e.target.value) || 0))} className={`${input} font-tech`} />
              </label>
              <label className="block">
                <span className="text-[11px] text-muted-2 block mb-1">Pago al equipo / video</span>
                <input type="number" min={0} step={0.5} value={creatorPay} onChange={e => setCreatorPay(Math.max(0, Number(e.target.value) || 0))} className={`${input} font-tech text-accent`} />
              </label>
              <div className="bg-surface-3 border border-line rounded-lg p-3">
                <p className="text-[11px] text-muted-2">Se paga en 2 tramos</p>
                <p className="text-xs font-tech mt-1"><span className="text-accent">{fmtMoney(creatorPay / 2)}</span> Aprobado Senda</p>
                <p className="text-xs font-tech"><span className="text-mint">{fmtMoney(creatorPay / 2)}</span> Aprobado Cliente</p>
              </div>
            </div>
          </GlowCard>

          {/* 4 · Archivos */}
          <GlowCard contentClassName="p-5 space-y-3">
            <StepHeader n={4} icon={<Receipt size={18} className="text-accent shrink-0" />} title="Factura, brief y notas" hint="Todo es opcional" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input ref={invoiceRef} type="file" accept=".pdf,image/*" className="hidden" onChange={e => { void upload('invoice', e.target.files?.[0]); e.target.value = ''; }} />
              <FileSlot icon={<Receipt size={15} />} loading={uploading === 'invoice'} file={invoiceFile}
                empty="Subir factura del pago" hint="Sin factura queda “Pago pendiente”"
                onPick={() => invoiceRef.current?.click()} onClear={() => setInvoiceFile(null)} />
              <input ref={briefRef} type="file" accept=".pdf,.doc,.docx,image/*" className="hidden" onChange={e => { void upload('brief', e.target.files?.[0]); e.target.value = ''; }} />
              <FileSlot icon={<FileText size={15} />} loading={uploading === 'brief'} file={briefFile}
                empty="Adjuntar brief" hint="El cliente también lo completa en su portal"
                onPick={() => briefRef.current?.click()} onClear={() => setBriefFile(null)} />
            </div>
            {uploadError && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-1.5"><AlertTriangle size={13} /> {uploadError}</p>}
            <textarea value={clientNotes} onChange={e => setClientNotes(e.target.value)} rows={2}
              placeholder="Indicaciones de estilo, formato de entrega, enlaces del cliente…" className={`${input} resize-y`} />
          </GlowCard>
        </div>

        {/* Resumen en vivo */}
        <div className="lg:col-span-4 space-y-5 lg:sticky lg:top-20">
          <GlowCard tone="mint" contentClassName="p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Wallet size={18} className="text-mint shrink-0" /> Resumen del pedido
              </h3>
              <span className="text-xs text-muted-2 font-tech">{videoCount} videos</span>
            </div>
            <div className="grid grid-cols-1 gap-2.5">
              <MoneyCard icon={<Receipt size={16} />} label="Cobro al cliente" value={<NumberTicker value={money.gross} />} sub={`${fmtMoney(unitPriceClient)} por video`} tone="text" />
              <MoneyCard icon={<Users size={16} />} label="Pago al equipo" value={<NumberTicker value={money.team} />} sub="50% Aprobado Senda + 50% Aprobado Cliente" tone="amber" />
              <MoneyCard icon={<TrendingUp size={16} />} label="Neto SENDA" value={<NumberTicker value={money.net} />} sub={`Margen del ${money.pct}%`} tone="mint" highlight />
            </div>
          </GlowCard>

          <GlowCard tone={capacity.fits ? 'accent' : 'amber'} contentClassName="p-5 flex flex-col items-center">
            <div className="self-stretch flex items-center justify-between gap-3">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Gauge size={18} className="text-accent shrink-0" /> Capacidad
              </h3>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[capacity.priority]}`}>Prioridad {PRIORITY_LABEL[capacity.priority]}</span>
            </div>
            <div className="pt-3">
              <AnimatedRadialChart value={capacity.saturation} size={190} strokeWidth={13} showLabels={false} caption={`Ocupación del día · cupo ${capacity.dailyLimit} videos`} />
            </div>
            <p className={`self-stretch text-xs mt-2 flex items-start gap-1.5 ${capacity.fits ? 'text-mint' : 'text-amber'}`}>
              {capacity.fits ? <CheckCircle2 size={14} className="shrink-0 mt-px" /> : <AlertTriangle size={14} className="shrink-0 mt-px" />}
              {capacity.fits ? 'Cabe en la fecha pedida.' : `Supera el cupo del día (${capacity.freeOnTarget} libres).`}
            </p>
            <p className="self-stretch text-[11px] text-muted-2 mt-1">{capacity.reason}</p>
            <div className="self-stretch mt-3 space-y-1.5">
              <div className="flex items-center justify-between bg-surface-3 border border-line rounded-lg px-3 py-2 text-xs">
                <span className="text-muted">Personas sugeridas</span><span className="font-tech font-bold">{capacity.people}</span>
              </div>
              {capacity.batches.length > 1 && capacity.batches.map((b, i) => (
                <div key={b.date} className="flex items-center justify-between bg-surface-3 border border-line rounded-lg px-3 py-2 text-xs">
                  <span className="text-muted">Tanda {i + 1} · {fmtDate(b.date)}</span><span className="font-tech font-bold">{b.videos} videos</span>
                </div>
              ))}
              <p className="text-[11px] text-accent font-tech pt-1">Entrega estimada: {capacity.eta}</p>
            </div>
          </GlowCard>

          <GlowCard contentClassName="p-5 space-y-3">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <ClipboardCheck size={18} className="text-accent shrink-0" /> Listo para registrar
            </h3>
            <div className="space-y-1.5 text-xs">
              <CheckRow ok={Boolean(brandName.trim())} label="Marca" />
              <CheckRow ok={!pastDate} label="Fecha de entrega válida" />
              <CheckRow ok={Boolean(clientId)} label="Cuenta del cliente vinculada" optional />
              <CheckRow ok={Boolean(invoiceFile)} label="Factura del pago" optional />
            </div>
            <LiquidMetalButton
              onClick={submit}
              disabled={!canSubmit}
              loading={Boolean(uploading)}
              loadingLabel="Esperando la subida…"
              label={invoiceFile ? 'Registrar pedido pagado' : 'Registrar con pago pendiente'}
              icon={PlusCircle}
              variant={invoiceFile ? 'mint' : 'cyan'}
              fullWidth
            />
          </GlowCard>
        </div>
      </div>
    </div>
  );
}

function StepHeader({ n, icon, title, hint }: { n: number; icon: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4">
      <h3 className="font-display text-lg font-semibold flex items-center gap-2">
        <span className="w-6 h-6 rounded-md bg-surface-3 border border-line font-tech text-xs text-muted flex items-center justify-center">{n}</span>
        {icon} {title}
      </h3>
      {hint && <span className="text-xs text-muted-2">{hint}</span>}
    </div>
  );
}

function FileSlot({ icon, loading, file, empty, hint, onPick, onClear }: {
  icon: ReactNode; loading: boolean; file: { name: string } | null; empty: string; hint: string; onPick: () => void; onClear: () => void;
}) {
  return (
    <div className={`rounded-lg border p-3 transition-colors ${file ? 'bg-mint-dim border-mint/30' : 'bg-surface-3 border-dashed border-line hover:border-accent/40'}`}>
      <div className="flex items-center gap-2.5">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${file ? 'bg-mint/15 text-mint' : 'bg-surface-2 text-accent'}`}>
          {loading ? <Loader2 size={15} className="animate-spin" /> : file ? <CheckCircle2 size={15} /> : icon}
        </span>
        <button type="button" onClick={onPick} disabled={loading} className="flex-1 min-w-0 text-left disabled:cursor-wait">
          <p className={`text-sm font-medium truncate ${file ? 'text-mint' : ''}`}>{loading ? 'Subiendo…' : file ? file.name : empty}</p>
          <p className="text-[11px] text-muted-2 truncate">{file ? 'Clic para cambiar' : hint}</p>
        </button>
        {file && !loading
          ? <button type="button" onClick={onClear} aria-label="Quitar archivo" className="text-muted-2 hover:text-red-400"><X size={14} /></button>
          : !loading && <Upload size={14} className="text-muted-2 shrink-0" />}
      </div>
    </div>
  );
}

function CheckRow({ ok, label, optional }: { ok: boolean; label: string; optional?: boolean }) {
  return (
    <p className={`flex items-center gap-2 ${ok ? 'text-mint' : 'text-muted-2'}`}>
      {ok ? <CheckCircle2 size={13} /> : <span className="w-3 h-3 rounded-full border border-current" />}
      {label}{!ok && optional && <span className="text-[10px]">(opcional)</span>}
    </p>
  );
}

// ---------------------------------------------------------------------------
// Expedientes: lista de clientes (5) + detalle (7)
// ---------------------------------------------------------------------------
interface ClientFile {
  brand: string;
  orders: Order[];
  videos: number;
  billed: number;
  net: number;
  pendingAmount: number;
  active: number;
  latest: string;
  unlinked: number;
  nextDeadline: number;
}

function ClientFiles({ search, filter, focusBrand, onClearFilter, onNewOrder }: {
  search: string; filter: FileFilter; focusBrand: string | null; onClearFilter: () => void; onNewOrder: () => void;
}) {
  const { orders, financeSettings } = useStore();
  const [selected, setSelected] = useState<string | null>(focusBrand);

  const files = useMemo<ClientFile[]>(() => {
    const map = new Map<string, ClientFile>();
    for (const o of orders) {
      const name = baseBrand(o.brand);
      if (!name) continue;
      const key = name.toLowerCase();
      const f = map.get(key) || { brand: name, orders: [], videos: 0, billed: 0, net: 0, pendingAmount: 0, active: 0, latest: '', unlinked: 0, nextDeadline: Infinity };
      const count = Math.max(1, o.videoCount || 1);
      const eco = unitEconomics(null, o, financeSettings);
      f.orders.push(o);
      f.videos += count;
      if (isPaid(o)) f.billed += count * eco.price; else f.pendingAmount += count * eco.price;
      f.net += count * (eco.price - eco.creatorPay);
      if (o.status !== 'finalizado') {
        f.active += 1;
        if (!o.clientId) f.unlinked += 1;
        const dl = deadlineMs(o.deliveryDate, o.deliveryTime);
        if (Number.isFinite(dl)) f.nextDeadline = Math.min(f.nextDeadline, dl);
      }
      if ((o.createdAt || '') > f.latest) f.latest = o.createdAt || '';
      map.set(key, f);
    }
    for (const f of map.values()) f.orders.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return Array.from(map.values()).sort((a, b) => b.latest.localeCompare(a.latest));
  }, [orders, financeSettings]);

  const q = norm(search.trim());
  const visible = files.filter(f =>
    (!q || norm(f.brand).includes(q)) &&
    (filter === 'todos' || (filter === 'activos' ? f.active > 0 : filter === 'por_cobrar' ? f.pendingAmount > 0 : f.unlinked > 0))
  );
  const active = visible.find(f => f.brand.toLowerCase() === selected?.toLowerCase()) || visible[0] || null;

  if (files.length === 0) {
    return (
      <GlowCard contentClassName="p-8">
        <EmptyState icon={<Briefcase size={22} />} title="Aún no hay pedidos" text="Registra el primero y aquí verás su expediente, pagos, factura y avance." action={{ label: 'Nuevo pedido', onClick: onNewOrder }} />
      </GlowCard>
    );
  }
  if (visible.length === 0) {
    return (
      <GlowCard contentClassName="p-8">
        <EmptyState icon={<Search size={22} />} title="Sin resultados" text="Ningún cliente coincide con la búsqueda o el filtro." action={{ label: 'Ver todos', onClick: onClearFilter }} />
      </GlowCard>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      {/* Lista */}
      <div className="lg:col-span-5 space-y-2">
        {visible.map(f => {
          const on = active?.brand === f.brand;
          const late = Number.isFinite(f.nextDeadline) && f.nextDeadline < Date.now();
          return (
            <button
              key={f.brand}
              type="button"
              onClick={() => setSelected(f.brand)}
              className={`w-full text-left p-3.5 rounded-xl border transition-all ${on ? 'bg-accent-dim/40 border-accent shadow-[0_0_20px_-10px_rgba(53,214,228,0.8)]' : 'bg-surface-2 border-line hover:border-accent/40'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold truncate">{f.brand} <span className="text-muted-2 font-normal">· {f.orders.length} pedido{f.orders.length === 1 ? '' : 's'} · {f.videos} videos</span></p>
                <ChevronRight size={15} className={on ? 'text-accent' : 'text-muted-2'} />
              </div>
              <p className="text-[11px] text-muted-2 mt-1">
                {f.active > 0 && Number.isFinite(f.nextDeadline)
                  ? <>Próxima entrega <span className={`font-medium ${late ? 'text-red-400' : 'text-amber'}`}>· {countdownLabel(f.nextDeadline)}</span></>
                  : 'Sin pedidos activos'}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                <Chip ok={f.pendingAmount === 0} label={f.pendingAmount === 0 ? 'Pagos al día' : `Por cobrar ${fmtMoney(f.pendingAmount)}`} warn={f.pendingAmount > 0} />
                <Chip ok={f.unlinked === 0} label={f.unlinked === 0 ? 'Cliente vinculado' : 'Sin cuenta de cliente'} />
                {f.active > 0 && <Chip ok label={`${f.active} activo${f.active === 1 ? '' : 's'}`} />}
              </div>
            </button>
          );
        })}
      </div>

      {/* Detalle */}
      {active && (
        <GlowCard className="lg:col-span-7 lg:sticky lg:top-20" contentClassName="p-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-display text-xl font-bold">{active.brand}</h3>
              <p className="text-xs text-muted mt-0.5">{active.orders.length} pedido{active.orders.length === 1 ? '' : 's'} · {active.videos} videos · {active.active} activo{active.active === 1 ? '' : 's'}</p>
            </div>
            <FolderOpen size={18} className="text-accent shrink-0" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <MoneyCard icon={<Receipt size={16} />} label="Pagado" value={<NumberTicker value={active.billed} />} sub="Pedidos con pago verificado" tone="text" />
            <MoneyCard icon={<Wallet size={16} />} label="Por cobrar" value={<NumberTicker value={active.pendingAmount} />} sub={active.pendingAmount > 0 ? 'Sube el comprobante o márcalo pagado' : 'Todo al día'} tone="amber" />
            <MoneyCard icon={<TrendingUp size={16} />} label="Neto SENDA" value={<NumberTicker value={active.net} />} sub="Cobro − pago al equipo" tone="mint" highlight />
          </div>
          <div className="pt-3 border-t border-line/70 space-y-3">
            <p className="text-sm font-semibold flex items-center gap-1.5"><Layers size={15} className="text-accent" /> Pedidos</p>
            {active.orders.map((o, i) => <OrderBlock key={o.id} order={o} number={active.orders.length - i} />)}
          </div>
        </GlowCard>
      )}
    </div>
  );
}

function Chip({ ok, label, warn }: { ok: boolean; label: string; warn?: boolean }) {
  const cls = ok ? 'text-mint border-mint/30 bg-mint-dim' : warn ? 'text-amber border-amber/30 bg-amber-dim' : 'text-muted-2 border-line bg-surface-3';
  return <span className={`text-[10px] px-2 py-0.5 rounded-full border ${cls}`}>{label}</span>;
}

function OrderBlock({ order, number }: { order: Order; number: number }) {
  const { orders, brands, financeSettings, updateOrder, deleteOrder, setView } = useStore();
  const [busy, setBusy] = useState<'brief' | 'invoice' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const count = Math.max(1, order.videoCount || 1);
  const eco = unitEconomics(null, order, financeSettings);
  const total = count * eco.price;
  const paid = isPaid(order);
  const videos = brands.flatMap(b => b.videos).filter(v => v.orderId === order.id || v.id === order.boardVideoId);
  const approved = videos.filter(v => v.qc === 'aprobado_cliente').length;
  const delivered = videos.filter(isDelivered).length;
  const dl = deadlineMs(order.deliveryDate, order.deliveryTime);
  const finished = order.status === 'finalizado' || approved >= count;
  const late = !finished && Number.isFinite(dl) && dl < Date.now();
  const soleOrderOfBrand = !orders.some(o => o.id !== order.id && baseBrand(o.brand).toLowerCase() === baseBrand(order.brand).toLowerCase());

  const flash = (msg: string) => { setNotice(msg); setTimeout(() => setNotice(null), 3000); };

  const uploadFile = async (kind: 'brief' | 'invoice', f: File | undefined) => {
    if (!f) return;
    setBusy(kind);
    setError(null);
    try {
      const url = await uploadSharedFile(f, kind === 'brief' ? 'client-briefs' : 'client-invoices');
      updateOrder(order.id, kind === 'brief'
        ? { briefFileName: f.name, briefFileUrl: url }
        : { invoiceFileName: f.name, invoiceFileUrl: url, paymentStatus: 'completado' });
      flash(kind === 'brief' ? 'Brief guardado.' : 'Comprobante guardado: pedido pagado.');
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
    win.document.write(`<!DOCTYPE html><html lang="es"><head><meta charset="utf-8"/><title>Factura ${escapeHtml(code)} · SENDA</title>
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

  const stage = finished ? 'Finalizado' : order.clipperId || order.status === 'asignado' ? 'En producción' : 'Sin asignar';
  const btn = 'px-3 py-1.5 rounded-lg bg-surface-2 border border-line text-xs font-medium flex items-center gap-1.5 hover:border-accent/40 transition-colors';

  return (
    <div className="bg-surface-3 border border-line rounded-lg p-3.5 space-y-3 hover:border-accent/40 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Pedido #{number} <span className="text-muted-2 font-normal">· {count} video{count === 1 ? '' : 's'} · {fmtMoney(total)}</span>
          </p>
          <p className="text-[11px] text-muted-2 mt-0.5">
            {fmtDate(order.deliveryDate, order.deliveryTime)}
            {!finished && Number.isFinite(dl) && <span className={`ml-1.5 font-medium ${late ? 'text-red-400' : 'text-amber'}`}>· {countdownLabel(dl)}</span>}
            {order.invoiceNumber && <span className="font-tech"> · {order.invoiceNumber}</span>}
          </p>
        </div>
        {confirmDelete ? (
          <div className="flex items-center gap-1 bg-red-500/15 border border-red-500/40 rounded-lg px-2 py-1 shrink-0">
            <span className="text-[11px] text-red-400 font-semibold">{soleOrderOfBrand ? '¿Borrar pedido y sus videos?' : '¿Borrar pedido?'}</span>
            <button type="button" onClick={() => deleteOrder(order.id)} className="px-2 py-0.5 rounded bg-red-500 text-white text-[11px] font-bold hover:bg-red-600">Sí</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="px-1.5 py-0.5 rounded bg-surface-2 text-muted text-[11px] hover:text-text">No</button>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} title="Eliminar pedido" className="p-1.5 rounded-lg text-muted-2 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0">
            <Trash2 size={15} />
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Chip ok={paid} warn={!paid} label={paid ? 'Pagado' : 'Pago pendiente'} />
        <Chip ok={finished} label={stage} />
        <Chip ok={Boolean(order.briefConfirmedAt)} label={order.briefConfirmedAt ? 'Brief confirmado' : 'Brief sin confirmar'} />
        {order.priority && order.priority !== 'normal' && (
          <span className={`text-[10px] px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[order.priority]}`}>Prioridad {PRIORITY_LABEL[order.priority]}</span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="flex h-1.5 flex-1 rounded-full overflow-hidden bg-surface-2">
          <span className="bg-mint transition-all duration-500" style={{ width: `${(approved / count) * 100}%` }} />
          <span className="bg-accent transition-all duration-500" style={{ width: `${(Math.max(0, delivered - approved) / count) * 100}%` }} />
        </div>
        <span className="text-[10px] font-tech text-muted-2 whitespace-nowrap"><span className="text-accent">{delivered}</span> entregados · <span className="text-mint">{approved}</span> aprobados</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <ClientAccountField order={order} />
        <DriveFolderField order={order} compact />
      </div>

      {notice && <p className="text-xs text-mint bg-mint-dim border border-mint/30 rounded-lg px-3 py-2 flex items-center gap-1.5 animate-fadeIn"><CheckCircle2 size={14} /> {notice}</p>}
      {error && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2 flex items-center gap-1.5"><AlertTriangle size={13} /> {error}</p>}

      <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-line/60">
        {!paid && (
          <button type="button" onClick={() => { updateOrder(order.id, { paymentStatus: 'completado' }); flash('Pedido marcado como pagado.'); }}
            className="px-3 py-1.5 rounded-lg bg-mint text-on-accent text-xs font-semibold flex items-center gap-1.5 hover:opacity-90 transition-opacity">
            <CheckCircle2 size={13} /> Marcar pagado
          </button>
        )}
        <label className={`${btn} cursor-pointer ${busy === 'invoice' ? 'opacity-50 pointer-events-none' : ''}`}>
          {busy === 'invoice' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} className="text-mint" />}
          {order.invoiceFileUrl ? 'Cambiar comprobante' : 'Subir comprobante'}
          <input type="file" className="hidden" accept=".pdf,image/*" onChange={e => { void uploadFile('invoice', e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {order.invoiceFileUrl && (
          <a href={order.invoiceFileUrl} target="_blank" rel="noreferrer" className={btn}>
            <Receipt size={13} className="text-mint" /> Comprobante <ExternalLink size={11} className="text-muted-2" />
          </a>
        )}
        {order.briefFileUrl ? (
          <a href={order.briefFileUrl} target="_blank" rel="noreferrer" className={btn}>
            <FileText size={13} className="text-accent" /> Brief <ExternalLink size={11} className="text-muted-2" />
          </a>
        ) : (
          <label className={`${btn} cursor-pointer ${busy === 'brief' ? 'opacity-50 pointer-events-none' : ''}`}>
            {busy === 'brief' ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} className="text-accent" />} Subir brief
            <input type="file" className="hidden" accept=".pdf,.doc,.docx,image/*" onChange={e => { void uploadFile('brief', e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        )}
        <button type="button" onClick={printInvoice} className={btn}>
          <Printer size={13} className="text-accent" /> Factura PDF
        </button>
        <button type="button" onClick={() => setView('tareas')} className="ml-auto text-sm text-accent hover:text-accent-strong flex items-center gap-1">
          Ver en Tareas <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
