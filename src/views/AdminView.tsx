import { useState, useMemo } from 'react';
import { useStore } from '../store';
import type { Worker } from '../types';
import {
  Users, Video, Flame, CheckCircle2, Clock, Wifi,
  Scissors, Film, SlidersHorizontal, Check, X, RotateCcw,
} from 'lucide-react';

export function AdminView() {
  const { workers, registeredUsersCount, brands, toggleDayClosed, updateWorkerPointsAndGoals, getWorkerGoals } = useStore();
  const [teamTab, setTeamTab] = useState<'clipper' | 'editor'>('clipper');
  const [editingWorkerId, setEditingWorkerId] = useState<string | null>(null);
  const [ptsTodayInput, setPtsTodayInput] = useState<string>('');
  const [ptsMonthInput, setPtsMonthInput] = useState<string>('');
  const [goalDailyInput, setGoalDailyInput] = useState<string>('');
  const [goalMonthlyInput, setGoalMonthlyInput] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedToastId, setSavedToastId] = useState<string | null>(null);

  const allVideos = brands.flatMap(b => b.videos);
  const completed = allVideos.filter(v => v.qc === 'aprobado_cliente');
  const inProgress = allVideos.filter(v => v.qc !== 'aprobado_cliente' && v.qc !== 'sin_iniciar');
  const onlineWorkers = workers.filter(w => w.online);

  const clippers = useMemo(() => workers.filter(w => w.role === 'clipper'), [workers]);
  const editors = useMemo(() => workers.filter(w => w.role === 'editor'), [workers]);
  const visibleWorkers = teamTab === 'clipper' ? clippers : editors;

  const startEditingWorker = (w: Worker) => {
    const goals = getWorkerGoals(w.id, w.role);
    setEditingWorkerId(w.id);
    setPtsTodayInput(String(w.pointsToday));
    setPtsMonthInput(String(w.pointsMonth));
    setGoalDailyInput(String(goals.daily));
    setGoalMonthlyInput(String(goals.monthly));
  };

  const handleSaveWorker = async (w: Worker) => {
    setSavingId(w.id);
    await updateWorkerPointsAndGoals(w.id, {
      pointsToday: Math.max(0, parseInt(ptsTodayInput, 10) || 0),
      pointsMonth: Math.max(0, parseInt(ptsMonthInput, 10) || 0),
      goalDaily: Math.max(1, parseInt(goalDailyInput, 10) || 1),
      goalMonthly: Math.max(1, parseInt(goalMonthlyInput, 10) || 1),
    });
    setSavingId(null);
    setEditingWorkerId(null);
    setSavedToastId(w.id);
    setTimeout(() => setSavedToastId(prev => (prev === w.id ? null : prev)), 2500);
  };

  return (
    <div className="space-y-5">
      {/* KPIs superiores — Equipo refleja en vivo todos los usuarios registrados (incluyendo Admin) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Equipo (usuarios registrados)" value={registeredUsersCount} color="accent" />
        <KpiCard icon={Video} label="Videos totales" value={allVideos.length} color="mint" />
        <KpiCard icon={CheckCircle2} label="Completados" value={completed.length} color="violet" />
        <KpiCard icon={Clock} label="En progreso" value={inProgress.length} color="amber" />
      </div>

      {/* En línea ahora — tarjetas mini compactas para soportar muchos usuarios */}
      <div className="bg-surface-2 border border-line rounded-xl p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 className="font-display text-base sm:text-lg font-semibold flex items-center gap-2">
            <Wifi size={17} className="text-mint" /> En línea ahora
            <span className="font-tech text-xs px-2 py-0.5 rounded-full bg-mint-dim text-mint">
              {onlineWorkers.length}
            </span>
          </h3>
          <span className="text-[11px] text-muted-2">Tiempo real</span>
        </div>

        {onlineWorkers.length === 0 ? (
          <p className="text-xs text-muted text-center py-3">Nadie está en línea en este momento</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-44 overflow-y-auto pr-1">
            {onlineWorkers.map(w => (
              <div
                key={w.id}
                className="flex items-center gap-2 bg-surface-3 border border-mint/25 rounded-lg px-2.5 py-1.5 min-w-0"
              >
                <div className="relative w-7 h-7 rounded-md bg-mint-dim text-mint flex items-center justify-center text-xs font-bold shrink-0">
                  {w.name.charAt(0).toUpperCase()}
                  <span className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-mint ring-2 ring-surface-3" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium truncate leading-tight">{w.name}</p>
                  <p className="text-[10px] text-mint leading-tight truncate mt-0.5">
                    En línea · <span className="text-muted-2">{w.role === 'clipper' ? 'Clipper' : 'Editor(a)'}</span>
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Equipo — Seccionado primero Clippers, después Editores + Edición de puntos y metas individuales */}
      <div className="bg-surface-2 border border-line rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display text-lg font-semibold">Equipo y Metas de Puntos</h3>
            <p className="text-xs text-muted mt-0.5">
              Selecciona Clippers o Editores para gestionar sus puntos recolectados hoy/mes, la meta individual que debe recolectar cada persona y su cierre de día.
            </p>
          </div>

          <div className="flex items-center gap-1.5 bg-surface-3 border border-line rounded-xl p-1">
            <button
              type="button"
              onClick={() => { setTeamTab('clipper'); setEditingWorkerId(null); }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                teamTab === 'clipper'
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Scissors size={13} /> Clippers ({clippers.length})
            </button>
            <button
              type="button"
              onClick={() => { setTeamTab('editor'); setEditingWorkerId(null); }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                teamTab === 'editor'
                  ? 'bg-mint text-on-accent shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Film size={13} /> Editores ({editors.length})
            </button>
          </div>
        </div>

        {visibleWorkers.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">
            No hay {teamTab === 'clipper' ? 'clippers' : 'editores'} registrados todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs border-b border-line">
                  <th className="py-2.5 pr-4 font-medium">Nombre</th>
                  <th className="py-2.5 pr-4 font-medium">Estado</th>
                  <th className="py-2.5 pr-4 font-medium">Puntos hoy / Meta</th>
                  <th className="py-2.5 pr-4 font-medium">Puntos mes / Meta</th>
                  <th className="py-2.5 pr-4 font-medium">Racha</th>
                  <th className="py-2.5 pr-4 font-medium">Día cerrado</th>
                  <th className="py-2.5 font-medium text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {visibleWorkers.map(w => {
                  const goals = getWorkerGoals(w.id, w.role);
                  const isEditing = editingWorkerId === w.id;
                  const pctDay = Math.min(100, Math.round((w.pointsToday / Math.max(goals.daily, 1)) * 100));
                  const pctMonth = Math.min(100, Math.round((w.pointsMonth / Math.max(goals.monthly, 1)) * 100));

                  return (
                    <tr key={w.id} className="border-b border-line/50 hover:bg-surface-3/60 transition-colors align-top">
                      <td className="py-3 pr-4">
                        <p className="font-medium">{w.name}</p>
                        <p className="text-[11px] text-muted-2">{w.cargo}</p>
                      </td>
                      <td className="py-3 pr-4">
                        <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${w.online ? 'text-mint' : 'text-muted-2'}`}>
                          <span className={`w-2 h-2 rounded-full ${w.online ? 'bg-mint' : 'bg-muted-2'}`} />
                          {w.online ? 'En línea' : 'No en línea'}
                        </span>
                      </td>

                      <td className="py-3 pr-4">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <div>
                              <span className="text-[10px] text-muted-2 block">Hoy</span>
                              <input
                                type="number"
                                min={0}
                                value={ptsTodayInput}
                                onChange={e => setPtsTodayInput(e.target.value)}
                                className="w-14 bg-surface-2 border border-accent rounded-md px-2 py-1 text-xs font-tech outline-none"
                              />
                            </div>
                            <span className="text-muted-2 mt-3">/</span>
                            <div>
                              <span className="text-[10px] text-accent block">Meta día</span>
                              <input
                                type="number"
                                min={1}
                                value={goalDailyInput}
                                onChange={e => setGoalDailyInput(e.target.value)}
                                className="w-14 bg-surface-2 border border-accent rounded-md px-2 py-1 text-xs font-tech outline-none"
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-baseline gap-1 font-tech text-xs">
                              <span className="font-semibold text-sm text-text">{w.pointsToday}</span>
                              <span className="text-muted-2">/ {goals.daily} pts</span>
                            </div>
                            <div className="w-24 h-1.5 bg-surface-3 rounded-full overflow-hidden mt-1">
                              <div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pctDay}%` }} />
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 pr-4">
                        {isEditing ? (
                          <div className="flex items-center gap-1.5">
                            <div>
                              <span className="text-[10px] text-muted-2 block">Mes</span>
                              <input
                                type="number"
                                min={0}
                                value={ptsMonthInput}
                                onChange={e => setPtsMonthInput(e.target.value)}
                                className="w-16 bg-surface-2 border border-mint rounded-md px-2 py-1 text-xs font-tech outline-none"
                              />
                            </div>
                            <span className="text-muted-2 mt-3">/</span>
                            <div>
                              <span className="text-[10px] text-mint block">Meta mes</span>
                              <input
                                type="number"
                                min={1}
                                value={goalMonthlyInput}
                                onChange={e => setGoalMonthlyInput(e.target.value)}
                                className="w-16 bg-surface-2 border border-mint rounded-md px-2 py-1 text-xs font-tech outline-none"
                              />
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-baseline gap-1 font-tech text-xs">
                              <span className="font-semibold text-sm text-text">{w.pointsMonth}</span>
                              <span className="text-muted-2">/ {goals.monthly} pts</span>
                            </div>
                            <div className="w-24 h-1.5 bg-surface-3 rounded-full overflow-hidden mt-1">
                              <div className="h-full bg-mint rounded-full transition-all" style={{ width: `${pctMonth}%` }} />
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="py-3 pr-4">
                        <span className="inline-flex items-center gap-1 text-amber font-tech text-xs">
                          <Flame size={14} /> {w.streak}
                        </span>
                      </td>

                      <td className="py-3 pr-4">
                        <button
                          type="button"
                          onClick={() => toggleDayClosed(w.id)}
                          title={w.dayClosedToday ? 'Día cerrado (clic para reabrir)' : 'Día abierto (clic para cerrar día)'}
                          className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border transition-colors ${
                            w.dayClosedToday
                              ? 'bg-mint-dim text-mint border-mint/30 hover:bg-mint/20'
                              : 'bg-surface-3 text-muted border-line hover:text-text hover:border-accent/40'
                          }`}
                        >
                          {w.dayClosedToday ? (
                            <>
                              <CheckCircle2 size={13} /> Cerrado
                            </>
                          ) : (
                            <>
                              <Clock size={13} /> Cerrar día
                            </>
                          )}
                        </button>
                      </td>

                      <td className="py-3 text-right">
                        {isEditing ? (
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={savingId === w.id}
                              onClick={() => void handleSaveWorker(w)}
                              className="inline-flex items-center gap-1 bg-accent text-on-accent rounded-md px-2.5 py-1 text-xs font-semibold hover:bg-accent-strong transition-colors disabled:opacity-50"
                            >
                              <Check size={13} /> Guardar
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingWorkerId(null)}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-surface-3 border border-line text-muted hover:text-text"
                              title="Cancelar"
                            >
                              <X size={13} />
                            </button>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-2 justify-end">
                            {savedToastId === w.id && (
                              <span className="text-[11px] text-mint flex items-center gap-1">
                                <Check size={12} /> Actualizado
                              </span>
                            )}
                            <button
                              type="button"
                              onClick={() => startEditingWorker(w)}
                              className="inline-flex items-center gap-1.5 text-xs font-medium bg-surface-3 hover:bg-accent-dim text-muted hover:text-accent border border-line hover:border-accent/40 rounded-lg px-2.5 py-1.5 transition-colors"
                            >
                              <SlidersHorizontal size={12} /> Editar puntos
                            </button>
                            {w.dayClosedToday && (
                              <button
                                type="button"
                                onClick={() => toggleDayClosed(w.id)}
                                title="Reabrir día"
                                className="inline-flex items-center justify-center w-7 h-7 rounded-lg bg-surface-3 border border-line text-muted hover:text-amber transition-colors"
                              >
                                <RotateCcw size={12} />
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: typeof Users; label: string; value: number; color: string }) {
  const map: Record<string, string> = {
    accent: 'text-accent bg-accent-dim',
    mint: 'text-mint bg-mint-dim',
    amber: 'text-amber bg-amber-dim',
    violet: 'text-violet bg-violet-dim',
  };
  return (
    <div className="bg-surface-2 border border-line rounded-xl p-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${map[color]}`}>
        <Icon size={20} />
      </div>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-2">{label}</p>
    </div>
  );
}
