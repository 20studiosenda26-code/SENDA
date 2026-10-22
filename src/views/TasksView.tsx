import { useStore } from '../store';
import type { Video, QcStatus, ClipStatus, Correction, MainImageStatus, Clip } from '../types';
import { uploadSharedFile } from '../lib/supabaseClient';
import { qcStatusLabel, pendingRoleSuffix } from '../lib/qcLabel';
import {
  Play, AlertCircle, CheckCircle2, Plus, X, Film, MessageSquare, Upload,
  FileText, Download, Lock, Send, Eye, Image as ImageIcon, Video as VideoIcon,
  ThumbsUp, ThumbsDown, Check, RotateCcw, Flag, Loader2,
  Clock, ChevronRight, ChevronDown, User, Link2, StickyNote
} from 'lucide-react';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AdminTasksRoot } from './AdminTasksPanels';

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

const BOARD_QC_LABEL: Record<QcStatus, string> = {
  sin_iniciar: 'Sin iniciar',
  pendiente: 'Pendiente',
  revision: 'En revisión',
  correcciones: 'Correcciones',
  aprobado: 'Aprobado',
  aprobado_senda: 'Aprobado Senda · En Clientes',
  aprobado_cliente: 'Aprobado cliente',
};

const BOARD_QC_CLASSES: Record<QcStatus, string> = {
  sin_iniciar: 'bg-surface-3 text-muted-2',
  pendiente: 'bg-amber-dim text-amber',
  revision: 'bg-accent-dim text-accent',
  correcciones: 'bg-red-500/10 text-red-400',
  aprobado: 'bg-mint-dim text-mint',
  aprobado_senda: 'bg-mint-dim text-mint border border-mint/30',
  aprobado_cliente: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
};

function getProcessBadgeLabel(v: Video): string {
  if (v.qc === 'pendiente') {
    return `Proceso: Pendiente ${pendingRoleSuffix(v)}`;
  }
  if (v.qc === 'aprobado_senda') {
    return 'Proceso: Aprobado Senda (En Clientes)';
  }
  return `Proceso: ${BOARD_QC_LABEL[v.qc]}`;
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
    brands, orders, role, currentWorkerId, setQc, addClip, replaceClip, setClipStatus, setClipMarkerTime, acceptAllClips,
    addCorrection, updateCorrectionTime,
    uploadBrief, addFinalVideo, uploadMainImage, setMainImageStatus, sendVideo,
    setSelectedVideo, selectedVideo,
  } = useStore();

  const [openBrandId, setOpenBrandId] = useState<string | null>(null);

  const myProjectsWithVideos = useMemo(() => {
    return brands
      .map(b => {
        const myVids = b.videos
          .filter(v => (role === 'clipper' ? v.clipperId === currentWorkerId : v.editorId === currentWorkerId))
          .sort((a, bVid) => (a.videoNumber || 0) - (bVid.videoNumber || 0));
        const linkedOrder = orders.find(o => o.brand.trim().toLowerCase() === b.name.trim().toLowerCase());
        return {
          brand: b,
          videos: myVids,
          linkedOrder,
        };
      })
      .filter(group => group.videos.length > 0);
  }, [brands, orders, role, currentWorkerId]);

  if (selectedVideo) {
    const parentBrand = brands.find(b => b.videos.some(v => v.id === selectedVideo.id));
    return (
      <VideoDetail
        video={selectedVideo}
        brandName={parentBrand?.name || ''}
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

  if (role === 'admin') {
    return <AdminTasksRoot />;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h2 className="font-display text-2xl font-bold mb-1">Proyectos asignados</h2>
        <p className="text-muted text-sm">
          Selecciona un proyecto para ver cada video por separado (<strong className="text-text">Video 1, Video 2, Video 3...</strong>) con su proceso actual.
        </p>
      </div>

      {myProjectsWithVideos.length === 0 ? (
        <div className="text-center py-16 bg-surface-2 border border-dashed border-line rounded-2xl">
          <div className="w-14 h-14 rounded-full bg-surface-3 flex items-center justify-center mx-auto mb-3 text-muted">
            <CheckCircle2 size={28} />
          </div>
          <h3 className="text-base font-semibold">No tienes proyectos asignados por ahora</h3>
          <p className="text-xs text-muted mt-1">Cuando el administrador te asigne un proyecto aparecerá inmediatamente aquí.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {myProjectsWithVideos.map(({ brand, videos, linkedOrder }, index) => {
            const isOpen = openBrandId === brand.id || openBrandId === null;
            return (
              <div
                key={brand.id}
                className="bg-surface-2 border border-line rounded-2xl overflow-hidden transition-colors"
              >
                <button
                  type="button"
                  onClick={() => setOpenBrandId(prev => (prev === brand.id ? '__none__' : brand.id))}
                  className="w-full p-4 flex items-center justify-between gap-4 hover:bg-surface-3/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-accent-dim text-accent border border-accent/30 flex items-center justify-center text-xs font-bold shrink-0 font-tech">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-display font-bold truncate">
                        {brand.name} · <span className="text-accent font-tech">{videos.length} videos</span>
                      </p>
                      <p className="text-xs text-muted-2 flex items-center gap-2 flex-wrap mt-0.5">
                        <span className="inline-flex items-center gap-1">
                          <Clock size={12} /> Entrega: {linkedOrder?.deliveryDate ? `${linkedOrder.deliveryDate} · ${linkedOrder.deliveryTime || ''}` : videos[0]?.date}
                        </span>
                        <span>· Clipper: {videos[0]?.clipperName}</span>
                        <span>· Editor(a): {videos[0]?.editorName}</span>
                      </p>
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-muted transition-transform ${isOpen ? 'rotate-180 text-accent' : ''}`} />
                </button>

                {isOpen && (
                  <div className="p-4 pt-2 border-t border-line/60 space-y-3 bg-surface-3/30">
                    {linkedOrder && (linkedOrder.avatarName || linkedOrder.briefFileName || (linkedOrder.references && linkedOrder.references.length > 0) || linkedOrder.clientNotes) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div className="bg-surface-2 border border-line rounded-lg p-2.5">
                          <p className="text-[10px] text-muted-2 uppercase flex items-center gap-1 mb-1"><User size={11} /> Avatar</p>
                          <p className="truncate">{linkedOrder.avatarName || 'Sin avatar especificado'}</p>
                        </div>
                        <div className="bg-surface-2 border border-line rounded-lg p-2.5">
                          <p className="text-[10px] text-muted-2 uppercase flex items-center gap-1 mb-1"><FileText size={11} /> Brief</p>
                          <p className="truncate">{videos[0]?.briefFileName || linkedOrder.briefFileName || 'Sin brief'}</p>
                        </div>
                        <div className="bg-surface-2 border border-line rounded-lg p-2.5">
                          <p className="text-[10px] text-muted-2 uppercase flex items-center gap-1 mb-1"><Link2 size={11} /> Referencias</p>
                          <p className="truncate">{linkedOrder.references && linkedOrder.references.length > 0 ? `${linkedOrder.references.length} referencia(s)` : 'Sin referencias'}</p>
                        </div>
                        <div className="bg-surface-2 border border-line rounded-lg p-2.5">
                          <p className="text-[10px] text-muted-2 uppercase flex items-center gap-1 mb-1"><StickyNote size={11} /> Notas cliente</p>
                          <p className="truncate">{linkedOrder.clientNotes || 'Sin notas'}</p>
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      {videos.map((v, vIdx) => (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedVideo(v)}
                          className="w-full flex items-center justify-between gap-3 p-3 bg-surface-2 hover:bg-surface-3 border border-line hover:border-accent/50 rounded-xl text-left transition-all"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-7 h-7 rounded-lg bg-surface-3 border border-line font-tech text-xs font-bold flex items-center justify-center text-accent shrink-0">
                              #{v.videoNumber || vIdx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold truncate">
                                Video {v.videoNumber || vIdx + 1}
                              </p>
                              <p className="text-[11px] text-muted-2 truncate">
                                Clips: {v.clips.length} · Corte final: {v.finalVideos.length} · Correcciones: {v.corrections.length}
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center gap-2.5 shrink-0">
                            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${BOARD_QC_CLASSES[v.qc]}`}>
                              {getProcessBadgeLabel(v)}
                            </span>
                            <ChevronRight size={15} className="text-muted-2" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function VideoDetail({
  video, brandName, onClose, onSetQc, onAddClip, onReplaceClip, onSetClipStatus, onSetClipMarkerTime, onAcceptAllClips,
  onAddCorrection, onUpdateCorrectionTime,
  onUploadBrief, onAddFinalVideo, onUploadMainImage, onSetMainImageStatus, onSendVideo, role,
}: {
  video: Video; brandName: string; onClose: () => void; onSetQc: (id: string, s: QcStatus) => void; onAddClip: (id: string, name: string, note: string, fileName?: string, fileUrl?: string) => void;
  onReplaceClip: (id: string, clipId: string, fileName: string, fileUrl: string) => void; onSetClipStatus: (id: string, clipId: string, status: ClipStatus, reason?: string) => void;
  onSetClipMarkerTime: (id: string, clipId: string, time: number) => void; onAcceptAllClips: (id: string) => void; onAddCorrection: (id: string, time: number, text: string) => void;
  onUpdateCorrectionTime: (id: string, correctionId: string, time: number) => void; onUploadBrief: (id: string, fileName: string, fileUrl: string) => void;
  onAddFinalVideo: (id: string, name: string, note: string, fileName?: string, fileUrl?: string) => void; onUploadMainImage: (id: string, fileName: string, fileUrl: string) => void;
  onSetMainImageStatus: (id: string, status: MainImageStatus, comment: string) => void; onSendVideo: (id: string) => void; role: string;
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
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-2xl font-bold">
                {brandName ? `${brandName} · ${video.name}` : video.name}
              </h2>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${BOARD_QC_CLASSES[video.qc]}`}>
                {getProcessBadgeLabel(video)}
              </span>
            </div>
            <p className="text-sm text-muted">{video.clipperName} → {video.editorName} · {video.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-surface-2 border border-line rounded-xl p-5 space-y-4">
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
            ) : video.finalVideos[0]?.fileUrl ? (
              <video
                src={video.finalVideos[0].fileUrl}
                controls
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center">
                <Film size={40} className="text-muted-2 mx-auto mb-2" />
                <p className="text-sm text-muted">
                  {video.clips.length > 0 ? 'Selecciona un clip para reproducirlo aquí' : `Vista previa de ${video.name}`}
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
                        className="text-xs bg-red-500 text-white rounded-md px-3 py-1.5 font-medium hover:bg-red-600 transition-colors disabled:opacity-40"
                      >
                        Confirmar rechazo
                      </button>
                    </div>
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
              <p className="text-sm font-medium">Estado de QC ({video.name})</p>
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
                    {qcStatusLabel(q, video)}
                  </button>
                ) : (
                  <span
                    key={q}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md border cursor-default select-none ${
                      video.qc === q ? 'bg-accent text-on-accent border-accent' : 'bg-surface-3 text-muted border-line opacity-60'
                    }`}
                  >
                    {qcStatusLabel(q, video)}
                  </span>
                )
              ))}
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-2 pt-2 border-t border-line">
              <div className="flex gap-2">
                <button
                  onClick={() => onSetQc(video.id, 'aprobado_senda')}
                  className="flex-1 bg-mint-dim text-mint border border-mint/40 rounded-lg py-2.5 text-sm font-semibold hover:bg-mint/20 transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} /> Aprobar Senda (Subir a Clientes)
                </button>
                <button
                  onClick={() => onSetQc(video.id, 'aprobado_cliente')}
                  className="flex-1 bg-accent text-on-accent rounded-lg py-2.5 text-sm font-semibold hover:bg-accent-strong transition-colors flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} /> Aprobar Cliente
                </button>
              </div>
              {(video.publishedToClient || video.qc === 'aprobado_senda' || video.qc === 'aprobado_cliente') && (
                <p className="text-[11px] text-mint flex items-center gap-1.5">
                  <CheckCircle2 size={13} /> Este video ({video.name}) ya fue subido directamente a la sección Clientes de <strong>{brandName}</strong>.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-surface-2 border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <Film size={16} className="text-accent" /> {isEditor ? `Clips enviados (${video.name})` : `Clips generados (${video.name})`}
              </h3>
              {isClipper && (
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
                <p className="text-sm mb-2">¿Aceptar todos los clips de {video.name}?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmAcceptAll(false)} className="flex-1 bg-surface-2 border border-line text-muted rounded-md py-1.5 text-xs font-medium">
                    Cancelar
                  </button>
                  <button
                    onClick={() => { onAcceptAllClips(video.id); setConfirmAcceptAll(false); }}
                    className="flex-1 bg-mint text-on-accent rounded-md py-1.5 text-xs font-medium"
                  >
                    Aceptar todos
                  </button>
                </div>
              </div>
            )}

            {showClipForm && (
              <div className="mb-3 space-y-2 p-3 bg-surface-3 rounded-lg">
                <input value={clipName} onChange={e => setClipName(e.target.value)} placeholder="Nombre del clip" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                <input value={clipNote} onChange={e => setClipNote(e.target.value)} placeholder="Nota" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                <label className="flex items-center gap-2 bg-surface-2 border border-line border-dashed rounded-md px-3 py-2 text-sm text-muted cursor-pointer hover:border-accent">
                  {uploadingNewClip ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {clipFileName || (uploadingNewClip ? 'Subiendo...' : 'Subir archivo de video')}
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
                  className="w-full bg-accent text-on-accent rounded-md py-2 text-sm font-medium disabled:opacity-50"
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
                    className={`p-2 rounded-lg border transition-colors ${c.fileUrl ? 'cursor-pointer' : ''} ${
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
                        </div>
                        {c.note && <p className="text-xs text-muted">{c.note}</p>}
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
                            className="text-[11px] text-muted hover:text-accent flex items-center gap-1 px-2 py-1 rounded-md bg-surface-2 border border-line"
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
                {video.sentByClipper ? <><CheckCircle2 size={16} /> Clips enviados</> : <><Send size={16} /> Enviar clips de {video.name}</>}
              </button>
            )}
          </div>

          {(isEditor || isAdmin) && (
            <div className="bg-surface-2 border border-line rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-base font-semibold flex items-center gap-2">
                  <VideoIcon size={16} className="text-mint" /> Video final ({video.name})
                </h3>
                {isEditor && (
                  <button onClick={() => setShowFinalForm(s => !s)} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
                    <Plus size={14} /> Agregar
                  </button>
                )}
              </div>
              {showFinalForm && isEditor && (
                <div className="mb-3 space-y-2 p-3 bg-surface-3 rounded-lg">
                  <input value={finalName} onChange={e => setFinalName(e.target.value)} placeholder="Nombre del video final" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                  <input value={finalNote} onChange={e => setFinalNote(e.target.value)} placeholder="Nota" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                  <label className="flex items-center gap-2 bg-surface-2 border border-line border-dashed rounded-md px-3 py-2 text-sm text-muted cursor-pointer hover:border-accent">
                    <Upload size={14} />
                    {finalFileName || 'Subir archivo de video'}
                    <input type="file" className="hidden" onChange={handleFinalFile} />
                  </label>
                  <button
                    onClick={() => {
                      if (finalName) {
                        onAddFinalVideo(video.id, finalName, finalNote, finalFileName || undefined, finalFileUrl || undefined);
                        setFinalName(''); setFinalNote(''); setFinalFileName(''); setFinalFileUrl(''); setShowFinalForm(false);
                      }
                    }}
                    className="w-full bg-accent text-on-accent rounded-md py-2 text-sm font-medium"
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
                          <video src={fv.fileUrl} controls className="w-full max-h-64" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isClipper && (
            <div className="bg-surface-2 border border-line rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-base font-semibold flex items-center gap-2">
                  <MessageSquare size={16} className="text-amber" /> Correcciones ({video.corrections.length})
                </h3>
                {isAdmin && (
                  <button onClick={() => setShowCorrForm(s => !s)} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1">
                    <Plus size={14} /> Agregar
                  </button>
                )}
              </div>
              {isAdmin && showCorrForm && (
                <div className="mb-3 space-y-2 p-3 bg-surface-3 rounded-lg">
                  <input value={corrTime} onChange={e => setCorrTime(e.target.value)} placeholder="Tiempo (seg)" type="number" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                  <input value={corrText} onChange={e => setCorrText(e.target.value)} placeholder="Descripción" className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent" />
                  <button onClick={() => { if (corrText) { onAddCorrection(video.id, parseInt(corrTime) || 0, corrText); setCorrTime(''); setCorrText(''); setShowCorrForm(false); } }} className="w-full bg-accent text-on-accent rounded-md py-2 text-sm font-medium">
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Tablero de Proyectos Iniciados del Administrador: agrupa por Proyecto/Marca y despliega Video 1, Video 2, Video 3... con su proceso al lado
export function TasksBoard() {
  const { brands, orders, setSelectedVideo } = useStore();
  const [filter, setFilter] = useState<'todos' | QcStatus>('todos');
  const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null);

  const filterOptions: ('todos' | QcStatus)[] = ['todos', 'sin_iniciar', 'pendiente', 'revision', 'correcciones', 'aprobado_senda', 'aprobado_cliente'];

  const brandGroups = useMemo(() => {
    return brands
      .map(b => {
        const sortedVids = [...b.videos].sort((a, bVid) => (a.videoNumber || 0) - (bVid.videoNumber || 0));
        const filteredVids = filter === 'todos' ? sortedVids : sortedVids.filter(v => v.qc === filter);
        const linkedOrder = orders.find(o => o.brand.trim().toLowerCase() === b.name.trim().toLowerCase());
        return {
          brand: b,
          videos: filteredVids,
          totalVideos: sortedVids.length,
          linkedOrder,
        };
      })
      .filter(g => g.videos.length > 0);
  }, [brands, orders, filter]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex flex-wrap gap-1.5">
        {filterOptions.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
              filter === f ? 'bg-accent text-on-accent border-accent' : 'bg-surface-2 text-muted border-line hover:border-accent/40'
            }`}
          >
            {f === 'todos' ? 'Todos' : BOARD_QC_LABEL[f]}
          </button>
        ))}
      </div>

      {brandGroups.length === 0 ? (
        <p className="text-sm text-muted text-center py-10">No hay videos en este estado</p>
      ) : (
        <div className="space-y-3">
          {brandGroups.map(({ brand, videos, totalVideos, linkedOrder }, idx) => {
            const isOpen = expandedBrandId === brand.id || expandedBrandId === null;
            return (
              <div key={brand.id} className="bg-surface-2 border border-line rounded-2xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setExpandedBrandId(prev => (prev === brand.id ? '__closed__' : brand.id))}
                  className="w-full flex items-center justify-between gap-3 p-4 hover:bg-surface-3/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-7 h-7 rounded-lg bg-accent-dim text-accent border border-accent/30 flex items-center justify-center text-xs font-bold font-tech shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-base font-display font-bold truncate">
                        {brand.name} · <span className="text-accent font-tech">{totalVideos} videos</span>
                      </p>
                      <p className="text-xs text-muted-2 truncate">
                        Equipo: {videos[0]?.clipperName} + {videos[0]?.editorName}
                        {linkedOrder?.deliveryDate ? ` · Entrega: ${linkedOrder.deliveryDate} ${linkedOrder.deliveryTime || ''}` : ''}
                      </p>
                    </div>
                  </div>
                  <ChevronDown size={18} className={`text-muted transition-transform ${isOpen ? 'rotate-180 text-accent' : ''}`} />
                </button>

                {isOpen && (
                  <div className="p-3.5 pt-2 border-t border-line/60 bg-surface-3/30 space-y-2">
                    {videos.map((v, vIndex) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVideo(v)}
                        className="w-full flex items-center justify-between gap-3 p-3 bg-surface-2 border border-line rounded-xl hover:border-accent/50 hover:bg-surface-3 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span className="w-7 h-7 rounded-lg bg-surface-3 border border-line font-tech text-xs font-bold text-accent flex items-center justify-center shrink-0">
                            #{v.videoNumber || vIndex + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              Video {v.videoNumber || vIndex + 1} <span className="text-muted-2 font-normal">· {brand.name}</span>
                            </p>
                            <p className="text-xs text-muted-2 truncate">
                              Clips: {v.clips.length} · Corte final: {v.finalVideos.length} · Correcciones: {v.corrections.length}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${BOARD_QC_CLASSES[v.qc]}`}>
                            {getProcessBadgeLabel(v)}
                          </span>
                          <ChevronRight size={15} className="text-muted-2" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
