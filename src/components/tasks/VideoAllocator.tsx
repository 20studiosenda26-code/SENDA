// Reparto de los videos de un proyecto: TÚ eliges exactamente qué número de video va con cada persona
// (por ejemplo, el 2, el 3 y el 5 a un editor). También hay atajos: "Todos", "Parejo" y los botones + / −.
// Muestra la carga REAL de hoy de cada persona.
import { useMemo } from 'react';
import { CheckCircle2, Equal, Lock, Minus, Plus, RotateCcw, Sparkles } from 'lucide-react';
import { useStore } from '../../store';
import { buildWorkUnits, workerDayLoad } from '../../lib/capacity';
import { movableCount, type Slot } from '../../lib/assignment';
import { initialsOf } from '../ui/avatar-stack';

export type Owners = (string | null)[];

/** Punto de partida: lo aprobado conserva a su dueño; el resto, vacío (o con quien lo tiene hoy). */
export const initialOwners = (slots: Slot[], keepCurrent: boolean): Owners =>
  slots.map(s => (s.frozen ? s.owner : keepCurrent ? s.owner : null));

/** Cuántos videos movibles aún no tienen responsable */
export const missingCount = (slots: Slot[], owners: Owners) => slots.filter((s, i) => !s.frozen && !owners[i]).length;

export function VideoAllocator({ slots, owners, onChange }: { slots: Slot[]; owners: Owners; onChange: (next: Owners) => void }) {
  const { workers, orders, brands, getWorkerCapacity } = useStore();
  const movable = movableCount(slots);
  const left = missingCount(slots, owners);
  const frozen = slots.filter(s => s.frozen);

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

  const recommended = rows.find(r => r.ratio < 1)?.w.id || null;
  const nameOf = (id: string | null) => (id ? workers.find(w => w.id === id)?.name.split(' ')[0] || '—' : '—');

  const setOwner = (i: number, id: string | null) => onChange(owners.map((o, k) => (k === i ? id : o)));
  const toggle = (i: number, id: string) => setOwner(i, owners[i] === id ? null : id);
  const addNext = (id: string) => {
    const i = slots.findIndex((s, k) => !s.frozen && !owners[k]);
    if (i >= 0) setOwner(i, id);
  };
  const removeLast = (id: string) => {
    for (let k = slots.length - 1; k >= 0; k--) if (!slots[k].frozen && owners[k] === id) { setOwner(k, null); return; }
  };
  const allTo = (id: string) => onChange(owners.map((o, k) => (slots[k].frozen ? o : id)));
  const clear = () => onChange(owners.map((o, k) => (slots[k].frozen ? o : null)));
  const even = () => {
    const chosen = Array.from(new Set(owners.filter((o, k) => o && !slots[k].frozen) as string[]));
    const people = chosen.length > 1 ? chosen : rows.filter(r => r.w.online).slice(0, Math.min(movable, 2)).map(r => r.w.id);
    if (people.length === 0) return;
    const base = Math.floor(movable / people.length);
    let extra = movable % people.length;
    const targets = people.map(() => base + (extra-- > 0 ? 1 : 0));
    const next = owners.slice();
    let p = 0; let used = 0;
    slots.forEach((s, k) => {
      if (s.frozen) return;
      while (used >= targets[p]) { p++; used = 0; }
      next[k] = people[p]; used++;
    });
    onChange(next);
  };

  if (rows.length === 0) {
    return <p className="text-xs text-muted-2 py-3">Aún no hay personas del equipo registradas. Créalas en Admin → Gestión de usuarios.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap bg-surface-3 border border-line rounded-xl px-4 py-3">
        <div>
          <p className="text-sm font-semibold">Elige qué videos hace cada persona</p>
          <p className="text-[11px] text-muted-2">Marca los números de video de cada una (ej. el 2, el 3 y el 5). Un video solo puede tener una persona.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`font-tech text-sm font-bold px-3 py-1.5 rounded-lg border ${left === 0 ? 'bg-mint-dim text-mint border-mint/30' : 'bg-amber-dim text-amber border-amber/30'}`}>
            {left === 0 ? <span className="flex items-center gap-1"><CheckCircle2 size={14} /> Todo repartido</span> : `Faltan ${left} de ${movable}`}
          </span>
          <button type="button" onClick={even} title="Repartir parejo entre las personas elegidas" className="h-8 px-2.5 rounded-lg bg-surface-2 border border-line text-xs text-muted hover:text-accent hover:border-accent/40 flex items-center gap-1"><Equal size={13} /> Parejo</button>
          <button type="button" onClick={clear} title="Quitar todas las asignaciones" className="h-8 px-2.5 rounded-lg bg-surface-2 border border-line text-xs text-muted hover:text-text flex items-center gap-1"><RotateCcw size={12} /> Limpiar</button>
        </div>
      </div>

      <div className="space-y-2">
        {rows.map(({ w, today, pending, cap, ratio }) => {
          const mine = slots.map((s, i) => (!s.frozen && owners[i] === w.id ? i : -1)).filter(i => i >= 0);
          const n = mine.length;
          const full = ratio >= 1;
          return (
            <div key={w.id} className={`px-3 py-3 rounded-xl border transition-colors space-y-2.5 ${n > 0 ? 'border-accent bg-accent-dim/60' : 'border-line bg-surface-3'}`}>
              <div className="flex items-center gap-3">
                <span className="relative w-9 h-9 rounded-lg bg-surface-2 border border-line text-accent font-tech font-bold text-[11px] flex items-center justify-center shrink-0">
                  {initialsOf(w.name)}
                  <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-3 ${w.online ? 'bg-accent' : 'bg-muted-2'}`} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5 flex-wrap">
                    {w.name}
                    {w.id === recommended && <span className="text-[10px] font-semibold text-mint bg-mint-dim border border-mint/30 rounded-full px-1.5 py-0.5 flex items-center gap-1"><Sparkles size={10} /> Recomendado</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="h-1 flex-1 max-w-[140px] bg-surface-2 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${full ? 'bg-amber' : today > 0 ? 'bg-mint' : 'bg-accent/50'}`} style={{ width: `${Math.min(100, ratio * 100)}%` }} />
                    </div>
                    <span className={`text-[10px] font-tech ${full ? 'text-amber' : 'text-muted-2'}`}>Hoy {today}/{cap} · {pending} pendientes</span>
                  </div>
                </div>
                <button type="button" onClick={() => allTo(w.id)} title="Todo el proyecto a esta persona"
                  className="text-[11px] font-medium text-muted hover:text-accent px-2 py-1 rounded-md hover:bg-surface-2 transition-colors shrink-0">Todos</button>
                <div className="flex items-center gap-1 shrink-0">
                  <button type="button" aria-label={`Quitar el último video a ${w.name}`} disabled={n === 0} onClick={() => removeLast(w.id)}
                    className="w-8 h-8 rounded-lg bg-surface-2 border border-line text-muted hover:text-text disabled:opacity-30 flex items-center justify-center active:scale-95 transition"><Minus size={14} /></button>
                  <span className={`w-8 text-center font-tech text-base font-bold ${n > 0 ? 'text-accent' : 'text-muted-2'}`}>{n}</span>
                  <button type="button" aria-label={`Dar el siguiente video libre a ${w.name}`} disabled={left <= 0} onClick={() => addNext(w.id)}
                    className="w-8 h-8 rounded-lg bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-30 flex items-center justify-center active:scale-95 transition"><Plus size={14} /></button>
                </div>
              </div>

              {/* Números de video: se marcan uno por uno */}
              <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label={`Videos de ${w.name}`}>
                <span className="text-[10px] font-tech uppercase tracking-wider text-muted-2 mr-1">Videos</span>
                {slots.map((s, i) => {
                  if (s.frozen) return null;
                  const o = owners[i];
                  const isMine = o === w.id;
                  const other = o && !isMine;
                  return (
                    <button key={s.index} type="button" onClick={() => toggle(i, w.id)} aria-pressed={isMine}
                      title={isMine ? `Video ${i + 1}: lo hace ${w.name.split(' ')[0]} (clic para quitarlo)` : other ? `Video ${i + 1}: lo tiene ${nameOf(o)} (clic para pasarlo a ${w.name.split(' ')[0]})` : `Video ${i + 1}: sin asignar (clic para dárselo a ${w.name.split(' ')[0]})`}
                      className={`min-w-[34px] h-8 px-2 rounded-lg font-tech text-xs font-bold border transition-all active:scale-95 ${
                        isMine ? 'bg-accent text-on-accent border-accent shadow-[0_0_10px_rgba(53,214,228,0.35)]'
                          : other ? 'bg-surface-2 text-muted-2 border-line opacity-55 hover:opacity-100 hover:border-accent/40'
                          : 'bg-surface-2 text-text border-line hover:border-accent hover:text-accent'
                      }`}>
                      {i + 1}
                    </button>
                  );
                })}
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
