import { useMemo, type ReactNode } from 'react';
import { useStore } from '../store';
import { Play, ArrowRight, CheckCircle2, Clock, AlertCircle, GraduationCap, BookOpen, Wallet, TrendingUp, Hourglass, Sparkles } from 'lucide-react';
import { CardNodeDeco } from '../components/BrandBackground';
import { AdminHomePanels } from './AdminHomePanels';
import { pendingRoleSuffix } from '../lib/qcLabel';
import { isAssignedTo } from '../lib/roles';
import { findOrderForVideo, fmtMoney, PAY_SPLIT, unitEconomics, videoEarned, workerEarningsSummary } from '../lib/economics';
import NumberTicker from '../components/ui/number-ticker';
import type { Video } from '../types';

export function HomeView() {
  const {
    role, workers, currentWorkerId, brands, orders, financeSettings, payrollPayments,
    classroomModules, lessonCompletions, setView, setSelectedVideo, setSelectedClassroomModuleId,
  } = useStore();

  const worker = workers.find(w => w.id === currentWorkerId);

  const myVideos = useMemo(
    () => brands.flatMap(b => b.videos.map(v => ({ ...v, brandName: b.name }))).filter(v => isAssignedTo(v, currentWorkerId)),
    [brands, currentWorkerId]
  );
  const inProgress = myVideos.filter(v => v.qc !== 'aprobado_cliente' && v.qc !== 'sin_iniciar');
  const done = myVideos.filter(v => v.qc === 'aprobado_cliente');

  // El administrador tiene su propio Inicio: centro de atención, entregas, equipo y economía
  if (role === 'admin') {
    return <AdminHomePanels />;
  }

  const greeting = `Hola, ${worker?.name?.split(' ')[0] || ''}`;
  const earnings = worker
    ? workerEarningsSummary(worker, brands, orders, financeSettings, payrollPayments)
    : null;
  const payOf = (v: Video & { brandName: string }) => unitEconomics(v, findOrderForVideo(v, v.brandName, orders), financeSettings).creatorPay;
  const completedLessons = new Set(lessonCompletions[currentWorkerId] || []);
  const modules = classroomModules
    .map(m => {
      const doneCount = m.lessons.filter(l => completedLessons.has(l.id)).length;
      return { m, doneCount, complete: m.lessons.length > 0 && doneCount === m.lessons.length };
    })
    // Primero lo que falta por terminar
    .sort((a, b) => Number(a.complete) - Number(b.complete))
    .slice(0, 3);

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-3xl font-bold">{greeting}</h2>
            {worker && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${worker.online ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted-2'}`}>
                <span className={`w-2 h-2 rounded-full ${worker.online ? 'bg-mint' : 'bg-muted-2'}`} />
                {worker.online ? 'En línea' : 'No en línea'}
              </span>
            )}
          </div>
          <p className="text-muted mt-1">Aquí está tu resumen de hoy, {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}.</p>
        </div>
      </div>

      {/* Ganancias: $X por video · 50% al Aprobado Senda + 50% al Aprobado Cliente */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <EarnCard
          icon={TrendingUp}
          label="Ganado este mes"
          value={earnings?.earnedMonth || 0}
          sub={`Hoy: ${fmtMoney(earnings?.earnedToday || 0)}`}
          accent="mint"
          onClick={() => setView('perfil')}
        />
        <EarnCard
          icon={Wallet}
          label="Por cobrar"
          value={earnings?.pending || 0}
          sub="Se paga en el corte del fin de semana"
          accent="accent"
          onClick={() => setView('perfil')}
        />
        <EarnCard
          icon={Hourglass}
          label="Esperando al cliente"
          value={earnings?.waitingClientAmount || 0}
          sub={`${earnings?.waitingClientVideos || 0} video(s) aprobados por SENDA`}
          accent="amber"
          onClick={() => setView('perfil')}
        />
      </div>
      <p className="text-xs text-muted-2 -mt-3 flex items-center gap-1.5">
        <Sparkles size={12} className="text-accent" />
        Ganas {fmtMoney(financeSettings.payPerVideo)} por video: {fmtMoney(financeSettings.payPerVideo * PAY_SPLIT)} cuando SENDA lo aprueba y {fmtMoney(financeSettings.payPerVideo * PAY_SPLIT)} cuando lo aprueba el cliente.
      </p>

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
              {inProgress.slice(0, 4).map(v => {
                const earned = videoEarned(v, payOf(v));
                return (
                  <button
                    key={v.id}
                    onClick={() => { setSelectedVideo(v); setView('tareas'); }}
                    className="w-full flex items-center gap-3 p-3 bg-surface-3 hover:bg-surface-2 border border-transparent hover:border-accent/40 rounded-lg text-left transition-colors"
                  >
                    <div className="w-10 h-10 rounded-lg bg-accent-dim flex items-center justify-center shrink-0">
                      <Play size={16} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.brandName} · {v.name}</p>
                      <p className="text-xs text-muted">
                        Vale {fmtMoney(payOf(v))}{earned > 0 ? ` · ya ganaste ${fmtMoney(earned)}` : ''}
                      </p>
                    </div>
                    <QcBadge status={v.qc} suffix={v.qc === 'pendiente' ? pendingRoleSuffix(v) : undefined} />
                  </button>
                );
              })}
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
                    <p className="text-sm font-medium truncate">{v.brandName} · {v.name}</p>
                    <p className="text-xs text-muted">{(v.clientApprovedAt || v.date || '').slice(0, 10)}</p>
                  </div>
                  <span className="text-xs text-mint font-tech font-semibold">+{fmtMoney(videoEarned(v, payOf(v)))}</span>
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
              <h3 className="font-display text-lg font-semibold">Capacitaciones</h3>
              <p className="text-xs text-muted mt-0.5">Clases del equipo en Classroom</p>
            </div>
          </div>
          <button onClick={() => { setSelectedClassroomModuleId(null); setView('classroom'); }} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
            Ver Classroom <ArrowRight size={14} />
          </button>
        </div>
        {modules.length === 0 ? (
          <p className="text-sm text-muted text-center py-6 bg-surface-3/40 border border-dashed border-line rounded-lg">
            Aún no hay capacitaciones publicadas. Cuando el administrador suba clases aparecerán aquí.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {modules.map(({ m, doneCount, complete }) => (
              <button
                key={m.id}
                onClick={() => { setSelectedClassroomModuleId(m.id); setView('classroom'); }}
                className="text-left bg-surface-3 border border-line rounded-lg p-3 hover:border-accent/50 transition-colors group"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className={`w-8 h-8 rounded-lg bg-surface-2 flex items-center justify-center ${complete ? 'text-mint' : 'text-accent'}`}>
                    {complete ? <CheckCircle2 size={15} /> : <BookOpen size={15} />}
                  </div>
                  <ArrowRight size={14} className="text-muted-2 group-hover:text-accent transition-colors mt-1" />
                </div>
                <p className="text-sm font-medium mt-3 truncate">{m.title}</p>
                <p className="text-xs text-muted mt-1">{doneCount}/{m.lessons.length} clases vistas</p>
                <div className="h-1 bg-surface-2 rounded-full overflow-hidden mt-2">
                  <div className={`h-full rounded-full ${complete ? 'bg-mint' : 'bg-accent'}`} style={{ width: `${m.lessons.length ? (doneCount / m.lessons.length) * 100 : 0}%` }} />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function EarnCard({ icon: Icon, label, value, sub, accent, onClick }: {
  icon: typeof Wallet; label: string; value: number; sub: ReactNode; accent: 'accent' | 'mint' | 'amber'; onClick?: () => void;
}) {
  const colorMap = {
    accent: { text: 'text-accent', soft: 'bg-accent-dim', node: 'var(--accent)' },
    mint: { text: 'text-mint', soft: 'bg-mint-dim', node: 'var(--mint)' },
    amber: { text: 'text-amber', soft: 'bg-amber-dim', node: 'var(--amber)' },
  }[accent];
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative w-full text-left bg-surface-2 border border-line rounded-xl p-5 transition-colors overflow-hidden hover:border-accent/50 hover:bg-surface-3"
    >
      <CardNodeDeco color={colorMap.node} />
      <div className="flex items-center gap-3 mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap.soft} ${colorMap.text}`}>
          <Icon size={20} />
        </div>
        <span className="text-sm text-muted">{label}</span>
      </div>
      <p className={`font-display text-3xl font-bold leading-none ${colorMap.text}`}><NumberTicker value={value} /></p>
      <p className="text-xs text-muted-2 mt-2">{sub}</p>
    </button>
  );
}

function QcBadge({ status, suffix }: { status: string; suffix?: string }) {
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
      {status.replace(/_/g, ' ')}{suffix ? ` ${suffix}` : ''}
    </span>
  );
}
