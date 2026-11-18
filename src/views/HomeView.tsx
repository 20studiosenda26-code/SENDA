// Inicio de SENDA.
// - Admin → AdminHomePanels
// - Clipper · Asistente de edición → este archivo (WorkerHome)
// - Cliente → ClientHome (ClientArea.tsx)
// Pensado para computador (bento de 12 columnas); en pantallas pequeñas se apila.
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useStore } from '../store';
import {
  AlertTriangle, ArrowRight, Bell, BookOpen, CalendarDays, CheckCircle2, Clapperboard, Clock3, Download,
  Film, GraduationCap, Hourglass, Image as ImageIcon, Inbox, MessageSquare, Scissors, Sparkles, TrendingUp, Wallet,
} from 'lucide-react';
import { AdminHomePanels } from './AdminHomePanels';
import { isAssignedTo } from '../lib/roles';
import { buildWorkUnits, workerDayLoad } from '../lib/capacity';
import {
  findOrderForVideo, flattenVideos, fmtMoney, isTeamDone, PAY_SPLIT, todayIso, unitEconomics, videoEarned, workerEarningsSummary,
  type VideoWithBrand,
} from '../lib/economics';
import { GlowCard } from '../components/ui/spotlight-card';
import NumberTicker from '../components/ui/number-ticker';
import { AnimatedRadialChart } from '../components/ui/animated-radial-chart';
import { AttentionTile, countdownLabel, deadlineMs, EmptyState, fmtDate, FollowUpRow, Modal, VideoList, type Tone } from '../components/home/home-bits';
import type { CalendarEvent, Order, Video } from '../types';
import { WORKER_STEP_TEXT, workerStep, type WorkerStep } from '../lib/videoFlow';

export function HomeView() {
  const { role } = useStore();
  // El administrador tiene su propio Inicio: centro de atención, entregas, equipo y economía
  if (role === 'admin') return <AdminHomePanels />;
  return <WorkerHome />;
}

// Siguiente paso de cada video: fuente única en lib/videoFlow
type Step = WorkerStep;
const STEP_TEXT = WORKER_STEP_TEXT;
const nextStep = workerStep;

type ActionKey = 'subir_imagen' | 'clips' | 'subir_final' | 'corregir';

function eventDate(e: CalendarEvent): Date {
  return new Date(e.year, e.month, e.day, 12);
}

// ---------------------------------------------------------------------------
// Inicio del Clipper · Asistente de edición
// ---------------------------------------------------------------------------
function WorkerHome() {
  const {
    workers, currentWorkerId, brands, orders, financeSettings, payrollPayments, calendarEvents,
    classroomModules, lessonCompletions, notificationsArchive, getWorkerCapacity,
    setView, setSelectedVideo, setSelectedClassroomModuleId, refreshAssignments,
  } = useStore();
  const [panel, setPanel] = useState<ActionKey | 'waiting' | null>(null);

  // Los videos que te asignan o te quitan aparecen aquí sin esperar: se trae lo último al abrir y cada 6 s
  useEffect(() => {
    void refreshAssignments();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') void refreshAssignments(); }, 6000);
    return () => clearInterval(iv);
  }, [refreshAssignments]);

  const worker = workers.find(w => w.id === currentWorkerId);
  const firstName = worker?.name?.split(' ')[0] || '';

  const myVideos = useMemo<VideoWithBrand[]>(
    () => flattenVideos(brands).filter(v => isAssignedTo(v, currentWorkerId)),
    [brands, currentWorkerId]
  );
  const withStep = useMemo(() => myVideos.map(v => ({ v, step: nextStep(v) })), [myVideos]);
  const byStep = (...steps: Step[]) => withStep.filter(x => steps.includes(x.step)).map(x => x.v);

  const actions: Record<ActionKey, VideoWithBrand[]> = {
    subir_imagen: byStep('subir_imagen'),
    clips: byStep('subir_clips', 'reemplazar_clips'),
    subir_final: byStep('subir_final'),
    corregir: byStep('corregir'),
  };
  const waitingSenda = byStep('revision_senda');
  const waitingClient = byStep('esperando_cliente');
  const actionTotal = Object.values(actions).reduce((s, l) => s + l.length, 0);

  const payOf = (v: VideoWithBrand) => unitEconomics(v, findOrderForVideo(v, v.brandName, orders), financeSettings).creatorPay;
  const earnings = worker ? workerEarningsSummary(worker, brands, orders, financeSettings, payrollPayments) : null;
  const lastPayment = payrollPayments.filter(p => p.workerId === currentWorkerId).sort((a, b) => b.paidAt.localeCompare(a.paidAt))[0] || null;

  // Carga de hoy: mismo motor que usa el admin en Capacidad
  const load = useMemo(() => {
    if (!worker) return { today: 0, cap: 1, pending: 0 };
    const dl = workerDayLoad(worker, buildWorkUnits(orders, brands));
    return { today: dl.todayLoad, cap: Math.max(1, getWorkerCapacity(worker.id)), pending: dl.pendingTotal };
  }, [worker, orders, brands, getWorkerCapacity]);

  // Mis entregas: un renglón por proyecto, ordenado por fecha límite
  const projects = useMemo(() => {
    const map = new Map<string, { key: string; brand: string; order: Order | null; videos: VideoWithBrand[] }>();
    for (const v of myVideos) {
      const order = findOrderForVideo(v, v.brandName, orders);
      const key = order?.id || v.brandName;
      const cur = map.get(key) || { key, brand: v.brandName, order, videos: [] };
      cur.videos.push(v);
      map.set(key, cur);
    }
    return Array.from(map.values())
      .map(p => {
        const sorted = [...p.videos].sort((a, b) => (a.videoNumber || 0) - (b.videoNumber || 0));
        const dl = deadlineMs(p.order?.deliveryDate || sorted[0]?.date, p.order?.deliveryTime);
        const doneSenda = sorted.filter(isTeamDone).length;
        const doneClient = sorted.filter(v => v.qc === 'aprobado_cliente').length;
        const next = sorted.find(v => !isTeamDone(v)) || null;
        return { ...p, videos: sorted, dl, doneSenda, doneClient, next, finished: !next };
      })
      .sort((a, b) => Number(a.finished) - Number(b.finished) || (Number.isFinite(a.dl) ? a.dl : Infinity) - (Number.isFinite(b.dl) ? b.dl : Infinity));
  }, [myVideos, orders]);
  const activeProjects = projects.filter(p => !p.finished);
  const nextDelivery = activeProjects[0] || null;

  // Próximas reuniones y capacitaciones del calendario del equipo
  const upcoming = useMemo(() => {
    const start = new Date(`${todayIso()}T00:00:00`).getTime();
    return calendarEvents
      .filter(e => eventDate(e).getTime() >= start)
      .sort((a, b) => eventDate(a).getTime() - eventDate(b).getTime())
      .slice(0, 4);
  }, [calendarEvents]);

  const completedLessons = new Set(lessonCompletions[currentWorkerId] || []);
  const modules = classroomModules
    .map(m => {
      const doneCount = m.lessons.filter(l => completedLessons.has(l.id)).length;
      return { m, doneCount, complete: m.lessons.length > 0 && doneCount === m.lessons.length };
    })
    .sort((a, b) => Number(a.complete) - Number(b.complete))
    .slice(0, 3);

  const myNotifs = notificationsArchive
    .filter(n => n.role === 'clipper' && n.workerId === currentWorkerId)
    .sort((a, b) => b.t.localeCompare(a.t))
    .slice(0, 5);

  const goToVideo = (v: Video) => { setPanel(null); setSelectedVideo(v); setView('tareas'); };
  const openAction = (key: ActionKey | 'waiting', list: VideoWithBrand[]) => {
    if (list.length === 0) return;
    if (list.length === 1) goToVideo(list[0]);
    else setPanel(key);
  };

  const tiles: { key: ActionKey; label: string; hint: string; icon: ReactNode; tone: Tone }[] = [
    { key: 'corregir', label: 'Correcciones', hint: 'Del admin o del cliente', icon: <AlertTriangle size={18} />, tone: 'red' },
    { key: 'subir_final', label: 'Video final', hint: 'Clips aprobados: súbelo', icon: <Film size={18} />, tone: 'accent' },
    { key: 'clips', label: 'Clips', hint: 'Subir o reemplazar', icon: <Scissors size={18} />, tone: 'accent' },
    { key: 'subir_imagen', label: 'Imagen principal', hint: 'Primer paso de cada video', icon: <ImageIcon size={18} />, tone: 'amber' },
  ];

  const panelList: VideoWithBrand[] = panel === 'waiting' ? waitingSenda : panel ? actions[panel] : [];

  return (
    <div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fadeIn">
      {/* Encabezado */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="font-display text-3xl xl:text-4xl font-bold">Hola, {firstName}</h2>
            {worker && (
              <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${worker.online ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted-2'}`}>
                <span className={`w-2 h-2 rounded-full ${worker.online ? 'bg-mint animate-pulse' : 'bg-muted-2'}`} />
                {worker.online ? 'En línea' : 'No en línea'}
              </span>
            )}
          </div>
          <p className="text-muted mt-1 first-letter:uppercase">
            {new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
            {actionTotal > 0 ? ` · tienes ${actionTotal} tarea${actionTotal === 1 ? '' : 's'} por hacer` : ' · estás al día'}
          </p>
        </div>
        {nextDelivery && (
          <button
            type="button"
            onClick={() => nextDelivery.next && goToVideo(nextDelivery.next)}
            className="group flex items-center gap-3 bg-surface-2 border border-line hover:border-accent/50 rounded-xl px-4 py-2.5 text-left transition-colors"
          >
            <span className="w-9 h-9 rounded-lg bg-amber-dim text-amber flex items-center justify-center"><Clock3 size={17} /></span>
            <span>
              <span className="block text-[11px] text-muted-2 uppercase tracking-wide font-tech">Próxima entrega</span>
              <span className="block text-sm font-semibold">{nextDelivery.brand} · <span className={Number.isFinite(nextDelivery.dl) && nextDelivery.dl < Date.now() ? 'text-red-400' : 'text-amber'}>{countdownLabel(nextDelivery.dl)}</span></span>
            </span>
            <ArrowRight size={16} className="text-muted-2 group-hover:text-accent group-hover:translate-x-0.5 transition-all" />
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Columna principal */}
        <div className="lg:col-span-8 space-y-5">
          {/* Lo que te toca hacer */}
          <GlowCard contentClassName="p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Inbox size={18} className="text-accent shrink-0" /> Lo que te toca hacer
                {actionTotal > 0 && <span className="font-tech text-xs px-2 py-0.5 rounded-full bg-accent-dim text-accent">{actionTotal}</span>}
              </h3>
              {actionTotal === 0 && <span className="text-xs text-mint flex items-center gap-1"><CheckCircle2 size={14} /> Todo al día</span>}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
              {tiles.map(t => (
                <AttentionTile
                  key={t.key}
                  label={t.label}
                  hint={t.hint}
                  icon={t.icon}
                  tone={t.tone}
                  count={actions[t.key].length}
                  onClick={() => openAction(t.key, actions[t.key])}
                />
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-line/60 grid grid-cols-1 md:grid-cols-2 gap-2">
              <FollowUpRow icon={<Hourglass size={15} />} label="En revisión de SENDA" count={waitingSenda.length} onClick={() => openAction('waiting', waitingSenda)} />
              <FollowUpRow icon={<Sparkles size={15} />} label="Esperando aprobación del cliente" count={waitingClient.length} onClick={() => setView('perfil')} />
            </div>
          </GlowCard>

          {/* Mis entregas */}
          <GlowCard tone="amber" contentClassName="p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Clock3 size={18} className="text-amber shrink-0" /> Mis entregas
                <span className="text-xs font-normal text-muted-2">{activeProjects.length} activa{activeProjects.length === 1 ? '' : 's'}</span>
              </h3>
              <button type="button" onClick={() => setView('tareas')} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1 whitespace-nowrap">
                Ir a Tareas <ArrowRight size={14} />
              </button>
            </div>
            {activeProjects.length === 0 ? (
              <EmptyState
                icon={<Clapperboard size={22} />}
                title="Sin entregas pendientes"
                text="Cuando el equipo de administración te asigne un proyecto aparecerá aquí con su fecha de entrega."
              />
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                {activeProjects.slice(0, 6).map(p => {
                  const late = Number.isFinite(p.dl) && p.dl < Date.now();
                  const step = p.next ? nextStep(p.next) : 'listo';
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => p.next && goToVideo(p.next)}
                      className="w-full text-left p-3 bg-surface-3 border border-line rounded-lg hover:border-accent/40 transition-colors group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{p.brand} <span className="text-muted-2 font-normal">· {p.videos.length} video{p.videos.length === 1 ? '' : 's'}</span></p>
                          <p className="text-[11px] text-muted-2 mt-0.5">
                            {fmtDate(p.order?.deliveryDate || p.videos[0]?.date, p.order?.deliveryTime)}
                            <span className={`ml-1.5 font-medium ${late ? 'text-red-400' : 'text-amber'}`}>· {countdownLabel(p.dl)}</span>
                          </p>
                        </div>
                        <ArrowRight size={15} className="text-muted-2 group-hover:text-accent transition-colors shrink-0 mt-0.5" />
                      </div>
                      <p className="text-xs mt-2 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-accent" />
                        <span className="text-text">{p.next?.name}:</span> <span className="text-muted">{STEP_TEXT[step]}</span>
                      </p>
                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="relative h-1.5 flex-1 bg-surface-2 rounded-full overflow-hidden">
                          <div className="absolute inset-y-0 left-0 bg-accent/40 rounded-full" style={{ width: `${(p.doneSenda / p.videos.length) * 100}%` }} />
                          <div className="absolute inset-y-0 left-0 bg-mint rounded-full" style={{ width: `${(p.doneClient / p.videos.length) * 100}%` }} />
                        </div>
                        <span className="text-[10px] font-tech text-muted-2">{p.doneSenda}/{p.videos.length} aprobados</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </GlowCard>

          {/* Capacitaciones */}
          <GlowCard tone="violet" contentClassName="p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <GraduationCap size={18} className="text-violet shrink-0" /> Capacitaciones
              </h3>
              <button type="button" onClick={() => { setSelectedClassroomModuleId(null); setView('classroom'); }} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
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
                    type="button"
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
          </GlowCard>
        </div>

        {/* Columna lateral */}
        <div className="lg:col-span-4 space-y-5">
          {/* Ganancias */}
          <GlowCard tone="mint" contentClassName="p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <TrendingUp size={18} className="text-mint shrink-0" /> Mis ganancias
              </h3>
              <button type="button" onClick={() => setView('perfil')} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
                Detalle <ArrowRight size={14} />
              </button>
            </div>
            <p className="text-xs text-muted">Ganado este mes</p>
            <p className="font-display text-4xl font-bold text-mint leading-tight"><NumberTicker value={earnings?.earnedMonth || 0} /></p>
            <p className="text-[11px] text-muted-2">Hoy: {fmtMoney(earnings?.earnedToday || 0)}</p>
            <div className="grid grid-cols-2 gap-2 mt-4">
              <MiniMoney icon={<Wallet size={14} />} label="Por cobrar" value={earnings?.pending || 0} cls="text-accent" />
              <MiniMoney icon={<Hourglass size={14} />} label="Esperando cliente" value={earnings?.waitingClientAmount || 0} cls="text-amber" />
            </div>
            {lastPayment && (
              <div className="mt-3 flex items-center justify-between gap-2 text-xs bg-surface-3 border border-mint/25 rounded-lg px-3 py-2">
                <span className="text-muted">Último pago · <span className="text-mint font-semibold">{fmtMoney(lastPayment.amount)}</span> · {lastPayment.weekendLabel}</span>
                {lastPayment.receiptFileUrl && (
                  <a href={lastPayment.receiptFileUrl} download={lastPayment.receiptFileName || 'comprobante'} className="text-accent hover:text-accent-strong flex items-center gap-1 shrink-0">
                    <Download size={12} /> Comprobante
                  </a>
                )}
              </div>
            )}
            <p className="text-[11px] text-muted-2 mt-3 leading-snug">
              {fmtMoney(financeSettings.payPerVideo)} por video: {fmtMoney(financeSettings.payPerVideo * PAY_SPLIT)} al Aprobado Senda + {fmtMoney(financeSettings.payPerVideo * PAY_SPLIT)} al Aprobado Cliente.
            </p>
          </GlowCard>

          {/* Carga de hoy */}
          <GlowCard contentClassName="p-5 flex flex-col items-center">
            <h3 className="font-display text-lg font-semibold self-start flex items-center gap-2">
              <Clapperboard size={18} className="text-accent shrink-0" /> Mi carga de hoy
            </h3>
            <div className="pt-4">
              <AnimatedRadialChart
                value={(load.today / load.cap) * 100}
                size={210}
                strokeWidth={14}
                showLabels={false}
                caption={`${load.today} de ${load.cap} videos para hoy · ${load.pending} pendientes en total`}
              />
            </div>
          </GlowCard>

          {/* Próximas reuniones y capacitaciones */}
          <GlowCard tone="violet" contentClassName="p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <CalendarDays size={18} className="text-violet shrink-0" /> Próximos eventos
              </h3>
              <button type="button" onClick={() => setView('calendario')} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
                Calendario <ArrowRight size={14} />
              </button>
            </div>
            {upcoming.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">No hay reuniones ni capacitaciones programadas.</p>
            ) : (
              <div className="space-y-2">
                {upcoming.map(e => {
                  const d = eventDate(e);
                  const isToday = d.toDateString() === new Date().toDateString();
                  return (
                    <div key={e.id} className="flex items-center gap-3 p-2.5 bg-surface-3 border border-line rounded-lg">
                      <div className={`w-11 shrink-0 text-center rounded-md py-1 ${isToday ? 'bg-accent text-on-accent' : 'bg-surface-2 text-text'}`}>
                        <p className="text-[9px] uppercase font-tech leading-none">{d.toLocaleDateString('es-ES', { month: 'short' })}</p>
                        <p className="font-display text-lg font-bold leading-tight">{e.day}</p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{e.label}</p>
                        <p className="text-[11px] text-muted-2 truncate">{isToday ? 'Hoy' : d.toLocaleDateString('es-ES', { weekday: 'long' })}{e.note ? ` · ${e.note}` : ''}</p>
                      </div>
                      {e.link && (
                        <a href={e.link} target="_blank" rel="noreferrer" className="text-xs text-accent hover:text-accent-strong shrink-0">Unirse</a>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </GlowCard>

          {/* Novedades */}
          <GlowCard contentClassName="p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2">
                <Bell size={18} className="text-accent shrink-0" /> Novedades
              </h3>
              <button type="button" onClick={() => setView('chat')} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
                <MessageSquare size={14} /> Chat
              </button>
            </div>
            {myNotifs.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">Sin novedades por ahora.</p>
            ) : (
              <ul className="space-y-2">
                {myNotifs.map(n => (
                  <li key={n.id} className="text-xs leading-snug border-l-2 border-accent/40 pl-2.5">
                    <p className="text-text">{n.text}</p>
                    <p className="text-[10px] text-muted-2 mt-0.5">{new Date(n.t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                  </li>
                ))}
              </ul>
            )}
          </GlowCard>
        </div>
      </div>

      {panel && (
        <Modal title={panel === 'waiting' ? 'En revisión de SENDA' : tiles.find(t => t.key === panel)?.label || ''} onClose={() => setPanel(null)} icon={<Inbox size={18} className="text-accent" />}>
          <VideoList
            videos={panelList}
            detail={v => {
              const vv = v as VideoWithBrand;
              const earned = videoEarned(vv, payOf(vv));
              return `${STEP_TEXT[nextStep(v)]} · vale ${fmtMoney(payOf(vv))}${earned > 0 ? ` · ya ganaste ${fmtMoney(earned)}` : ''}`;
            }}
            onOpen={goToVideo}
          />
        </Modal>
      )}
    </div>
  );
}

function MiniMoney({ icon, label, value, cls }: { icon: ReactNode; label: string; value: number; cls: string }) {
  return (
    <div className="bg-surface-3 border border-line rounded-lg p-3">
      <p className="text-[11px] text-muted flex items-center gap-1.5"><span className={cls}>{icon}</span> {label}</p>
      <p className={`font-display text-xl font-bold mt-1 ${cls}`}><NumberTicker value={value} /></p>
    </div>
  );
}
