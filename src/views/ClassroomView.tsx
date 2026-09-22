import { CLASSROOM_MODULES } from '../data';
import { GraduationCap, Play, CheckCircle2, Lock, BookOpen, Award } from 'lucide-react';

export function ClassroomView() {
  const colorMap: Record<string, string> = {
    accent: 'text-accent bg-accent-dim',
    mint: 'text-mint bg-mint-dim',
    amber: 'text-amber bg-amber-dim',
    violet: 'text-violet bg-violet-dim',
  };

  const totalLessons = CLASSROOM_MODULES.reduce((s, m) => s + m.lessons, 0);
  const doneLessons = CLASSROOM_MODULES.reduce((s, m) => s + m.done, 0);

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent-dim flex items-center justify-center">
            <GraduationCap size={28} className="text-accent" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-semibold">Academia Senda</h2>
            <p className="text-sm text-muted">Progreso: {doneLessons} de {totalLessons} lecciones completadas</p>
          </div>
          <div className="flex items-center gap-2 text-mint">
            <Award size={20} />
            <span className="font-display text-2xl font-bold">{Math.round((doneLessons / totalLessons) * 100)}%</span>
          </div>
        </div>
        <div className="h-2 bg-surface-3 rounded-full mt-4 overflow-hidden">
          <div className="h-full bg-mint rounded-full transition-all duration-500" style={{ width: `${(doneLessons / totalLessons) * 100}%` }} />
        </div>
      </div>

      <div className="space-y-3">
        {CLASSROOM_MODULES.map(m => {
          const pct = Math.round((m.done / m.lessons) * 100);
          const isComplete = m.done === m.lessons;
          const isLocked = m.done === 0 && CLASSROOM_MODULES.indexOf(m) > 0 && CLASSROOM_MODULES[CLASSROOM_MODULES.indexOf(m) - 1].done < CLASSROOM_MODULES[CLASSROOM_MODULES.indexOf(m) - 1].lessons;
          return (
            <div key={m.id} className={`bg-surface-2 border border-line rounded-xl p-5 ${isLocked ? 'opacity-50' : ''}`}>
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${colorMap[m.color]}`}>
                  {isLocked ? <Lock size={22} /> : isComplete ? <CheckCircle2 size={22} /> : <BookOpen size={22} />}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-base font-semibold">{m.title}</h3>
                    <span className="text-xs text-muted-2">{m.done}/{m.lessons} lecciones</span>
                  </div>
                  <p className="text-sm text-muted mt-1">{m.desc}</p>
                  <div className="flex items-center gap-3 mt-3">
                    <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-mint' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                    </div>
                    {!isLocked && (
                      <button className={`text-sm font-medium flex items-center gap-1 ${isComplete ? 'text-mint' : 'text-accent hover:text-accent-strong'}`}>
                        <Play size={14} /> {isComplete ? 'Repasar' : 'Continuar'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
