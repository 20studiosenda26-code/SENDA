// Reparto de los videos de un proyecto entre varias personas: a cada una, la cantidad que quieras
// (1, 2, 3… o todo el proyecto). Muestra la carga REAL de hoy de cada persona y qué video queda con quién.
import { useMemo } from 'react';
import { CheckCircle2, Equal, Lock, Minus, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { useStore } from '../../store';
import { buildWorkUnits, workerDayLoad } from '../../lib/capacity';
import { distribute, movableCount, type Slot } from '../../lib/assignment';
import { initialsOf } from '../ui/avatar-stack';

export type AllocMap = Record<string, number>;

export const allocToList = (a: AllocMap) => Object.entries(a).filter(([, n]) => n > 0).map(([workerId, count]) => ({ workerId, count }));
export const allocTotal = (a: AllocMap) => Object.values(a).reduce((s, n) => s + (n > 0 ? n : 0), 0);

export function VideoAllocator({ slots, alloc, onChange }: { slots: Slot[]; alloc: AllocMap; onChange: (next: AllocMap) => void }) {
  const { workers, orders, brands, getWorkerCapacity } = useStore();
  const movable = movableCount(slots);
  const frozen = slots.filter(s => s.frozen);
  const assigned = allocTotal(alloc);
  const left = movable - assigned;

  const rows = useMemo(() => {
    const units = buildWorkUnits(orders, brands);
    return workers
      .map(w => {
        const dl = workerDayLoad(w, units);
        const cap = Math.max(1, getWorkerCapacity(w.id));
        return { w, today: dl.todayLoad, pending: dl.pendingTotal, cap, ratio: dl.todayLoad / cap, here: slots.filter(s => !s.frozen && s.owner === w.id).length };
      })
      .sort((a, b) => Number(b.w.online) - Number(a.w.online) || a.ratio - b.ratio || a.pending - b.pending);
  }, [workers, orders, brands, getWorkerCapacity, slots]);

  const recommended = rows.find(r => r.ratio < 1)?.w.id || null;
  const set = (id: string, n: number) => {
    const clean = Math.max(0, Math.min(n, movable));
    const next = { ...alloc, [id]: clean };
    // Nunca más videos de los que hay por repartir
    const over = allocTotal(next) - movable;
    if (over > 0) next[id] = Math.max(0, clean - over);
    onChange(next);
  };
  const all = (id: string) => onChange({ [id]: movable });
  const even = () => {
    const chosen = Object.keys(alloc).filter(id => (alloc[id] || 0) > 0);
    const people = chosen.length > 1 ? chosen : rows.filter(r => r.w.online).slice(0, Math.min(movable, 2)).map(r => r.w.id);
    if (people.length === 0) return;
    const base = Math.floor(movable / people.length);
    let extra = movable % people.length;
    const next: AllocMap = {};
    people.forEach(id => { next[id] = base + (extra-- > 0 ? 1 : 0); });
    onChange(next);
  };

  // Vista previa: qué video queda con quién
  const owners = useMemo(() => distribute(slots, allocToList(alloc)), [slots, alloc]);
  const nameOf = (id: string | null) => (id ? workers.find(w => w.id === id)?.name.split(' ')[0] || '—' : '—');

  if (rows.length === 0) {
    return <p className="text-xs text-muted-2 py-3">Aún no hay personas del equipo registradas. Créalas en Admin → Gestión de usuarios.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap bg-surface-3 border border-line rounded-xl px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Reparte los {movable} video{movable === 1 ? '' : 's'}</p>
          <p className="text-[11px] text-muted-2">A cada persona la cantidad que quieras: un video, varios o todo el proyecto.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-tech text-sm font-bold px-3 py-1.5 rounded-lg border ${left === 0 ? 'bg-mint-dim text-mint border-mint/30' : left < 0 ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-amber-dim text-amber border-amber/30'}`}>
            {left === 0 ? <span className="flex items-center gap-1"><CheckCircle2 size={14} /> Todo repartido</span> : `Faltan ${left}`}
          </span>
          <button type="button" onClick={even} title="Repartir parejo entre las personas elegidas" className="h-8 px-2.5 rounded-lg bg-surface-2 border border-line text-xs text-muted hover:text-accent hover:border-accent/40 flex items-center gap-1"><Equal size={13} /> Parejo</button>
          <button type="button" onClick={() => onChange({})} title="Limpiar el reparto" className="h-8 px-2.5 rounded-lg bg-surface-2 border border-line text-xs text-muted hover:text-text flex items-center gap-1"><RotateCcw size={12} /> Limpiar</button>
        </div>
      </div>

      <div className="space-y-1.5">
        {rows.map(({ w, today, pending, cap, ratio, here }) => {
          const n = alloc[w.id] || 0;
          const full = ratio >= 1;
          return (
            <div key={w.id} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors ${n > 0 ? 'border-accent bg-accent-dim' : 'border-line bg-surface-3'}`}>
              <span className="relative w-9 h-9 rounded-lg bg-surface-2 border border-line text-accent font-tech font-bold text-[11px] flex items-center justify-center shrink-0">
                {initialsOf(w.name)}
                <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-3 ${w.online ? 'bg-accent' : 'bg-muted-2'}`} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate flex items-center gap-1.5 flex-wrap">
                  {w.name}
                  {w.id === recommended && <span className="text-[10px] font-semibold text-mint bg-mint-dim border border-mint/30 rounded-full px-1.5 py-0.5 flex items-center gap-1"><Sparkles size={10} /> Recomendado</span>}
                  {here > 0 && <span className="text-[10px] text-muted-2">(tiene {here} aquí)</span>}
                </p>
                {n > 0 && (
                  <p className="flex items-center gap-1 flex-wrap mt-1">
                    <span className="text-[10px] text-muted-2">{n === 1 ? 'Video' : 'Videos'}:</span>
                    {slots.map((s, i) => (owners[i] === w.id && !s.frozen ? (
                      <span key={s.index} className="font-tech text-[11px] font-bold bg-accent text-on-accent rounded-md px-1.5 py-0.5">{i + 1}</span>
                    ) : null))}
                  </p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <div className="h-1 flex-1 max-w-[140px] bg-surface-2 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${full ? 'bg-amber' : today > 0 ? 'bg-mint' : 'bg-accent/50'}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                  </div>
                  <span className={`text-[10px] font-tech ${full ? 'text-amber' : 'text-muted-2'}`}>Hoy {today}/{cap} · {pending} pendientes</span>
                </div>
              </div>
              <button type="button" onClick={() => all(w.id)} title="Todo el proyecto a esta persona"
                className="text-[11px] font-medium text-muted hover:text-accent px-2 py-1 rounded-md hover:bg-surface-2 transition-colors shrink-0">Todos</button>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" aria-label={`Quitar un video a ${w.name}`} disabled={n === 0} onClick={() => set(w.id, n - 1)}
                  className="w-8 h-8 rounded-lg bg-surface-2 border border-line text-muted hover:text-text disabled:opacity-30 flex items-center justify-center active:scale-95 transition"><Minus size={14} /></button>
                <span className={`w-9 text-center font-tech text-base font-bold ${n > 0 ? 'text-accent' : 'text-muted-2'}`}>{n}</span>
                <button type="button" aria-label={`Dar un video a ${w.name}`} disabled={left <= 0} onClick={() => set(w.id, n + 1)}
                  className="w-8 h-8 rounded-lg bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-30 flex items-center justify-center active:scale-95 transition"><Plus size={14} /></button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-surface-3/60 border border-line rounded-xl p-3 space-y-2">
        <p className="text-[10px] font-tech uppercase tracking-wider text-muted-2">Así queda el proyecto</p>
        <div className="flex flex-wrap gap-1.5">
          {slots.map((s, i) => (
            <span key={s.index} title={s.frozen ? 'Ya aprobado: se queda con quien lo hizo' : undefined}
              className={`text-[11px] px-2.5 py-1 rounded-lg border flex items-center gap-1.5 ${s.frozen ? 'bg-surface-2 border-line text-muted-2' : owners[i] ? 'bg-accent-dim border-accent/30 text-text' : 'bg-amber-dim/40 border-amber/30 text-amber'}`}>
              {s.frozen && <Lock size={10} />}
              <b className="font-tech">{i + 1}</b> {owners[i] ? nameOf(owners[i]) : 'sin asignar'}
            </span>
          ))}
        </div>
        {frozen.length > 0 && <p className="text-[11px] text-muted-2">{frozen.length} video{frozen.length === 1 ? '' : 's'} ya aprobado{frozen.length === 1 ? '' : 's'} se queda{frozen.length === 1 ? '' : 'n'} con quien {frozen.length === 1 ? 'lo hizo' : 'los hizo'} (no se mueve{frozen.length === 1 ? '' : 'n'}).</p>}
      </div>
    </div>
  );
}
