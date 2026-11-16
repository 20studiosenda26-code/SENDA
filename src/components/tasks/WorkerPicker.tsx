// Selector de responsable (Clipper · Asistente de edición) para asignar o reasignar un proyecto.
// Muestra la carga REAL de hoy (mismo motor que Capacidad e Inicio), quién está en línea
// y recomienda a la persona con más espacio libre.
import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { useStore } from '../../store';
import { buildWorkUnits, workerDayLoad } from '../../lib/capacity';
import { initialsOf } from '../ui/avatar-stack';

export function WorkerPicker({ selected, onSelect, excludeId }: {
  selected: string | null;
  onSelect: (id: string) => void;
  /** Persona actual (al reasignar), para marcarla */
  excludeId?: string | null;
}) {
  const { workers, orders, brands, getWorkerCapacity, setWorkerCapacity } = useStore();

  const rows = useMemo(() => {
    const units = buildWorkUnits(orders, brands);
    return workers
      .map(w => {
        const dl = workerDayLoad(w, units);
        const cap = Math.max(1, getWorkerCapacity(w.id));
        return { w, today: dl.todayLoad, pending: dl.pendingTotal, cap, ratio: dl.todayLoad / cap };
      })
      .sort((a, b) => Number(b.w.online) - Number(a.w.online) || a.ratio - b.ratio || a.pending - b.pending);
  }, [workers, orders, brands, getWorkerCapacity]);

  const recommended = rows.find(r => r.w.id !== excludeId && r.ratio < 1)?.w.id || null;

  if (rows.length === 0) {
    return <p className="text-xs text-muted-2 py-3">Aún no hay personas del equipo registradas. Créalas en Admin → Gestión de usuarios.</p>;
  }

  return (
    <div className="space-y-1.5" role="radiogroup" aria-label="Responsable del proyecto">
      {rows.map(({ w, today, pending, cap, ratio }) => {
        const isSel = selected === w.id;
        const full = ratio >= 1;
        return (
          <div
            key={w.id}
            role="radio"
            aria-checked={isSel}
            tabIndex={0}
            onClick={() => onSelect(w.id)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(w.id); } }}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors outline-none focus-visible:ring-2 focus-visible:ring-accent/50 ${
              isSel ? 'border-accent bg-accent-dim' : 'border-line bg-surface-3 hover:border-accent/40'
            }`}
          >
            <span className="relative w-8 h-8 rounded-lg bg-surface-2 border border-line text-accent font-tech font-bold text-[11px] flex items-center justify-center shrink-0">
              {initialsOf(w.name)}
              <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-3 ${w.online ? 'bg-accent' : 'bg-muted-2'}`} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate flex items-center gap-1.5">
                {w.name}
                {w.id === recommended && (
                  <span className="text-[10px] font-semibold text-mint bg-mint-dim border border-mint/30 rounded-full px-1.5 py-0.5 flex items-center gap-1">
                    <Sparkles size={10} /> Recomendado
                  </span>
                )}
                {w.id === excludeId && <span className="text-[10px] text-muted-2">(actual)</span>}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <div className="h-1 flex-1 max-w-[140px] bg-surface-2 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full ${full ? 'bg-amber' : today > 0 ? 'bg-mint' : 'bg-accent/50'}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                </div>
                <span className={`text-[10px] font-tech ${full ? 'text-amber' : 'text-muted-2'}`}>Hoy {today}/{cap} · {pending} pendientes</span>
              </div>
            </div>
            <label className="flex items-center gap-1 text-[10px] text-muted-2 shrink-0" onClick={e => e.stopPropagation()} title="Capacidad diaria (videos completos por día)">
              Cap.
              <input
                type="number"
                min={1}
                value={cap}
                onChange={e => setWorkerCapacity(w.id, Number(e.target.value))}
                className="w-11 bg-surface-2 border border-line rounded-md px-1 py-0.5 text-[11px] text-center text-text outline-none focus:border-accent"
              />
            </label>
          </div>
        );
      })}
    </div>
  );
}
