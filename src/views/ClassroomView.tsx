import { useStore } from '../store';
import { GraduationCap, Play, CheckCircle2, BookOpen, Award, ArrowLeft, Plus, Trash2, Upload, FolderPlus, X } from 'lucide-react';
import { useRef, useState } from 'react';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
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
    role, currentWorkerId,
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

  const myCompleted = lessonCompletions[currentWorkerId] || [];
  const totalLessons = classroomModules.reduce((s, m) => s + m.lessons.length, 0);
  const doneLessons = classroomModules.reduce((s, m) => s + m.lessons.filter(l => myCompleted.includes(l.id)).length, 0);

  const selectedModule = classroomModules.find(m => m.id === selectedClassroomModuleId);

  const handleLessonFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const dataUrl = await fileToDataUrl(f);
      setLessonFileName(f.name);
      setLessonFileUrl(dataUrl);
    }
  };

  const submitNewLesson = (moduleId: string) => {
    if (!lessonTitle.trim()) return;
    addClassroomLesson(moduleId, lessonTitle.trim(), lessonFileUrl || undefined, lessonFileName || undefined);
    setLessonTitle(''); setLessonFileName(''); setLessonFileUrl(''); setAddingLessonToModule(null);
  };

  const submitModuleColor = (color: string) => {
    if (!newModuleTitle.trim()) return;
    addClassroomModule(newModuleTitle.trim(), newModuleDesc.trim(), color);
    setNewModuleTitle(''); setNewModuleDesc(''); setShowNewModule(false);
  };

  // --- Vista de un módulo abierto ---
  if (selectedModule) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
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
              <label className="flex items-center gap-2 bg-surface-2 border border-line border-dashed rounded-md px-3 py-2 text-sm text-muted cursor-pointer hover:border-accent transition-colors">
                <Upload size={14} />
                {lessonFileName || 'Subir video de la clase'}
                <input ref={fileInputRef} type="file" accept="video/*" className="hidden" onChange={handleLessonFile} />
              </label>
              <button
                onClick={() => submitNewLesson(selectedModule.id)}
                className="w-full bg-accent text-on-accent rounded-md py-2 text-sm font-medium hover:bg-accent-strong transition-colors"
              >
                Guardar clase
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
                      <video
                        src={lesson.videoUrl}
                        controls
                        className="w-full h-full"
                        onPlay={() => { if (!isAdmin) markLessonComplete(currentWorkerId, lesson.id); }}
                      />
                    </div>
                  )}
                  <div className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      {done ? <CheckCircle2 size={16} className="text-mint shrink-0" /> : <Play size={16} className="text-muted-2 shrink-0" />}
                      <p className="text-sm font-medium truncate">{lesson.title}</p>
                    </div>
                    {isAdmin ? (
                      <button
                        onClick={() => deleteClassroomLesson(selectedModule.id, lesson.id)}
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
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent-dim flex items-center justify-center">
            <GraduationCap size={28} className="text-accent" />
          </div>
          <div className="flex-1">
            <h2 className="font-display text-xl font-semibold">Academia Senda</h2>
            {isAdmin ? (
              <p className="text-sm text-muted">{classroomModules.length} módulos · {totalLessons} clases subidas</p>
            ) : (
              <p className="text-sm text-muted">Progreso: {doneLessons} de {totalLessons} lecciones completadas</p>
            )}
          </div>
          {!isAdmin && (
            <div className="flex items-center gap-2 text-mint">
              <Award size={20} />
              <span className="font-display text-2xl font-bold">{totalLessons ? Math.round((doneLessons / totalLessons) * 100) : 0}%</span>
            </div>
          )}
          {isAdmin && (
            <button
              onClick={() => setShowNewModule(s => !s)}
              className="text-sm bg-accent text-on-accent rounded-lg px-3 py-2 font-medium hover:bg-accent-strong transition-colors flex items-center gap-1.5 shrink-0"
            >
              <FolderPlus size={16} /> Nuevo módulo
            </button>
          )}
        </div>
        {!isAdmin && (
          <div className="h-2 bg-surface-3 rounded-full mt-4 overflow-hidden">
            <div className="h-full bg-mint rounded-full transition-all duration-500" style={{ width: `${totalLessons ? (doneLessons / totalLessons) * 100 : 0}%` }} />
          </div>
        )}
        {isAdmin && showNewModule && (
          <div className="mt-4 space-y-2 p-3 bg-surface-3 rounded-lg">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">Nueva carpeta / módulo</p>
              <button onClick={() => setShowNewModule(false)} className="text-muted hover:text-text"><X size={16} /></button>
            </div>
            <input value={newModuleTitle} onChange={e => setNewModuleTitle(e.target.value)} placeholder="Título del módulo" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            <input value={newModuleDesc} onChange={e => setNewModuleDesc(e.target.value)} placeholder="Descripción" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
            <div className="flex gap-2">
              {COLORS.map(c => (
                <button key={c} onClick={() => submitModuleColor(c)} className={`w-7 h-7 rounded-full border-2 border-line ${COLOR_MAP[c].split(' ')[1]}`} />
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {classroomModules.map(m => {
          const done = m.lessons.filter(l => myCompleted.includes(l.id)).length;
          const pct = m.lessons.length ? Math.round((done / m.lessons.length) * 100) : 0;
          const isComplete = m.lessons.length > 0 && done === m.lessons.length;
          return (
            <div key={m.id} className="bg-surface-2 border border-line rounded-xl p-5">
              <div className="flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${COLOR_MAP[m.color]}`}>
                  {isComplete ? <CheckCircle2 size={22} /> : <BookOpen size={22} />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-display text-base font-semibold truncate">{m.title}</h3>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-xs text-muted-2">{isAdmin ? `${m.lessons.length} clases` : `${done}/${m.lessons.length} lecciones`}</span>
                      {isAdmin && (
                        <button
                          onClick={() => deleteClassroomModule(m.id)}
                          title="Eliminar módulo"
                          className="text-muted-2 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted mt-1">{m.desc}</p>
                  <div className="flex items-center gap-3 mt-3">
                    {!isAdmin && (
                      <div className="flex-1 h-1.5 bg-surface-3 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-mint' : 'bg-accent'}`} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                    <button
                      onClick={() => setSelectedClassroomModuleId(m.id)}
                      className={`text-sm font-medium flex items-center gap-1 ${isAdmin ? 'text-accent hover:text-accent-strong' : isComplete ? 'text-mint' : 'text-accent hover:text-accent-strong'}`}
                    >
                      {isAdmin ? <><Upload size={14} /> Gestionar clases</> : <><Play size={14} /> {isComplete ? 'Repasar' : m.lessons.length ? 'Continuar' : 'Sin clases aún'}</>}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {classroomModules.length === 0 && (
          <p className="text-sm text-muted text-center py-8">Aún no hay módulos creados.</p>
        )}
      </div>
    </div>
  );
}
