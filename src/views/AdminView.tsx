import { useMemo } from 'react';
import { useStore } from '../store';
import { Users, Video, CheckCircle2, Clock, Wifi, Wallet } from 'lucide-react';
import { workerLoadColor, workerLoadBorder, type WorkerLoad } from './AdminHomePanels';
import { fmtMoney, workerEarningsSummary, type WorkerEarningsSummary } from '../lib/economics';
import { TEAM_ROLE_PLURAL, TEAM_ROLE_SHORT } from '../lib/roles';

export function AdminView() {
  const { workers, registeredUsersCount, brands, orders, financeSettings, payrollPayments, getWorkerCapacity, getWorkerWorkload, setView } = useStore();

  const allVideos = useMemo(() => brands.flatMap(b => b.videos), [brands]);
  const completed = useMemo(() => allVideos.filter(v => v.qc === 'aprobado_cliente'), [allVideos]);
  const inProgress = useMemo(() => allVideos.filter(v => v.qc !== 'aprobado_cliente' && v.qc !== 'sin_iniciar'), [allVideos]);
  const onlineWorkers = useMemo(() => workers.filter(w => w.online), [workers]);

  // Misma fórmula de carga que Tareas, Inicio y Capacidad (sin duplicar pedido + videos)
  const workerWorkloads = useMemo(() => {
    const map = new Map<string, { activeLoad: number; capacity: number; status: WorkerLoad }>();
    for (const w of workers) {
      const cap = getWorkerCapacity(w.id);
      const activeLoad = getWorkerWorkload(w.id);
      const status: WorkerLoad = activeLoad === 0 ? 'sin_trabajo' : activeLoad >= cap ? 'lleno' : 'meta';
      map.set(w.id, { activeLoad, capacity: cap, status });
    }
    return map;
  }, [workers, getWorkerCapacity, getWorkerWorkload]);

  // Ganancias con la regla de pago por video (50% Aprobado Senda + 50% Aprobado Cliente)
  const earningsById = useMemo(() => {
    const map = new Map<string, WorkerEarningsSummary>();
    for (const w of workers) map.set(w.id, workerEarningsSummary(w, brands, orders, financeSettings, payrollPayments));
    return map;
  }, [workers, brands, orders, financeSettings, payrollPayments]);

  const teamPending = Array.from(earningsById.values()).reduce((s, e) => s + e.pending, 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Equipo (usuarios registrados)" value={registeredUsersCount} color="accent" />
        <KpiCard icon={Video} label="Videos totales" value={allVideos.length} color="mint" />
        <KpiCard icon={CheckCircle2} label="Completados" value={completed.length} color="violet" />
        <KpiCard icon={Clock} label="En progreso" value={inProgress.length} color="amber" />
      </div>

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
            {onlineWorkers.map(w => {
              const isFilled = workerWorkloads.get(w.id)?.status === 'lleno';
              return (
                <div
                  key={w.id}
                  className={`flex items-center gap-2 bg-surface-3 border rounded-lg px-2.5 py-1.5 min-w-0 transition-colors ${
                    isFilled ? 'border-amber/40 ring-1 ring-amber/20' : 'border-mint/25'
                  }`}
                >
                  <div className={`relative w-7 h-7 rounded-md flex items-center justify-center text-xs font-bold shrink-0 ${isFilled ? 'bg-amber-dim text-amber' : 'bg-mint-dim text-mint'}`}>
                    {w.name.charAt(0).toUpperCase()}
                    <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-surface-3 ${isFilled ? 'bg-amber' : 'bg-mint'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium truncate leading-tight">{w.name}</p>
                    <p className={`text-[10px] leading-tight truncate mt-0.5 ${isFilled ? 'text-amber' : 'text-mint'}`}>
                      En línea · <span className="text-muted-2">{TEAM_ROLE_SHORT}</span>
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-4 sm:p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="font-display text-lg font-semibold">Equipo y ganancias</h3>
            <p className="text-xs text-muted mt-0.5">
              {fmtMoney(financeSettings.payPerVideo)} por video: 50% al Aprobado Senda + 50% al Aprobado Cliente. Se calcula solo con cada aprobación.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setView('nominas')}
            className="inline-flex items-center gap-2 bg-accent text-on-accent rounded-lg px-3.5 py-2 text-xs font-semibold hover:bg-accent-strong transition-colors"
          >
            <Wallet size={14} /> Ir a Nóminas · {fmtMoney(teamPending)} por pagar
          </button>
        </div>

        {workers.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">
            No hay miembros del equipo ({TEAM_ROLE_PLURAL.toLowerCase()}) registrados todavía.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs border-b border-line">
                  <th className="py-2.5 pr-4 font-medium">Nombre</th>
                  <th className="py-2.5 pr-4 font-medium">Estado</th>
                  <th className="py-2.5 pr-4 font-medium">Carga</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Ganado este mes</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Por cobrar</th>
                  <th className="py-2.5 pr-4 font-medium text-right">Esperando cliente</th>
                  <th className="py-2.5 font-medium text-right">Aprobados (cliente)</th>
                </tr>
              </thead>
              <tbody>
                {workers.map(w => {
                  const workload = workerWorkloads.get(w.id);
                  const wStatus = workload?.status || 'sin_trabajo';
                  const e = earningsById.get(w.id);
                  return (
                    <tr key={w.id} className="border-b border-line/50 hover:bg-surface-3/60 transition-colors">
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
                        <div className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border bg-surface-3 ${workerLoadBorder(wStatus)}`}>
                          <span className={`w-2 h-2 rounded-full ${workerLoadColor(wStatus)}`} />
                          <span className="font-tech text-xs font-semibold">{workload?.activeLoad || 0}/{workload?.capacity || 0}</span>
                        </div>
                      </td>
                      <td className="py-3 pr-4 text-right font-tech font-semibold text-mint">{fmtMoney(e?.earnedMonth || 0)}</td>
                      <td className={`py-3 pr-4 text-right font-tech font-semibold ${(e?.pending || 0) > 0 ? 'text-amber' : 'text-muted-2'}`}>{fmtMoney(e?.pending || 0)}</td>
                      <td className="py-3 pr-4 text-right font-tech text-xs text-muted">
                        {fmtMoney(e?.waitingClientAmount || 0)} <span className="text-muted-2">· {e?.waitingClientVideos || 0} vid</span>
                      </td>
                      <td className="py-3 text-right font-tech text-xs">{e?.clientApprovedVideos || 0}</td>
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
