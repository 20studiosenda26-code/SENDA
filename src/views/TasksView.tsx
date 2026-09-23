import { useStore } from '../store';
import type { Video, QcStatus, ClipStatus, Correction, MainImageStatus, Clip } from '../types';
import { uploadSharedFile } from '../lib/supabaseClient';
import {
  Play, AlertCircle, CheckCircle2, Plus, X, Film, MessageSquare, Upload,
  FileText, Download, Lock, Send, Eye, Image as ImageIcon, Video as VideoIcon,
  ThumbsUp, ThumbsDown, Check, RotateCcw, Flag, Loader2,
} from 'lucide-react';
import { useState, useRef, useCallback, useEffect } from 'react';

function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function clipStatusLabel(status?: ClipStatus | null) {
  if (status === 'approved') return 'Aceptado';
  if (status === 'rejected') return 'Rechazado';
  return 'Pendiente de revisión';
}

function clipStatusClasses(status?: ClipStatus | null) {
  if (status === 'approved') return 'bg-mint-dim text-mint';
  if (status === 'rejected') return 'bg-red-500/10 text-red-400';
  return 'bg-amber-dim text-amber';
}

function isImageFile(name?: string | null) {
  if (!name) return false;
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}

function VideoTimeline({
  durationSeconds,
  corrections,
  editable,
  onDragTime,
  onTimelineClick,
}: {
  durationSeconds: number;
  corrections: Correction[];
  editable: boolean;
  onDragTime: (correctionId: string, time: number) => void;
  onTimelineClick?: (time: number) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const timeFromClientX = useCallback((clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const rect = el.getBoundingClientRect();
    const pct = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(pct * durationSeconds);
  }, [durationSeconds]);

  useEffect(() => {
    if (!draggingId) return;
    const move = (e: MouseEvent) => onDragTime(draggingId, timeFromClientX(e.clientX));
    const up = () => setDraggingId(null);
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    return () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
  }, [draggingId, onDragTime, timeFromClientX]);

  return (
    <div className="pt-1">
      <div
        ref={trackRef}
        onClick={e => {
          if (!editable || !onTimelineClick) return;
          onTimelineClick(timeFromClientX(e.clientX));
        }}
        className={`relative h-8 flex items-center ${editable ? 'cursor-pointer' : ''}`}
      >
        <div className="w-full h-[2px] bg-line rounded-full" />
        {corrections.map(c => {
          const pct = Math.min(100, Math.max(0, (c.time / Math.max(durationSeconds, 1)) * 100));
          return (
            <div
              key={c.id}
              onMouseDown={e => { if (!editable) return; e.stopPropagation(); setDraggingId(c.id); }}
              title={`${fmtTime(c.time)} · ${c.text}`}
              className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-[3px] h-6 bg-red-500 rounded-full ${editable ? 'cursor-ew-resize hover:w-1' : ''}`}
              style={{ left: `${pct}%` }}
            />
          );
        })}
      </div>
      <div className="flex justify-between text-[10px] text-muted-2 mt-1">
        <span>0:00</span>
        <span>{fmtTime(durationSeconds)}</span>
      </div>
    </div>
  );
}

export function TasksView() {
  const {
    brands, role, currentWorkerId, setQc, addClip, replaceClip, setClipStatus, setClipMarkerTime, acceptAllClips,
    addCorrection, updateCorrectionTime,
    uploadBrief, addFinalVideo, uploadMainImage, setMainImageStatus, sendVideo,
    setSelectedVideo, selectedVideo,
  } = useStore();
  const allVideos = brands.flatMap(b => b.videos).filter(v =>
    role === 'admin' ? true : role === 'clipper' ? v.clipperId === currentWorkerId : v.editorId === currentWorkerId
  );
  const grouped = {
    sin_iniciar: allVideos.filter(v => v.qc === 'sin_iniciar'),
    pendiente: allVideos.filter(v => v.qc === 'pendiente'),
    revision: allVideos.filter(v => v.qc === 'revision' || v.qc === 'correcciones'),
    aprobado: allVideos.filter(v => v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente'),
  };

  if (selectedVideo) {
    return (
      <VideoDetail
        video={selectedVideo}
        onClose={() => setSelectedVideo(null)}
        onSetQc={setQc}
        onAddClip={addClip}
        onReplaceClip={replaceClip}
        onSetClipStatus={setClipStatus}
        onSetClipMarkerTime={setClipMarkerTime}
        onAcceptAllClips={acceptAllClips}
        onAddCorrection={addCorrection}
        onUpdateCorrectionTime={updateCorrectionTime}
        onUploadBrief={uploadBrief}
        onAddFinalVideo={addFinalVideo}
        onUploadMainImage={uploadMainImage}
        onSetMainImageStatus={setMainImageStatus}
        onSendVideo={sendVideo}
        role={role}
      />
    );
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

function VideoDetail({
  video, onClose, onSetQc, onAddClip, onReplaceClip, onSetClipStatus, onSetClipMarkerTime, onAcceptAllClips,
  onAddCorrection, onUpdateCorrectionTime,
  onUploadBrief, onAddFinalVideo, onUploadMainImage, onSetMainImageStatus, onSendVideo, role,
}: {
  video: Video;
  onClose: () => void;
  onSetQc: (id: string, s: QcStatus) => void;
  onAddClip: (id: string, name: string, note: string, fileName?: string, fileUrl?: string) => void;
  onReplaceClip: (id: string, clipId: string, fileName: string, fileUrl: string) => void;
  onSetClipStatus: (id: string, clipId: string, status: ClipStatus, reason?: string) => void;
  onSetClipMarkerTime: (id: string, clipId: string, time: number) => void;
  onAcceptAllClips: (id: string) => void;
  onAddCorrection: (id: string, time: number, text: string) => void;
  onUpdateCorrectionTime: (id: string, correctionId: string, time: number) => void;
  onUploadBrief: (id: string, fileName: string, fileUrl: string) => void;
  onAddFinalVideo: (id: string, name: string, note: string, fileName?: string, fileUrl?: string) => void;
  onUploadMainImage: (id: string, fileName: string, fileUrl: string) => void;
  onSetMainImageStatus: (id: string, status: MainImageStatus, comment: string) => void;
  onSendVideo: (id: string) => void;
  role: string;
}) {
  const [showClipForm, setShowClipForm] = useState(false);
  const [showCorrForm, setShowCorrForm] = useState(false);
  const [showFinalForm, setShowFinalForm] = useState(false);
  const [clipName, setClipName] = useState('');
  const [clipNote, setClipNote] = useState('');
  const [clipFileName, setClipFileName] = useState('');
  const [clipFileUrl, setClipFileUrl] = useState('');
  const [finalName, setFinalName] = useState('');
  const [finalNote, setFinalNote] = useState('');
  const [finalFileName, setFinalFileName] = useState('');
  const [finalFileUrl, setFinalFileUrl] = useState('');
  const [corrTime, setCorrTime] = useState('');
  const [corrText, setCorrText] = useState('');
  const [mainImageComment, setMainImageComment] = useState('');
  const [previewOpenId, setPreviewOpenId] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [confirmAcceptAll, setConfirmAcceptAll] = useState(false);
  const [uploadingClipId, setUploadingClipId] = useState<string | null>(null);
  const [uploadingNewClip, setUploadingNewClip] = useState(false);
  const briefInputRef = useRef<HTMLInputElement>(null);
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const playerRef = useRef<HTMLVideoElement>(null);

  const isAdmin = role === 'admin';
  const isClipper = role === 'clipper';
  const isEditor = role === 'editor';
  const qcOptions: QcStatus[] = ['sin_iniciar', 'pendiente', 'revision', 'correcciones', 'aprobado_senda', 'aprobado_cliente'];
  const mainImageApproved = video.mainImageStatus === 'aprobada';

  // Clip que se está mostrando en el reproductor integrado de la página.
  // Por defecto, si solo hay un clip, se elige automáticamente.
  const activeClip: Clip | null =
    video.clips.find(c => c.id === activeClipId) ||
    (video.clips.length === 1 ? video.clips[0] : null);

  useEffect(() => {
    setShowRejectBox(false);
    setRejectReason('');
  }, [activeClip?.id]);

  const handleClipFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setUploadingNewClip(true);
      try {
        const url = await uploadSharedFile(f, `clips/${video.id}`);
        setClipFileName(f.name);
        setClipFileUrl(url);
      } finally {
        setUploadingNewClip(false);
      }
    }
  };

  // El Clipper reemplaza el archivo de un clip existente (equivocación o
  // corrección tras un rechazo). No crea un clip duplicado: reemplaza el
  // archivo del mismo clip y vuelve a quedar pendiente de revisión.
  const handleReplaceClipFile = async (clipId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setUploadingClipId(clipId);
      try {
        const url = await uploadSharedFile(f, `clips/${video.id}`);
        onReplaceClip(video.id, clipId, f.name, url);
      } finally {
        setUploadingClipId(null);
      }
    }
  };

  const handleFinalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const url = await uploadSharedFile(f, `finals/${video.id}`);
      setFinalFileName(f.name);
      setFinalFileUrl(url);
    }
  };

  const handleBriefFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const url = await uploadSharedFile(f, `briefs/${video.id}`);
      onUploadBrief(video.id, f.name, url);
    }
  };

  const handleMainImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      const url = await uploadSharedFile(f, `main-images/${video.id}`);
      onUploadMainImage(video.id, f.name, url);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-muted hover:text-text transition-colors">
            <X size={18} />
          </button>
          <div>
            <h2 className="font-display text-2xl font-bold">{video.name}</h2>
            <p className="text-sm text-muted">{video.clipperName} → {video.editorName} · {video.date}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Brief / trabajo asignado: visible y descargable para todos, admin lo sube */}
          <div className="flex items-center gap-2 bg-surface-2 border border-line rounded-lg px-3 py-2">
            <FileText size={16} className="text-accent shrink-0" />
            <div className="text-xs">
              <p className="font-medium">Brief / Trabajo asignado</p>
              <p className="text-muted-2 truncate max-w-[160px]">{video.briefFileName || 'Sin archivo'}</p>
            </div>
            {isAdmin && (
              <>
                <input ref={briefInputRef} type="file" className="hidden" onChange={handleBriefFile} />
                <button
                  onClick={() => briefInputRef.current?.click()}
                  className="text-xs bg-accent text-on-accent rounded-md px-2.5 py-1.5 font-medium hover:bg-accent-strong transition-colors flex items-center gap-1"
                >
                  <Upload size={12} /> {video.briefFileName ? 'Reemplazar' : 'Subir'}
                </button>
              </>
            )}
            <a
              href={video.briefFileUrl || undefined}
              download={video.briefFileName || undefined}
              className={`text-xs rounded-md px-2.5 py-1.5 font-medium flex items-center gap-1 transition-colors ${
                video.briefFileUrl ? 'bg-surface-3 text-text hover:bg-line' : 'bg-surface-3 text-muted-2 pointer-events-none'
              }`}
            >
              <Download size={12} /> Descargar
            </a>
          </div>

          {/* Imagen principal: la sube el clíper, la aprueba/rechaza el admin */}
          {(isClipper || isAdmin) && (
            <div className="flex items-center gap-2 bg-surface-2 border border-line rounded-lg px-3 py-2">
              <ImageIcon size={16} className="text-violet shrink-0" />
              <div className="text-xs min-w-[90px]">
                <p className="font-medium">Imagen principal</p>
                <p className="text-muted-2 truncate max-w-[130px]">{video.mainImageFileName || 'Sin imagen'}</p>
                {video.mainImageStatus && (
                  <span className={`inline-block mt-1 text-[10px] px-1.5 py-0.5 rounded ${
                    video.mainImageStatus === 'aprobada' ? 'bg-mint-dim text-mint' :
                    video.mainImageStatus === 'rechazada' ? 'bg-red-500/10 text-red-400' :
                    'bg-amber-dim text-amber'
                  }`}>
                    {video.mainImageStatus === 'aprobada' ? 'Aprobada' : video.mainImageStatus === 'rechazada' ? 'Rechazada' : 'Pendiente de aprobación'}
                  </span>
                )}
                {video.mainImageComment && (
                  <p className="text-[10px] text-muted mt-1 max-w-[150px]">"{video.mainImageComment}"</p>
                )}
              </div>
              {isClipper && (
                <>
                  <input ref={mainImageInputRef} type="file" accept="image/*,*/*" className="hidden" onChange={handleMainImageFile} />
                  <button
                    onClick={() => mainImageInputRef.current?.click()}
                    className="text-xs bg-violet text-on-accent rounded-md px-2.5 py-1.5 font-medium hover:opacity-90 transition-colors flex items-center gap-1 shrink-0"
                  >
                    <Upload size={12} /> {video.mainImageFileName ? 'Reemplazar' : 'Subir'}
                  </button>
                </>
              )}
              {isAdmin && video.mainImageFileName && (
                <div className="flex flex-col gap-1 shrink-0 w-[150px]">
                  <input
                    value={mainImageComment}
                    onChange={e => setMainImageComment(e.target.value)}
                    placeholder="Comentario"
                    className="w-full bg-surface-3 border border-line rounded-md px-2 py-1 text-[11px] text-text placeholder:text-muted-2 outline-none focus:border-accent"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => { onSetMainImageStatus(video.id, 'aprobada', mainImageComment); setMainImageComment(''); }}
                      className="flex-1 bg-mint-dim text-mint rounded-md py-1 text-[11px] font-medium hover:bg-mint/20 flex items-center justify-center gap-1"
                    >
                      <ThumbsUp size={11} /> Aprobar
                    </button>
                    <button
                      onClick={() => { onSetMainImageStatus(video.id, 'rechazada', mainImageComment); setMainImageComment(''); }}
                      className="flex-1 bg-red-500/10 text-red-400 rounded-md py-1 text-[11px] font-medium hover:bg-red-500/20 flex items-center justify-center gap-1"
                    >
                      <ThumbsDown size={11} /> Rechazar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Imagen principal: vista previa independiente del clip/video. No se
          mezcla con el reproductor de clips para evitar errores de asociación. */}
      {(isClipper || isAdmin) && video.mainImageFileUrl && (
        <div className="bg-surface-2 border border-line rounded-xl p-4">
          <p className="text-sm font-medium mb-2 flex items-center gap-2">
            <ImageIcon size={14} className="text-violet" /> Vista previa · Imagen principal
          </p>
          <div className="bg-surface-3 rounded-lg overflow-hidden max-h-72 flex items-center justify-center">
            <img
              src={video.mainImageFileUrl}
              alt={video.mainImageFileName || 'Imagen principal'}
              className="w-full max-h-72 object-contain"
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-2 border border-line rounded-xl p-5 space-y-4">
          {/* Reproductor de clip integrado: al hacer clic sobre un clip en la
              lista de la derecha, se reproduce aquí mismo (sin modal, sin
              ojito, sin ventana externa). */}
          <div className="aspect-video bg-surface-3 rounded-lg flex items-center justify-center overflow-hidden">
            {activeClip?.fileUrl ? (
              isImageFile(activeClip.fileName) ? (
                <img src={activeClip.fileUrl} alt={activeClip.name} className="w-full h-full object-contain" />
              ) : (
                <video
                  key={activeClip.id}
                  ref={playerRef}
                  src={activeClip.fileUrl}
                  controls
                  autoPlay
                  className="w-full h-full object-contain"
                />
              )
            ) : (
              <div className="text-center">
                <Film size={40} className="text-muted-2 mx-auto mb-2" />
                <p className="text-sm text-muted">
                  {video.clips.length > 0 ? 'Selecciona un clip para reproducirlo aquí' : 'Vista previa del video'}
                </p>
                {video.duration && <p className="text-xs text-muted-2 mt-1">{video.duration}</p>}
              </div>
            )}
          </div>

          {activeClip && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium truncate">Clip activo: {activeClip.name}</p>
                <span className={`text-[10px] px-1.5 py-0.5 rounded shrink-0 ${clipStatusClasses(activeClip.status)}`}>
                  {clipStatusLabel(activeClip.status)}
                </span>
              </div>

              {/* Marcador de tiempo del error, asociado directamente a este clip */}
              <div className="flex items-center gap-2 mt-1">
                {isAdmin && (
                  <button
                    onClick={() => {
                      const t = Math.floor(playerRef.current?.currentTime || 0);
                      onSetClipMarkerTime(video.id, activeClip.id, t);
                    }}
                    className="text-[11px] text-amber bg-amber-dim/40 border border-amber/20 rounded-md px-2 py-1 flex items-center gap-1 hover:bg-amber-dim/60 transition-colors shrink-0"
                  >
                    <Flag size={11} /> Marcar momento actual
                  </button>
                )}
                <p className="text-xs text-muted-2">
                  {activeClip.markerTime != null
                    ? <>Momento señalado: <span className="text-amber font-mono">{fmtTime(activeClip.markerTime)}</span></>
                    : 'Sin momento señalado'}
                </p>
              </div>

              {/* Aprobar / Rechazar: solo Admin, controles compactos */}
              {isAdmin && (
                <div className="mt-3 pt-3 border-t border-line">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { onSetClipStatus(video.id, activeClip.id, 'approved'); setShowRejectBox(false); }}
                      title="Aceptar clip"
                      className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ${
                        activeClip.status === 'approved'
                          ? 'bg-mint text-on-accent border-mint'
                          : 'bg-mint-dim text-mint border-mint/30 hover:bg-mint/20'
                      }`}
                    >
                      <Check size={18} />
                    </button>
                    <button
                      onClick={() => setShowRejectBox(s => !s)}
                      title="Rechazar clip"
                      className={`w-10 h-10 rounded-lg border flex items-center justify-center transition-colors ${
                        activeClip.status === 'rejected'
                          ? 'bg-red-500 text-white border-red-500'
                          : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                      }`}
                    >
                      <X size={18} />
                    </button>
                    {activeClip.status && (
                      <span className={`text-xs px-2 py-1 rounded ${clipStatusClasses(activeClip.status)}`}>
                        {clipStatusLabel(activeClip.status)}
                      </span>
                    )}
                  </div>
                  {showRejectBox && (
                    <div className="mt-2 space-y-2">
                      <textarea
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Motivo del rechazo (obligatorio)"
                        rows={2}
                        className="w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent resize-none"
                      />
                      <button
                        onClick={() => {
                          if (rejectReason.trim()) {
                            onSetClipStatus(video.id, activeClip.id, 'rejected', rejectReason.trim());
                            setRejectReason('');
                            setShowRejectBox(false);
                          }
                        }}
                        disabled={!rejectReason.trim()}
                        className="text-xs bg-red-500 text-white rounded-md px-3 py-1.5 font-medium hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        Confirmar rechazo
                      </button>
                    </div>
                  )}
                  {activeClip.status === 'rejected' && activeClip.rejectionReason && (
                    <p className="text-xs text-red-400 mt-2">Motivo: {activeClip.rejectionReason}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <p className="text-sm font-medium">Marcador de tiempo del error</p>
              {!isAdmin && (
                <span className="text-[10px] text-muted-2 flex items-center gap-1"><Lock size={10} /> Solo lectura</span>
              )}
            </div>
            <VideoTimeline
              durationSeconds={video.durationSeconds || 60}
              corrections={video.corrections}
              editable={isAdmin}
              onDragTime={(correctionId, time) => onUpdateCorrectionTime(video.id, correctionId, time)}
              onTimelineClick={time => { setCorrTime(String(time)); setShowCorrForm(true); }}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Estado de QC</p>
              {!isAdmin && (
                <span className="text-[10px] text-muted-2 flex items-center gap-1"><Lock size={10} /> Solo el administrador puede cambiarlo</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {qcOptions.map(q => (
                isAdmin ? (
                  <button
                    key={q}
                    onClick={() => onSetQc(video.id, q)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-colors ${
                      video.qc === q ? 'bg-accent text-on-accent border-accent' : 'bg-surface-3 text-muted border-line hover:text-text'
                    }`}
                  >
                    {q.replace(/_/g, ' ')}
                  </button>
                ) : (
                  <span
                    key={q}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md border cursor-default select-none ${
                      video.qc === q ? 'bg-accent text-on-accent border-accent' : 'bg-surface-3 text-muted border-line opacity-60'
                    }`}
                  >
                    {q.replace(/_/g, ' ')}
                  </span>
                )
              ))}
            </div>
          </div>
          {isAdmin && (
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
          {/* Clips: el clíper los genera y sube, el editor y admin solo los ven/descargan */}
          <div className="bg-surface-2 border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <Film size={16} className="text-accent" /> {isEditor ? 'Clips enviados' : 'Clips generados'}
              </h3>
              {isClipper && mainImageApproved && (
                <button onClick={() => setShowClipForm(s => !s)} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
                  <Plus size={14} /> Agregar
                </button>
              )}
              {isAdmin && video.clips.some(c => c.fileUrl && c.status !== 'approved') && (
                <button onClick={() => setConfirmAcceptAll(true)} className="text-xs bg-mint-dim text-mint rounded-md px-2.5 py-1.5 font-medium hover:bg-mint/20 transition-colors flex items-center gap-1">
                  <Check size={12} /> Aceptar todos los clips
                </button>
              )}
            </div>

            {confirmAcceptAll && (
              <div className="mb-3 p-3 bg-surface-3 border border-line rounded-lg">
                <p className="text-sm mb-2">¿Aceptar todos los clips de esta tarea?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmAcceptAll(false)} className="flex-1 bg-surface-2 border border-line text-muted rounded-md py-1.5 text-xs font-medium hover:text-text transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={() => { onAcceptAllClips(video.id); setConfirmAcceptAll(false); }}
                    className="flex-1 bg-mint text-on-accent rounded-md py-1.5 text-xs font-medium hover:opacity-90 transition-colors"
                  >
                    Aceptar todos
                  </button>
                </div>
              </div>
            )}

            {isClipper && !mainImageApproved && (
              <p className="text-xs text-amber bg-amber-dim/40 border border-amber/20 rounded-lg px-3 py-2 mb-3">
                Debes subir la imagen principal arriba y esperar a que el administrador la apruebe antes de generar y subir clips.
              </p>
            )}

            {showClipForm && (
              <div className="mb-3 space-y-2 p-3 bg-surface-3 rounded-lg">
                <input value={clipName} onChange={e => setClipName(e.target.value)} placeholder="Nombre del clip" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
                <input value={clipNote} onChange={e => setClipNote(e.target.value)} placeholder="Nota" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
                <label className="flex items-center gap-2 bg-surface-2 border border-line border-dashed rounded-md px-3 py-2 text-sm text-muted cursor-pointer hover:border-accent transition-colors">
                  {uploadingNewClip ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {clipFileName || (uploadingNewClip ? 'Subiendo...' : 'Subir archivo de video (cualquier formato)')}
                  <input type="file" className="hidden" onChange={handleClipFile} disabled={uploadingNewClip} />
                </label>
                <button
                  onClick={() => {
                    if (clipName) {
                      onAddClip(video.id, clipName, clipNote, clipFileName || undefined, clipFileUrl || undefined);
                      setClipName(''); setClipNote(''); setClipFileName(''); setClipFileUrl(''); setShowClipForm(false);
                    }
                  }}
                  disabled={uploadingNewClip || !clipName}
                  className="w-full bg-accent text-on-accent rounded-md py-2 text-sm font-medium hover:bg-accent-strong transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Guardar clip
                </button>
              </div>
            )}
            {video.clips.length === 0 ? (
              <p className="text-sm text-muted text-center py-4">Sin clips {isEditor ? 'enviados' : 'generados'}</p>
            ) : (
              <div className="space-y-2">
                {video.clips.map(c => (
                  <div
                    key={c.id}
                    onClick={() => c.fileUrl && setActiveClipId(c.id)}
                    className={`p-2 rounded-lg border transition-colors ${
                      c.fileUrl ? 'cursor-pointer' : ''
                    } ${
                      activeClip?.id === c.id ? 'bg-accent-dim border-accent/40' : 'bg-surface-3 border-transparent hover:border-line'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <Play size={14} className={`mt-0.5 shrink-0 ${activeClip?.id === c.id ? 'text-accent' : 'text-muted-2'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium">{c.name}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded ${clipStatusClasses(c.status)}`}>
                            {clipStatusLabel(c.status)}
                          </span>
                          {(c.version || 1) > 1 && (
                            <span className="text-[10px] text-muted-2">v{c.version}</span>
                          )}
                        </div>
                        {c.note && <p className="text-xs text-muted">{c.note}</p>}
                        {c.status === 'rejected' && c.rejectionReason && (
                          <p className="text-xs text-red-400 mt-0.5">Motivo: {c.rejectionReason}</p>
                        )}
                        {c.fileName && (
                          <a
                            href={c.fileUrl || undefined}
                            download={c.fileName}
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-accent flex items-center gap-1 mt-0.5"
                          >
                            <Download size={11} /> {c.fileName}
                          </a>
                        )}
                      </div>
                      {isClipper && (
                        <div onClick={e => e.stopPropagation()} className="shrink-0">
                          <input
                            ref={el => { replaceInputRefs.current[c.id] = el; }}
                            type="file"
                            className="hidden"
                            onChange={e => handleReplaceClipFile(c.id, e)}
                          />
                          <button
                            onClick={() => replaceInputRefs.current[c.id]?.click()}
                            disabled={uploadingClipId === c.id}
                            className="text-[11px] text-muted hover:text-accent flex items-center gap-1 px-2 py-1 rounded-md bg-surface-2 border border-line disabled:opacity-50"
                          >
                            {uploadingClipId === c.id ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                            {c.fileUrl ? 'Reemplazar' : 'Subir'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
            {isClipper && video.clips.length > 0 && (
              <button
                onClick={() => onSendVideo(video.id)}
                disabled={video.sentByClipper}
                className={`w-full mt-3 rounded-md py-2.5 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
                  video.sentByClipper ? 'bg-mint-dim text-mint cursor-default' : 'bg-accent text-on-accent hover:bg-accent-strong'
                }`}
              >
                {video.sentByClipper ? <><CheckCircle2 size={16} /> Video enviado</> : <><Send size={16} /> Enviar video</>}
              </button>
            )}
          </div>

          {/* Video final: lo sube el editor (no genera clips, genera el video final) */}
          {(isEditor || isAdmin) && (
            <div className="bg-surface-2 border border-line rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-base font-semibold flex items-center gap-2">
                  <VideoIcon size={16} className="text-mint" /> Video final
                </h3>
                {isEditor && (
                  <button onClick={() => setShowFinalForm(s => !s)} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
                    <Plus size={14} /> Agregar
                  </button>
                )}
              </div>
              {showFinalForm && isEditor && (
                <div className="mb-3 space-y-2 p-3 bg-surface-3 rounded-lg">
                  <input value={finalName} onChange={e => setFinalName(e.target.value)} placeholder="Nombre del video" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
                  <input value={finalNote} onChange={e => setFinalNote(e.target.value)} placeholder="Nota" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text placeholder:text-muted-2 outline-none focus:border-accent" />
                  <label className="flex items-center gap-2 bg-surface-2 border border-line border-dashed rounded-md px-3 py-2 text-sm text-muted cursor-pointer hover:border-accent transition-colors">
                    <Upload size={14} />
                    {finalFileName || 'Subir archivo de video (cualquier formato)'}
                    <input type="file" className="hidden" onChange={handleFinalFile} />
                  </label>
                  <button
                    onClick={() => {
                      if (finalName) {
                        onAddFinalVideo(video.id, finalName, finalNote, finalFileName || undefined, finalFileUrl || undefined);
                        setFinalName(''); setFinalNote(''); setFinalFileName(''); setFinalFileUrl(''); setShowFinalForm(false);
                      }
                    }}
                    className="w-full bg-accent text-on-accent rounded-md py-2 text-sm font-medium hover:bg-accent-strong transition-colors"
                  >
                    Guardar video final
                  </button>
                </div>
              )}
              {video.finalVideos.length === 0 ? (
                <p className="text-sm text-muted text-center py-4">Sin video final</p>
              ) : (
                <div className="space-y-2">
                  {video.finalVideos.map(fv => (
                    <div key={fv.id} className="p-2 bg-surface-3 rounded-lg">
                      <div className="flex items-start gap-2">
                        <CheckCircle2 size={14} className="text-mint mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{fv.name}</p>
                          {fv.note && <p className="text-xs text-muted">{fv.note}</p>}
                          {fv.fileName && (
                            <a href={fv.fileUrl || undefined} download={fv.fileName} className="text-xs text-accent flex items-center gap-1 mt-0.5">
                              <Download size={11} /> {fv.fileName}
                            </a>
                          )}
                        </div>
                        {fv.fileUrl && (
                          <button
                            onClick={() => setPreviewOpenId(id => (id === fv.id ? null : fv.id))}
                            className="text-[11px] text-muted hover:text-accent flex items-center gap-1 shrink-0 px-2 py-1 rounded-md bg-surface-2 border border-line"
                          >
                            <Eye size={12} /> {previewOpenId === fv.id ? 'Ocultar' : 'Ver'}
                          </button>
                        )}
                      </div>
                      {previewOpenId === fv.id && fv.fileUrl && (
                        <div className="mt-2 rounded-md overflow-hidden bg-black">
                          {isImageFile(fv.fileName) ? (
                            <img src={fv.fileUrl} alt={fv.name} className="w-full max-h-64 object-contain" />
                          ) : (
                            <video src={fv.fileUrl} controls className="w-full max-h-64" />
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="bg-surface-2 border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <MessageSquare size={16} className="text-amber" /> Correcciones
              </h3>
              {isAdmin && (
                <button onClick={() => setShowCorrForm(s => !s)} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
                  <Plus size={14} /> Agregar
                </button>
              )}
            </div>
            {isAdmin && showCorrForm && (
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
                {video.corrections.map(c => (
                  <div key={c.id} className="flex items-start gap-2 p-2 bg-surface-3 rounded-lg">
                    <AlertCircle size={14} className="text-amber mt-0.5 shrink-0" />
                    <div>
                      <span className="text-xs text-amber font-mono">{fmtTime(c.time)}</span>
                      <p className="text-sm">{c.text}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!isAdmin && (
              <p className="text-[10px] text-muted-2 flex items-center gap-1 mt-3"><Lock size={10} /> Solo el admin puede dejar o editar correcciones. Quedan guardadas hasta que el video se apruebe por completo.</p>
            )}
          </div>

          {isAdmin && (
            <div className="flex gap-2">
              <button onClick={() => onSetQc(video.id, 'aprobado_senda')} className="flex-1 bg-mint-dim text-mint border border-mint/30 rounded-lg py-2.5 text-sm font-medium hover:bg-mint/10 transition-colors flex items-center justify-center gap-2">
                <CheckCircle2 size={16} /> Aprobar Senda
              </button>
              <button onClick={() => onSetQc(video.id, 'aprobado_cliente')} className="flex-1 bg-accent text-on-accent rounded-lg py-2.5 text-sm font-medium hover:bg-accent-strong transition-colors flex items-center justify-center gap-2">
                <CheckCircle2 size={16} /> Aprobar Cliente
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
