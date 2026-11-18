// Panel grande para reasignar (o asignar) un proyecto: se ve todo el proyecto y se reparte
// cuántos videos le tocan a cada persona. Mismo estilo que el motor de capacidad de entrega.
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Lock, Loader2, ShieldAlert, Timer, X } from 'lucide-react';
import { useStore } from '../../store';
import { buildSlots, movableCount } from '../../lib/assignment';
import { briefReadiness } from '../../lib/scripts';
import { VideoAllocator, initialOwners, missingCount, type Owners } from './VideoAllocator';
import type { Order } from '../../types';

export interface ReassignAlert {
  level: 'prioritario' | 'urgente' | 'critico' | 'normal';
  hoursLeft: number;
  maxReassignLabel: string;
  hoursUntilMaxReassign: number;
  isPastMaxReassign: boolean;
  productionHoursNeeded: number;
}

const LEVEL_STYLE: Record<ReassignAlert['level'], string> = {
  prioritario: 'bg-accent-dim text-accent border-accent/40',
  urgente: 'bg-amber-dim text-amber border-amber/40',
  critico: 'bg-red-500/15 text-red-400 border-red-500/40',
  normal: 'bg-mint-dim text-mint border-mint/40',
};

const QC_LABEL: Record<string, string> = {
  sin_iniciar: 'Sin iniciar', pendiente: 'En producción', revision: 'En revisión', correcciones: 'Con correcciones',
  aprobado_senda: 'Aprobado Senda', aprobado_cliente: 'Aprobado cliente',
};

export function ReassignModal({ order, alert, onClose }: { order: Order; alert?: ReassignAlert; onClose: () => void }) {
  const { brands, workers, assignOrderVideos } = useStore();
  const videos = useMemo(() => brands.flatMap(b => b.videos).filter(v => v.orderId === order.id || v.id === order.boardVideoId), [brands, order]);
  const slots = useMemo(() => buildSlots(order.videoCount, videos), [order.videoCount, videos]);
  const movable = movableCount(slots);

  // Empieza con el reparto actual, para mover solo lo necesario
  const [owners, setOwners] = useState<Owners>(() => initialOwners(slots, true));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const firstTime = !order.clipperId;
  const ready = briefReadiness(order);
  const blocked = firstTime && !ready.ready;
  const can = missingCount(slots, owners) === 0 && movable > 0 && !blocked;
  const nameOf = (id: string | null) => (id ? workers.find(w => w.id === id)?.name || '—' : 'Sin asignar');

  const confirm = async () => {
    setBusy(true);
    const ok = await assignOrderVideos(order.id, [], owners);
    setBusy(false);
    if (ok) {
      setMsg({ ok: true, text: 'Listo: reparto guardado y verificado en el servidor. El equipo ya recibió su aviso.' });
      setTimeout(onClose, 900);
    } else {
      setMsg({ ok: false, text: blocked ? ready.reason : 'No se pudo confirmar el guardado en el servidor, así que la otra persona podría no verlo todavía. Revisa tu conexión y vuelve a confirmar.' });
    }
  };

  return (
    <div className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-3 sm:p-6 animate-fadeIn" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={`Reasignar ${order.brand}`} onClick={e => e.stopPropagation()}
        className="glow-card bg-surface-2 border border-line rounded-2xl w-full max-w-6xl my-4 overflow-hidden shadow-2xl">
        {/* Encabezado */}
        <div className="px-6 py-5 border-b border-line bg-gradient-to-br from-accent/5 to-transparent flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0 space-y-2">
            <p className="text-[11px] font-tech uppercase tracking-[0.18em] text-accent flex items-center gap-1.5">
              <ShieldAlert size={13} /> {firstTime ? 'Asignar proyecto' : 'Reasignar proyecto'}
            </p>
            <h3 className="font-display text-2xl xl:text-3xl font-bold truncate">{order.brand} <span className="text-accent font-tech text-lg">· {order.videoCount} videos</span></h3>
            <div className="flex items-center gap-2 flex-wrap text-[11px] font-tech">
              {alert && <span className={`uppercase px-2.5 py-0.5 rounded-full border font-bold ${LEVEL_STYLE[alert.level]}`}>{alert.level}</span>}
              <span className="text-muted-2 flex items-center gap-1"><Clock size={12} /> Entrega {order.deliveryDate} {order.deliveryTime || '18:00'}{alert ? ` (${alert.hoursLeft > 0 ? `${alert.hoursLeft}h` : 'Vencido'})` : ''}</span>
              {alert && (
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border font-semibold ${alert.isPastMaxReassign ? 'bg-red-500/15 text-red-400 border-red-500/35' : 'bg-amber-dim/60 text-amber border-amber/35'}`}>
                  <Timer size={12} /> Hora máx. reasignar: {alert.maxReassignLabel}{alert.isPastMaxReassign ? ' (Límite superado)' : ` (en ${alert.hoursUntilMaxReassign}h)`}
                </span>
              )}
              {alert && <span className="text-muted-2">Producción requerida: <b className="text-text">{alert.productionHoursNeeded}h netas</b></span>}
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-10 h-10 rounded-xl bg-surface-3 border border-line text-muted hover:text-text flex items-center justify-center"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 p-6">
          {/* Videos del proyecto */}
          <div className="lg:col-span-5 space-y-3">
            <p className="text-xs font-tech uppercase tracking-wider text-muted-2">Videos del proyecto</p>
            <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
              {slots.map(s => (
                <div key={s.index} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${s.frozen ? 'bg-surface-3/60 border-line' : 'bg-surface-3 border-line'}`}>
                  <span className="font-tech text-xs font-bold bg-surface-2 border border-line rounded-md w-8 h-8 flex items-center justify-center text-accent shrink-0">{s.index + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{nameOf(s.owner)}</p>
                    <p className="text-[11px] text-muted-2">{s.qc ? QC_LABEL[s.qc] || s.qc : 'Aún sin empezar'}</p>
                  </div>
                  {s.frozen && <span className="text-[10px] text-muted-2 flex items-center gap-1 shrink-0"><Lock size={11} /> No se mueve</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Reparto */}
          <div className="lg:col-span-7">
            {movable === 0 ? (
              <div className="text-center py-14 bg-surface-3/40 border border-dashed border-line rounded-xl">
                <CheckCircle2 size={28} className="text-mint mx-auto mb-2" />
                <p className="text-sm font-semibold">Todos los videos ya están aprobados</p>
                <p className="text-xs text-muted mt-1">No hay nada para reasignar.</p>
              </div>
            ) : (
              <VideoAllocator slots={slots} owners={owners} onChange={setOwners} />
            )}
          </div>
        </div>

        {/* Pie */}
        <div className="px-6 py-4 border-t border-line bg-surface-3/40 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs flex-1 min-w-[200px]">
            {msg ? <span className={msg.ok ? 'text-mint flex items-center gap-1.5' : 'text-red-400'}>{msg.ok && <CheckCircle2 size={14} />} {msg.text}</span>
              : blocked ? <span className="text-amber">Todavía no se puede asignar: {ready.reason}</span>
              : <span className="text-muted-2">El pedido sigue en seguimiento mientras tenga alerta activa.</span>}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl text-sm text-muted bg-surface-3 border border-line hover:text-text">Cancelar</button>
            <button type="button" onClick={() => void confirm()} disabled={!can || busy}
              className="px-5 py-2.5 rounded-xl text-sm font-bold bg-mint text-on-accent hover:opacity-95 disabled:opacity-40 flex items-center gap-2">
              {busy ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />} Confirmar {firstTime ? 'asignación' : 'reasignación'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
