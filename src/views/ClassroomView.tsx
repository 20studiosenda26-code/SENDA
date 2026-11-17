import { useStore } from '../store';
import { GraduationCap, Play, CheckCircle2, BookOpen, Award, ArrowLeft, Plus, Trash2, Upload, FolderPlus, X, Loader2, Link2, AlertCircle } from 'lucide-react';
import { useRef, useState } from 'react';
import { GlowCard } from '../components/ui/spotlight-card';
import { EmptyState } from '../components/home/home-bits';
import { uploadSharedFile, isGoogleDriveUrl, getGoogleDrivePreviewUrl } from '../lib/supabaseClient';

// Enlaces que se reproducen embebidos (Drive, YouTube, Loom); el resto va en <video>
function embedUrl(url: string): string | null {
  if (isGoogleDriveUrl(url)) return getGoogleDrivePreviewUrl(url);
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{6,})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const loom = url.match(/loom\.com\/share\/([\w-]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  return null;
}

const COLOR_MAP: Record<string, string> = {
  accent: 'text-accent bg-accent-dim',
  mint: 'text-mint bg-mint-dim',
  amber: 'text-amber bg-amber-dim',
  violet: 'text-violet bg-violet-dim',
};

const COLORS = ['accent', 'mint', 'amber', 'violet'];

export function ClassroomView() {
  const {
    role, currentWorkerId, workers,
    classroomModules, addClassroomModule, deleteClassroomModule,
    addClassroomLesson, deleteClassroomLesson,
    lessonCompletions, markLessonComplete,
    selectedClassroomModuleId, setSelectedClassroomModuleId,
  } = useStore();

  const isAdmin = role === 'admin';
  const [addingLessonToModule, setAddingLessonToModule] = useState<string | null>(null);
  const [lessonTitle, setLessonTitle] = useState('');
  const [lessonFileName, setLessonFileName] = useState('');
  const [lessonFileUrl, setLessonFileUrl] = useState('');
  const [showNewModule, setShowNewModule] = useState(false);
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const [newModuleDesc, setNewModuleDesc] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingLesson, setUploadingLesson] = useState(false);
  const [lessonPct, setLessonPct] = useState(0);
  const [lessonLink, setLessonLink] = useState('');
  const [lessonError, setLessonError] = useState<string | null>(null);

  const myCompleted = lessonCompletions[currentWorkerId] || [];
  const totalLessons = classroomModules.reduce((s, m) => s + m.lessons.length, 0);
  const doneLessons = classroomModules.reduce((s, m) => s + m.lessons.filter(l => myCompleted.includes(l.id)).length, 0);

  const selectedModule = classroomModules.find(m => m.id === selectedClassroomModuleId);

  // Las clases se suben al almacenamiento compartido (antes quedaban embebidas solo en este navegador)
  const handleLessonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLessonError(null);
    setLessonFileName(f.name);
    setUploadingLesson(true);
    setLessonPct(2);
    try {
      const url = await uploadSharedFile(f, `classroom/${selectedClassroomModuleId || 'general'}`, pct => setLessonPct(pct));
      setLessonFileUrl(url);
    } catch {
      setLessonFileName('');
      setLessonFileUrl('');
      setLessonError('No se pudo subir el video. Si es pesado, súbelo a Google Drive y pega el enlace.');
    } finally {
      setUploadingLesson(false);
      e.target.value = '';
    }
  };

  const submitNewLesson = (moduleId: string) => {
    if (!lessonTitle.trim()) return;
    const link = lessonLink.trim();
    addClassroomLesson(moduleId, lessonTitle.trim(), link || lessonFileUrl || undefined, link ? 'Enlace externo' : lessonFileName || undefined);
    setLessonTitle(''); setLessonFileName(''); setLessonFileUrl(''); setLessonLink(''); setLessonError(null); setAddingLessonToModule(null);
  };

  const submitModuleColor = (color: string) => {
    if (!newModuleTitle.trim()) return;
    addClassroomModule(newModuleTitle.trim(), newModuleDesc.trim(), color);
    setNewModuleTitle(''); setNewModuleDesc(''); setShowNewModule(false);
  };

  // --- Vista de un módulo abierto ---
  if (selectedModule) {
    return (
      <div className="px-6 xl:px-8 py-6 max-w-[1100px] mx-auto space-y-5 animate-fadeIn">
        <button
          onClick={() => setSelectedClassroomModuleId(null)}
          className="flex items-center gap-1.5 text-sm text-muted hover:text-text transition-colors"
        >
          <ArrowLeft size={16} /> Volver a Classroom
        </button>

        <div className="bg-surface-2 border border-line rounded-xl p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-md mb-2 ${COLOR_MAP[selectedModule.color]}`}>
                <BookOpen size={12} /> {selectedModule.title}
              </p>
              <p className="text-sm text-muted">{selectedModule.desc}</p>
            </div>
            {isAdmin && (
              <button
                onClick={() => setAddingLessonToModule(m => (m === selectedModule.id ? null : selectedModule.id))}
                className="text-sm text-accent hover:text-accent-strong flex items-center gap-1 shrink-0"
              >
                <Plus size={14} /> Subir clase
              </button>
            )}
          </div>

          {isAdmin && addingLessonToModule === selectedModule.id && (
            <div className="mt-4 space-y-2 p-3 bg-surface-3 rounded-lg">
              <input
                value={lessonTitle}
                onChange={e => setLessonTitle(e.target.value)}
                placeholder="Título de la clase"
                className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent"
              />
              <label className={`block bg-surface-2 border border-line border-dashed rounded-md px-3 py-2 text-sm text-muted transition-colors ${uploadingLesson || lessonLink.trim() ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:border-accent hover:text-accent'}`}>
                <span className="flex items-center gap-2">
                  {uploadingLesson ? <Loader2 size={14} className="animate-spin text-accent" /> : lessonFileUrl ? <CheckCircle2 size={14} className="text-mint" /> : <Upload size={14} />}
                  <span className="truncate flex-1">{lessonFileName || 'Subir video de la clase'}</span>
                  {uploadingLesson && <span className="font-tech text-xs text-accent">{lessonPct}%</span>}
                </span>
                {uploadingLesson && (
                  <span className="block w-full h-1 bg-surface-3 rounded-full overflow-hidden mt-2">
                    <span className="block h-full bg-accent transition-all duration-150" style={{ width: `${lessonPct}%` }} />
                  </span>
                )}
                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleLessonFile} disabled={uploadingLesson || Boolean(lessonLink.trim())} />
              </label>
              <div className="flex items-center gap-2 bg-surface-2 border border-line rounded-md px-3 focus-within:border-accent transition-colors">
                <Link2 size={14} className="text-muted-2 shrink-0" />
                <input
                  value={lessonLink}
                  onChange={e => setLessonLink(e.target.value)}
                  placeholder="…o pega un enlace (Google Drive, YouTube, Loom)"
                  className="flex-1 bg-transparent py-2 text-sm text-text placeholder:text-muted-2 outline-none"
                />
              </div>
              {lessonError && (
                <p className="text-xs text-red-400 flex items-center gap-1.5"><AlertCircle size={12} /> {lessonError}</p>
              )}
              <button
                onClick={() => submitNewLesson(selectedModule.id)}
                disabled={!lessonTitle.trim() || uploadingLesson}
                className="w-full bg-accent text-on-accent rounded-md py-2 text-sm font-medium hover:bg-accent-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploadingLesson ? `Subiendo video (${lessonPct}%)...` : 'Guardar clase'}
              </button>
            </div>
          )}
        </div>

        {selectedModule.lessons.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">Este módulo todavía no tiene clases subidas.</p>
        ) : (
          <div className="space-y-3">
            {selectedModule.lessons.map(lesson => {
              const done = myCompleted.includes(lesson.id);
              return (
                <div key={lesson.id} className="bg-surface-2 border border-line rounded-xl overflow-hidden">
                  {lesson.videoUrl && (
                    <div className="bg-black aspect-video w-full">
                      {embedUrl(lesson.videoUrl) ? (
                        <iframe
                          src={embedUrl(lesson.videoUrl) || undefined}
                          className="w-full h-full border-0"
                          allow="autoplay; encrypted-media; fullscreen"
                          allowFullScreen
                          title={lesson.title}
                        />
                      ) : (
                        <video
                          src={lesson.videoUrl}
                          controls
                          className="w-full h-full"
                          onEnded={() => { if (!isAdmin) markLessonComplete(currentWorkerId, lesson.id); }}
                        />
                      )}
                    </div>
                  )}
                  <div className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {done ? <CheckCircle2 size={16} className="text-mint shrink-0" /> : <Play size={16} className="text-muted-2 shrink-0" />}
                      <p className="text-sm font-medium truncate">{lesson.title}</p>
                    </div>
                    {isAdmin ? (
                      <button
                        onClick={() => { if (window.confirm(`¿Eliminar la clase "${lesson.title}"?`)) deleteClassroomLesson(selectedModule.id, lesson.id); }}
                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 shrink-0"
                      >
                        <Trash2 size={13} /> Eliminar
                      </button>
                    ) : (
                      !done && (
                        <button
                          onClick={() => markLessonComplete(currentWorkerId, lesson.id)}
                          className="text-xs text-accent hover:text-accent-strong shrink-0"
                        >
                          Marcar completada
                        </button>
                      )
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // --- Vista general (lista de módulos) ---
  const pctAll = totalLessons ? Math.round((doneLessons / totalLessons) * 100) : 0;
  const nextLesson = (() => {
    for (const m of classroomModules) {
      const l = m.lessons.find(x => !myCompleted.includes(x.id));
      if (l) return { m, l };
    }
    return null;
  })();
  const allLessonIds = classroomModules.flatMap(m => m.lessons.map(l => l.id));
  const teamProgress = workers
    .map(w => {
      const done = (lessonCompletions[w.id] || []).filter(id => allLessonIds.includes(id)).length;
      return { w, done, pct: totalLessons ? Math.round((done / totalLessons) * 100) : 0 };
    })
    .sort((a, b) => a.pct - b.pct);

  const removeModule = (id: string, title: string, lessons: number) => {
    if (!window.confirm(`¿Eliminar el módulo "${title}"${lessons ? ` y sus ${lessons} clase(s)` : ''}? No se puede deshacer.`)) return;
    deleteClassroomModule(id);
  };

  return (
    <div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fadeIn">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-[0.18em] text-accent flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" /> En vivo
          </p>
          <h2 className="font-display text-3xl xl:text-4xl font-bold mt-1">Classroom</h2>
          <p className="text-muted text-sm mt-1">
            {isAdmin ? `Academia Senda · ${classroomModules.length} módulo(s) · ${totalLessons} clase(s). Al subir una clase, el equipo recibe el aviso.` : 'Capacitaciones del equipo: aprende a tu ritmo y marca cada clase al terminarla.'}
          </p>
        </div>
        {isAdmin && (
          <button
            onClick={() => setShowNewModule(s => !s)}
            className="bg-accent text-on-accent rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-accent-strong transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(53,214,228,0.25)] self-start xl:self-auto"
          >
            <FolderPlus size={16} /> Nuevo módulo
          </button>
        )}
      </div>

      {isAdmin && showNewModule && (
        <div className="glow-card bg-surface-2 border border-accent/30 rounded-xl p-5 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <p className="font-display font-semibold flex items-center gap-2"><FolderPlus size={16} className="text-accent" /> Nuevo módulo</p>
            <button onClick={() => setShowNewModule(false)} aria-label="Cerrar" className="text-muted hover:text-text"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input autoFocus value={newModuleTitle} onChange={e => setNewModuleTitle(e.target.value)} placeholder="Título del módulo (ej. Edición básica)" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            <input value={newModuleDesc} onChange={e => setNewModuleDesc(e.target.value)} placeholder="Descripción corta" className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted">Elige un color para crearlo:</span>
            {COLORS.map(c => (
              <button key={c} onClick={() => submitModuleColor(c)} disabled={!newModuleTitle.trim()} title="Crear con este color"
                className={`w-8 h-8 rounded-lg border border-line hover:scale-110 transition-transform disabled:opacity-40 disabled:hover:scale-100 flex items-center justify-center ${COLOR_MAP[c]}`}>
                <BookOpen size={14} />
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8">
          {classroomModules.length === 0 ? (
            <EmptyState
              icon={<GraduationCap size={20} />}
              title="Aún no hay módulos"
              text={isAdmin ? 'Crea el primer módulo y sube clases (video, Drive, YouTube o Loom).' : 'El admin todavía no ha subido capacitaciones.'}
              action={isAdmin ? { label: 'Nuevo módulo', onClick: () => setShowNewModule(true) } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {classroomModules.map(m => {
                const done = m.lessons.filter(l => myCompleted.includes(l.id)).length;
                const pct = m.lessons.length ? Math.round((done / m.lessons.length) * 100) : 0;
                const isComplete = m.lessons.length > 0 && done === m.lessons.length;
                return (
                  <div key={m.id} onClick={() => setSelectedClassroomModuleId(m.id)}
                    className="glow-card group bg-surface-2 border border-line rounded-xl p-5 cursor-pointer hover:-translate-y-0.5 hover:border-accent/40 transition-all flex flex-col">
                    <div className="flex items-start justify-between gap-3">
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${COLOR_MAP[m.color]}`}>
                        {isComplete ? <CheckCircle2 size={20} /> : <BookOpen size={20} />}
                      </div>
                      {isAdmin && (
                        <button onClick={e => { e.stopPropagation(); removeModule(m.id, m.title, m.lessons.length); }} title="Eliminar módulo"
                          className="text-muted-2 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={14} /></button>
                      )}
                    </div>
                    <h3 className="font-display text-base font-semibold mt-3 truncate">{m.title}</h3>
                    <p className="text-sm text-muted mt-1 line-clamp-2 flex-1">{m.desc || 'Sin descripción'}</p>
                    <div className="mt-4">
                      {!isAdmin && (
                        <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden mb-2">
                          <div className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-mint' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-2 font-tech">{isAdmin ? `${m.lessons.length} clase(s)` : `${done}/${m.lessons.length} · ${pct}%`}</span>
                        <span className={`font-medium flex items-center gap-1 ${isComplete && !isAdmin ? 'text-mint' : 'text-accent'}`}>
                          {isAdmin ? <><Upload size={13} /> Gestionar</> : <><Play size={13} /> {isComplete ? 'Repasar' : m.lessons.length ? (done ? 'Continuar' : 'Empezar') : 'Sin clases aún'}</>}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="lg:col-span-4 space-y-5">
          {isAdmin ? (
            <GlowCard tone="mint" contentClassName="p-5">
              <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
                <Award size={18} className="text-mint" /> Progreso del equipo
              </h3>
              {teamProgress.length === 0 || totalLessons === 0 ? (
                <p className="text-sm text-muted">{totalLessons === 0 ? 'Sube clases para ver el avance de cada persona.' : 'Aún no hay personas en el equipo.'}</p>
              ) : (
                <div className="space-y-3">
                  {teamProgress.map(({ w, done, pct }) => (
                    <div key={w.id}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate">{w.name}</span>
                        <span className={`font-tech text-xs ${pct === 100 ? 'text-mint' : pct === 0 ? 'text-amber' : 'text-muted'}`}>{done}/{totalLessons}</span>
                      </div>
                      <div className="h-1.5 bg-surface-3 rounded-full overflow-hidden mt-1">
                        <div className={`h-full rounded-full ${pct === 100 ? 'bg-mint' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </GlowCard>
          ) : (
            <>
              <GlowCard tone="mint" contentClassName="p-5">
                <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
                  <Award size={18} className="text-mint" /> Tu progreso
                </h3>
                <p className="font-display text-4xl font-bold text-mint">{pctAll}%</p>
                <p className="text-xs text-muted-2 mt-1">{doneLessons} de {totalLessons} clase(s) completadas</p>
                <div className="h-2 bg-surface-3 rounded-full mt-3 overflow-hidden">
                  <div className="h-full bg-mint rounded-full transition-all duration-500" style={{ width: `${pctAll}%` }} />
                </div>
              </GlowCard>
              <GlowCard tone="accent" contentClassName="p-5">
                <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
                  <Play size={18} className="text-accent" /> Siguiente clase
                </h3>
                {nextLesson ? (
                  <button onClick={() => setSelectedClassroomModuleId(nextLesson.m.id)} className="w-full text-left bg-surface-3 border border-line rounded-lg p-3 hover:border-accent/40 transition-colors">
                    <p className="text-sm font-medium truncate">{nextLesson.l.title}</p>
                    <p className="text-[11px] text-muted-2 mt-0.5">{nextLesson.m.title}</p>
                  </button>
                ) : (
                  <p className="text-sm text-muted">{totalLessons ? '¡Completaste todas las clases! 🎉' : 'Aún no hay clases.'}</p>
                )}
              </GlowCard>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
