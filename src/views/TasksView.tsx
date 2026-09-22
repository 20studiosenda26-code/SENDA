import { useStore } from '../store';
import type { Video, QcStatus } from '../types';
import { Play, Clock, AlertCircle, CheckCircle2, Plus, X, Film, MessageSquare, Upload } from 'lucide-react';
import { useState } from 'react';

export function TasksView() {
  const { brands, role, currentWorkerId, setQc, addClip, addCorrection, setSelectedVideo, selectedVideo } = useStore();
  const allVideos = brands.flatMap(b => b.videos).filter(v =>
    role === 'clipper' ? v.clipperId === currentWorkerId : v.editorId === currentWorkerId
  );
  const grouped = {
    sin_iniciar: allVideos.filter(v => v.qc === 'sin_iniciar'),
    pendiente: allVideos.filter(v => v.qc === 'pendiente'),
    revision: allVideos.filter(v => v.qc === 'revision' || v.qc === 'correcciones'),
    aprobado: allVideos.filter(v => v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente'),
  };

  if (selectedVideo) {
    return <VideoDetail video={selectedVideo} onClose={() => setSelectedVideo(null)} onSetQc={setQc} onAddClip={addClip} onAddCorrection={addCorrection} role={role} />;
  }

  const columns: { key: QcStatus | 'revision' | 'aprobado'; label: string; color: string }[] = [
    { key: 'sin_iniciar', label: 'Sin iniciar', color: 'border-muted-2' },
    { key: 'pendiente', label: 'Pendiente', color: 'border-amber' },
    { key: 'revision', label: 'Revisión / Correcciones', color: 'border-accent' },
    { key: 'aprobado', label: 'Aprobado', color: 'border-mint' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {columns.map(col => (
          <div key={col.key} className={`bg-surface-2 border-t-2 ${col.color} border-r border-b border-line rounded-xl p-4 min-h-[200px]`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-muted">{col.label}</h3>
              <span className="text-xs text-muted-2 bg-surface-3 px-2 py-0.5 rounded">{grouped[col.key as keyof typeof grouped].length}</span>
            </div>
            <div className="space-y-2">
              {grouped[col.key as keyof typeof grouped].map(v => (
                <button
                  key={v.id}
                  onClick={() => setSelectedVideo(v)}
                  className="w-full text-left bg-surface-3 hover:bg-surface-2 border border-line rounded-lg p-3 transition-colors group"
                >
                  <div className="flex items-start gap-2">
                    <div className="w-8 h-8 rounded bg-accent-dim flex items-center justify-center shrink-0">
                      <Play size={14} className="text-accent" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.name}</p>
                      <p className="text-xs text-muted mt-0.5">{v.clipperName} → {v.editorName}</p>
                      {v.duration && <p className="text-xs text-muted-2 mt-0.5">{v.duration}</p>}
                    </div>
                  </div>
                </button>
              ))}
              {grouped[col.key as keyof typeof grouped].length === 0 && (
                <p className="text-xs text-muted-2 text-center py-4">Sin videos</p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function VideoDetail({ video, onClose, onSetQc, onAddClip, onAddCorrection, role }: {
  video: Video;
  onClose: () => void;
  onSetQc: (id: string, s: QcStatus) => void;
  onAddClip: (id: string, name: string, note: string) => void;
  onAddCorrection: (id: string, time: number, text: string) => void;
  role: string;
}) {
  const [showClipForm, setShowClipForm] = useState(false);
  const [showCorrForm, setShowCorrForm] = useState(false);
  const [clipName, setClipName] = useState('');
  const [clipNote, setClipNote] = useState('');
  const [corrTime, setCorrTime] = useState('');
  const [corrText, setCorrText] = useState('');

  const qcOptions: QcStatus[] = ['sin_iniciar', 'pendiente', 'revision', 'correcciones', 'aprobado_senda', 'aprobado_cliente'];

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-muted hover:text-text transition-colors">
          <X size={18} />
        </button>
        <div>
          <h2 className="font-display text-2xl font-bold">{video.name}</h2>
          <p className="text-sm text-muted">{video.clipperName} → {video.editorName} · {video.date}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-2 border border-line rounded-xl p-5 space-y-4">
          <div className="aspect-video bg-surface-3 rounded-lg flex items-center justify-center">
            <div className="text-center">
              <Film size={40} className="text-muted-2 mx-auto mb-2" />
              <p className="text-sm text-muted">Vista previa del video</p>
              {video.duration && <p className="text-xs text-muted-2 mt-1">{video.duration}</p>}
            </div>
          </div>
          <div>
            <p className="text-sm font-medium mb-2">Estado de QC</p>
            <div className="flex flex-wrap gap-2">
              {qcOptions.map(q => (
                <button
                  key={q}
                  onClick={() => onSetQc(video.id, q)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                    video.qc === q ? 'bg-accent text-on-accent border-accent' : 'bg-surface-3 text-muted border-line hover:text-text'
                  }`}
                >
                  {q.replace(/_/g, ' ')}
                </button>
              ))}
            </div>
          </div>
          {role === 'admin' && (
            <div className="flex gap-2">
              <span className={`text-xs px-2 py-1 rounded ${video.paid50 ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted'}`}>
                Pago 50%: {video.paid50 ? 'Liberado' : 'Pendiente'}
              </span>
              <span className={`text-xs px-2 py-1 rounded ${video.paid100 ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted'}`}>
                Pago 100%: {video.paid100 ? 'Liberado' : 'Pendiente'}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-surface-2 border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <Film size={16} className="text-accent" /> Clips marcados
              </h3>
              <button onClick={() => setShowClipForm(s => !s)} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
                <Plus size={14} /> Agregar
              </button>
            </div>
            {showClipForm && (
              <div className="mb-3 space-y-2 p-3 bg-surface-3 rounded-lg">
                <input value={clipName} onChange={e => setClipName(e.target.value)} placeholder="Nombre del clip" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
                <input value={clipNote} onChange={e => setClipNote(e.target.value)} placeholder="Nota" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
                <button onClick={() => { if (clipName) { onAddClip(video.id, clipName, clipNote); setClipName(''); setClipNote(''); setShowClipForm(false); } }} className="w-full bg-accent text-on-accent rounded-md py-2 text-sm font-medium hover:bg-accent-strong transition-colors">
                  Guardar clip
                </button>
              </div>
            )}
            {video.clips.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">Sin clips marcados</p>
            ) : (
              <div className="space-y-2">
                {video.clips.map(c => (
                  <div key={c.id} className="flex items-start gap-2 p-2 bg-surface-3 rounded-lg">
                    <CheckCircle2 size={14} className="text-mint mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-medium">{c.name}</p>
                      {c.note && <p className="text-xs text-muted">{c.note}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface-2 border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <MessageSquare size={16} className="text-amber" /> Correcciones
              </h3>
              <button onClick={() => setShowCorrForm(s => !s)} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
                <Plus size={14} /> Agregar
              </button>
            </div>
            {showCorrForm && (
              <div className="mb-3 space-y-2 p-3 bg-surface-3 rounded-lg">
                <input value={corrTime} onChange={e => setCorrTime(e.target.value)} placeholder="Tiempo (seg)" type="number" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
                <input value={corrText} onChange={e => setCorrText(e.target.value)} placeholder="Descripción" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
                <button onClick={() => { if (corrText) { onAddCorrection(video.id, parseInt(corrTime) || 0, corrText); setCorrTime(''); setCorrText(''); setShowCorrForm(false); } }} className="w-full bg-accent text-on-accent rounded-md py-2 text-sm font-medium hover:bg-accent-strong transition-colors">
                  Guardar corrección
                </button>
              </div>
            )}
            {video.corrections.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">Sin correcciones</p>
            ) : (
              <div className="space-y-2">
                {video.corrections.map((c, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 bg-surface-3 rounded-lg">
                    <AlertCircle size={14} className="text-amber mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs text-amber font-mono">{c.time}s</span>
                      <p className="text-sm">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {role === 'admin' && (
            <div className="flex gap-2">
              <button onClick={() => onSetQc(video.id, 'aprobado_senda')} className="flex-1 bg-mint-dim text-mint border border-mint/30 rounded-lg py-2.5 text-sm font-medium hover:bg-mint/10 transition-colors flex items-center justify-center gap-2">
                <CheckCircle2 size={16} /> Aprobar Senda
              </button>
              <button className="flex-1 bg-accent text-on-accent rounded-lg py-2.5 text-sm font-medium hover:bg-accent-strong transition-colors flex items-center justify-center gap-2">
                <Upload size={16} /> Subir final
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
