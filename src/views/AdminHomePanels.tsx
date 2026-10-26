import { useStore } from '../store';
import { Users } from 'lucide-react';

export function AdminHomePanels() {
  const { workers, getWorkerWorkload, getWorkerCapacity, getWorkerGoals } = useStore();

  const clippers = workers.filter(w => w.role === 'clipper');
  const editors = workers.filter(w => w.role === 'editor');

  const renderWorkerCard = (worker: any) => {
    const workload = getWorkerWorkload(worker.id);
    const capacity = getWorkerCapacity(worker.id);
    const goals = getWorkerGoals(worker.id);

    let statusText = 'Disponible';
    let statusColor = 'text-gray-400 bg-gray-500/10 border-gray-500/20';

    if (workload === 0) {
      statusText = 'Sin trabajo';
      statusColor = 'text-blue-400 bg-blue-500/10 border-blue-500/20';
    } else if (workload >= capacity) {
      statusText = 'Lleno';
      statusColor = 'text-red-500 bg-red-500/10 border-red-500/20';
    } else if (worker.pointsToday >= goals.daily) {
      statusText = 'Meta diaria';
      statusColor = 'text-green-500 bg-green-500/10 border-green-500/20';
    } else {
      statusText = 'En progreso';
      statusColor = 'text-[var(--accent)] bg-[var(--accent)]/10 border-[var(--accent)]/20';
    }

    return (
      <div key={worker.id} className="bg-[var(--surface-1)] border border-[var(--border-line)] p-4 rounded-xl flex items-center justify-between hover:border-gray-600 transition-colors">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-bold text-white shadow-sm border border-[var(--border-line)] ${worker.role === 'clipper' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-purple-500/20 text-purple-400'}`}>
              {worker.name.charAt(0).toUpperCase()}
            </div>
            <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[var(--surface-1)] ${worker.online ? 'bg-green-500' : 'bg-gray-500'}`} />
          </div>
          <div>
            <h3 className="text-white font-medium text-sm">{worker.name}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded border ${statusColor} font-semibold mt-1 inline-block`}>
              {statusText}
            </span>
          </div>
        </div>
        
        <div className="flex gap-4 text-right">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 font-medium tracking-wide">VIDEOS</span>
            <span className="text-sm text-gray-200 font-bold">{workload} <span className="text-gray-500 font-normal">/ {capacity}</span></span>
          </div>
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 font-medium tracking-wide">PUNTOS HOY</span>
            <span className="text-sm text-gray-200 font-bold">{worker.pointsToday} <span className="text-gray-500 font-normal">/ {goals.daily}</span></span>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div>
        <h1 className="text-2xl font-display font-bold text-white mb-2 tracking-tight">Rendimiento del Equipo</h1>
        <p className="text-sm text-[var(--surface-4)]">Monitoreo en tiempo real de cargas de trabajo y metas de Clippers y Editores.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[var(--surface-2)] border border-[var(--border-line)] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 border-b border-[var(--border-line)] pb-4">
            <Users className="w-5 h-5 text-[var(--accent)]" />
            <h2 className="text-lg font-medium text-white">Clippers</h2>
          </div>
          <div className="space-y-3">
            {clippers.length > 0 ? clippers.map(renderWorkerCard) : (
              <div className="text-center py-8 text-gray-500 text-sm">No hay clippers registrados.</div>
            )}
          </div>
        </div>

        <div className="bg-[var(--surface-2)] border border-[var(--border-line)] rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-6 border-b border-[var(--border-line)] pb-4">
            <Users className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-medium text-white">Editores</h2>
          </div>
          <div className="space-y-3">
            {editors.length > 0 ? editors.map(renderWorkerCard) : (
              <div className="text-center py-8 text-gray-500 text-sm">No hay editores registrados.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
