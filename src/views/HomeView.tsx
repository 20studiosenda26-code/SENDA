import { useStore } from '../store';
import { Flame, Target, TrendingUp, Play, ArrowRight, CheckCircle2, Clock, AlertCircle, CalendarDays, GraduationCap, BookOpen, Users } from 'lucide-react';
import { CardNodeDeco } from '../components/BrandBackground';
import { CLASSROOM_MODULES } from '../data';

export function HomeView() {
  const { role, workers, currentWorkerId, brands, setView, config, setSelectedVideo, setSelectedClassroomModuleId } = useStore();
  const worker = workers.find(w => w.id === currentWorkerId);
  const goals = role === 'admin' ? config.goals.clipper : config.goals[role as 'clipper' | 'editor'];

  const myVideos = brands.flatMap(b => b.videos).filter(v =>
    role === 'clipper' ? v.clipperId === currentWorkerId : role === 'editor' ? v.editorId === currentWorkerId : true
  );
  const inProgress = myVideos.filter(v => v.qc !== 'aprobado_cliente' && v.qc !== 'sin_iniciar');
  const done = myVideos.filter(v => v.qc === 'aprobado_cliente');

  const greeting = role === 'admin' ? 'Panel de administración' : `Hola, ${worker?.name?.split(' ')[0] || ''}`;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-3xl font-bold">{greeting}</h2>
            {role !== 'admin' && worker && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${worker.online ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted-2'}`}>
                <span className={`w-2 h-2 rounded-full ${worker.online ? 'bg-mint' : 'bg-muted-2'}`} />
                {worker.online ? 'En línea' : 'No en línea'}
              </span>
            )}
          </div>
          <p className="text-muted mt-1">Aquí está tu resumen de hoy, {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.</p>
        </div>
      </div>

      {role === 'admin' && (
        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <h3 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            <Users size={18} className="text-accent" /> Estado del equipo
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {workers.map(w => (
              <div key={w.id} className="flex items-center gap-2 bg-surface-3 border border-line rounded-lg px-3 py-2">
                <span className={`w-2 h-2 rounded-full shrink-0 ${w.online ? 'bg-mint' : 'bg-muted-2'}`} />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{w.name}</p>
                  <p className="text-[10px] text-muted-2">{w.online ? 'En línea' : 'No en línea'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard icon={Target} label="Puntos hoy" value={worker?.pointsToday || 0} target={goals.daily} sub={`Meta: ${goals.daily}`} accent="accent" onClick={() => setView('perfil')} />
        <StatCard icon={TrendingUp} label="Puntos del mes" value={worker?.pointsMonth || 0} target={goals.monthly} sub={`Meta: ${goals.monthly}`} accent="mint" onClick={() => setView('perfil')} />
        <StatCard icon={Flame} label="Racha" value={worker?.streak || 0} target={worker?.bestStreak || 0} sub={`Mejor: ${worker?.bestStreak || 0}`} accent="amber" onClick={() => setView('perfil')} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold">En progreso</h3>
            <button onClick={() => setView('tareas')} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
              Ver todas <ArrowRight size={14} />
            </button>
          </div>
          {inProgress.length === 0 ? (
            <p className="text-muted text-sm py-6 text-center">No tienes videos en progreso.</p>
          ) : (
            <div className="space-y-2">
              {inProgress.slice(0, 4).map(v => (
                <button
                  key={v.id}
                  onClick={() => { setSelectedVideo(v); setView('tareas'); }}
                  className="w-full flex items-center gap-3 p-3 bg-surface-3 hover:bg-surface-2 border border-transparent hover:border-accent/40 rounded-lg text-left transition-colors"
                >
                  <div className="w-10 h-10 rounded-lg bg-accent-dim flex items-center justify-center shrink-0">
                    <Play size={16} className="text-accent" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    <p className="text-xs text-muted">QC: {v.qc.replace(/_/g, ' ')}</p>
                  </div>
                  <QcBadge status={v.qc} />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-lg font-semibold">Completados</h3>
            <span className="text-sm text-muted">{done.length} videos</span>
          </div>
          {done.length === 0 ? (
            <p className="text-muted text-sm py-6 text-center">Aún no hay videos completados.</p>
          ) : (
            <div className="space-y-2">
              {done.slice(0, 4).map(v => (
                <div key={v.id} className="flex items-center gap-3 p-3 bg-surface-3 rounded-lg">
                  <CheckCircle2 size={18} className="text-mint shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{v.name}</p>
                    <p className="text-xs text-muted">{v.date}</p>
                  </div>
                  {v.paid100 && <span className="text-xs text-mint font-medium">Pagado</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-dim text-violet flex items-center justify-center">
              <GraduationCap size={20} />
            </div>
            <div>
              <h3 className="font-display text-lg font-semibold">Clases recomendadas</h3>
              <p className="text-xs text-muted mt-0.5">Sigue aprendiendo a tu ritmo</p>
            </div>
          </div>
          <button onClick={() => { setSelectedClassroomModuleId(null); setView('classroom'); }} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
            Ver Classroom <ArrowRight size={14} />
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {CLASSROOM_MODULES.slice(0, 3).map(m => {
            const progress = Math.round((m.done / m.lessons) * 100);
            const shortTitle = m.title.replace(/^Módulo \d+ · /, '');
            return (
              <button
                key={m.id}
                onClick={() => { setSelectedClassroomModuleId(m.id); setView('classroom'); }}
                className="text-left bg-surface-3 border border-line rounded-lg p-3 hover:border-accent/50 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center text-accent">
                    <BookOpen size={15} />
                  </div>
                  <ArrowRight size={14} className="text-muted-2 group-hover:text-accent transition-colors mt-1" />
                </div>
                <p className="text-sm font-medium mt-3">{shortTitle}</p>
                <p className="text-xs text-muted mt-1">{m.done} de {m.lessons} lecciones</p>
                <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden mt-3">
                  <div className={`h-full rounded-full ${m.color === 'mint' ? 'bg-mint' : m.color === 'amber' ? 'bg-amber' : 'bg-accent'}`} style={{ width: `${progress}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, target, sub, accent, onClick }: { icon: typeof Flame; label: string; value: number; target: number; sub: string; accent: string; onClick?: () => void }) {
  const colorMap: Record<string, { text: string; soft: string; fill: string; border: string }> = {
    accent: { text: 'text-accent', soft: 'bg-accent-dim', fill: 'bg-accent', border: 'border-accent/30' },
    mint: { text: 'text-mint', soft: 'bg-mint-dim', fill: 'bg-mint', border: 'border-mint/30' },
    amber: { text: 'text-amber', soft: 'bg-amber-dim', fill: 'bg-amber', border: 'border-amber/30' },
  };
  const colors = colorMap[accent];
  const percent = Math.min(100, Math.round((value / Math.max(target, 1)) * 100));
  const isStreak = label === 'Racha';
  const streakDays = [
    { label: 'J', active: false },
    { label: 'V', active: true },
    { label: 'S', active: true },
    { label: 'D', active: true },
    { label: 'L', active: true },
    { label: 'M', active: true },
    { label: 'X', active: false },
  ];

  const nodeColor = accent === 'mint' ? 'var(--mint)' : accent === 'amber' ? 'var(--amber)' : 'var(--accent)';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-left bg-surface-2 border border-line rounded-xl p-5 transition-colors overflow-hidden ${isStreak ? 'min-h-[160px]' : ''} ${onClick ? 'hover:border-accent/50 hover:bg-surface-3 cursor-pointer' : ''}`}
    >
      <CardNodeDeco color={nodeColor} />
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors.soft} ${colors.text}`}>
            <Icon size={20} />
          </div>
          <span className="text-sm text-muted">{label}</span>
        </div>
        <span className={`text-xs font-semibold ${colors.text}`}>{percent}%</span>
      </div>
      {isStreak ? (
        <div className="flex items-end justify-between gap-1.5 mt-4">
          {streakDays.map((day, index) => (
            <div key={`${day.label}-${index}`} className="flex flex-col items-center gap-1.5">
              <div className={`w-7 h-7 rounded-md flex items-center justify-center border ${day.active ? `${colors.soft} ${colors.text} ${colors.border}` : 'bg-surface-3 text-muted-2 border-line'}`}>
                {day.active ? <Flame size={14} /> : <CalendarDays size={13} />}
              </div>
              <span className="text-[10px] text-muted-2">{day.label}</span>
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div className="flex items-end justify-between">
            <p className="font-display text-3xl font-bold leading-none">{value}</p>
            <p className="text-xs text-muted-2">{sub}</p>
          </div>
          <div className="relative h-3 bg-surface-3 border border-line rounded-full overflow-hidden mt-4">
            <div className={`h-full ${colors.fill} rounded-full transition-all duration-500`} style={{ width: `${percent}%` }} />
            <span className="absolute top-1/2 -translate-y-1/2 w-2 h-2 bg-text rounded-full shadow-sm transition-all duration-500" style={{ left: `calc(${Math.max(percent, 4)}% - 8px)` }} />
          </div>
        </div>
      )}
      {isStreak && <p className="text-xs text-muted-2 mt-3">{value} días · {sub}</p>}
    </button>
  );
}

function QcBadge({ status }: { status: string }) {
  const map: Record<string, { color: string; icon: typeof Clock }> = {
    pendiente: { color: 'text-amber bg-amber-dim', icon: Clock },
    revision: { color: 'text-accent bg-accent-dim', icon: AlertCircle },
    correcciones: { color: 'text-amber bg-amber-dim', icon: AlertCircle },
    aprobado: { color: 'text-mint bg-mint-dim', icon: CheckCircle2 },
    aprobado_senda: { color: 'text-mint bg-mint-dim', icon: CheckCircle2 },
    aprobado_cliente: { color: 'text-mint bg-mint-dim', icon: CheckCircle2 },
    sin_iniciar: { color: 'text-muted-2 bg-surface-3', icon: Clock },
  };
  const m = map[status] || map.sin_iniciar;
  const Icon = m.icon;
  return (
    <span className={`text-xs font-medium px-2 py-1 rounded-md flex items-center gap-1 ${m.color}`}>
      <Icon size={12} />
      {status.replace(/_/g, ' ')}
    </span>
  );
}
