// Inicio del Administrador.
// Estructura (de lo más urgente a lo más informativo):
//   1. Encabezado + accesos rápidos
//   2. Requiere tu atención: lo que está esperando una acción del admin (con acceso directo)
//   3. Orden de entrega: proyectos ordenados por fecha límite, con progreso y cuenta regresiva
//   4. Equipo: carga real de HOY (motor de Capacidad) y estado en línea
//   5. Resumen económico de la cartera activa
// Todo se calcula en vivo desde pedidos y tablero: no hay datos de ejemplo ni fijos.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import { flattenVideos, findOrderForVideo, isTeamDone, todayIso, unitEconomics, videoEarned, type VideoWithBrand } from '../lib/economics';
import { buildWorkUnits, workerDayLoad } from '../lib/capacity';
import { setNavIntent } from '../lib/navIntent';
import { TEAM_ROLE_PLURAL } from '../lib/roles';
import { GlowCard } from '../components/ui/spotlight-card';
import NumberTicker, { CountTicker } from '../components/ui/number-ticker';
import { AnimatedRadialChart } from '../components/ui/animated-radial-chart';
import { AvatarStack } from '../components/ui/avatar-stack';
import { TeamOrbit } from '../components/ui/team-orbit';
import type { Order, Video, Worker } from '../types';
import {
  AlertTriangle, ArrowRight, CheckCircle2, ChevronRight, Clock3, DollarSign, Eye, Film, Gauge,
  Hourglass, Image as ImageIcon, Inbox, Loader2, MessageSquare, PlusCircle, Receipt, Scissors,
  Sparkles, TrendingUp, UserPlus, Users, Wallet, X,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Carga del equipo (lo usan también otras vistas: AdminView)
// ---------------------------------------------------------------------------
export type WorkerLoad = 'lleno' | 'meta' | 'sin_trabajo';

export function workerLoadColor(load: WorkerLoad) {
  if (load === 'lleno') return 'bg-amber';
  if (load === 'meta') return 'bg-mint';
  return 'bg-accent';
}

export function workerLoadBorder(load: WorkerLoad) {
  if (load === 'lleno') return 'border-amber/40';
  if (load === 'meta') return 'border-mint/40';
  return 'border-accent/40';
}

const LOAD_LABEL: Record<WorkerLoad, string> = {
  lleno: 'Al límite',
  meta: 'Con trabajo',
  sin_trabajo: 'Sin trabajo',
};

const LOAD_HINT: Record<WorkerLoad, string> = {
  lleno: 'La carga de hoy ya alcanzó su capacidad diaria',
  meta: 'Tiene trabajo y todavía le queda capacidad hoy',
  sin_trabajo: 'No tiene videos pendientes: disponible para asignar',
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const CURRENCY_SIGN = String.fromCharCode(36);

/** Dinero con centavos solo cuando hacen falta ($5 · $2,50). */
function fmtMoney(n: number): string {
  const v = Number(n) || 0;
  const hasCents = Math.abs(v % 1) > 0.001;
  return CURRENCY_SIGN + v.toLocaleString('es-CO', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 });
}

function deadlineMs(date?: string | null, time?: string | null): number {
  if (!date) return Number.NaN;
  return new Date(`${date}T${time || '23:59'}`).getTime();
}

function countdownLabel(ms: number): string {
  if (!Number.isFinite(ms)) return 'Sin fecha';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const span = mins < 60 ? `${mins} min` : hours < 24 ? `${hours} h` : `${days} ${days === 1 ? 'día' : 'días'}`;
  return diff < 0 ? `Vencido hace ${span}` : `Vence en ${span}`;
}

function fmtDate(date?: string | null, time?: string | null): string {
  if (!date) return 'Sin fecha';
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const label = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${label} · ${time}` : label;
}

const latestFinal = (v: Video) => v.finalVideos[v.finalVideos.length - 1];

// ---------------------------------------------------------------------------
// Proyectos (pedidos + carpetas antiguas sin pedido)
// ---------------------------------------------------------------------------
type ProjectStatus = 'asignar' | 'vencido' | 'urgente' | 'produccion' | 'cliente' | 'finalizado';

const PROJECT_STATUS: Record<ProjectStatus, { label: string; cls: string; rank: number }> = {
  vencido: { label: 'Vencido', cls: 'bg-red-500/15 text-red-400 border-red-500/30', rank: 0 },
  urgente: { label: 'Urgente', cls: 'bg-amber-dim text-amber border-amber/40', rank: 1 },
  asignar: { label: 'Por asignar', cls: 'bg-amber-dim text-amber border-amber/30', rank: 2 },
  produccion: { label: 'En producción', cls: 'bg-accent-dim text-accent border-accent/30', rank: 3 },
  cliente: { label: 'Esperando cliente', cls: 'bg-violet-dim text-violet border-violet/30', rank: 4 },
  finalizado: { label: 'Finalizado', cls: 'bg-mint-dim text-mint border-mint/30', rank: 5 },
};

interface ProjectRow {
  id: string;
  brand: string;
  order: Order | null;
  videos: VideoWithBrand[];
  total: number;
  approvedSenda: number;
  approvedClient: number;
  responsible: string | null;
  deadline: number;
  deliveryDate: string | null;
  deliveryTime: string | null;
  status: ProjectStatus;
  nextVideo: VideoWithBrand | null;
}

// ---------------------------------------------------------------------------
// Centro de atención
// ---------------------------------------------------------------------------
type AttentionKey = 'imagen' | 'clips' | 'final' | 'asignar' | 'entregas' | 'cliente' | 'feedback';

type Panel =
  | { kind: 'attention'; key: AttentionKey }
  | { kind: 'worker'; id: string }
  | { kind: 'entregas' }
  | { kind: 'finanzas' }
  | null;

export function AdminHomePanels() {
  const {
    workers, brands, orders, financeSettings, appExpenses, capacityConfig,
    getWorkerCapacity, setView, setSelectedVideo, startAdminDm,
  } = useStore();

  const [panel, setPanel] = useState<Panel>(null);
  const [teamFilter, setTeamFilter] = useState<WorkerLoad | 'todos'>('todos');
  const [, setTick] = useState(0);

  // Las cuentas regresivas se refrescan solas cada minuto
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  const today = todayIso();
  const monthPrefix = today.slice(0, 7);
  const urgentMs = Math.max(1, capacityConfig.urgentThresholdHours || 4) * 3600000;
  const allVideos = useMemo(() => flattenVideos(brands), [brands]);
  const workerName = (id?: string | null) => (id ? workers.find(w => w.id === id)?.name || null : null);

  // ------------------------------------------------------------------ proyectos
  const projects = useMemo<ProjectRow[]>(() => {
    const claimed = new Set<string>();
    const rows: ProjectRow[] = [];

    const build = (
      id: string, brand: string, order: Order | null, videos: VideoWithBrand[],
      deliveryDate: string | null, deliveryTime: string | null, responsibleId: string | null, fallbackName: string | null,
    ): ProjectRow => {
      const sorted = [...videos].sort((a, b) => (a.videoNumber || 0) - (b.videoNumber || 0));
      const total = Math.max(order ? Math.max(1, order.videoCount || 1) : 0, sorted.length);
      const approvedClient = sorted.filter(v => v.qc === 'aprobado_cliente').length;
      const approvedSenda = sorted.filter(isTeamDone).length;
      const dl = deadlineMs(deliveryDate, deliveryTime);
      let status: ProjectStatus;
      if ((sorted.length > 0 && approvedClient >= total) || order?.status === 'finalizado') status = 'finalizado';
      else if (!responsibleId) status = 'asignar';
      else if (sorted.length > 0 && approvedSenda >= total) status = 'cliente';
      else if (Number.isFinite(dl) && dl < Date.now()) status = 'vencido';
      else if (Number.isFinite(dl) && dl - Date.now() <= urgentMs) status = 'urgente';
      else status = 'produccion';
      return {
        id, brand, order, videos: sorted, total, approvedSenda, approvedClient,
        responsible: workerName(responsibleId) || fallbackName,
        deadline: dl, deliveryDate, deliveryTime, status,
        nextVideo: sorted.find(v => !isTeamDone(v)) || sorted[0] || null,
      };
    };

    for (const o of orders) {
      const ownBrand = brands.find(b => b.id === `brand-${o.id}`);
      let vids = allVideos.filter(v => v.orderId === o.id || v.id === o.boardVideoId || (ownBrand && !v.orderId && ownBrand.videos.some(x => x.id === v.id)));
      // Compatibilidad con pedidos antiguos que solo se enlazaban por nombre de marca
      if (vids.length === 0 && o.promotedToBoard) {
        const key = o.brand.trim().toLowerCase();
        vids = allVideos.filter(v => !v.orderId && !claimed.has(v.id) && v.brandName.trim().toLowerCase() === key);
      }
      vids.forEach(v => claimed.add(v.id));
      rows.push(build(o.id, o.brand, o, vids, o.deliveryDate || null, o.deliveryTime || null, o.clipperId || null, null));
    }

    // Carpetas del tablero sin pedido (datos antiguos): también se muestran para no perderlas de vista
    for (const b of brands) {
      const rest = allVideos.filter(v => v.brandName === b.name && b.videos.some(x => x.id === v.id) && !claimed.has(v.id));
      if (rest.length === 0) continue;
      rest.forEach(v => claimed.add(v.id));
      const first = rest[0];
      rows.push(build(b.id, b.name, null, rest, first.date || null, null, first.clipperId || null, first.clipperName || null));
    }

    return rows.sort((a, b) => {
      const r = PROJECT_STATUS[a.status].rank - PROJECT_STATUS[b.status].rank;
      if (r !== 0) return r;
      const ta = Number.isFinite(a.deadline) ? a.deadline : Infinity;
      const tb = Number.isFinite(b.deadline) ? b.deadline : Infinity;
      return ta - tb;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, brands, allVideos, workers, urgentMs]);

  const activeProjects = projects.filter(p => p.status !== 'finalizado');

  // ------------------------------------------------------------------ atención
  const attention = useMemo(() => {
    const open = allVideos.filter(v => !isTeamDone(v));
    return {
      imagen: open.filter(v => v.mainImageStatus === 'pendiente'),
      clips: open.filter(v => v.clips.some(c => c.fileUrl && (!c.status || c.status === 'pending'))),
      final: open.filter(v => {
        const f = latestFinal(v);
        return Boolean(f && f.fileUrl && (!f.status || f.status === 'pending'));
      }),
      cliente: allVideos.filter(v => v.qc === 'aprobado_senda'),
      feedback: open.filter(v => v.qc === 'correcciones' && v.corrections.some(c => c.author === 'cliente' && !c.resolved)),
    };
  }, [allVideos]);

  const toAssign = activeProjects.filter(p => p.status === 'asignar');
  const briefReady = toAssign.filter(p => p.order?.briefConfirmedAt).length;
  const lateOrUrgent = activeProjects.filter(p => p.status === 'vencido' || p.status === 'urgente');
  const actionTotal = attention.imagen.length + attention.clips.length + attention.final.length + toAssign.length + lateOrUrgent.length;

  // ------------------------------------------------------------------ equipo
  const team = useMemo(() => {
    const units = buildWorkUnits(orders, brands);
    const order: Record<WorkerLoad, number> = { lleno: 0, meta: 1, sin_trabajo: 2 };
    return workers
      .map(w => {
        const dl = workerDayLoad(w, units);
        const cap = Math.max(1, getWorkerCapacity(w.id));
        const load: WorkerLoad = dl.pendingTotal === 0 ? 'sin_trabajo' : dl.todayLoad >= cap ? 'lleno' : 'meta';
        const pending = allVideos.filter(v => (v.clipperId === w.id || v.editorId === w.id) && !isTeamDone(v));
        return { worker: w, load, today: dl.todayLoad, pendingTotal: dl.pendingTotal, cap, brands: dl.brands, pending };
      })
      .sort((a, b) => order[a.load] - order[b.load] || Number(b.worker.online) - Number(a.worker.online) || a.worker.name.localeCompare(b.worker.name));
  }, [workers, orders, brands, allVideos, getWorkerCapacity]);

  const teamCounts = useMemo(() => {
    const c: Record<WorkerLoad, number> = { lleno: 0, meta: 0, sin_trabajo: 0 };
    team.forEach(t => { c[t.load] += 1; });
    return c;
  }, [team]);
  const visibleTeam = teamFilter === 'todos' ? team : team.filter(t => t.load === teamFilter);

  // ------------------------------------------------------------------ economía
  const money = useMemo(() => {
    let billed = 0;
    let payroll = 0;
    let payrollEarned = 0;
    const rows: { id: string; label: string; billed: number; payroll: number; earned: number }[] = [];
    for (const p of projects) {
      let pb = 0, pp = 0, pe = 0;
      if (p.videos.length === 0) {
        const eco = unitEconomics(null, p.order, financeSettings);
        pb = p.total * eco.price;
        pp = p.total * eco.creatorPay;
      } else {
        for (const v of p.videos) {
          const eco = unitEconomics(v, p.order || findOrderForVideo(v, v.brandName, orders), financeSettings);
          pb += eco.price;
          pp += eco.creatorPay;
          // Regla de pago: 50% al Aprobado Senda + 50% al Aprobado Cliente
          pe += videoEarned(v, eco.creatorPay);
        }
      }
      billed += pb; payroll += pp; payrollEarned += pe;
      rows.push({ id: p.id, label: `${p.brand} · ${p.total} video${p.total === 1 ? '' : 's'}`, billed: pb, payroll: pp, earned: pe });
    }
    const expensesMonth = appExpenses.filter(e => (e.date || '').startsWith(monthPrefix)).reduce((s, e) => s + (Number(e.amount) || 0), 0);
    return { billed, payroll, payrollEarned, expensesMonth, net: billed - payroll - expensesMonth, rows };
  }, [projects, financeSettings, orders, appExpenses, monthPrefix]);

  // ------------------------------------------------------------------ navegación
  const goToVideo = (v: Video) => {
    setPanel(null);
    setSelectedVideo(v);
    setView('tareas');
  };
  const goToTasksFolder = (folder: 'disponibles' | 'iniciados') => {
    setPanel(null);
    setSelectedVideo(null);
    setNavIntent('tareas', folder);
    setView('tareas');
  };
  const openProject = (p: ProjectRow) => {
    if (p.status === 'asignar') goToTasksFolder('disponibles');
    else if (p.nextVideo) goToVideo(p.nextVideo);
    else goToTasksFolder('iniciados');
  };
  const openAttention = (key: AttentionKey, list: unknown[]) => {
    if (list.length === 0) return;
    if (key === 'asignar') { goToTasksFolder('disponibles'); return; }
    if (key === 'cliente') { setPanel(null); setView('clientes'); return; }
    if ((key === 'imagen' || key === 'clips' || key === 'final' || key === 'feedback') && list.length === 1) {
      goToVideo(list[0] as Video);
      return;
    }
    setPanel({ kind: 'attention', key });
  };

  const [dmLoadingId, setDmLoadingId] = useState<string | null>(null);
  const openChatWith = async (w: Worker) => {
    setDmLoadingId(w.id);
    try {
      const groupId = await startAdminDm(w.id);
      if (groupId) setNavIntent('chat', groupId);
      setPanel(null);
      setView('chat');
    } finally {
      setDmLoadingId(null);
    }
  };

  const todayLabel = new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });

  const tiles: { key: AttentionKey; list: unknown[]; label: string; hint: string; icon: ReactNode; tone: Tone }[] = [
    { key: 'final', list: attention.final, label: 'Videos finales', hint: 'Por revisar y aprobar', icon: <Film size={18} />, tone: 'accent' },
    { key: 'clips', list: attention.clips, label: 'Clips', hint: 'Por aceptar o rechazar', icon: <Scissors size={18} />, tone: 'accent' },
    { key: 'imagen', list: attention.imagen, label: 'Imagen principal', hint: 'Por aprobar', icon: <ImageIcon size={18} />, tone: 'accent' },
    { key: 'asignar', list: toAssign, label: 'Por asignar', hint: briefReady > 0 ? `${briefReady} con brief del cliente listo` : 'Proyectos sin responsable', icon: <UserPlus size={18} />, tone: 'amber' },
    { key: 'entregas', list: lateOrUrgent, label: 'Entregas en riesgo', hint: `Vencidas o a menos de ${capacityConfig.urgentThresholdHours || 4} h`, icon: <AlertTriangle size={18} />, tone: 'red' },
  ];

  // Ocupación del equipo hoy: videos que tocan hoy (según fechas de entrega) contra la capacidad diaria total
  const occToday = team.reduce((s, t) => s + t.today, 0);
  const occCap = team.reduce((s, t) => s + t.cap, 0);
  const occPct = occCap > 0 ? Math.round((occToday / occCap) * 100) : 0;
  const onlineMembers = workers.filter(w => w.online).map(w => ({ id: w.id, name: w.name, online: true }));
  const orbitMembers = workers.map(w => ({ id: w.id, name: w.name, online: w.online }));
  const openNewOrder = () => { setNavIntent('clientes', 'nuevo_pedido'); setView('clientes'); };

  return (
    <div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fadeIn">
      {/* 1. Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-[0.18em] text-accent flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" /> En vivo
          </p>
          <h2 className="font-display text-3xl xl:text-4xl font-bold mt-1">Panel de administración</h2>
          <p className="text-muted mt-1 first-letter:uppercase">{todayLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {onlineMembers.length > 0 && (
            <div className="flex items-center gap-2.5 pr-3 mr-1 border-r border-line">
              <AvatarStack members={onlineMembers} max={5} size={30} onSelect={id => setPanel({ kind: 'worker', id })} />
              <span className="text-xs text-muted whitespace-nowrap">{onlineMembers.length} en línea</span>
            </div>
          )}
          <button
            type="button"
            onClick={() => goToTasksFolder('disponibles')}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-line bg-surface-2 text-sm font-medium text-text hover:border-accent/50 hover:bg-surface-3 transition-colors"
          >
            <UserPlus size={15} className="text-amber" /> Asignar proyectos
            {toAssign.length > 0 && <span className="font-tech text-[11px] px-1.5 py-0.5 rounded-md bg-amber-dim text-amber">{toAssign.length}</span>}
          </button>
          <button
            type="button"
            onClick={openNewOrder}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-on-accent text-sm font-semibold hover:bg-accent-strong transition-all hover:-translate-y-0.5 shadow-[0_0_20px_-6px_rgba(53,214,228,0.6)]"
          >
            <PlusCircle size={15} /> Nuevo pedido
          </button>
        </div>
      </div>

      {/* Bento: pensado para computador (12 columnas); en pantallas pequeñas se apila */}
      <div className="grid grid-cols-12 gap-5">
        {/* 2. Requiere tu atención */}
        <GlowCard className="col-span-12 lg:col-span-8" contentClassName="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2 min-w-0">
              <Inbox size={18} className="text-accent shrink-0" /> Requiere tu atención
              {actionTotal > 0 && <span className="font-tech text-xs px-2 py-0.5 rounded-full bg-accent-dim text-accent">{actionTotal}</span>}
            </h3>
            {actionTotal === 0 && (
              <span className="text-xs text-mint flex items-center gap-1"><CheckCircle2 size={14} /> Todo al día</span>
            )}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {tiles.map(t => (
              <AttentionTile
                key={t.key}
                label={t.label}
                hint={t.hint}
                icon={t.icon}
                tone={t.tone}
                count={t.list.length}
                onClick={() => openAttention(t.key, t.list)}
              />
            ))}
          </div>
          <div className="mt-3 pt-3 border-t border-line/60 grid grid-cols-1 md:grid-cols-2 gap-2">
            <FollowUpRow
              icon={<Hourglass size={15} />}
              label="Esperando aprobación del cliente"
              count={attention.cliente.length}
              onClick={() => openAttention('cliente', attention.cliente)}
            />
            <FollowUpRow
              icon={<MessageSquare size={15} />}
              label="En corrección por feedback del cliente"
              count={attention.feedback.length}
              onClick={() => openAttention('feedback', attention.feedback)}
            />
          </div>
        </GlowCard>

        {/* 4. Equipo: rueda de usuarios + carga de hoy */}
        <GlowCard className="col-span-12 lg:col-span-4 lg:row-span-2" contentClassName="p-5 flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-2">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2 min-w-0">
              <Users size={18} className="text-accent shrink-0" /> Equipo
            </h3>
            <span className="text-[11px] text-muted-2 flex items-center gap-3">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent" /> Activo</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-muted-2" /> Desconectado</span>
            </span>
          </div>
          {workers.length === 0 ? (
            <EmptyState
              icon={<UserPlus size={22} />}
              title="Sin equipo registrado"
              text={`Crea las cuentas de tus ${TEAM_ROLE_PLURAL.toLowerCase()} para asignarles proyectos.`}
              action={{ label: 'Crear usuario', onClick: () => setView('administracion') }}
            />
          ) : (
            <>
              <TeamOrbit members={orbitMembers} size={250} className="my-2" onSelect={id => setPanel({ kind: 'worker', id })} />
              <div className="grid grid-cols-4 gap-1 mb-3 mt-1">
                {(['todos', 'lleno', 'meta', 'sin_trabajo'] as const).map(f => {
                  const count = f === 'todos' ? team.length : teamCounts[f];
                  const active = teamFilter === f;
                  return (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setTeamFilter(f)}
                      title={f === 'todos' ? 'Todo el equipo' : LOAD_HINT[f]}
                      className={`inline-flex items-center justify-center gap-1 text-[11px] font-medium px-1.5 py-1 rounded-full border whitespace-nowrap transition-colors ${
                        active ? 'bg-accent-dim border-accent/40 text-accent' : 'border-line text-muted hover:text-text hover:border-accent/30'
                      }`}
                    >
                      {f !== 'todos' && <span className={`w-1.5 h-1.5 rounded-full ${workerLoadColor(f)}`} />}
                      {f === 'todos' ? 'Todos' : LOAD_LABEL[f]} <span className="font-tech">{count}</span>
                    </button>
                  );
                })}
              </div>
              {visibleTeam.length === 0 ? (
                <p className="text-sm text-muted text-center py-6">Nadie en este estado ahora mismo.</p>
              ) : (
                <div className="space-y-2 max-h-[330px] overflow-y-auto pr-1 -mr-1">
                  {visibleTeam.map(t => (
                    <button
                      key={t.worker.id}
                      type="button"
                      onClick={() => setPanel({ kind: 'worker', id: t.worker.id })}
                      className="w-full text-left p-3 bg-surface-3 border border-line rounded-lg hover:border-accent/40 transition-colors group"
                    >
                      <div className="flex items-center gap-2.5">
                        <Avatar name={t.worker.name} online={t.worker.online} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{t.worker.name}</p>
                          <p className="text-[11px] text-muted-2 truncate">
                            {t.pendingTotal === 0 ? 'Disponible para asignar' : `${t.pendingTotal} video${t.pendingTotal === 1 ? '' : 's'} pendiente${t.pendingTotal === 1 ? '' : 's'} · ${t.brands.length} proyecto${t.brands.length === 1 ? '' : 's'}`}
                          </p>
                        </div>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${
                          t.load === 'lleno' ? 'bg-amber-dim text-amber border-amber/40' : t.load === 'meta' ? 'bg-mint-dim text-mint border-mint/40' : 'bg-surface-2 text-muted border-line'
                        }`}>{LOAD_LABEL[t.load]}</span>
                      </div>
                      <LoadBar today={t.today} cap={t.cap} load={t.load} />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </GlowCard>

        {/* 3. Orden de entrega */}
        <GlowCard className="col-span-12 lg:col-span-8" tone="amber" contentClassName="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2 min-w-0">
              <Clock3 size={18} className="text-amber shrink-0" /> Orden de entrega
              <span className="hidden sm:inline text-xs font-normal text-muted-2">{activeProjects.length} activo{activeProjects.length === 1 ? '' : 's'}</span>
            </h3>
            {projects.length > 0 && (
              <button type="button" onClick={() => setPanel({ kind: 'entregas' })} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors">
                Ver todos <ChevronRight size={14} />
              </button>
            )}
          </div>
          {activeProjects.length === 0 ? (
            <EmptyState
              icon={<Sparkles size={22} />}
              title={projects.length === 0 ? 'Aún no hay pedidos' : 'Sin entregas pendientes'}
              text={projects.length === 0 ? 'Crea el primer pedido y aparecerá aquí ordenado por fecha de entrega.' : 'Todos los proyectos están finalizados.'}
              action={projects.length === 0 ? { label: 'Crear pedido', onClick: openNewOrder } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
              {activeProjects.slice(0, 8).map(p => <ProjectItem key={p.id} p={p} onOpen={() => openProject(p)} />)}
              {activeProjects.length > 8 && (
                <button type="button" onClick={() => setPanel({ kind: 'entregas' })} className="xl:col-span-2 w-full text-xs text-muted hover:text-accent py-2 transition-colors">
                  + {activeProjects.length - 8} proyecto(s) más
                </button>
              )}
            </div>
          )}
        </GlowCard>

        {/* Ocupación del equipo hoy */}
        <GlowCard className="col-span-12 md:col-span-5 lg:col-span-4" tone="mint" contentClassName="p-5 flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2 min-w-0">
              <Gauge size={18} className="text-mint shrink-0" /> Ocupación de hoy
            </h3>
            <button type="button" onClick={() => setView('capacidad')} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors">
              Capacidad <ChevronRight size={14} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center pt-4">
            <AnimatedRadialChart
              value={occPct}
              size={230}
              strokeWidth={16}
              showLabels={false}
              caption={occCap > 0 ? `${occToday} de ${occCap} videos de capacidad diaria` : 'Sin equipo registrado'}
            />
          </div>
          <div className="grid grid-cols-3 gap-2 mt-3">
            {(['lleno', 'meta', 'sin_trabajo'] as const).map(f => (
              <button
                key={f}
                type="button"
                onClick={() => setTeamFilter(f)}
                className={`rounded-lg border px-2 py-2 text-center transition-colors ${teamFilter === f ? 'border-accent/40 bg-accent-dim' : 'border-line bg-surface-3 hover:border-accent/30'}`}
              >
                <span className="font-display text-lg font-bold leading-none block"><CountTicker value={teamCounts[f]} /></span>
                <span className="text-[10px] text-muted-2 flex items-center justify-center gap-1 mt-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${workerLoadColor(f)}`} /> {LOAD_LABEL[f]}
                </span>
              </button>
            ))}
          </div>
        </GlowCard>

        {/* 5. Resumen económico */}
        <GlowCard className="col-span-12 md:col-span-7 lg:col-span-8" tone="mint" contentClassName="p-5">
          <div className="flex items-center justify-between gap-3 mb-4">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2 min-w-0">
              <DollarSign size={18} className="text-mint shrink-0" /> Resumen económico
              <span className="hidden sm:inline text-xs font-normal text-muted-2">pedidos registrados</span>
            </h3>
            <div className="flex items-center gap-3">
              {money.rows.length > 0 && (
                <button type="button" onClick={() => setPanel({ kind: 'finanzas' })} className="hidden sm:flex text-sm text-muted hover:text-text items-center gap-1 whitespace-nowrap transition-colors">
                  Detalle <Eye size={14} />
                </button>
              )}
              <button type="button" onClick={() => setView('finanzas')} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors">
                Finanzas <ChevronRight size={14} />
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            <MoneyCard icon={<Receipt size={16} />} label="Facturado" value={<NumberTicker value={money.billed} />} sub="Pago 100% por adelantado" tone="text" />
            <MoneyCard
              icon={<Wallet size={16} />}
              label="Nómina del equipo"
              value={<NumberTicker value={money.payroll} />}
              sub={`Generada: ${fmtMoney(money.payrollEarned)}`}
              tone="amber"
              progress={money.payroll > 0 ? money.payrollEarned / money.payroll : 0}
            />
            <MoneyCard icon={<Gauge size={16} />} label="Apps y créditos" value={<NumberTicker value={money.expensesMonth} />} sub="Gastos de este mes" tone="violet" />
            <MoneyCard icon={<TrendingUp size={16} />} label="Utilidad estimada" value={<NumberTicker value={money.net} />} sub="Facturado − nómina − gastos" tone="mint" highlight />
          </div>
        </GlowCard>
      </div>

      {/* ------------------------------------------------------------ Paneles */}
      {panel?.kind === 'attention' && (
        <Modal
          title={ATTENTION_TITLE[panel.key]}
          icon={ATTENTION_ICON[panel.key]}
          onClose={() => setPanel(null)}
        >
          {panel.key === 'entregas' ? (
            <div className="space-y-2">
              {lateOrUrgent.map(p => <ProjectItem key={p.id} p={p} onOpen={() => openProject(p)} />)}
            </div>
          ) : (
            <VideoList
              videos={(attention as Record<string, VideoWithBrand[]>)[panel.key] || []}
              detail={v => attentionDetail(panel.key, v)}
              onOpen={goToVideo}
            />
          )}
        </Modal>
      )}

      {panel?.kind === 'entregas' && (
        <EntregasModal projects={projects} onOpen={openProject} onClose={() => setPanel(null)} />
      )}

      {panel?.kind === 'finanzas' && (
        <Modal title="Detalle económico por proyecto" onClose={() => setPanel(null)}>
          <div className="space-y-2">
            {money.rows.map(r => (
              <div key={r.id} className="flex items-center gap-3 p-3 bg-surface-3 border border-line rounded-lg">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{r.label}</p>
                  <p className="text-xs text-muted-2">Facturado {fmtMoney(r.billed)} · Nómina {fmtMoney(r.payroll)} · Generada {fmtMoney(r.earned)}</p>
                </div>
                <span className="text-sm font-semibold font-tech text-mint shrink-0">+{fmtMoney(r.billed - r.payroll)}</span>
              </div>
            ))}
          </div>
          <button type="button" onClick={() => { setPanel(null); setView('finanzas'); }} className="w-full mt-2 text-sm text-accent hover:text-accent-strong flex items-center justify-center gap-1 py-2">
            Ir a Finanzas completas <ArrowRight size={14} />
          </button>
        </Modal>
      )}

      {panel?.kind === 'worker' && (() => {
        const t = team.find(x => x.worker.id === panel.id);
        if (!t) return null;
        return (
          <Modal title={t.worker.name} onClose={() => setPanel(null)} icon={<Avatar name={t.worker.name} online={t.worker.online} />}>
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Carga de hoy" value={`${t.today}/${t.cap}`} />
              <Stat label="Pendientes" value={String(t.pendingTotal)} />
              <Stat label="Estado" value={LOAD_LABEL[t.load]} />
            </div>
            <p className="text-xs text-muted-2">{LOAD_HINT[t.load]} · {t.worker.online ? 'En línea ahora' : 'No está en línea'}</p>
            <div>
              <p className="text-xs font-medium text-muted mb-2">Videos pendientes</p>
              {t.pending.length === 0 ? (
                <p className="text-sm text-muted text-center py-4 bg-surface-3 border border-dashed border-line rounded-lg">No tiene videos pendientes.</p>
              ) : (
                <VideoList videos={t.pending as VideoWithBrand[]} detail={v => STAGE_LABEL(v)} onOpen={goToVideo} />
              )}
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={() => void openChatWith(t.worker)}
                disabled={dmLoadingId === t.worker.id}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-accent text-on-accent text-sm font-semibold hover:bg-accent-strong disabled:opacity-60 transition-colors"
              >
                {dmLoadingId === t.worker.id ? <Loader2 size={15} className="animate-spin" /> : <MessageSquare size={15} />} Escribirle
              </button>
              <button
                type="button"
                onClick={() => { setPanel(null); setView('capacidad'); }}
                className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-line text-sm text-muted hover:text-text hover:border-accent/40 transition-colors"
              >
                <Gauge size={15} /> Ajustar capacidad
              </button>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Textos de los paneles
// ---------------------------------------------------------------------------
const ATTENTION_TITLE: Record<AttentionKey, string> = {
  imagen: 'Imagen principal por aprobar',
  clips: 'Clips por revisar',
  final: 'Videos finales por revisar',
  asignar: 'Proyectos por asignar',
  entregas: 'Entregas en riesgo',
  cliente: 'Esperando aprobación del cliente',
  feedback: 'En corrección por feedback del cliente',
};

const ATTENTION_ICON: Record<AttentionKey, ReactNode> = {
  imagen: <ImageIcon size={18} className="text-accent" />,
  clips: <Scissors size={18} className="text-accent" />,
  final: <Film size={18} className="text-accent" />,
  asignar: <UserPlus size={18} className="text-amber" />,
  entregas: <AlertTriangle size={18} className="text-red-400" />,
  cliente: <Hourglass size={18} className="text-violet" />,
  feedback: <MessageSquare size={18} className="text-violet" />,
};

function attentionDetail(key: AttentionKey, v: Video): string {
  const who = v.clipperName || 'Sin responsable';
  if (key === 'clips') {
    const n = v.clips.filter(c => c.fileUrl && (!c.status || c.status === 'pending')).length;
    return `${who} · ${n} clip${n === 1 ? '' : 's'} por revisar`;
  }
  if (key === 'final') {
    const f = latestFinal(v);
    return `${who} · versión ${f?.version || 1}${v.corrections.length ? ` · ${v.corrections.filter(c => !c.resolved).length} corrección(es) abiertas` : ''}`;
  }
  if (key === 'feedback') {
    const n = v.corrections.filter(c => c.author === 'cliente' && !c.resolved).length;
    return `${who} · ${n} punto(s) del cliente sin resolver`;
  }
  return who;
}

function STAGE_LABEL(v: Video): string {
  if (v.qc === 'correcciones') return 'En correcciones';
  const f = latestFinal(v);
  if (f?.fileUrl && (!f.status || f.status === 'pending')) return 'Video final en revisión';
  if (v.clips.length > 0 && v.clips.every(c => c.status === 'approved')) return 'Clips aprobados · falta video final';
  if (v.clips.length > 0) return 'Subiendo / revisando clips';
  if (v.mainImageStatus === 'aprobada') return 'Imagen aprobada · faltan clips';
  if (v.mainImageStatus === 'pendiente') return 'Imagen principal en revisión';
  if (v.mainImageStatus === 'rechazada') return 'Imagen principal rechazada';
  return 'Sin iniciar';
}

// ---------------------------------------------------------------------------
// Piezas visuales
// ---------------------------------------------------------------------------
type Tone = 'accent' | 'amber' | 'red';

const TONE: Record<Tone, { icon: string; ring: string; num: string }> = {
  accent: { icon: 'bg-accent-dim text-accent', ring: 'hover:border-accent/50', num: 'text-text' },
  amber: { icon: 'bg-amber-dim text-amber', ring: 'hover:border-amber/50', num: 'text-amber' },
  red: { icon: 'bg-red-500/10 text-red-400', ring: 'hover:border-red-500/50', num: 'text-red-400' },
};

function AttentionTile({ label, hint, icon, tone, count, onClick }: { label: string; hint: string; icon: ReactNode; tone: Tone; count: number; onClick: () => void }) {
  const t = TONE[tone];
  const idle = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={idle}
      className={`relative text-left p-3.5 rounded-xl border transition-all duration-150 ${
        idle
          ? 'bg-surface-3/40 border-line/60 cursor-default'
          : `bg-surface-3 border-line ${t.ring} hover:-translate-y-0.5`
      }`}
    >
      {!idle && tone === 'red' && <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 ${idle ? 'bg-surface-2 text-muted-2' : t.icon}`}>
        {idle ? <CheckCircle2 size={17} /> : icon}
      </div>
      <p className={`font-display text-2xl font-bold leading-none ${idle ? 'text-muted-2' : t.num}`}><CountTicker value={count} /></p>
      <p className={`text-xs font-medium mt-1.5 ${idle ? 'text-muted-2' : 'text-text'}`}>{label}</p>
      <p className="text-[10px] text-muted-2 mt-0.5 leading-snug">{idle ? 'Al día' : hint}</p>
    </button>
  );
}

function FollowUpRow({ icon, label, count, onClick }: { icon: ReactNode; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm text-muted enabled:hover:bg-surface-3 enabled:hover:text-text disabled:opacity-60 disabled:cursor-default transition-colors"
    >
      <span className="text-violet">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="font-tech text-xs font-semibold text-text">{count}</span>
      {count > 0 && <ChevronRight size={14} className="text-muted-2" />}
    </button>
  );
}

function ProjectItem({ p, onOpen }: { p: ProjectRow; onOpen: () => void }) {
  const st = PROJECT_STATUS[p.status];
  const pctSenda = p.total > 0 ? (p.approvedSenda / p.total) * 100 : 0;
  const pctClient = p.total > 0 ? (p.approvedClient / p.total) * 100 : 0;
  const deadlineTone = p.status === 'vencido' ? 'text-red-400' : p.status === 'urgente' ? 'text-amber' : 'text-muted-2';
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left p-3 bg-surface-3 border border-line rounded-lg hover:border-accent/40 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">
            {p.brand} <span className="text-muted-2 font-normal">· {p.total} video{p.total === 1 ? '' : 's'}</span>
          </p>
          <p className="text-[11px] text-muted-2 mt-0.5 leading-relaxed">
            {fmtDate(p.deliveryDate, p.deliveryTime)}
            {p.status !== 'finalizado' && <span className={`ml-1.5 font-medium ${deadlineTone}`}>· {countdownLabel(p.deadline)}</span>}
            <span className="ml-1.5">· {p.responsible || 'Sin responsable'}</span>
          </p>
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${st.cls}`}>{st.label}</span>
        <ChevronRight size={15} className="text-muted-2 group-hover:text-accent transition-colors shrink-0" />
      </div>
      {p.total > 0 && p.status !== 'asignar' && (
        <div className="mt-2.5 flex items-center gap-2">
          <div className="relative h-1.5 flex-1 bg-surface-2 rounded-full overflow-hidden" title={`${p.approvedSenda} aprobados por Senda · ${p.approvedClient} aprobados por el cliente`}>
            <div className="absolute inset-y-0 left-0 bg-accent/40 rounded-full transition-all duration-500" style={{ width: `${pctSenda}%` }} />
            <div className="absolute inset-y-0 left-0 bg-mint rounded-full transition-all duration-500" style={{ width: `${pctClient}%` }} />
          </div>
          <span className="text-[10px] font-tech text-muted-2 shrink-0">{p.approvedClient}/{p.total}</span>
        </div>
      )}
    </button>
  );
}

function EntregasModal({ projects, onOpen, onClose }: { projects: ProjectRow[]; onOpen: (p: ProjectRow) => void; onClose: () => void }) {
  const [tab, setTab] = useState<'activos' | 'finalizados'>('activos');
  const active = projects.filter(p => p.status !== 'finalizado');
  const done = projects.filter(p => p.status === 'finalizado');
  const list = tab === 'activos' ? active : done;
  return (
    <Modal title="Orden de entrega" icon={<Clock3 size={18} className="text-amber" />} onClose={onClose}>
      <div className="flex gap-1.5">
        {([['activos', `Activos (${active.length})`], ['finalizados', `Finalizados (${done.length})`]] as const).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${tab === k ? 'bg-accent-dim border-accent/40 text-accent' : 'border-line text-muted hover:text-text'}`}
          >
            {l}
          </button>
        ))}
      </div>
      {list.length === 0 ? (
        <p className="text-sm text-muted text-center py-8">{tab === 'activos' ? 'No hay entregas activas.' : 'Todavía no hay proyectos finalizados.'}</p>
      ) : (
        <div className="space-y-2">
          {list.map(p => <ProjectItem key={p.id} p={p} onOpen={() => onOpen(p)} />)}
        </div>
      )}
      <p className="text-[11px] text-muted-2">Para borrar un proyecto ve a Tareas → Proyectos iniciados o a Clientes → Facturas y expedientes.</p>
    </Modal>
  );
}

function VideoList({ videos, detail, onOpen }: { videos: VideoWithBrand[]; detail: (v: Video) => string; onOpen: (v: Video) => void }) {
  if (videos.length === 0) return <p className="text-sm text-muted text-center py-6">Nada pendiente aquí.</p>;
  return (
    <div className="space-y-2">
      {videos.map(v => (
        <button
          key={v.id}
          type="button"
          onClick={() => onOpen(v)}
          className="w-full flex items-center justify-between gap-3 p-3 bg-surface-3 border border-line rounded-lg text-left hover:border-accent/40 transition-colors group"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{v.brandName} · {v.name}</p>
            <p className="text-xs text-muted-2 truncate">{detail(v)}</p>
          </div>
          <span className="text-xs text-accent font-medium flex items-center gap-1 shrink-0">Abrir <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" /></span>
        </button>
      ))}
    </div>
  );
}

function MoneyCard({ icon, label, value, sub, tone, progress, highlight }: {
  icon: ReactNode; label: string; value: ReactNode; sub: string; tone: 'text' | 'amber' | 'violet' | 'mint'; progress?: number; highlight?: boolean;
}) {
  const color = { text: 'text-text', amber: 'text-amber', violet: 'text-violet', mint: 'text-mint' }[tone];
  const soft = { text: 'bg-surface-2 text-muted', amber: 'bg-amber-dim text-amber', violet: 'bg-violet-dim text-violet', mint: 'bg-mint-dim text-mint' }[tone];
  return (
    <div className={`p-4 rounded-xl border bg-surface-3 ${highlight ? 'border-mint/40' : 'border-line'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-7 h-7 rounded-md flex items-center justify-center ${soft}`}>{icon}</span>
        <span className="text-xs text-muted">{label}</span>
      </div>
      <p className={`font-display text-xl sm:text-2xl font-bold ${color}`}>{value}</p>
      {progress !== undefined && (
        <div className="h-1 bg-surface-2 rounded-full overflow-hidden mt-2">
          <div className="h-full bg-amber rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
        </div>
      )}
      <p className="text-[11px] text-muted-2 mt-1.5">{sub}</p>
    </div>
  );
}

function LoadBar({ today, cap, load }: { today: number; cap: number; load: WorkerLoad }) {
  const pct = Math.min(100, (today / Math.max(1, cap)) * 100);
  return (
    <div className="mt-2.5 flex items-center gap-2" title="Videos que debe avanzar hoy según sus fechas de entrega, contra su capacidad diaria">
      <div className="h-1.5 flex-1 bg-surface-2 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${workerLoadColor(load)}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] font-tech text-muted-2 shrink-0">Hoy {today}/{cap}</span>
    </div>
  );
}

function Avatar({ name, online }: { name: string; online: boolean }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
  return (
    <span className="relative w-8 h-8 rounded-lg bg-accent-dim text-accent border border-accent/30 flex items-center justify-center text-[11px] font-bold font-tech shrink-0">
      {initials}
      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-3 ${online ? 'bg-mint' : 'bg-muted-2'}`} />
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-3 border border-line rounded-lg p-3">
      <p className="text-[10px] text-muted-2 uppercase tracking-wide">{label}</p>
      <p className="font-display text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}

function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-4 border border-dashed border-line rounded-xl bg-surface-3/30">
      <div className="w-12 h-12 rounded-full bg-surface-3 text-accent flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(53,214,228,0.1)]">{icon}</div>
      <p className="font-display font-semibold">{title}</p>
      <p className="text-xs text-muted mt-1 max-w-xs">{text}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="mt-3 text-xs font-semibold text-accent hover:text-accent-strong flex items-center gap-1">
          {action.label} <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

function Modal({ title, icon, onClose, children }: { title: string; icon?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] flex items-start justify-center p-4 sm:p-6 overflow-y-auto animate-fadeIn" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} className="bg-surface-2 border border-line rounded-xl w-full max-w-2xl mt-10 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2 min-w-0">
            {icon || <Users size={18} className="text-accent" />}
            <span className="truncate">{title}</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
