import { useMemo, useState, useEffect } from 'react';
import { useStore } from '../store';
import type { Order, OrderStatus, Video, Worker } from '../types';
import {
  DollarSign, Users, X, ClipboardCheck, Clock3, ChevronRight, Film, Scissors, Eye, Trash2
} from 'lucide-react';

export type WorkerLoad = 'lleno' | 'meta' | 'sin_trabajo';

const CURRENCY_SIGN = String.fromCharCode(36);
function fmtMoney(n: number): string {
  return CURRENCY_SIGN + Math.round(Number(n) || 0).toLocaleString('es-CO');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

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

const WORKER_LOAD_LABEL: Record<WorkerLoad, string> = {
  lleno: 'Lleno de trabajo (capacidad diaria al límite)',
  meta: 'Con tareas activas asignadas (en rango operativo)',
  sin_trabajo: 'Sin tareas asignadas actualmente',
};

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  aprobado_senda: 'Aprobado Senda',
  aprobado_cliente: 'Aprobado cliente',
  sin_asignar: 'Sin asignar',
  asignado: 'En progreso',
  finalizado: 'Pedido finalizado',
  incompleto: 'Pedido incompleto',
};

const ORDER_STATUS_CLASSES: Record<OrderStatus, string> = {
  aprobado_senda: 'bg-mint-dim text-mint',
  aprobado_cliente: 'bg-accent-dim text-accent',
  sin_asignar: 'bg-amber-dim text-amber',
  asignado: 'bg-accent-dim text-accent',
  finalizado: 'bg-emerald-500/10 text-emerald-400',
  incompleto: 'bg-red-500/10 text-red-400',
};

type EntregaBucket = 'urgente' | 'asignar' | 'asignado' | 'finalizado';

const ENTREGA_BUCKET_LABEL: Record<EntregaBucket, string> = {
  urgente: 'En proceso · Urgente',
  asignar: 'Por asignar',
  asignado: 'En progreso',
  finalizado: 'Finalizado',
};

const ENTREGA_BUCKET_CLASSES: Record<EntregaBucket, string> = {
  urgente: 'bg-red-500/15 text-red-400 border border-red-500/30',
  asignar: 'bg-amber-dim text-amber border border-amber/30',
  asignado: 'bg-accent-dim text-accent border border-accent/30',
  finalizado: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
};

export function AdminHomePanels({
  externalSelectedWorkerId,
  onClearExternalWorker,
}: {
  externalSelectedWorkerId?: string | null;
  onClearExternalWorker?: () => void;
}) {
  const {
    workers,
    brands,
    orders,
    financeSettings,
    appExpenses,
    getWorkerCapacity,
    getWorkerGoals,
    setView,
    setSelectedVideo,
    deleteOrder,
    deleteBrandProject,
  } = useStore();

  const [openFolder, setOpenFolder] = useState<'finanzas' | 'equipo' | 'pedidos' | 'qc_editores' | 'qc_clippers' | null>(null);
  const [equipoFilter, setEquipoFilter] = useState<WorkerLoad>('lleno');
  const [highlightedWorkerId, setHighlightedWorkerId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const allVideos = useMemo(() => brands.flatMap(b => b.videos), [brands]);

  const brandNameForVideo = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of brands) for (const v of b.videos) map[v.id] = b.name;
    return map;
  }, [brands]);

  const todayStr = todayIso();

  // Finanzas conectadas tanto a los pedidos activos (Pago 100%) como a los videos entregados
  const todayFinanceData = useMemo(() => {
    const unitPrice = financeSettings.clientPricePerVideo;
    const defClipper = financeSettings.defaultClipperCost;
    const defEditor = financeSettings.defaultEditorCost;

    // 1. Proyectos activos / facturados en orders
    const activeOrdersRows = orders.map(o => {
      const count = Math.max(1, o.videoCount || 1);
      const pricePerVid = o.unitPriceClient ?? unitPrice;
      const uClipper = o.unitClipperPay ?? defClipper;
      const uEditor = o.unitEditorPay ?? defEditor;
      const gross = count * pricePerVid;
      const creatorCost = count * (uClipper + uEditor);
      const netMargin = gross - creatorCost;
      const clipperW = workers.find(w => w.id === o.clipperId);
      const editorW = workers.find(w => w.id === o.editorId);
      return {
        id: o.id,
        brandName: o.brand,
        videoCount: count,
        gross,
        creatorCost,
        netMargin,
        teamLabel: `${clipperW?.name || "Por asignar"} + ${editorW?.name || "Por asignar"}`,
        status: o.status,
      };
    });

    const grossToday = activeOrdersRows.reduce((sum, r) => sum + r.gross, 0);
    const payrollToday = activeOrdersRows.reduce((sum, r) => sum + r.creatorCost, 0);
    const expensesToday = appExpenses
      .filter(e => e.date === todayStr)
      .reduce((sum, e) => sum + e.amount, 0);

    return {
      rowsHoy: activeOrdersRows,
      grossToday,
      payrollToday,
      expensesToday,
      netUtilityToday: grossToday - payrollToday - expensesToday,
      totalVideosHoy: activeOrdersRows.reduce((sum, r) => sum + r.videoCount, 0),
    };
  }, [orders, workers, financeSettings, appExpenses, todayStr]);

  // Carga REAL exacta: lo que el Clipper/Editor tiene asignado en su pestaña de Tareas (sin duplicar jamás)
  const workerMetrics = useMemo(() => {
    const map: Record<string, {
      activeVideosLoad: number;
      activeProjectsCount: number;
      capacity: number;
      dailyGoal: number;
      status: WorkerLoad;
      activeBrandNames: string[];
      assignedVideosList: { video: Video; brandName: string }[];
    }> = {};

    for (const w of workers) {
      const cap = getWorkerCapacity(w.id);
      const goals = getWorkerGoals(w.id, w.role);

      // Videos reales en Tareas del trabajador que aún no han sido finalizados por el cliente
      const myActiveVideos = allVideos.filter(v =>
        (w.role === 'clipper' ? v.clipperId === w.id : v.editorId === w.id) &&
        v.qc !== 'aprobado_cliente'
      );

      let activeVideosLoad = 0;
      const brandCounts = new Map<string, number>();
      const coveredOrderIds = new Set<string>();
      const coveredBrands = new Set<string>();
      const assignedVideosList: { video: Video; brandName: string }[] = [];

      for (const v of myActiveVideos) {
        const bName = brandNameForVideo[v.id] || v.name;
        activeVideosLoad += 1;
        brandCounts.set(bName, (brandCounts.get(bName) || 0) + 1);
        if (v.orderId) coveredOrderIds.add(v.orderId);
        coveredBrands.add(bName.trim().toLowerCase());
        assignedVideosList.push({ video: v, brandName: bName });
      }

      // Solo sumar órdenes donde ya fue preasignado este rol pero aún no se ha promovido a brands
      const unpromotedOrders = orders.filter(o => {
        if (o.status === 'finalizado' || o.status === 'aprobado_cliente') return false;
        const isMine = w.role === 'clipper' ? o.clipperId === w.id : o.editorId === w.id;
        if (!isMine) return false;
        if (coveredOrderIds.has(o.id)) return false;
        return true;
      });

      for (const o of unpromotedOrders) {
        const count = Math.max(1, o.videoCount || 1);
        activeVideosLoad += count;
        brandCounts.set(o.brand, (brandCounts.get(o.brand) || 0) + count);
      }

      let status: WorkerLoad = 'sin_trabajo';
      if (activeVideosLoad === 0) {
        status = 'sin_trabajo';
      } else if (activeVideosLoad >= cap) {
        status = 'lleno';
      } else {
        status = 'meta';
      }

      map[w.id] = {
        activeVideosLoad,
        activeProjectsCount: brandCounts.size,
        capacity: cap,
        dailyGoal: goals.daily,
        status,
        activeBrandNames: Array.from(brandCounts.entries()).map(([bName, count]) => `${bName} · ${count} video(s) pendiente(s)`),
        assignedVideosList,
      };
    }

    return map;
  }, [workers, allVideos, orders, brandNameForVideo, getWorkerCapacity, getWorkerGoals]);

  const workersByLoad = useMemo(() => {
    const result: Record<WorkerLoad, Worker[]> = { lleno: [], meta: [], sin_trabajo: [] };
    for (const w of workers) {
      const st = workerMetrics[w.id]?.status || 'sin_trabajo';
      result[st].push(w);
    }
    return result;
  }, [workers, workerMetrics]);

  useEffect(() => {
    if (externalSelectedWorkerId && workerMetrics[externalSelectedWorkerId]) {
      setEquipoFilter(workerMetrics[externalSelectedWorkerId].status);
      setHighlightedWorkerId(externalSelectedWorkerId);
      setOpenFolder('equipo');
      onClearExternalWorker?.();
    }
  }, [externalSelectedWorkerId, workerMetrics, onClearExternalWorker]);

  const pendingClipVideos = useMemo(
    () => allVideos.filter(v => {
      if (v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente' || v.qc === 'sin_iniciar') return false;
      const hasPendingClips = v.clips.some(c => !c.status || c.status === 'pending');
      const hasPendingMainImage = v.mainImageStatus === 'pendiente';
      const sentWaitingReview = Boolean(v.sentByClipper && v.finalVideos.length === 0);
      return hasPendingClips || hasPendingMainImage || sentWaitingReview;
    }),
    [allVideos]
  );

  const pendingFinalVideos = useMemo(
    () => allVideos.filter(v => {
      if (v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente' || v.qc === 'sin_iniciar') return false;
      return v.finalVideos.length > 0 || v.qc === 'revision' || v.qc === 'correcciones';
    }),
    [allVideos]
  );

  const goToVideo = (v: Video) => {
    setSelectedVideo(v);
    setView('tareas');
  };

  // Unificar Orden de Entrega con tanto los pedidos de orders como cualquier marca en brands
  const enrichedOrders = useMemo(() => {
    const list = orders.map(o => {
      const brandObj = brands.find(b => b.id === `brand-${o.id}` || b.videos.some(v => v.orderId === o.id)) || brands.find(b => b.name.trim().toLowerCase() === o.brand.trim().toLowerCase());
      const brandVideos = brandObj ? brandObj.videos.filter(v => !v.orderId || v.orderId === o.id) : [];
      const linkedVideo = brandVideos[0] || allVideos.find(v => v.id === o.boardVideoId) || null;

      let realStatus: OrderStatus = o.status;
      if (brandVideos.length > 0) {
        if (brandVideos.every(v => v.qc === 'aprobado_cliente')) realStatus = 'finalizado';
        else if (brandVideos.some(v => v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente')) realStatus = 'aprobado_senda';
        else if (o.clipperId && o.editorId) realStatus = 'asignado';
      }

      let bucket: EntregaBucket = 'asignado';
      if (realStatus === 'finalizado' || realStatus === 'aprobado_cliente') {
        bucket = 'finalizado';
      } else if (!o.clipperId || !o.editorId) {
        bucket = 'asignar';
      } else {
        const dt = new Date(`${o.deliveryDate}T${o.deliveryTime || '18:00'}`).getTime();
        const hoursLeft = (dt - Date.now()) / (1000 * 60 * 60);
        if (!Number.isNaN(dt) && hoursLeft <= 8) bucket = 'urgente';
        else bucket = 'asignado';
      }

      return {
        id: o.id,
        isBrandOnly: false,
        brandId: brandObj?.id || null,
        order: { ...o, status: realStatus },
        linkedVideo,
        bucket,
      };
    });

    // Si existiera alguna carpeta en brands sin Order en orders (residuo antiguo), mostrarla también para poder verla o borrarla
    for (const b of brands) {
      const alreadyInList = list.some(
        item => item.brandId === b.id || item.order.brand.trim().toLowerCase() === b.name.trim().toLowerCase()
      );
      if (!alreadyInList && b.videos.length > 0) {
        const firstV = b.videos[0];
        const allDone = b.videos.every(v => v.qc === 'aprobado_cliente');
        const synthOrder: Order = {
          id: b.id,
          brand: b.name,
          videoCount: b.videos.length,
          deliveryDate: firstV.date || todayStr,
          deliveryTime: '18:00',
          status: allDone ? 'finalizado' : 'asignado',
          assignedWorkerIds: [firstV.clipperId, firstV.editorId].filter(Boolean),
          clipperId: firstV.clipperId || null,
          editorId: firstV.editorId || null,
          createdAt: new Date().toISOString(),
        };
        list.push({
          id: b.id,
          isBrandOnly: true,
          brandId: b.id,
          order: synthOrder,
          linkedVideo: firstV,
          bucket: allDone ? 'finalizado' : 'asignado',
        });
      }
    }

    return list.sort((a, b) => {
      const aDone = a.bucket === 'finalizado' ? 1 : 0;
      const bDone = b.bucket === 'finalizado' ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      const tA = new Date(`${a.order.deliveryDate}T${a.order.deliveryTime || '23:59'}`).getTime();
      const tB = new Date(`${b.order.deliveryDate}T${b.order.deliveryTime || '23:59'}`).getTime();
      return tA - tB;
    });
  }, [orders, brands, allVideos, todayStr]);

  const handleCompleteDelete = (item: { id: string; isBrandOnly: boolean; brandId: string | null }) => {
    if (item.isBrandOnly && item.brandId) {
      deleteBrandProject(item.brandId);
    } else {
      deleteOrder(item.id);
      if (item.brandId) deleteBrandProject(item.brandId);
    }
    setConfirmDeleteId(null);
  };

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button onClick={() => setOpenFolder('finanzas')} className="text-left bg-surface-2 border border-line rounded-xl p-5 hover:border-mint/50 hover:bg-surface-3 transition-colors">
          <div className="w-10 h-10 rounded-lg bg-mint-dim text-mint flex items-center justify-center mb-3">
            <DollarSign size={20} />
          </div>
          <p className="font-display text-2xl font-bold">{fmtMoney(todayFinanceData.netUtilityToday)}</p>
          <p className="text-xs text-muted-2 mt-1">
            Utilidad activa ({todayStr}) · {todayFinanceData.rowsHoy.length} proyecto(s) ({todayFinanceData.totalVideosHoy} videos)
          </p>
        </button>

        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <p className="text-sm font-medium text-muted mb-3">Clippers / Editores</p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { setEquipoFilter('lleno'); setHighlightedWorkerId(null); setOpenFolder('equipo'); }} className="flex flex-col items-center gap-1.5 bg-surface-3 hover:bg-line/40 border border-line rounded-lg py-2.5 transition-colors">
              <span className={`w-2.5 h-2.5 rounded-full ${workerLoadColor('lleno')}`} />
              <span className="font-display text-lg font-bold leading-none">{workersByLoad.lleno.length}</span>
              <span className="text-[9px] text-muted-2 text-center leading-tight">Lleno</span>
            </button>
            <button onClick={() => { setEquipoFilter('meta'); setHighlightedWorkerId(null); setOpenFolder('equipo'); }} className="flex flex-col items-center gap-1.5 bg-surface-3 hover:bg-line/40 border border-line rounded-lg py-2.5 transition-colors">
              <span className={`w-2.5 h-2.5 rounded-full ${workerLoadColor('meta')}`} />
              <span className="font-display text-lg font-bold leading-none">{workersByLoad.meta.length}</span>
              <span className="text-[9px] text-muted-2 text-center leading-tight">Meta diaria</span>
            </button>
            <button onClick={() => { setEquipoFilter('sin_trabajo'); setHighlightedWorkerId(null); setOpenFolder('equipo'); }} className="flex flex-col items-center gap-1.5 bg-surface-3 hover:bg-line/40 border border-line rounded-lg py-2.5 transition-colors">
              <span className={`w-2.5 h-2.5 rounded-full ${workerLoadColor('sin_trabajo')}`} />
              <span className="font-display text-lg font-bold leading-none">{workersByLoad.sin_trabajo.length}</span>
              <span className="text-[9px] text-muted-2 text-center leading-tight">Sin trabajo</span>
            </button>
          </div>
        </div>

        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <p className="text-sm font-medium text-muted mb-3 flex items-center gap-1.5">
            <ClipboardCheck size={15} /> Control de Calidad (QC)
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button onClick={() => { if (pendingFinalVideos.length === 1) goToVideo(pendingFinalVideos[0]); else if (pendingFinalVideos.length > 1) setOpenFolder('qc_editores'); }} disabled={pendingFinalVideos.length === 0} className="flex flex-col items-center gap-1 bg-surface-3 hover:bg-line/40 border border-line rounded-lg py-3 transition-colors disabled:opacity-50 disabled:cursor-default">
              <Film size={14} className="text-accent" />
              <span className="font-display text-xl font-bold leading-none">{pendingFinalVideos.length}</span>
              <span className="text-[9px] text-muted-2">Editores (video final)</span>
            </button>
            <button onClick={() => { if (pendingClipVideos.length === 1) goToVideo(pendingClipVideos[0]); else if (pendingClipVideos.length > 1) setOpenFolder('qc_clippers'); }} disabled={pendingClipVideos.length === 0} className="flex flex-col items-center gap-1 bg-surface-3 hover:bg-line/40 border border-line rounded-lg py-3 transition-colors disabled:opacity-50 disabled:cursor-default">
              <Scissors size={14} className="text-violet" />
              <span className="font-display text-xl font-bold leading-none">{pendingClipVideos.length}</span>
              <span className="text-[9px] text-muted-2">Clippers</span>
            </button>
          </div>
        </div>
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base font-semibold flex items-center gap-2">
            <Clock3 size={16} className="text-amber" /> Orden de entrega
          </h3>
          <button onClick={() => setOpenFolder('pedidos')} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
            Ver más <ChevronRight size={14} />
          </button>
        </div>
        {enrichedOrders.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Sin pedidos registrados</p>
        ) : (
          <div className="space-y-2">
            {enrichedOrders.slice(0, 5).map((item, i) => {
              const { order: o, linkedVideo, bucket } = item;
              const clipperW = workers.find(w => w.id === o.clipperId);
              const editorW = workers.find(w => w.id === o.editorId);
              return (
                <div
                  key={item.id}
                  onClick={() => { if (linkedVideo) goToVideo(linkedVideo); else setView('tareas'); }}
                  className="w-full flex items-center gap-3 p-3 bg-surface-3 hover:bg-line/30 border border-line rounded-lg text-left transition-colors cursor-pointer"
                >
                  <span className="w-6 h-6 rounded-full bg-surface-2 border border-line flex items-center justify-center text-xs font-semibold shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{o.brand} · {o.videoCount} videos</p>
                    <p className="text-xs text-muted-2 truncate">
                      Entrega: {o.deliveryDate} · {o.deliveryTime} · {clipperW?.name || 'Sin Clipper'} + {editorW?.name || 'Sin Editor'}
                    </p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-1 rounded-full shrink-0 ${ENTREGA_BUCKET_CLASSES[bucket]}`}>
                    {ENTREGA_BUCKET_LABEL[bucket]}
                  </span>
                  <div onClick={e => e.stopPropagation()} className="shrink-0">
                    {confirmDeleteId === item.id ? (
                      <div className="flex items-center gap-1 bg-red-500/15 border border-red-500/40 rounded-lg px-2 py-1">
                        <span className="text-[10px] text-red-300 font-semibold">¿Borrar?</span>
                        <button
                          type="button"
                          onClick={() => handleCompleteDelete(item)}
                          className="px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-bold hover:bg-red-600"
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-0.5 rounded bg-surface-2 text-muted text-[10px] hover:text-text"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(item.id)}
                        title="Borrar proyecto por completo de la base de datos"
                        className="p-1.5 rounded-lg text-muted-2 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {openFolder === 'finanzas' && (
        <FolderModal title={`Utilidad y Proyectos Activos (${todayStr})`} onClose={() => setOpenFolder(null)}>
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-surface-3 border border-line rounded-lg p-3.5">
              <p className="text-xs text-muted-2">Facturación Bruta</p>
              <p className="font-display text-xl font-bold text-text">{fmtMoney(todayFinanceData.grossToday)}</p>
            </div>
            <div className="bg-surface-3 border border-line rounded-lg p-3.5">
              <p className="text-xs text-muted-2">Nómina + Apps</p>
              <p className="font-display text-xl font-bold text-amber">-{fmtMoney(todayFinanceData.payrollToday + todayFinanceData.expensesToday)}</p>
            </div>
            <div className="bg-surface-3 border border-mint/40 rounded-lg p-3.5">
              <p className="text-xs text-mint">Utilidad Neta SENDA</p>
              <p className="font-display text-xl font-bold text-mint">{fmtMoney(todayFinanceData.netUtilityToday)}</p>
            </div>
          </div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs text-muted-2">Proyectos contabilizados en el sistema</p>
            <button onClick={() => { setOpenFolder(null); setView('finanzas'); }} className="text-xs text-accent hover:text-accent-strong font-medium flex items-center gap-1">
              Ir a Finanzas completas <ChevronRight size={13} />
            </button>
          </div>
          {todayFinanceData.rowsHoy.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">No hay proyectos registrados actualmente</p>
          ) : (
            <div className="space-y-2">
              {todayFinanceData.rowsHoy.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-3 bg-surface-3 border border-line rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{r.brandName} · {r.videoCount} videos</p>
                    <p className="text-xs text-muted">{r.teamLabel} · Bruto: {fmtMoney(r.gross)} · Nómina: -{fmtMoney(r.creatorCost)}</p>
                  </div>
                  <span className="text-sm font-semibold text-mint shrink-0">+{fmtMoney(r.netMargin)}</span>
                </div>
              ))}
            </div>
          )}
        </FolderModal>
      )}

      {openFolder === 'equipo' && (
        <FolderModal title="Estado Real de Clippers y Editores (Conectado a Tareas)" onClose={() => setOpenFolder(null)}>
          <div className="flex gap-2 mb-4">
            {(['lleno', 'meta', 'sin_trabajo'] as WorkerLoad[]).map(f => (
              <button
                key={f}
                onClick={() => { setEquipoFilter(f); setHighlightedWorkerId(null); }}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg py-2 border transition-colors ${
                  equipoFilter === f ? 'bg-surface-3 border-accent text-text' : 'bg-surface-3 border-line text-muted hover:text-text'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${workerLoadColor(f)}`} />
                {f === 'lleno' ? 'Lleno' : f === 'meta' ? 'Meta diaria' : 'Sin trabajo'} ({workersByLoad[f].length})
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-2 mb-2">{WORKER_LOAD_LABEL[equipoFilter]}</p>
          {workersByLoad[equipoFilter].length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Nadie se encuentra en este estado en este momento</p>
          ) : (
            <div className="space-y-2.5">
              {workersByLoad[equipoFilter].map(w => {
                const info = workerMetrics[w.id];
                const isHighlighted = highlightedWorkerId === w.id;
                return (
                  <div
                    key={w.id}
                    className={`p-3.5 bg-surface-3 border rounded-xl transition-colors space-y-2.5 ${
                      isHighlighted ? 'border-accent ring-1 ring-accent/40' : 'border-line'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${workerLoadColor(equipoFilter)}`} />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">
                            {w.name} <span className="text-xs text-muted-2">({w.role === 'clipper' ? 'Clipper' : 'Editor(a)'})</span>
                          </p>
                          <p className="text-xs text-muted-2 truncate">
                            {info.activeBrandNames.length > 0
                              ? `Proyectos en Tareas: ${info.activeBrandNames.join(' · ')}`
                              : 'Sin proyectos asignados en su bandeja de Tareas'}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className={`text-xs font-tech font-bold px-2.5 py-1 rounded-full border ${
                          info.status === 'lleno'
                            ? 'bg-amber-dim text-amber border-amber/40'
                            : info.status === 'meta'
                            ? 'bg-mint-dim text-mint border-mint/40'
                            : 'bg-surface-2 text-muted border-line'
                        }`}>
                          {info.activeVideosLoad}/{info.capacity} videos
                        </span>
                        <p className="text-[10px] text-muted-2 mt-1">Puntos hoy: {w.pointsToday}/{info.dailyGoal}</p>
                      </div>
                    </div>

                    {info.activeBrandNames.length > 0 && (
                      <div className="pt-2 border-t border-line/60 flex flex-wrap gap-1.5">
                        {info.activeBrandNames.map((brandSummary, idx) => (
                          <span
                            key={idx}
                            className="text-xs font-tech font-medium px-2.5 py-1 rounded-lg bg-surface-2 border border-line text-accent"
                          >
                            {brandSummary}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </FolderModal>
      )}

      {openFolder === 'qc_editores' && (
        <FolderModal title="Control de Calidad · Editores (Video Final)" onClose={() => setOpenFolder(null)}>
          <p className="text-xs text-muted-2 mb-2">Proyectos iniciados esperando tu visto bueno o correcciones sobre el video final:</p>
          <div className="space-y-2">
            {pendingFinalVideos.map(v => (
              <button key={v.id} onClick={() => { setOpenFolder(null); goToVideo(v); }} className="w-full flex items-center justify-between gap-3 p-3 bg-surface-3 hover:bg-line/40 border border-line rounded-lg text-left transition-colors">
                <div>
                  <p className="text-sm font-medium">{brandNameForVideo[v.id] ? `${brandNameForVideo[v.id]} · ${v.name}` : v.name}</p>
                  <p className="text-xs text-muted-2">Editor(a): {v.editorName} · {v.finalVideos.length} corte(s) final(es) · Estado: {v.qc.replace(/_/g, ' ')}</p>
                </div>
                <span className="text-xs text-accent font-medium flex items-center gap-1">Revisar <Eye size={13} /></span>
              </button>
            ))}
          </div>
        </FolderModal>
      )}

      {openFolder === 'qc_clippers' && (
        <FolderModal title="Control de Calidad · Clippers" onClose={() => setOpenFolder(null)}>
          <p className="text-xs text-muted-2 mb-2">Proyectos iniciados con clips o imagen principal pendientes de tu aprobación:</p>
          <div className="space-y-2">
            {pendingClipVideos.map(v => (
              <button key={v.id} onClick={() => { setOpenFolder(null); goToVideo(v); }} className="w-full flex items-center justify-between gap-3 p-3 bg-surface-3 hover:bg-line/40 border border-line rounded-lg text-left transition-colors">
                <div>
                  <p className="text-sm font-medium">{brandNameForVideo[v.id] ? `${brandNameForVideo[v.id]} · ${v.name}` : v.name}</p>
                  <p className="text-xs text-muted-2">Clipper: {v.clipperName} · {v.clips.filter(c => !c.status || c.status === 'pending').length} clip(s) por revisar</p>
                </div>
                <span className="text-xs text-accent font-medium flex items-center gap-1">Revisar <Eye size={13} /></span>
              </button>
            ))}
          </div>
        </FolderModal>
      )}

      {openFolder === 'pedidos' && (
        <FolderModal title="Orden de Entrega (Proyectos Reales)" icon={<Clock3 size={18} className="text-amber" />} onClose={() => setOpenFolder(null)}>
          {enrichedOrders.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Sin pedidos registrados todavía</p>
          ) : (
            <div className="space-y-2">
              {enrichedOrders.map((item, i) => {
                const { order: o, linkedVideo, bucket } = item;
                const clipperW = workers.find(w => w.id === o.clipperId);
                const editorW = workers.find(w => w.id === o.editorId);
                return (
                  <div key={item.id} onClick={() => { if (linkedVideo) { setOpenFolder(null); goToVideo(linkedVideo); } }} className={`flex items-center gap-3 p-3 bg-surface-3 border border-line rounded-lg ${linkedVideo ? 'cursor-pointer hover:border-accent/40' : ''}`}>
                    <span className="w-6 h-6 rounded-full bg-surface-2 border border-line flex items-center justify-center text-xs font-semibold shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{o.brand} · {o.videoCount} videos</p>
                      <p className="text-xs text-muted-2">{o.deliveryDate} · {o.deliveryTime} · {clipperW?.name || 'Por asignar'} + {editorW?.name || 'Por asignar'}</p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-full shrink-0 ${ORDER_STATUS_CLASSES[o.status]}`}>{ORDER_STATUS_LABEL[o.status]}</span>
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-full shrink-0 ${ENTREGA_BUCKET_CLASSES[bucket]}`}>{ENTREGA_BUCKET_LABEL[bucket]}</span>
                    <div onClick={e => e.stopPropagation()} className="shrink-0">
                      {confirmDeleteId === item.id ? (
                        <div className="flex items-center gap-1 bg-red-500/15 border border-red-500/40 rounded-lg px-2 py-1">
                          <button
                            type="button"
                            onClick={() => handleCompleteDelete(item)}
                            className="px-2 py-0.5 rounded bg-red-500 text-white text-[10px] font-bold hover:bg-red-600"
                          >
                            Confirmar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-1.5 py-0.5 rounded bg-surface-2 text-muted text-[10px] hover:text-text"
                          >
                            No
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(item.id)}
                          title="Borrar proyecto por completo"
                          className="p-1.5 rounded-lg text-muted-2 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </FolderModal>
      )}
    </>
  );
}

function FolderModal({ title, icon, onClose, children }: { title: string; icon?: React.ReactNode; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 flex items-start justify-center p-6 overflow-y-auto" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-surface-2 border border-line rounded-xl w-full max-w-2xl mt-10 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2">{icon || <Users size={18} className="text-accent" />} {title}</h3>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text transition-colors">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
