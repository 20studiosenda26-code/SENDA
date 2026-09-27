import { useMemo, useState } from 'react';
import { useStore } from '../store';
import type { Order, OrderStatus, Video, Worker } from '../types';
import {
  DollarSign, Users, X, ClipboardCheck, Clock3, ChevronRight, Film, Scissors,
} from 'lucide-react';

type WorkerLoad = 'lleno' | 'meta' | 'sin_trabajo';

function workerLoadColor(load: WorkerLoad) {
  if (load === 'lleno') return 'bg-red-500';
  if (load === 'meta') return 'bg-mint';
  return 'bg-accent';
}

const WORKER_LOAD_LABEL: Record<WorkerLoad, string> = {
  lleno: 'Lleno de trabajo',
  meta: 'Con la meta diaria (ni lleno ni vacío)',
  sin_trabajo: 'Sin trabajo asignado hoy',
};

const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  aprobado_rste: 'Aprobado Rste',
  aprobado_cliente: 'Aprobado cliente',
  sin_asignar: 'Sin asignar',
  finalizado: 'Pedido finalizado',
  incompleto: 'Pedido incompleto',
};

const ORDER_STATUS_CLASSES: Record<OrderStatus, string> = {
  aprobado_rste: 'bg-mint-dim text-mint',
  aprobado_cliente: 'bg-accent-dim text-accent',
  sin_asignar: 'bg-amber-dim text-amber',
  finalizado: 'bg-emerald-500/10 text-emerald-400',
  incompleto: 'bg-red-500/10 text-red-400',
};

type EntregaBucket = 'urgente' | 'asignar' | 'asignado' | 'finalizado';

const ENTREGA_BUCKET_LABEL: Record<EntregaBucket, string> = {
  urgente: 'En proceso · Urgente',
  asignar: 'Asignar',
  asignado: 'Asignado',
  finalizado: 'Finalizado',
};

const ENTREGA_BUCKET_CLASSES: Record<EntregaBucket, string> = {
  urgente: 'bg-red-500/15 text-red-400 border border-red-500/30',
  asignar: 'bg-amber-dim text-amber border border-amber/30',
  asignado: 'bg-accent-dim text-accent border border-accent/30',
  finalizado: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
};

function entregaBucket(order: Order): EntregaBucket {
  if (order.status === 'finalizado') return 'finalizado';
  if (order.assignedWorkerIds.length === 0) return 'asignar';
  const dt = new Date(`${order.deliveryDate}T${order.deliveryTime || '00:00'}`).getTime();
  const hoursLeft = (dt - Date.now()) / (1000 * 60 * 60);
  if (!Number.isNaN(dt) && hoursLeft <= 3) return 'urgente';
  return 'asignado';
}

export function AdminHomePanels() {
  const { workers, brands, orders, config, setView, setSelectedVideo } = useStore();
  const [openFolder, setOpenFolder] = useState<'finanzas' | 'equipo' | 'pedidos' | null>(null);
  const [equipoFilter, setEquipoFilter] = useState<WorkerLoad>('lleno');

  const allVideos = useMemo(() => brands.flatMap(b => b.videos), [brands]);

  const brandNameForVideo = useMemo(() => {
    const map: Record<string, string> = {};
    for (const b of brands) for (const v of b.videos) map[v.id] = b.name;
    return map;
  }, [brands]);

  // --- Utilidad / Finanzas ---
  const entregados = useMemo(() => allVideos.filter(v => v.qc === 'aprobado_cliente' && v.paid100), [allVideos]);
  const utilidadTotal = useMemo(
    () => entregados.reduce((sum, v) => sum + (v.tierSnapshot ? v.tierSnapshot.clipperPay + v.tierSnapshot.editorPay : 0), 0),
    [entregados]
  );

  // --- Carga de clíper / editor ---
  const workerLoad = (w: Worker): number => allVideos.filter(v =>
    (w.role === 'clipper' ? v.clipperId === w.id : v.editorId === w.id) &&
    v.qc !== 'aprobado_cliente' && v.qc !== 'sin_iniciar'
  ).length;

  const classifyWorker = (w: Worker): WorkerLoad => {
    const load = workerLoad(w);
    const goal = config.goals[w.role].daily;
    if (load === 0) return 'sin_trabajo';
    if (load >= goal * 1.5) return 'lleno';
    return 'meta';
  };

  const workersByLoad = useMemo(() => {
    const result: Record<WorkerLoad, Worker[]> = { lleno: [], meta: [], sin_trabajo: [] };
    for (const w of workers) result[classifyWorker(w)].push(w);
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers, allVideos, config]);

  const currentBrandForWorker = (w: Worker): string => {
    const v = allVideos.find(vid =>
      (w.role === 'clipper' ? vid.clipperId === w.id : vid.editorId === w.id) &&
      vid.qc !== 'aprobado_cliente' && vid.qc !== 'sin_iniciar'
    );
    return v ? (brandNameForVideo[v.id] || v.name) : 'Sin marca activa';
  };

  // --- QC pendiente ---
  const pendingClipVideos = useMemo(
    () => allVideos.filter(v => v.clips.some(c => c.fileUrl && (!c.status || c.status === 'pending'))),
    [allVideos]
  );
  const pendingFinalVideos = useMemo(
    () => allVideos.filter(v => v.finalVideos.length > 0 && v.qc !== 'aprobado_rste' && v.qc !== 'aprobado_cliente'),
    [allVideos]
  );

  const goToVideo = (v: Video) => {
    setSelectedVideo(v);
    setView('tareas');
  };

  // --- Orden de entrega ---
  const sortedOrders = useMemo(
    () => [...orders].sort((a, b) => new Date(`${a.deliveryDate}T${a.deliveryTime || '00:00'}`).getTime() - new Date(`${b.deliveryDate}T${b.deliveryTime || '00:00'}`).getTime()),
    [orders]
  );

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Utilidad */}
        <button
          onClick={() => setOpenFolder('finanzas')}
          className="text-left bg-surface-2 border border-line rounded-xl p-5 hover:border-mint/50 hover:bg-surface-3 transition-colors"
        >
          <div className="w-10 h-10 rounded-lg bg-mint-dim text-mint flex items-center justify-center mb-3">
            <DollarSign size={20} />
          </div>
          <p className="font-display text-2xl font-bold">${utilidadTotal.toLocaleString('es-CO')}</p>
          <p className="text-xs text-muted-2 mt-1">Utilidad · {entregados.length} entregados (aprobados y pagados)</p>
        </button>

        {/* Cliper / Editores */}
        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <p className="text-sm font-medium text-muted mb-3">Cliper / Editores</p>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={() => { setEquipoFilter('lleno'); setOpenFolder('equipo'); }} className="flex flex-col items-center gap-1.5 bg-surface-3 hover:bg-line/40 border border-line rounded-lg py-2.5 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
              <span className="font-display text-lg font-bold leading-none">{workersByLoad.lleno.length}</span>
              <span className="text-[9px] text-muted-2 text-center leading-tight">Lleno</span>
            </button>
            <button onClick={() => { setEquipoFilter('meta'); setOpenFolder('equipo'); }} className="flex flex-col items-center gap-1.5 bg-surface-3 hover:bg-line/40 border border-line rounded-lg py-2.5 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-mint" />
              <span className="font-display text-lg font-bold leading-none">{workersByLoad.meta.length}</span>
              <span className="text-[9px] text-muted-2 text-center leading-tight">Meta diaria</span>
            </button>
            <button onClick={() => { setEquipoFilter('sin_trabajo'); setOpenFolder('equipo'); }} className="flex flex-col items-center gap-1.5 bg-surface-3 hover:bg-line/40 border border-line rounded-lg py-2.5 transition-colors">
              <span className="w-2.5 h-2.5 rounded-full bg-accent" />
              <span className="font-display text-lg font-bold leading-none">{workersByLoad.sin_trabajo.length}</span>
              <span className="text-[9px] text-muted-2 text-center leading-tight">Sin trabajo</span>
            </button>
          </div>
        </div>

        {/* QC */}
        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <p className="text-sm font-medium text-muted mb-3 flex items-center gap-1.5"><ClipboardCheck size={15} /> QC</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { if (pendingFinalVideos[0]) goToVideo(pendingFinalVideos[0]); }}
              disabled={pendingFinalVideos.length === 0}
              className="flex flex-col items-center gap-1 bg-surface-3 hover:bg-line/40 border border-line rounded-lg py-3 transition-colors disabled:opacity-50 disabled:cursor-default"
            >
              <Film size={14} className="text-accent" />
              <span className="font-display text-xl font-bold leading-none">{pendingFinalVideos.length}</span>
              <span className="text-[9px] text-muted-2">Editores (video final)</span>
            </button>
            <button
              onClick={() => { if (pendingClipVideos[0]) goToVideo(pendingClipVideos[0]); }}
              disabled={pendingClipVideos.length === 0}
              className="flex flex-col items-center gap-1 bg-surface-3 hover:bg-line/40 border border-line rounded-lg py-3 transition-colors disabled:opacity-50 disabled:cursor-default"
            >
              <Scissors size={14} className="text-violet" />
              <span className="font-display text-xl font-bold leading-none">{pendingClipVideos.length}</span>
              <span className="text-[9px] text-muted-2">Clipers</span>
            </button>
          </div>
        </div>
      </div>

      {/* Orden de entrega */}
      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base font-semibold flex items-center gap-2"><Clock3 size={16} className="text-amber" /> Orden de entrega</h3>
          <button onClick={() => setOpenFolder('pedidos')} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
            Ver más <ChevronRight size={14} />
          </button>
        </div>
        {sortedOrders.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Sin pedidos registrados</p>
        ) : (
          <div className="space-y-2">
            {sortedOrders.slice(0, 3).map((o, i) => {
              const bucket = entregaBucket(o);
              return (
                <button
                  key={o.id}
                  onClick={() => setOpenFolder('pedidos')}
                  className="w-full flex items-center gap-3 p-3 bg-surface-3 hover:bg-line/30 border border-line rounded-lg text-left transition-colors"
                >
                  <span className="w-6 h-6 rounded-full bg-surface-2 border border-line flex items-center justify-center text-xs font-semibold shrink-0">{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{o.brand} · {o.videoCount} creativos</p>
                    <p className="text-xs text-muted-2">{o.deliveryDate} · {o.deliveryTime}</p>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-1 rounded-full shrink-0 ${ENTREGA_BUCKET_CLASSES[bucket]}`}>
                    {ENTREGA_BUCKET_LABEL[bucket]}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* --- Carpeta: Finanzas --- */}
      {openFolder === 'finanzas' && (
        <FolderModal title="Finanzas" onClose={() => setOpenFolder(null)}>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-surface-3 border border-line rounded-lg p-4">
              <p className="text-xs text-muted-2">Utilidad total</p>
              <p className="font-display text-2xl font-bold text-mint">${utilidadTotal.toLocaleString('es-CO')}</p>
            </div>
            <div className="bg-surface-3 border border-line rounded-lg p-4">
              <p className="text-xs text-muted-2">Entregados (aprobados y pagados)</p>
              <p className="font-display text-2xl font-bold">{entregados.length}</p>
            </div>
          </div>
          <p className="text-xs text-muted-2 mb-2">Detalle de videos entregados</p>
          {entregados.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Aún no hay videos entregados y pagados</p>
          ) : (
            <div className="space-y-2">
              {entregados.map(v => (
                <div key={v.id} className="flex items-center gap-3 p-3 bg-surface-3 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    <p className="text-xs text-muted">{v.clipperName} · {v.editorName} · {v.date}</p>
                  </div>
                  <span className="text-sm font-semibold text-mint shrink-0">
                    ${(v.tierSnapshot ? v.tierSnapshot.clipperPay + v.tierSnapshot.editorPay : 0).toLocaleString('es-CO')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </FolderModal>
      )}

      {/* --- Carpeta: Equipo --- */}
      {openFolder === 'equipo' && (
        <FolderModal title="Equipo" onClose={() => setOpenFolder(null)}>
          <div className="flex gap-2 mb-4">
            {(['lleno', 'meta', 'sin_trabajo'] as WorkerLoad[]).map(f => (
              <button
                key={f}
                onClick={() => setEquipoFilter(f)}
                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-medium rounded-lg py-2 border transition-colors ${
                  equipoFilter === f ? 'bg-surface-3 border-accent text-text' : 'bg-surface-3 border-line text-muted hover:text-text'
                }`}
              >
                <span className={`w-2 h-2 rounded-full ${workerLoadColor(f)}`} /> {workersByLoad[f].length}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-2 mb-2">{WORKER_LOAD_LABEL[equipoFilter]}</p>
          {workersByLoad[equipoFilter].length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Nadie en este estado por ahora</p>
          ) : (
            <div className="space-y-2">
              {workersByLoad[equipoFilter].map(w => (
                <div key={w.id} className="flex items-center gap-3 p-3 bg-surface-3 rounded-lg">
                  <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${workerLoadColor(equipoFilter)}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{w.name}</p>
                    <p className="text-xs text-muted-2">{w.role === 'clipper' ? 'Clipper' : 'Editor(a)'} · trabajando en: {currentBrandForWorker(w)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </FolderModal>
      )}

      {/* --- Carpeta: Pedidos (orden de entrega, ícono de reloj) --- */}
      {openFolder === 'pedidos' && (
        <FolderModal title="Pedidos" icon={<Clock3 size={18} className="text-amber" />} onClose={() => setOpenFolder(null)}>
          {sortedOrders.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">Sin pedidos registrados todavía</p>
          ) : (
            <div className="space-y-2">
              {sortedOrders.map((o, i) => {
                const bucket = entregaBucket(o);
                return (
                  <div key={o.id} className="flex items-center gap-3 p-3 bg-surface-3 border border-line rounded-lg">
                    <span className="w-6 h-6 rounded-full bg-surface-2 border border-line flex items-center justify-center text-xs font-semibold shrink-0">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{o.brand} · {o.videoCount} creativos</p>
                      <p className="text-xs text-muted-2">{o.deliveryDate} · {o.deliveryTime}</p>
                    </div>
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-full shrink-0 ${ORDER_STATUS_CLASSES[o.status]}`}>
                      {ORDER_STATUS_LABEL[o.status]}
                    </span>
                    <span className={`text-[10px] font-medium px-2 py-1 rounded-full shrink-0 ${ENTREGA_BUCKET_CLASSES[bucket]}`}>
                      {ENTREGA_BUCKET_LABEL[bucket]}
                    </span>
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
