import { useStore } from '../store';
import { Flame, TrendingUp, Target, CheckCircle2, Award, Star, Phone, Mail, Landmark, Globe2, BellRing } from 'lucide-react';
import { useState, useEffect } from 'react';

export function ProfileView() {
  const { workers, currentWorkerId, brands, config, role, updateWorkerProfile, toggleOnline } = useStore();
  const worker = workers.find(w => w.id === currentWorkerId);

  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [bankInfo, setBankInfo] = useState('');
  const [country, setCountry] = useState('');
  const [emailNotifOn, setEmailNotifOn] = useState(false);

  useEffect(() => {
    if (worker) {
      setPhone(worker.phone || '');
      setEmail(worker.email || '');
      setBankInfo(worker.bankInfo || '');
      setCountry(worker.country || '');
      setEmailNotifOn(!!worker.emailNotifications);
    }
  }, [worker?.id]);

  if (!worker) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <div className="bg-surface-2 border border-line rounded-xl p-6 text-center text-sm text-muted">
          Cargando tu perfil…
        </div>
      </div>
    );
  }

  const myVideos = brands.flatMap(b => b.videos).filter(v =>
    role === 'admin' ? true : role === 'clipper' ? v.clipperId === currentWorkerId : v.editorId === currentWorkerId
  );
  const completed = myVideos.filter(v => v.qc === 'aprobado_cliente');
  const goals = config.goals[worker.role];

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-5">
      <div className="bg-surface-2 border border-line rounded-xl p-6">
        <div className="flex items-center gap-5">
          <div className="w-16 h-16 rounded-2xl bg-accent-dim flex items-center justify-center">
            <span className="font-display text-2xl font-bold text-accent">{worker.name.charAt(0)}</span>
          </div>
          <div className="flex-1">
            <h2 className="font-display text-2xl font-bold">{worker.name}</h2>
            <p className="text-muted">{worker.cargo} · Ingresó {worker.ingreso}</p>
            <div className="flex items-center gap-3 mt-1">
              <span className="inline-flex items-center gap-1 text-xs text-mint"><CheckCircle2 size={12} /> {worker.estado}</span>
              {role !== 'admin' && (
                <button
                  onClick={() => toggleOnline(worker.id)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium ${worker.online ? 'text-mint' : 'text-muted-2'}`}
                >
                  <span className={`w-2 h-2 rounded-full ${worker.online ? 'bg-mint' : 'bg-muted-2'}`} />
                  {worker.online ? 'En línea' : 'No en línea'}
                </button>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-1 text-amber justify-end">
              <Star size={16} />
              <span className="font-display text-xl font-bold">{worker.pointsMonth}</span>
            </div>
            <p className="text-xs text-muted-2">puntos este mes</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MiniStat icon={Target} label="Puntos hoy" value={worker.pointsToday} color="accent" />
        <MiniStat icon={TrendingUp} label="Puntos mes" value={worker.pointsMonth} color="mint" />
        <MiniStat icon={Flame} label="Racha actual" value={worker.streak} color="amber" />
        <MiniStat icon={Award} label="Mejor racha" value={worker.bestStreak} color="violet" />
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <h3 className="font-display text-base font-semibold mb-4">Racha (últimos 5 días)</h3>
        <div className="flex gap-2">
          {worker.streakLog.map((s, i) => (
            <div key={i} className={`flex-1 h-16 rounded-lg flex items-center justify-center ${s === 'on' ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted-2'}`}>
              <Flame size={20} className={s === 'on' ? 'fill-mint' : ''} />
            </div>
          ))}
        </div>
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <h3 className="font-display text-base font-semibold mb-4">Metas</h3>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Diaria</span>
              <span className="text-muted">{worker.pointsToday} / {goals.daily}</span>
            </div>
            <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-accent rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (worker.pointsToday / goals.daily) * 100)}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Mensual</span>
              <span className="text-muted">{worker.pointsMonth} / {goals.monthly}</span>
            </div>
            <div className="h-2 bg-surface-3 rounded-full overflow-hidden">
              <div className="h-full bg-mint rounded-full transition-all duration-500" style={{ width: `${Math.min(100, (worker.pointsMonth / goals.monthly) * 100)}%` }} />
            </div>
          </div>
        </div>
      </div>

      {role !== 'admin' && (
        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <h3 className="font-display text-base font-semibold mb-4">Información personal</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-muted space-y-1">
              <span className="flex items-center gap-1.5"><Phone size={12} /> Celular</span>
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+57 300 000 0000" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            </label>
            <label className="text-xs text-muted space-y-1">
              <span className="flex items-center gap-1.5"><Mail size={12} /> Correo</span>
              <input value={email} onChange={e => setEmail(e.target.value)} placeholder="correo@ejemplo.com" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            </label>
            <label className="text-xs text-muted space-y-1">
              <span className="flex items-center gap-1.5"><Globe2 size={12} /> País de residencia</span>
              <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Colombia" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            </label>
            <label className="text-xs text-muted space-y-1">
              <span className="flex items-center gap-1.5"><Landmark size={12} /> Información de cuenta bancaria</span>
              <input value={bankInfo} onChange={e => setBankInfo(e.target.value)} placeholder="Banco, número de cuenta, tipo" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            </label>
          </div>
          <button
            onClick={() => updateWorkerProfile(worker.id, { phone, email, bankInfo, country })}
            className="mt-3 bg-accent text-on-accent rounded-md px-4 py-2 text-sm font-medium hover:bg-accent-strong transition-colors"
          >
            Guardar información
          </button>
        </div>
      )}

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <h3 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
          <BellRing size={16} className="text-accent" /> Notificaciones por correo
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
          <label className="text-xs text-muted space-y-1">
            <span className="flex items-center gap-1.5"><Mail size={12} /> Correo de contacto</span>
            <input
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="correo@ejemplo.com"
              className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent"
            />
          </label>
          <button
            type="button"
            onClick={() => setEmailNotifOn(v => !v)}
            className={`flex items-center gap-2.5 rounded-md px-3 py-2.5 text-sm font-medium border transition-colors ${
              emailNotifOn ? 'bg-mint-dim text-mint border-mint/30' : 'bg-surface-3 text-muted border-line'
            }`}
          >
            <span className={`w-9 h-5 rounded-full relative shrink-0 transition-colors ${emailNotifOn ? 'bg-mint' : 'bg-surface-2 border border-line'}`}>
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${emailNotifOn ? 'translate-x-4' : 'translate-x-0.5'}`} />
            </span>
            Recibir notificaciones de Senda al correo
          </button>
        </div>
        <button
          onClick={() => updateWorkerProfile(worker.id, { email, emailNotifications: emailNotifOn })}
          className="mt-3 bg-accent text-on-accent rounded-md px-4 py-2 text-sm font-medium hover:bg-accent-strong transition-colors"
        >
          Guardar preferencia
        </button>
        <p className="text-[10px] text-muted-2 mt-2">
          Cuando está activo, además de aparecer en la campanita, cada notificación importante (trabajo asignado, QC, racha, pagos y mensajes) se envía a este correo.
        </p>
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <h3 className="font-display text-base font-semibold mb-3">Videos completados ({completed.length})</h3>
        {completed.length === 0 ? (
          <p className="text-sm text-muted text-center py-4">Aún no hay videos completados</p>
        ) : (
          <div className="space-y-2">
            {completed.map(v => (
              <div key={v.id} className="flex items-center gap-3 p-2 bg-surface-3 rounded-lg">
                <CheckCircle2 size={16} className="text-mint shrink-0" />
                <span className="text-sm flex-1">{v.name}</span>
                <span className="text-xs text-muted-2">{v.date}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, color }: { icon: typeof Flame; label: string; value: number; color: string }) {
  const map: Record<string, string> = {
    accent: 'text-accent bg-accent-dim',
    mint: 'text-mint bg-mint-dim',
    amber: 'text-amber bg-amber-dim',
    violet: 'text-violet bg-violet-dim',
  };
  return (
    <div className="bg-surface-2 border border-line rounded-xl p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${map[color]}`}>
        <Icon size={18} />
      </div>
      <p className="font-display text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-2">{label}</p>
    </div>
  );
}
