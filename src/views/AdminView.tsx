import { useStore } from '../store';
import { Users, DollarSign, Video, TrendingUp, Flame, CheckCircle2, Clock, DollarSign as Dollar } from 'lucide-react';

export function AdminView() {
  const { workers, brands, paidHistory, closeDay, togglePaid50, approveFinal } = useStore();
  const allVideos = brands.flatMap(b => b.videos);
  const completed = allVideos.filter(v => v.qc === 'aprobado_cliente');
  const inProgress = allVideos.filter(v => v.qc !== 'aprobado_cliente' && v.qc !== 'sin_iniciar');
  const totalPaid = paidHistory.filter(p => p.paid100).length;
  const totalPending = allVideos.filter(v => v.paid50 && !v.paid100).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={Users} label="Equipo" value={workers.length} color="accent" />
        <KpiCard icon={Video} label="Videos totales" value={allVideos.length} color="mint" />
        <KpiCard icon={CheckCircle2} label="Completados" value={completed.length} color="violet" />
        <KpiCard icon={Clock} label="En progreso" value={inProgress.length} color="amber" />
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <h3 className="font-display text-lg font-semibold mb-4">Equipo</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted text-xs border-b border-line">
                <th className="py-2 pr-4 font-medium">Nombre</th>
                <th className="py-2 pr-4 font-medium">Cargo</th>
                <th className="py-2 pr-4 font-medium">Puntos hoy</th>
                <th className="py-2 pr-4 font-medium">Puntos mes</th>
                <th className="py-2 pr-4 font-medium">Racha</th>
                <th className="py-2 pr-4 font-medium">Día cerrado</th>
                <th className="py-2 font-medium">Acción</th>
              </tr>
            </thead>
            <tbody>
              {workers.map(w => (
                <tr key={w.id} className="border-b border-line/50 hover:bg-surface-3 transition-colors">
                  <td className="py-3 pr-4 font-medium">{w.name}</td>
                  <td className="py-3 pr-4 text-muted">{w.cargo}</td>
                  <td className="py-3 pr-4">{w.pointsToday}</td>
                  <td className="py-3 pr-4">{w.pointsMonth}</td>
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-1 text-amber"><Flame size={14} />{w.streak}</span>
                  </td>
                  <td className="py-3 pr-4">
                    {w.dayClosedToday ? <CheckCircle2 size={16} className="text-mint" /> : <Clock size={16} className="text-muted-2" />}
                  </td>
                  <td className="py-3">
                    {!w.dayClosedToday && (
                      <button onClick={() => closeDay(w.id)} className="text-xs text-accent hover:text-accent-strong font-medium">
                        Cerrar día
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <h3 className="font-display text-base font-semibold mb-3 flex items-center gap-2">
            <Dollar size={18} className="text-mint" /> Pagos pendientes
          </h3>
          {totalPending === 0 && totalPaid === allVideos.filter(v => v.paid100).length ? (
            <p className="text-sm text-muted text-center py-4">Todo al día</p>
          ) : (
            <div className="space-y-2">
              {allVideos.filter(v => v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente').map(v => (
                <div key={v.id} className="flex items-center gap-3 p-3 bg-surface-3 rounded-lg">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    <p className="text-xs text-muted">{v.clipperName} · {v.editorName}</p>
                  </div>
                  <button onClick={() => togglePaid50(v.id)} className={`text-xs px-2 py-1 rounded ${v.paid50 ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted border border-line'}`}>
                    50%
                  </button>
                  <button onClick={() => approveFinal(v.id)} className={`text-xs px-2 py-1 rounded ${v.paid100 ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted border border-line'}`}>
                    100%
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <h3 className="font-display text-base font-semibold mb-3 flex items-center gap-2">
            <TrendingUp size={18} className="text-accent" /> Historial de pagos
          </h3>
          {paidHistory.length === 0 ? (
            <p className="text-sm text-muted text-center py-4">Sin pagos registrados</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {paidHistory.map((p, i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-surface-3 rounded-lg">
                  <DollarSign size={16} className="text-mint shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.videoName}</p>
                    <p className="text-xs text-muted">{p.date} · {p.durationKey}</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded ${p.paid100 ? 'bg-mint-dim text-mint' : 'bg-amber-dim text-amber'}`}>
                    {p.paid100 ? '100%' : '50%'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
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
