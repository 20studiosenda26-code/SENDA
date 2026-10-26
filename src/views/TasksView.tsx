import { useStore } from '../store';
import type { Video, QcStatus, ClipStatus, Correction, MainImageStatus, Clip } from '../types';
import { uploadSharedFile } from '../lib/supabaseClient';
import { qcStatusLabel, pendingRoleSuffix } from '../lib/qcLabel';
import {
  Play, AlertCircle, CheckCircle2, Plus, X, Film, MessageSquare, Upload,
  FileText, Download, Lock, Send, Eye, Image as ImageIcon, Video as VideoIcon,
  ThumbsUp, ThumbsDown, Check, RotateCcw, Flag, Loader2,
  Clock, ChevronRight, ChevronDown, User, Link2, StickyNote, Folders
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
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-[var(--border-line)] rounded-2xl bg-[var(--surface-2)] shadow-sm">
          <div className="w-16 h-16 rounded-full bg-[var(--surface-3)] flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(53,214,228,0.1)]">
            <Folders className="w-8 h-8 text-[var(--accent)]" />
          </div>
          <h3 className="text-lg font-display font-semibold text-white mb-2">Todo al día</h3>
          <p className="text-sm text-[var(--surface-4)] max-w-sm leading-relaxed">
            No tienes tareas pendientes. Cuando el equipo de administración te asigne un nuevo proyecto, aparecerá aquí inmediatamente.
          </p>
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
          <button onClick={onClose} className="w-9 h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border-line)] flex items-center justify-center text-gray-400 hover:text-white hover:border-[var(--accent)] hover:bg-[var(--accent)]/10 transition-all duration-300">
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
          <div className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border-line)] rounded-lg px-3 py-2 hover:border-gray-500 transition-colors">
            <FileText size={16} className="text-[var(--accent)] shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-white">Brief / Trabajo asignado</p>
              <p className="text-gray-400 truncate max-w-[160px]">{video.briefFileName || 'Sin archivo'}</p>
            </div>
            {isAdmin && (
              <>
                <input ref={briefInputRef} type="file" className="hidden" onChange={handleBriefFile} />
                <button
                  onClick={() => briefInputRef.current?.click()}
                  className="text-xs bg-[var(--accent)] text-[#0F2E33] rounded-md px-2.5 py-1.5 font-medium hover:shadow-[0_0_15px_rgba(53,214,228,0.4)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-1"
                >
                  <Upload size={12} /> {video.briefFileName ? 'Reemplazar' : 'Subir'}
                </button>
              </>
            )}
            <a
              href={video.briefFileUrl || undefined}
              download={video.briefFileName || undefined}
              className={`text-xs rounded-md px-2.5 py-1.5 font-medium flex items-center gap-1 transition-all duration-300 ${
                video.briefFileUrl ? 'bg-[var(--surface-3)] text-white hover:bg-[var(--accent)]/20 hover:text-[var(--accent)]' : 'bg-surface-3 text-muted-2 pointer-events-none'
              }`}
            >
              <Download size={12} /> Descargar
            </a>
          </div>
          {(isClipper || isAdmin) && (
            <div className="flex items-center gap-2 bg-[var(--surface-2)] border border-[var(--border-line)] rounded-lg px-3 py-2 hover:border-gray-500 transition-colors">
              <ImageIcon size={16} className="text-violet-400 shrink-0" />
              <div className="text-xs min-w-[90px]">
                <p className="font-medium text-white">Imagen principal</p>
                <p className="text-gray-400 truncate max-w-[130px]">{video.mainImageFileName || 'Sin imagen'}</p>
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
                    className="text-xs bg-violet-500 text-white rounded-md px-2.5 py-1.5 font-medium hover:shadow-[0_0_15px_rgba(139,92,246,0.4)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-1 shrink-0"
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
                    className="w-full bg-[var(--surface-3)] border border-[var(--border-line)] rounded-md px-2 py-1 text-[11px] text-white placeholder-gray-500 outline-none focus:border-[var(--accent)] transition-colors"
                  />
                  <div className="flex gap-1">
                    <button
                      onClick={() => { onSetMainImageStatus(video.id, 'aprobada', mainImageComment); setMainImageComment(''); }}
                      className="flex-1 bg-mint-dim text-mint rounded-md py-1 text-[11px] font-medium hover:bg-mint/20 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-1"
                    >
                      <ThumbsUp size={11} /> Aprobar
                    </button>
                    <button
                      onClick={() => { onSetMainImageStatus(video.id, 'rechazada', mainImageComment); setMainImageComment(''); }}
                      className="flex-1 bg-red-500/10 text-red-400 rounded-md py-1 text-[11px] font-medium hover:bg-red-500/20 hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-1"
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
        <div className="bg-[var(--surface-2)] border border-[var(--border-line)] rounded-xl p-5 space-y-4">
          <div className="aspect-video bg-[var(--surface-3)] rounded-lg flex items-center justify-center overflow-hidden">
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
                <Film size={40} className="text-gray-600 mx-auto mb-2" />
                <p className="text-sm text-gray-400">
                  {video.clips.length > 0 ? 'Selecciona un clip para reproducirlo aquí' : `Vista previa de ${video.name}`}
                </p>
                {video.duration && <p className="text-xs text-gray-500 mt-1">{video.duration}</p>}
              </div>
            )}
          </div>

          {activeClip && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-white truncate">Clip activo: {activeClip.name}</p>
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
                    className="text-[11px] text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-md px-2 py-1 flex items-center gap-1 hover:bg-amber-500/20 transition-colors shrink-0"
                  >
                    <Flag size={11} /> Marcar momento actual
                  </button>
                )}
                <p className="text-xs text-gray-400">
                  {activeClip.markerTime != null
                    ? <>Momento señalado: <span className="text-amber-400 font-mono">{fmtTime(activeClip.markerTime)}</span></>
                    : 'Sin momento señalado'}
                </p>
              </div>

              {isAdmin && (
                <div className="mt-3 pt-3 border-t border-[var(--border-line)]">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => { onSetClipStatus(video.id, activeClip.id, 'approved'); setShowRejectBox(false); }}
                      title="Aceptar clip"
                      className={`w-10 h-10 rounded-lg border flex items-center justify-center hover:-translate-y-1 transition-all duration-300 ${
                        activeClip.status === 'approved'
                          ? 'bg-[#6FE7C8] text-[#0F2E33] border-[#6FE7C8] shadow-[0_0_15px_rgba(111,231,200,0.3)]'
                          : 'bg-[#6FE7C8]/10 text-[#6FE7C8] border-[#6FE7C8]/30 hover:bg-[#6FE7C8]/20'
                      }`}
                    >
                      <Check size={18} />
                    </button>
                    <button
                      onClick={() => setShowRejectBox(s => !s)}
                      title="Rechazar clip"
                      className={`w-10 h-10 rounded-lg border flex items-center justify-center hover:-translate-y-1 transition-all duration-300 ${
                        activeClip.status === 'rejected'
                          ? 'bg-red-500 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                          : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
                      }`}
                    >
                      <X size={18} />
                    </button>
                  </div>
                  {showRejectBox && (
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={rejectReason}
                        onChange={e => setRejectReason(e.target.value)}
                        placeholder="Motivo del rechazo (obligatorio)"
                        rows={2}
                        className="w-full bg-[var(--surface-3)] border border-[var(--border-line)] rounded-md px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-[var(--accent)] transition-colors resize-none"
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
                        className="text-xs bg-red-500 text-white rounded-md px-4 py-2 font-medium hover:bg-red-600 hover:-translate-y-0.5 transition-all duration-300 disabled:opacity-40 disabled:hover:-translate-y-0"
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
              <p className="text-sm font-medium text-white">Marcador de tiempo del error</p>
              {!isAdmin && (
                <span className="text-[10px] text-gray-500 flex items-center gap-1"><Lock size={10} /> Solo lectura</span>
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
              <p className="text-sm font-medium text-white">Estado de QC ({video.name})</p>
              {!isAdmin && (
                <span className="text-[10px] text-gray-500 flex items-center gap-1"><Lock size={10} /> Solo el administrador puede cambiarlo</span>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {qcOptions.map(q => (
                isAdmin ? (
                  <button
                    key={q}
                    onClick={() => onSetQc(video.id, q)}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md border transition-all duration-300 hover:-translate-y-0.5 ${
                      video.qc === q 
                      ? 'bg-[var(--accent)] text-[#0F2E33] border-[var(--accent)] shadow-[0_0_10px_rgba(53,214,228,0.3)]' 
                      : 'bg-[var(--surface-3)] text-gray-400 border-[var(--border-line)] hover:text-white hover:border-gray-500'
                    }`}
                  >
                    {qcStatusLabel(q, video)}
                  </button>
                ) : (
                  <span
                    key={q}
                    className={`text-xs font-medium px-3 py-1.5 rounded-md border cursor-default select-none ${
                      video.qc === q ? 'bg-[var(--accent)] text-[#0F2E33] border-[var(--accent)] shadow-[0_0_10px_rgba(53,214,228,0.2)]' : 'bg-[var(--surface-3)] text-gray-500 border-[var(--border-line)] opacity-60'
                    }`}
                  >
                    {qcStatusLabel(q, video)}
                  </span>
                )
              ))}
            </div>
          </div>

          {isAdmin && (
            <div className="space-y-2 pt-2 border-t border-[var(--border-line)]">
              <div className="flex gap-2">
                <button
                  onClick={() => onSetQc(video.id, 'aprobado_senda')}
                  className="flex-1 bg-[#6FE7C8]/10 text-[#6FE7C8] border border-[#6FE7C8]/40 rounded-lg py-2.5 text-sm font-semibold hover:bg-[#6FE7C8] hover:text-[#0F2E33] hover:shadow-[0_0_15px_rgba(111,231,200,0.4)] hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} /> Aprobar Senda
                </button>
                <button
                  onClick={() => onSetQc(video.id, 'aprobado_cliente')}
                  className="flex-1 bg-[var(--accent)] text-[#0F2E33] rounded-lg py-2.5 text-sm font-semibold hover:bg-[var(--accent-strong)] hover:shadow-[0_0_15px_rgba(53,214,228,0.5)] hover:-translate-y-0.5 transition-all duration-300 flex items-center justify-center gap-2"
                >
                  <CheckCircle2 size={16} /> Aprobar Cliente
                </button>
              </div>
              {(video.publishedToClient || video.qc === 'aprobado_senda' || video.qc === 'aprobado_cliente') && (
                <p className="text-[11px] text-[#6FE7C8] flex items-center gap-1.5 mt-2">
                  <CheckCircle2 size={13} /> Este video ({video.name}) ya está visible en la sección Clientes de <strong>{brandName}</strong>.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="bg-[var(--surface-2)] border border-[var(--border-line)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
                <Film size={16} className="text-[var(--accent)]" /> {isEditor ? `Clips enviados (${video.name})` : `Clips generados (${video.name})`}
              </h3>
              {isClipper && (
                <button onClick={() => setShowClipForm(s => !s)} className="text-sm text-[var(--accent)] hover:text-white flex items-center gap-1 transition-colors">
                  <Plus size={14} /> Agregar
                </button>
              )}
              {isAdmin && video.clips.some(c => c.fileUrl && c.status !== 'approved') && (
                <button onClick={() => setConfirmAcceptAll(true)} className="text-xs bg-mint-dim text-mint rounded-md px-2.5 py-1.5 font-medium hover:bg-mint/20 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-1">
                  <Check size={12} /> Aceptar todos los clips
                </button>
              )}
            </div>

            {confirmAcceptAll && (
              <div className="mb-4 p-4 bg-[var(--surface-3)] border border-[var(--border-line)] rounded-lg">
                <p className="text-sm text-white mb-3">¿Aceptar todos los clips de {video.name}?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmAcceptAll(false)} className="flex-1 bg-[var(--surface-2)] border border-[var(--border-line)] text-gray-400 rounded-md py-2 text-xs font-medium hover:text-white transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={() => { onAcceptAllClips(video.id); setConfirmAcceptAll(false); }}
                    className="flex-1 bg-mint text-[#0F2E33] rounded-md py-2 text-xs font-bold hover:shadow-[0_0_15px_rgba(111,231,200,0.4)] transition-all"
                  >
                    Aceptar todos
                  </button>
                </div>
              </div>
            )}

            {showClipForm && (
              <div className="mb-4 space-y-3 p-4 bg-[var(--surface-3)] rounded-lg border border-[var(--border-line)]">
                <input value={clipName} onChange={e => setClipName(e.target.value)} placeholder="Nombre del clip" className="w-full bg-[var(--surface-1)] border border-[var(--border-line)] rounded-md px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)] transition-colors" />
                <input value={clipNote} onChange={e => setClipNote(e.target.value)} placeholder="Nota (Opcional)" className="w-full bg-[var(--surface-1)] border border-[var(--border-line)] rounded-md px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)] transition-colors" />
                <label className="flex items-center gap-2 bg-[var(--surface-1)] border border-[var(--border-line)] border-dashed rounded-md px-3 py-3 text-sm text-gray-400 cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                  {uploadingNewClip ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
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
                  className="w-full bg-[var(--accent)] text-[#0F2E33] rounded-md py-2 text-sm font-bold disabled:opacity-50 hover:shadow-[0_0_15px_rgba(53,214,228,0.4)] transition-all duration-300"
                >
                  Guardar clip
                </button>
              </div>
            )}

            {video.clips.length === 0 ? (
              <div className="text-center py-8 text-gray-500 border border-dashed border-[var(--border-line)] rounded-lg">
                <p className="text-sm">Sin clips {isEditor ? 'enviados' : 'generados'}</p>
              </div>
            ) : (
              <div className="space-y-2">
                {video.clips.map(c => (
                  <div
                    key={c.id}
                    onClick={() => c.fileUrl && setActiveClipId(c.id)}
                    className={`p-3 rounded-lg border transition-all duration-300 ${c.fileUrl ? 'cursor-pointer' : ''} ${
                      activeClip?.id === c.id ? 'bg-[var(--accent)]/10 border-[var(--accent)]/50 shadow-sm' : 'bg-[var(--surface-3)] border-transparent hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Play size={16} className={`mt-0.5 shrink-0 ${activeClip?.id === c.id ? 'text-[var(--accent)]' : 'text-gray-500'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-medium text-white">{c.name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${clipStatusClasses(c.status)}`}>
                            {clipStatusLabel(c.status)}
                          </span>
                        </div>
                        {c.note && <p className="text-xs text-gray-400 mb-1">{c.note}</p>}
                        {c.fileName && (
                          <a
                            href={c.fileUrl || undefined}
                            download={c.fileName}
                            onClick={e => e.stopPropagation()}
                            className="text-xs text-[var(--accent)] flex items-center gap-1 hover:underline"
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
                            className="text-[11px] text-gray-400 hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-[var(--surface-1)] border border-[var(--border-line)] transition-colors"
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
                className={`w-full mt-4 rounded-lg py-3 text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
                  video.sentByClipper 
                    ? 'bg-mint-dim text-mint cursor-default' 
                    : 'bg-[var(--accent)] text-[#0F2E33] hover:shadow-[0_0_20px_rgba(53,214,228,0.5)] hover:-translate-y-1'
                }`}
              >
                {video.sentByClipper ? <><CheckCircle2 size={16} /> Clips enviados</> : <><Send size={16} /> Enviar clips de {video.name}</>}
              </button>
            )}
          </div>

          {(isEditor || isAdmin) && (
            <div className="bg-[var(--surface-2)] border border-[var(--border-line)] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
                  <VideoIcon size={16} className="text-mint" /> Video final ({video.name})
                </h3>
                {isEditor && (
                  <button onClick={() => setShowFinalForm(s => !s)} className="text-sm text-[var(--accent)] hover:text-white flex items-center gap-1 transition-colors">
                    <Plus size={14} /> Agregar
                  </button>
                )}
              </div>
              {showFinalForm && isEditor && (
                <div className="mb-4 space-y-3 p-4 bg-[var(--surface-3)] rounded-lg border border-[var(--border-line)]">
                  <input value={finalName} onChange={e => setFinalName(e.target.value)} placeholder="Nombre del video final" className="w-full bg-[var(--surface-1)] border border-[var(--border-line)] rounded-md px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)] transition-colors" />
                  <input value={finalNote} onChange={e => setFinalNote(e.target.value)} placeholder="Nota (Opcional)" className="w-full bg-[var(--surface-1)] border border-[var(--border-line)] rounded-md px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)] transition-colors" />
                  <label className="flex items-center gap-2 bg-[var(--surface-1)] border border-[var(--border-line)] border-dashed rounded-md px-3 py-3 text-sm text-gray-400 cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors">
                    <Upload size={16} />
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
                    className="w-full bg-[var(--accent)] text-[#0F2E33] rounded-md py-2 text-sm font-bold hover:shadow-[0_0_15px_rgba(53,214,228,0.4)] transition-all duration-300"
                  >
                    Guardar video final
                  </button>
                </div>
              )}
              {video.finalVideos.length === 0 ? (
                <div className="text-center py-6 text-gray-500 border border-dashed border-[var(--border-line)] rounded-lg">
                  <p className="text-sm">Sin video final</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {video.finalVideos.map(fv => (
                    <div key={fv.id} className="p-3 bg-[var(--surface-3)] border border-[var(--border-line)] rounded-lg">
                      <div className="flex items-start gap-3">
                        <CheckCircle2 size={16} className="text-mint mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white">{fv.name}</p>
                          {fv.note && <p className="text-xs text-gray-400 mb-1">{fv.note}</p>}
                          {fv.fileName && (
                            <a href={fv.fileUrl || undefined} download={fv.fileName} className="text-xs text-[var(--accent)] flex items-center gap-1 hover:underline">
                              <Download size={11} /> {fv.fileName}
                            </a>
                          )}
                        </div>
                        {fv.fileUrl && (
                          <button
                            onClick={() => setPreviewOpenId(id => (id === fv.id ? null : fv.id))}
                            className="text-[11px] text-gray-400 hover:text-[var(--accent)] flex items-center gap-1 shrink-0 px-2.5 py-1.5 rounded-md bg-[var(--surface-1)] border border-[var(--border-line)] transition-colors"
                          >
                            <Eye size={12} /> {previewOpenId === fv.id ? 'Ocultar' : 'Ver'}
                          </button>
                        )}
                      </div>
                      {previewOpenId === fv.id && fv.fileUrl && (
                        <div className="mt-3 rounded-lg overflow-hidden bg-black border border-[var(--border-line)]">
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
            <div className="bg-[var(--surface-2)] border border-[var(--border-line)] rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-semibold text-white flex items-center gap-2">
                  <MessageSquare size={16} className="text-amber-400" /> Correcciones ({video.corrections.length})
                </h3>
                {isAdmin && (
                  <button onClick={() => setShowCorrForm(s => !s)} className="text-sm text-[var(--accent)] hover:text-white flex items-center gap-1 transition-colors">
                    <Plus size={14} /> Agregar
                  </button>
                )}
              </div>
              {isAdmin && showCorrForm && (
                <div className="mb-4 space-y-3 p-4 bg-[var(--surface-3)] rounded-lg border border-[var(--border-line)]">
                  <input value={corrTime} onChange={e => setCorrTime(e.target.value)} placeholder="Tiempo (seg)" type="number" className="w-full bg-[var(--surface-1)] border border-[var(--border-line)] rounded-md px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)] transition-colors" />
                  <input value={corrText} onChange={e => setCorrText(e.target.value)} placeholder="Descripción" className="w-full bg-[var(--surface-1)] border border-[var(--border-line)] rounded-md px-3 py-2 text-sm text-white outline-none focus:border-[var(--accent)] transition-colors" />
                  <button onClick={() => { if (corrText) { onAddCorrection(video.id, parseInt(corrTime) || 0, corrText); setCorrTime(''); setCorrText(''); setShowCorrForm(false); } }} className="w-full bg-[var(--accent)] text-[#0F2E33] rounded-md py-2 text-sm font-bold hover:shadow-[0_0_15px_rgba(53,214,228,0.4)] transition-all">
                    Guardar corrección
                  </button>
                </div>
              )}
              {video.corrections.length === 0 ? (
                <div className="text-center py-6 text-gray-500 border border-dashed border-[var(--border-line)] rounded-lg">
                  <p className="text-sm">Sin correcciones</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {video.corrections.map(c => (
                    <div key={c.id} className="flex items-start gap-3 p-3 bg-[var(--surface-3)] border border-[var(--border-line)] rounded-lg">
                      <AlertCircle size={16} className="text-amber-400 mt-0.5 shrink-0" />
                      <div>
                        <span className="text-xs text-amber-400 font-mono bg-amber-500/10 px-1.5 py-0.5 rounded mr-2">{fmtTime(c.time)}</span>
                        <p className="text-sm text-white mt-1">{c.text}</p>
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

// Tablero de Proyectos Iniciados del Administrador
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
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap gap-2">
        {filterOptions.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-xs font-medium px-4 py-2 rounded-full border transition-all duration-300 ${
              filter === f 
                ? 'bg-[var(--accent)] text-[#0F2E33] border-[var(--accent)] shadow-[0_0_15px_rgba(53,214,228,0.3)]' 
                : 'bg-[var(--surface-2)] text-gray-400 border-[var(--border-line)] hover:border-gray-500 hover:text-white'
            }`}
          >
            {f === 'todos' ? 'Todos' : BOARD_QC_LABEL[f]}
          </button>
        ))}
      </div>

      {brandGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[var(--border-line)] rounded-2xl bg-[var(--surface-2)]">
          <div className="w-16 h-16 rounded-full bg-[var(--surface-3)] flex items-center justify-center mb-4">
            <Film className="w-8 h-8 text-gray-500" />
          </div>
          <p className="text-lg font-display font-medium text-white mb-1">Sin resultados</p>
          <p className="text-sm text-gray-400">No hay videos con este filtro o estado de QC seleccionado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {brandGroups.map(({ brand, videos, totalVideos, linkedOrder }, idx) => {
            const isOpen = expandedBrandId === brand.id || expandedBrandId === null;
            return (
              <div key={brand.id} className="bg-[var(--surface-2)] border border-[var(--border-line)] rounded-2xl overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpandedBrandId(prev => (prev === brand.id ? '__closed__' : brand.id))}
                  className="w-full flex items-center justify-between gap-4 p-5 hover:bg-[var(--surface-3)]/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] border border-[var(--accent)]/30 flex items-center justify-center text-sm font-bold font-tech shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-lg font-display font-bold text-white truncate mb-0.5">
                        {brand.name} · <span className="text-[var(--accent)] font-tech text-sm">{totalVideos} videos</span>
                      </p>
                      <p className="text-xs text-gray-400 truncate flex gap-2">
                        <span>Equipo: <strong className="text-gray-300">{videos[0]?.clipperName} + {videos[0]?.editorName}</strong></span>
                        {linkedOrder?.deliveryDate ? <span className="text-gray-500">| Entrega: {linkedOrder.deliveryDate}</span> : ''}
                      </p>
                    </div>
                  </div>
                  <ChevronDown size={20} className={`text-gray-400 transition-transform duration-300 ${isOpen ? 'rotate-180 text-[var(--accent)]' : ''}`} />
                </button>

                {isOpen && (
                  <div className="p-4 pt-2 border-t border-[var(--border-line)] bg-[var(--surface-1)] space-y-3">
                    {videos.map((v, vIndex) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVideo(v)}
                        className="w-full flex items-center justify-between gap-4 p-4 bg-[var(--surface-2)] border border-[var(--border-line)] rounded-xl hover:border-[var(--accent)]/50 hover:bg-[var(--surface-3)] transition-all duration-300 text-left group"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <span className="w-8 h-8 rounded-lg bg-[var(--surface-1)] border border-[var(--border-line)] font-tech text-xs font-bold text-[var(--accent)] flex items-center justify-center shrink-0 group-hover:bg-[var(--accent)]/10 transition-colors">
                            #{v.videoNumber || vIndex + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-white truncate mb-0.5">
                              Video {v.videoNumber || vIndex + 1} <span className="text-gray-500 font-normal ml-1">· {brand.name}</span>
                            </p>
                            <p className="text-[11px] text-gray-400 truncate flex gap-2">
                              <span>Clips: {v.clips.length}</span>
                              <span className="text-gray-600">|</span>
                              <span>Finales: {v.finalVideos.length}</span>
                              <span className="text-gray-600">|</span>
                              <span>Feedback: {v.corrections.length}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${BOARD_QC_CLASSES[v.qc]}`}>
                            {getProcessBadgeLabel(v)}
                          </span>
                          <ChevronRight size={18} className="text-gray-500 group-hover:text-[var(--accent)] transition-colors" />
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
