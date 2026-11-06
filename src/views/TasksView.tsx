import { useStore } from '../store';
import type { Video, QcStatus, ClipStatus, Correction, MainImageStatus, Clip } from '../types';
import {
  uploadSharedFile,
  resolveMediaUrl,
  downloadMediaFile,
  isGoogleDriveUrl,
  getGoogleDrivePreviewUrl,
  getGoogleDriveBridgeUrl,
  setGoogleDriveBridgeUrl,
  getGoogleDriveFolderUrl,
  setGoogleDriveFolderUrl,
} from "../lib/supabaseClient";
import { qcStatusLabel, pendingRoleSuffix } from '../lib/qcLabel';
import {
  Play, AlertCircle, CheckCircle2, Plus, X, Film, Upload,
  FileText, Download, Lock, Send, Eye, Image as ImageIcon, Video as VideoIcon,
  ThumbsUp, ThumbsDown, Check, RotateCcw, Loader2,
  Clock, ChevronRight, ChevronDown, User, Link2, StickyNote, Folders, Trash2
} from 'lucide-react';
import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { AdminTasksRoot } from './AdminTasksPanels';
import { isAssignedTo, TEAM_ROLE_SHORT } from '../lib/roles';

/** Nombre(s) del responsable: uno solo si la misma persona hace clips y edición. */
function teamNames(v?: Pick<Video, 'clipperName' | 'editorName' | 'clipperId' | 'editorId'> | null): string {
  if (!v) return 'Sin asignar';
  if (!v.editorId || v.editorId === v.clipperId) return v.clipperName || 'Sin asignar';
  if (!v.clipperId) return v.editorName || 'Sin asignar';
  return `${v.clipperName} + ${v.editorName}`;
}

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

function uploadErrorText(err: unknown, f: File): string {
  const msg = err instanceof Error ? err.message : '';
  if (msg === 'DRIVE_REQUIRED_FOR_LARGE_FILE') {
    return `"${f.name}" pesa ${(f.size / (1024 * 1024)).toFixed(1)} MB. Súbelo a Google Drive y pega el enlace, o pide al Admin activar el Puente de Drive en Ajustes.`;
  }
  return `No se pudo subir "${f.name}". Revisa tu conexión e inténtalo de nuevo.`;
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
  aprobado_cliente: 'bg-mint/15 text-mint border border-mint/30',
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
          .filter(v => isAssignedTo(v, currentWorkerId))
          .sort((a, bVid) => (a.videoNumber || 0) - (bVid.videoNumber || 0));
        const linkedOrder = orders.find(o => myVids.some(v => v.orderId === o.id) || `brand-${o.id}` === b.id) || orders.find(o => o.brand.trim().toLowerCase() === b.name.trim().toLowerCase());
        return {
          brand: b,
          videos: myVids,
          linkedOrder,
        };
      })
      .filter(group => group.videos.length > 0);
  }, [brands, orders, currentWorkerId]);

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
        <div className="flex flex-col items-center justify-center py-24 text-center border border-dashed border-line rounded-2xl bg-surface-2 shadow-sm">
          <div className="w-16 h-16 rounded-full bg-surface-3 flex items-center justify-center mb-4 shadow-[0_0_15px_rgba(53,214,228,0.1)]">
            <Folders className="w-8 h-8 text-accent" />
          </div>
          <h3 className="text-lg font-display font-semibold text-text mb-2">Todo al día</h3>
          <p className="text-sm text-muted max-w-sm leading-relaxed">
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
                        <span>· {TEAM_ROLE_SHORT}: {teamNames(videos[0])}</span>
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
  const [showFinalForm, setShowFinalForm] = useState(false);
  const [clipName, setClipName] = useState('');
  const [clipNote, setClipNote] = useState('');
  const [clipFileName, setClipFileName] = useState('');
  const [clipFileUrl, setClipFileUrl] = useState('');
  const [finalName, setFinalName] = useState('');
  const [finalNote, setFinalNote] = useState('');
  const [finalFileName, setFinalFileName] = useState('');
  const [finalFileUrl, setFinalFileUrl] = useState('');
  const [mainImageComment, setMainImageComment] = useState('');
  const [showMainImagePreview, setShowMainImagePreview] = useState(false);
  // Lo que se reproduce en el visor grande de la izquierda (clip o video final)
  const [playing, setPlaying] = useState<{ kind: 'clip' | 'final'; id: string } | null>(null);
  const setActiveClipId = (id: string | null) => setPlaying(id ? { kind: 'clip', id } : null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectBox, setShowRejectBox] = useState(false);
  const [confirmAcceptAll, setConfirmAcceptAll] = useState(false);
  const [uploadingClipId, setUploadingClipId] = useState<string | null>(null);
  const [uploadingNewClip, setUploadingNewClip] = useState(false);
  const [uploadingMainImage, setUploadingMainImage] = useState(false);
  const [uploadingBrief, setUploadingBrief] = useState(false);
  const [uploadingFinalVideo, setUploadingFinalVideo] = useState(false);
  const [uploadPct, setUploadPct] = useState<number>(0);
  const [finalDriveLinkInput, setFinalDriveLinkInput] = useState("");
  const [uploadErrorMsg, setUploadErrorMsg] = useState<string | null>(null);
  const [showDriveConfigModal, setShowDriveConfigModal] = useState(false);
  const [bridgeUrlDraft, setBridgeUrlDraft] = useState(() => getGoogleDriveBridgeUrl());
  const [folderUrlDraft, setFolderUrlDraft] = useState(() => getGoogleDriveFolderUrl());
  const briefInputRef = useRef<HTMLInputElement>(null);
  const mainImageInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const playerRef = useRef<HTMLVideoElement>(null);
  const [mediaTime, setMediaTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const seekTo = (t: number) => {
    const el = playerRef.current;
    if (el) { el.currentTime = t; el.pause(); }
    setMediaTime(t);
  };

  const isAdmin = role === 'admin';
  // Rol único de equipo: la misma persona sube imagen, clips y video final
  const isClipper = role !== 'admin';
  const isEditor = role !== 'admin';
  const isMainImageApproved = video.mainImageStatus === 'aprobada';
  const qcOptions: QcStatus[] = ['sin_iniciar', 'pendiente', 'revision', 'correcciones', 'aprobado_senda', 'aprobado_cliente'];

  const latestFinal: Clip | null = video.finalVideos.length > 0 ? video.finalVideos[video.finalVideos.length - 1] : null;
  const activeFinal: Clip | null =
    playing?.kind === 'final'
      ? video.finalVideos.find(f => f.id === playing.id) || null
      : !playing && (isEditor || isAdmin) && latestFinal?.fileUrl ? latestFinal : null;
  const activeClip: Clip | null = activeFinal
    ? null
    : playing?.kind === 'clip'
    ? video.clips.find(c => c.id === playing.id) || null
    : video.clips.length === 1 ? video.clips[0] : null;
  const activeMedia: Clip | null = activeFinal || activeClip;
  const [resolvedClipUrl, setResolvedClipUrl] = useState<string | null>(null);
  const [loadingClipMedia, setLoadingClipMedia] = useState(false);
  const [resolvedMainImgUrl, setResolvedMainImgUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const raw = activeMedia?.fileUrl || null;
    if (!raw) {
      setResolvedClipUrl(null);
      setLoadingClipMedia(false);
      return;
    }
    setLoadingClipMedia(true);
    resolveMediaUrl(raw).then(url => {
      if (!cancelled) {
        setResolvedClipUrl(url || raw);
        setLoadingClipMedia(false);
      }
    });
    return () => { cancelled = true; };
  }, [activeMedia?.id, activeMedia?.fileUrl]);

  useEffect(() => {
    let cancelled = false;
    if (!video.mainImageFileUrl) {
      setResolvedMainImgUrl(null);
      return;
    }
    resolveMediaUrl(video.mainImageFileUrl).then(url => {
      if (!cancelled) setResolvedMainImgUrl(url || video.mainImageFileUrl || null);
    });
    return () => { cancelled = true; };
  }, [video.mainImageFileUrl]);

  useEffect(() => {
    setShowRejectBox(false);
    setRejectReason('');
  }, [activeClip?.id]);

  const handleClipFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setClipFileName(f.name);
    setUploadingNewClip(true);
    setUploadPct(2);
    try {
      setActionError(null);
      const url = await uploadSharedFile(f, `clips/${video.id}`, pct => setUploadPct(pct));
      setClipFileUrl(url);
    } catch (err) {
      setClipFileName('');
      setClipFileUrl('');
      setActionError(uploadErrorText(err, f));
    } finally {
      setTimeout(() => {
        setUploadingNewClip(false);
        setUploadPct(0);
      }, 250);
    }
  };

  const handleReplaceClipFile = async (clipId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingClipId(clipId);
    setUploadPct(2);
    try {
      setActionError(null);
      const url = await uploadSharedFile(f, `clips/${video.id}`, pct => setUploadPct(pct));
      onReplaceClip(video.id, clipId, f.name, url);
      setActiveClipId(clipId);
    } catch (err) {
      setActionError(uploadErrorText(err, f));
    } finally {
      e.target.value = '';
      setTimeout(() => {
        setUploadingClipId(null);
        setUploadPct(0);
      }, 250);
    }
  };

  const handleFinalFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadErrorMsg(null);
    setFinalFileName(f.name);
    setUploadingFinalVideo(true);
    setUploadPct(2);
    try {
      const url = await uploadSharedFile(f, `finals/${video.id}`, pct => setUploadPct(pct));
      setFinalFileUrl(url);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "";
      if (msg === "DRIVE_REQUIRED_FOR_LARGE_FILE") {
        setUploadErrorMsg(`El video final pesa ${(f.size / (1024 * 1024)).toFixed(1)} MB. Súbelo a la carpeta de Google Drive y pega el enlace abajo (o pide al Admin activar el Puente de Google Drive).`);
      } else {
        setUploadErrorMsg("Error al subir. Usa el enlace de Google Drive abajo.");
      }
      setFinalFileUrl("");
    } finally {
      setTimeout(() => {
        setUploadingFinalVideo(false);
        setUploadPct(0);
      }, 250);
    }
  };

  const handleBriefFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingBrief(true);
    setUploadPct(2);
    try {
      setActionError(null);
      const url = await uploadSharedFile(f, `briefs/${video.id}`, pct => setUploadPct(pct));
      onUploadBrief(video.id, f.name, url);
    } catch (err) {
      setActionError(uploadErrorText(err, f));
    } finally {
      e.target.value = '';
      setTimeout(() => {
        setUploadingBrief(false);
        setUploadPct(0);
      }, 250);
    }
  };

  const handleMainImageFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingMainImage(true);
    setUploadPct(2);
    try {
      setActionError(null);
      const url = await uploadSharedFile(f, `main-images/${video.id}`, pct => setUploadPct(pct));
      onUploadMainImage(video.id, f.name, url);
    } catch (err) {
      setActionError(uploadErrorText(err, f));
    } finally {
      e.target.value = '';
      setTimeout(() => {
        setUploadingMainImage(false);
        setUploadPct(0);
      }, 250);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-muted hover:text-text hover:border-accent hover:bg-accent/10 transition-all duration-300">
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
            <p className="text-sm text-muted">{TEAM_ROLE_SHORT}: {teamNames(video)} · Entrega {video.date}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {(isAdmin || isEditor) && (
            <div className="flex items-center gap-2.5 bg-surface-2 border border-mint/40 rounded-lg px-3.5 py-2 hover:border-mint transition-colors">
              <VideoIcon size={16} className="text-mint shrink-0" />
              <div className="text-xs min-w-[115px]">
                <p className="font-medium text-text">Google Drive (Video final)</p>
                <p className="text-muted truncate max-w-[150px]">
                  {getGoogleDriveBridgeUrl()
                    ? "Puente automático activo"
                    : getGoogleDriveFolderUrl()
                    ? "Carpeta vinculada"
                    : "Sin configurar"}
                </p>
              </div>
              {getGoogleDriveFolderUrl() && (
                <a
                  href={getGoogleDriveFolderUrl()}
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs bg-mint/20 hover:bg-mint/30 border border-mint/40 text-mint rounded-md px-2.5 py-1.5 font-medium transition-all flex items-center gap-1 shrink-0"
                >
                  <Upload size={12} /> Abrir Drive
                </a>
              )}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() => {
                    setBridgeUrlDraft(getGoogleDriveBridgeUrl());
                    setFolderUrlDraft(getGoogleDriveFolderUrl());
                    setShowDriveConfigModal(true);
                  }}
                  className="text-xs bg-accent text-on-accent rounded-md px-2.5 py-1.5 font-bold hover:opacity-90 transition-all flex items-center gap-1 shrink-0"
                >
                  <Upload size={12} /> {getGoogleDriveBridgeUrl() || getGoogleDriveFolderUrl() ? "Configurar Drive" : "Conectar Drive"}
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-2 bg-surface-2 border border-line rounded-lg px-3 py-2 hover:border-muted-2 transition-colors">
            <FileText size={16} className="text-accent shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-text">Brief / Trabajo asignado</p>
              <p className="text-muted truncate max-w-[160px]">{video.briefFileName || 'Sin archivo'}</p>
            </div>
            {isAdmin && (
              <>
                <input ref={briefInputRef} type="file" className="hidden" onChange={handleBriefFile} />
                <button
                  onClick={() => briefInputRef.current?.click()}
                  className="text-xs bg-accent text-on-accent rounded-md px-2.5 py-1.5 font-medium hover:shadow-[0_0_15px_rgba(53,214,228,0.4)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-1"
                >
                  {uploadingBrief ? <><Loader2 size={12} className="animate-spin" /> {uploadPct}%</> : <><Upload size={12} /> {video.briefFileName ? "Reemplazar" : "Subir"}</>}
                </button>
              </>
            )}
            <DownloadButton url={video.briefFileUrl} fileName={video.briefFileName} label="Descargar" />
          </div>
          {(isClipper || isAdmin) && (
            <div className="flex items-center gap-3 bg-surface-2 border border-line rounded-lg px-3.5 py-2 hover:border-muted-2 transition-colors">
              <ImageIcon size={16} className="text-violet shrink-0" />
              <div className="text-xs min-w-[110px]">
                <p className="font-medium text-text">Imagen principal</p>
                <p className="text-muted truncate max-w-[150px]">{video.mainImageFileName || "Sin imagen"}</p>
                {video.mainImageStatus && (
                  <span className={`inline-block mt-1 text-[10px] px-2 py-0.5 rounded font-medium ${
                    video.mainImageStatus === "aprobada" ? "bg-mint-dim text-mint" :
                    video.mainImageStatus === "rechazada" ? "bg-red-500/10 text-red-400" :
                    "bg-amber-dim text-amber"
                  }`}>
                    {video.mainImageStatus === "aprobada" ? "Aprobado" : video.mainImageStatus === "rechazada" ? "Rechazado" : "Pendiente de aprobación"}
                  </span>
                )}
              </div>

              {video.mainImageFileName && (
                <button
                  type="button"
                  onClick={() => setShowMainImagePreview(true)}
                  title="Abrir vista previa para revisar imagen"
                  className="w-8 h-8 rounded-lg bg-surface-3 hover:bg-accent/20 border border-line hover:border-accent text-accent flex items-center justify-center transition-all shrink-0"
                >
                  <Eye size={15} />
                </button>
              )}

              {isClipper && (
                <>
                  <input ref={mainImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleMainImageFile} />
                  <button
                    onClick={() => mainImageInputRef.current?.click()}
                    disabled={uploadingMainImage}
                    className="text-xs bg-violet text-on-accent rounded-md px-2.5 py-1.5 font-medium hover:shadow-[0_0_15px_rgba(127,217,232,0.4)] hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-1.5 shrink-0 disabled:opacity-70"
                  >
                    {uploadingMainImage ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        <span className="font-tech font-bold">{uploadPct}%</span>
                      </>
                    ) : (
                      <>
                        <Upload size={12} /> {video.mainImageFileName ? "Reemplazar" : "Subir"}
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {actionError && (
        <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-xs animate-fadeIn">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <p className="flex-1">{actionError}</p>
          <button type="button" onClick={() => setActionError(null)} className="text-red-400/80 hover:text-red-400" title="Cerrar">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Columna izquierda: Reproductor Vertical Grande + Chulito, X y Comentario */}
        <div className="lg:col-span-6 bg-surface-2 border border-line rounded-xl p-5 space-y-4">
          {activeMedia && (
            <div className="flex items-center justify-between gap-2 -mb-1">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${activeFinal ? 'bg-mint-dim text-mint' : 'bg-accent-dim text-accent'}`}>
                {activeFinal ? <VideoIcon size={12} /> : <Play size={12} />}
                {activeFinal ? 'Video final' : `Clip ${activeMedia.name}`}
              </span>
              <span className="text-[11px] text-muted-2 truncate max-w-[60%]">{activeMedia.fileName || ''}</span>
            </div>
          )}
          <div className="relative w-full min-h-[520px] max-h-[640px] bg-surface-3 border border-line rounded-xl flex items-center justify-center overflow-hidden mx-auto">
            {loadingClipMedia ? (
              <div className="text-center p-6 space-y-2">
                <Loader2 size={32} className="text-accent animate-spin mx-auto" />
                <p className="text-xs text-muted">Cargando archivo en alta calidad...</p>
              </div>
            ) : activeMedia?.fileUrl && resolvedClipUrl ? (
              isGoogleDriveUrl(resolvedClipUrl) ? (
                <iframe
                  key={`gdrive-${activeMedia.id}-${resolvedClipUrl}`}
                  src={getGoogleDrivePreviewUrl(resolvedClipUrl) || resolvedClipUrl}
                  className="w-full h-[560px] border-0 rounded-lg bg-black animate-fadeIn"
                  allow="autoplay; encrypted-media; fullscreen"
                  allowFullScreen
                  title={activeMedia.name}
                />
              ) : isImageFile(activeMedia.fileName) ? (
                <img src={resolvedClipUrl} alt={activeMedia.name} className="w-full h-[560px] object-contain animate-fadeIn" />
              ) : (
                <video
                  key={`${activeMedia.id}-${resolvedClipUrl}`}
                  ref={playerRef}
                  src={resolvedClipUrl}
                  controls
                  autoPlay={Boolean(playing)}
                  playsInline
                  onLoadedMetadata={e => { setMediaDuration(e.currentTarget.duration || 0); setMediaTime(0); }}
                  onTimeUpdate={e => setMediaTime(e.currentTarget.currentTime)}
                  className="w-full h-[560px] object-contain bg-black animate-fadeIn"
                />
              )
            ) : (
              <div className="text-center p-6">
                <div className="w-14 h-14 rounded-2xl bg-surface-2 border border-line flex items-center justify-center mx-auto mb-3">
                  <Film size={26} className="text-muted-2" />
                </div>
                <p className="text-sm text-muted">
                  {video.clips.length > 0 || video.finalVideos.length > 0
                    ? 'Selecciona un clip o un video final para verlo aquí'
                    : `Vista previa de ${video.name}`}
                </p>
                <p className="text-xs text-muted-2 mt-1">Formato vertical · reproducción en alta calidad</p>
              </div>
            )}
          </div>

          {activeFinal && (
            <FinalReviewPanel
              video={video}
              final={activeFinal}
              isAdmin={isAdmin}
              canResolve={!isAdmin}
              duration={mediaDuration || video.durationSeconds || 60}
              currentTime={mediaTime}
              canReadPlayerTime={Boolean(resolvedClipUrl && !isGoogleDriveUrl(resolvedClipUrl))}
              onSeek={seekTo}
            />
          )}

          {activeClip && (
            <div className="space-y-3 pt-2 border-t border-line">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-text truncate">Clip activo: {activeClip.name}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 ${clipStatusClasses(activeClip.status)}`}>
                  {clipStatusLabel(activeClip.status)}
                </span>
              </div>

              {(activeClip.rejectionReason || activeClip.adminNote) && (
                <p className="text-xs text-amber bg-amber-dim/40 border border-amber/30 rounded-lg px-3 py-2">
                  Comentario: <strong>{activeClip.rejectionReason || activeClip.adminNote}</strong>
                </p>
              )}

              {isAdmin && (
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => {
                        onSetClipStatus(video.id, activeClip.id, "approved", rejectReason.trim() || undefined);
                        setRejectReason("");
                        setShowRejectBox(false);
                      }}
                      title="Aceptar clip"
                      className={`w-10 h-10 rounded-lg border flex items-center justify-center hover:-translate-y-0.5 transition-all duration-200 shrink-0 ${
                        activeClip.status === "approved"
                          ? "bg-mint text-on-accent border-mint shadow-[0_0_15px_rgba(111,231,200,0.3)]"
                          : "bg-mint/10 text-mint border-mint/30 hover:bg-mint/20"
                      }`}
                    >
                      <Check size={18} />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (rejectReason.trim()) {
                          onSetClipStatus(video.id, activeClip.id, "rejected", rejectReason.trim());
                          setRejectReason("");
                          setShowRejectBox(false);
                        } else {
                          setShowRejectBox(true);
                        }
                      }}
                      title="Rechazar clip"
                      className={`w-10 h-10 rounded-lg border flex items-center justify-center hover:-translate-y-0.5 transition-all duration-200 shrink-0 ${
                        activeClip.status === "rejected"
                          ? "bg-red-500 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                          : "bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20"
                      }`}
                    >
                      <X size={18} />
                    </button>
                    <input
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="Escribe un comentario sobre este clip..."
                      className="flex-1 bg-surface-3 border border-line rounded-lg px-3 py-2 text-xs text-text placeholder:text-muted-2 outline-none focus:border-accent transition-colors"
                    />
                  </div>
                  {showRejectBox && !rejectReason.trim() && (
                    <p className="text-[11px] text-red-400">
                      Escribe un comentario en el campo de arriba y vuelve a presionar la X para confirmar el rechazo.
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Columna derecha: Clips generados y Video final (sin cuadro de Correcciones) */}
        <div className="lg:col-span-6 space-y-4">
          <div className="bg-surface-2 border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-text flex items-center gap-2">
                <Film size={16} className="text-accent" /> {`Clips generados (${video.name})`}
              </h3>
              {isClipper && (
                isMainImageApproved ? (
                  <button onClick={() => {
                    setShowClipForm(s => {
                      const nextOpen = !s;
                      if (nextOpen) {
                        const usedNums = new Set(video.clips.map(c => String(c.name).replace(/\D/g, "")).filter(Boolean));
                        let nextNum = 1;
                        while (usedNums.has(String(nextNum))) nextNum++;
                        setClipName(String(nextNum));
                      }
                      return nextOpen;
                    });
                  }} className="text-sm text-accent hover:text-text flex items-center gap-1 transition-colors">
                    <Plus size={14} /> Agregar
                  </button>
                ) : (
                  <span className="text-xs text-amber bg-amber-dim border border-amber/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 select-none" title="El Administrador debe aprobar primero la Imagen principal">
                    <Lock size={12} /> Requiere Imagen Principal aprobada
                  </span>
                )
              )}
              {isAdmin && video.clips.some(c => c.fileUrl && c.status !== "approved") && (
                <button onClick={() => setConfirmAcceptAll(true)} className="text-xs bg-mint-dim text-mint rounded-md px-2.5 py-1.5 font-medium hover:bg-mint/20 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-1">
                  <Check size={12} /> Aceptar todos los clips
                </button>
              )}
            </div>

            {confirmAcceptAll && (
              <div className="mb-4 p-4 bg-surface-3 border border-line rounded-lg">
                <p className="text-sm text-text mb-3">¿Aceptar todos los clips de {video.name}?</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmAcceptAll(false)} className="flex-1 bg-surface-2 border border-line text-muted rounded-md py-2 text-xs font-medium hover:text-text transition-colors">
                    Cancelar
                  </button>
                  <button
                    onClick={() => { onAcceptAllClips(video.id); setConfirmAcceptAll(false); }}
                    className="flex-1 bg-mint text-on-accent rounded-md py-2 text-xs font-bold hover:shadow-[0_0_15px_rgba(111,231,200,0.4)] transition-all"
                  >
                    Aceptar todos
                  </button>
                </div>
              </div>
            )}

            {showClipForm && isMainImageApproved && (
              <div className="mb-4 space-y-3 p-4 bg-surface-3 rounded-lg border border-line">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-muted">Número de clip (solo números)</span>
                    {clipName && (
                      <span className="text-xs font-tech font-bold text-accent">
                        Seleccionado: #{clipName}
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-5 sm:grid-cols-10 gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(num => {
                      const numStr = String(num);
                      const isSelected = clipName === numStr;
                      const alreadyUsed = video.clips.some(c => String(c.name).trim() === numStr || String(c.name).trim() === `Clip ${numStr}`);
                      return (
                        <button
                          key={num}
                          type="button"
                          onClick={() => setClipName(numStr)}
                          className={`py-2 rounded-md font-tech text-xs font-bold border transition-all ${
                            isSelected
                              ? "bg-accent text-on-accent border-accent shadow-[0_0_12px_rgba(53,214,228,0.4)]"
                              : alreadyUsed
                              ? "bg-surface-2 text-muted-2 border-line opacity-60 hover:opacity-100"
                              : "bg-surface text-text border-line hover:border-accent/60 hover:text-accent"
                          }`}
                        >
                          {num}
                        </button>
                      );
                    })}
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={clipName}
                    onChange={e => setClipName(e.target.value.replace(/\D/g, ""))}
                    placeholder="O escribe el número (ej. 1, 2, 11...)"
                    className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm font-tech font-bold text-accent outline-none focus:border-accent transition-colors"
                  />
                </div>
                <input value={clipNote} onChange={e => setClipNote(e.target.value)} placeholder="Nota (Opcional)" className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent transition-colors" />
                <label className="block bg-surface border border-line border-dashed rounded-md px-3 py-3 text-sm text-muted cursor-pointer hover:border-accent hover:text-accent transition-colors space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 truncate">
                      {uploadingNewClip ? <Loader2 size={16} className="animate-spin text-accent shrink-0" /> : <Upload size={16} className="shrink-0" />}
                      <span className="truncate">{clipFileName || "Subir archivo de clip"}</span>
                    </span>
                    {uploadingNewClip && (
                      <span className="text-xs font-tech font-bold text-accent shrink-0">
                        {uploadPct}%
                      </span>
                    )}
                  </div>
                  {uploadingNewClip && (
                    <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent transition-all duration-150 rounded-full"
                        style={{ width: `${uploadPct}%` }}
                      />
                    </div>
                  )}
                  <input type="file" accept="video/*,image/*" className="hidden" onChange={handleClipFile} disabled={uploadingNewClip} />
                </label>
                <button
                  onClick={() => {
                    if (clipName) {
                      onAddClip(video.id, clipName, clipNote, clipFileName || undefined, clipFileUrl || undefined);
                      setClipName(""); setClipNote(""); setClipFileName(""); setClipFileUrl(""); setShowClipForm(false);
                    }
                  }}
                  disabled={uploadingNewClip || !clipName}
                  className="w-full bg-accent text-on-accent rounded-md py-2 text-sm font-bold disabled:opacity-50 hover:shadow-[0_0_15px_rgba(53,214,228,0.4)] transition-all duration-300"
                >
                  {uploadingNewClip ? `Subiendo clip (${uploadPct}%)...` : "Guardar clip"}
                </button>
              </div>
            )}

            {video.clips.length === 0 ? (
              <div className="text-center py-8 px-4 text-muted border border-dashed border-line rounded-lg space-y-1.5">
                {!isMainImageApproved && isClipper ? (
                  <>
                    <Lock size={20} className="text-amber mx-auto mb-1" />
                    <p className="text-sm font-medium text-text">Subida de clips bloqueada por Control de Calidad</p>
                    <p className="text-xs text-muted max-w-md mx-auto">
                      {!video.mainImageFileName
                        ? "Primero debes subir la Imagen principal en la barra superior para que el Administrador la revise."
                        : video.mainImageStatus === "rechazada"
                        ? `Tu Imagen principal fue rechazada${video.mainImageComment ? `: "${video.mainImageComment}"` : ""}. Sube una nueva Imagen principal arriba.`
                        : "Tu Imagen principal está pendiente de aprobación por el Administrador. Apenas la apruebe podrás subir los clips."}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-muted-2">Sin clips generados</p>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                {video.clips.map(c => (
                  <div
                    key={c.id}
                    onClick={() => c.fileUrl && setActiveClipId(c.id)}
                    className={`p-3 rounded-lg border transition-all duration-300 ${c.fileUrl ? "cursor-pointer" : ""} ${
                      activeClip?.id === c.id ? "bg-accent/10 border-accent/50 shadow-sm" : "bg-surface-3 border-transparent hover:border-muted-2"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <Play size={16} className={`mt-0.5 shrink-0 ${activeClip?.id === c.id ? "text-accent" : "text-muted-2"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-medium text-text">{c.name}</p>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full ${clipStatusClasses(c.status)}`}>
                            {clipStatusLabel(c.status)}
                          </span>
                        </div>
                        {c.note && <p className="text-xs text-muted mb-1">{c.note}</p>}
                        {(c.rejectionReason || c.adminNote) && (
                          <p className="text-xs text-amber mb-1">Comentario: {c.rejectionReason || c.adminNote}</p>
                        )}
                        {c.fileName && (
                          <p className="text-[11px] text-muted-2 truncate flex items-center gap-1"><Film size={11} className="shrink-0" /> {c.fileName}</p>
                        )}
                      </div>
                      {c.fileUrl && <DownloadButton url={c.fileUrl} fileName={c.fileName} />}
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
                            className="text-[11px] text-muted hover:text-accent hover:bg-accent/10 flex items-center gap-1 px-2.5 py-1.5 rounded-md bg-surface border border-line transition-colors"
                          >
                            {uploadingClipId === c.id ? (
                              <>
                                <Loader2 size={12} className="animate-spin text-accent" />
                                <span className="font-tech font-bold text-accent">{uploadPct}%</span>
                              </>
                            ) : (
                              <>
                                <RotateCcw size={12} />
                                {c.fileUrl ? "Reemplazar" : "Subir"}
                              </>
                            )}
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
                    ? "bg-mint-dim text-mint cursor-default"
                    : "bg-accent text-on-accent hover:shadow-[0_0_20px_rgba(53,214,228,0.5)] hover:-translate-y-1"
                }`}
              >
                {video.sentByClipper ? <><CheckCircle2 size={16} /> Clips enviados</> : <><Send size={16} /> Enviar clips de {video.name}</>}
              </button>
            )}
          </div>

          {(isEditor || isAdmin) && (
            <div className="bg-surface-2 border border-line rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-semibold text-text flex items-center gap-2">
                  <VideoIcon size={16} className="text-mint" /> Video final ({video.name})
                </h3>
                <div className="flex items-center gap-2">
                  {(isEditor || isAdmin) && (
                    <button onClick={() => setShowFinalForm(s => !s)} className="text-sm text-accent hover:text-text flex items-center gap-1 transition-colors">
                      <Plus size={14} /> Agregar versión
                    </button>
                  )}
                </div>
              </div>
              {showFinalForm && (isEditor || isAdmin) && (
                <div className="mb-4 space-y-3 p-4 bg-surface-3 rounded-lg border border-line">
                  <input value={finalName} onChange={e => setFinalName(e.target.value)} placeholder="Nombre del video final (ej. Video 1 Final)" className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent transition-colors" />
                  <input value={finalNote} onChange={e => setFinalNote(e.target.value)} placeholder="Nota (Opcional)" className="w-full bg-surface border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent transition-colors" />

                  <label className="block bg-surface border border-line border-dashed rounded-md px-3 py-3 text-sm text-muted cursor-pointer hover:border-accent hover:text-accent transition-colors space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 truncate">
                        {uploadingFinalVideo ? <Loader2 size={16} className="animate-spin text-accent shrink-0" /> : <Upload size={16} className="shrink-0" />}
                        <span className="truncate">
                          {finalFileName || (getGoogleDriveBridgeUrl() ? "Subir archivo (se enviará directo a Google Drive)" : "Seleccionar archivo de video final")}
                        </span>
                      </span>
                      {uploadingFinalVideo && (
                        <span className="text-xs font-tech font-bold text-accent shrink-0">{uploadPct}%</span>
                      )}
                    </div>
                    {uploadingFinalVideo && (
                      <div className="w-full h-1.5 bg-surface-3 rounded-full overflow-hidden">
                        <div className="h-full bg-accent transition-all duration-150 rounded-full" style={{ width: `${uploadPct}%` }} />
                      </div>
                    )}
                    <input type="file" accept="video/*" className="hidden" onChange={handleFinalFile} disabled={uploadingFinalVideo} />
                  </label>

                  <div className="bg-surface border border-mint/30 rounded-md p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs text-mint font-medium flex items-center gap-1.5">
                        <Upload size={13} /> Enlace de Google Drive (Video Final):
                      </span>
                      {getGoogleDriveFolderUrl() && (
                        <a href={getGoogleDriveFolderUrl()} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline font-medium shrink-0">
                          Abrir carpeta Drive →
                        </a>
                      )}
                    </div>
                    <input
                      value={finalDriveLinkInput}
                      onChange={e => {
                        const val = e.target.value;
                        setFinalDriveLinkInput(val);
                        if (val.trim()) {
                          setFinalFileUrl(val.trim());
                          if (!finalFileName) setFinalFileName(`${finalName || video.name} (Google Drive)`);
                          setUploadErrorMsg(null);
                        }
                      }}
                      placeholder="Pega aquí el link de Google Drive del video final..."
                      className="w-full bg-surface-3 border border-line rounded px-3 py-2 text-xs text-text placeholder:text-muted-2 outline-none focus:border-mint"
                    />
                  </div>

                  {uploadErrorMsg && (
                    <p className="text-xs text-amber bg-amber-dim/40 border border-amber/40 rounded-md px-3 py-2">
                      {uploadErrorMsg}
                    </p>
                  )}

                  <button
                    onClick={() => {
                      const fUrl = finalDriveLinkInput.trim() || finalFileUrl;
                      const fName = finalFileName || (finalDriveLinkInput.trim() ? `${finalName || video.name} (Drive)` : "");
                      if ((finalName || video.name) && fUrl) {
                        onAddFinalVideo(video.id, finalName || video.name, finalNote, fName || undefined, fUrl);
                        setFinalName(""); setFinalNote(""); setFinalFileName(""); setFinalFileUrl(""); setFinalDriveLinkInput(""); setUploadErrorMsg(null); setShowFinalForm(false);
                      }
                    }}
                    disabled={uploadingFinalVideo || (!finalFileUrl && !finalDriveLinkInput.trim())}
                    className="w-full bg-accent text-on-accent rounded-md py-2.5 text-sm font-bold disabled:opacity-50 hover:shadow-[0_0_15px_rgba(53,214,228,0.4)] transition-all duration-300"
                  >
                    {uploadingFinalVideo ? `Subiendo a Google Drive (${uploadPct}%)...` : "Guardar video final"}
                  </button>
                </div>
              )}
              {video.finalVideos.length === 0 ? (
                <div className="text-center py-6 text-muted-2 border border-dashed border-line rounded-lg">
                  <p className="text-sm">Sin video final</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {video.finalVideos.map((fv, idx) => {
                    const isPlayingThis = activeFinal?.id === fv.id;
                    const isLatest = idx === video.finalVideos.length - 1;
                    return (
                      <div
                        key={fv.id}
                        onClick={() => fv.fileUrl && setPlaying({ kind: 'final', id: fv.id })}
                        className={`p-3 rounded-lg border transition-all duration-200 ${fv.fileUrl ? 'cursor-pointer' : ''} ${
                          isPlayingThis ? 'bg-mint/10 border-mint/50' : 'bg-surface-3 border-transparent hover:border-line'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <CheckCircle2 size={16} className="text-mint mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-medium text-text">{fv.name}</p>
                              {(() => {
                                const open = video.corrections.filter(c => !c.resolved && (c.finalId === fv.id || (!c.finalId && isLatest))).length;
                                return open > 0 ? <span className="text-[10px] font-tech px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">{open} corrección(es)</span> : null;
                              })()}
                              {fv.status === 'approved' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-mint-dim text-mint">Aprobado</span>}
                              {video.finalVideos.length > 1 && (
                                <span className={`text-[10px] font-tech px-1.5 py-0.5 rounded ${isLatest ? 'bg-mint-dim text-mint' : 'bg-surface-2 text-muted-2'}`}>
                                  {isLatest ? 'Última versión' : `v${idx + 1}`}
                                </span>
                              )}
                            </div>
                            {fv.note && <p className="text-xs text-muted mb-1">{fv.note}</p>}
                            {fv.fileName && (
                              <p className="text-[11px] text-muted-2 truncate flex items-center gap-1"><VideoIcon size={11} className="shrink-0" /> {fv.fileName}</p>
                            )}
                          </div>
                          {fv.fileUrl && <DownloadButton url={fv.fileUrl} fileName={fv.fileName || `${fv.name}.mp4`} />}
                          {fv.fileUrl && (
                            isPlayingThis ? (
                              <span className="text-[11px] text-mint flex items-center gap-1 shrink-0 px-2.5 py-1.5 rounded-md bg-mint-dim border border-mint/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" /> En el visor
                              </span>
                            ) : (
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); setPlaying({ kind: 'final', id: fv.id }); }}
                                className="text-[11px] text-muted hover:text-accent flex items-center gap-1 shrink-0 px-2.5 py-1.5 rounded-md bg-surface border border-line hover:border-accent/50 transition-colors"
                              >
                                <Eye size={12} /> Ver
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
          )}
        </div>
      </div>

      {/* Última sección abajo: Estado de QC (sin botones de Aprobar Senda ni Aprobar Cliente) */}
      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium text-text">Estado de QC ({video.name})</p>
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
                className={`text-xs font-medium px-3.5 py-2 rounded-md border transition-all duration-300 hover:-translate-y-0.5 ${
                  video.qc === q
                    ? "bg-accent text-on-accent border-accent shadow-[0_0_10px_rgba(53,214,228,0.3)]"
                    : "bg-surface-3 text-muted border-line hover:text-text hover:border-muted-2"
                }`}
              >
                {qcStatusLabel(q, video)}
              </button>
            ) : (
              <span
                key={q}
                className={`text-xs font-medium px-3.5 py-2 rounded-md border cursor-default select-none ${
                  video.qc === q
                    ? "bg-accent text-on-accent border-accent shadow-[0_0_10px_rgba(53,214,228,0.2)]"
                    : "bg-surface-3 text-muted-2 border-line opacity-60"
                }`}
              >
                {qcStatusLabel(q, video)}
              </span>
            )
          ))}
        </div>
      </div>


      {showDriveConfigModal && isAdmin && (
        <div
          className="fixed inset-0 z-[75] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowDriveConfigModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-surface-2 border border-line rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-text">Conectar Google Drive (Videos finales)</h3>
                <p className="text-xs text-muted">Para que el equipo suba el video final directo a Drive, sin llenar ni cobrar extra en Supabase.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowDriveConfigModal(false)}
                className="w-8 h-8 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  1. Enlace de tu carpeta compartida de Google Drive
                </label>
                <input
                  value={folderUrlDraft}
                  onChange={e => setFolderUrlDraft(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="w-full bg-surface-3 border border-line rounded-xl px-3.5 py-2 text-xs text-text placeholder:text-muted-2 outline-none focus:border-accent"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1">
                  2. URL del Puente de Subida Directa a Drive (Google Apps Script Web App)
                </label>
                <input
                  value={bridgeUrlDraft}
                  onChange={e => setBridgeUrlDraft(e.target.value)}
                  placeholder="https://script.google.com/macros/s/.../exec"
                  className="w-full bg-surface-3 border border-line rounded-xl px-3.5 py-2 text-xs text-text placeholder:text-muted-2 outline-none focus:border-accent"
                />
              </div>

              <details className="bg-surface-3 border border-line rounded-xl p-3 text-xs text-muted">
                <summary className="cursor-pointer font-semibold text-accent">
                  ¿Cómo obtener la URL del Puente automático en 1 minuto? (Clic para ver código)
                </summary>
                <div className="mt-2 space-y-2 text-[11px] text-muted">
                  <p>1. Entra a <strong>script.google.com</strong> con la cuenta de Google dueña de la carpeta y crea un "Nuevo proyecto".</p>
                  <p>2. Pega este código reemplazando <code>ID_DE_TU_CARPETA</code> por el ID de tu carpeta de Drive:</p>
                  <pre className="bg-black/60 p-2.5 rounded-lg text-[10.5px] text-mint overflow-x-auto select-all">{
`function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var folder = DriveApp.getFolderById("ID_DE_TU_CARPETA");
  var blob = Utilities.newBlob(Utilities.base64Decode(data.base64), data.mimeType, data.fileName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return ContentService.createTextOutput(JSON.stringify({ fileId: file.getId(), url: file.getUrl() }))
    .setMimeType(ContentService.MimeType.JSON);
}`
                  }</pre>
                  <p>3. Dale a <strong>Implementar → Nueva implementación → Aplicación web</strong> (Ejecutar como: <em>Yo</em>, Quién tiene acceso: <em>Cualquier persona</em>) y pega arriba la URL <code>https://script.google.com/.../exec</code>.</p>
                </div>
              </details>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setShowDriveConfigModal(false)}
                className="px-4 py-2 rounded-xl bg-surface-3 text-xs text-muted hover:text-text"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setGoogleDriveFolderUrl(folderUrlDraft);
                  setGoogleDriveBridgeUrl(bridgeUrlDraft);
                  setShowDriveConfigModal(false);
                }}
                className="px-4 py-2 rounded-xl bg-accent text-on-accent text-xs font-display font-bold hover:opacity-95"
              >
                Guardar Conexión Drive
              </button>
            </div>
          </div>
        </div>
      )}

      {showMainImagePreview && video.mainImageFileName && (
        <div
          className="fixed inset-0 z-[70] bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowMainImagePreview(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-surface-2 border border-line rounded-2xl max-w-2xl w-full p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <ImageIcon size={18} className="text-violet shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-display text-base font-bold text-text truncate">
                    Imagen principal · {brandName ? `${brandName} · ${video.name}` : video.name}
                  </h3>
                  <p className="text-xs text-muted truncate">{video.mainImageFileName}</p>
                </div>
                {video.mainImageStatus && (
                  <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full shrink-0 ${
                    video.mainImageStatus === "aprobada"
                      ? "bg-mint-dim text-mint"
                      : video.mainImageStatus === "rechazada"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-amber-dim text-amber"
                  }`}>
                    {video.mainImageStatus === "aprobada"
                      ? "Aprobado"
                      : video.mainImageStatus === "rechazada"
                      ? "Rechazado"
                      : "Pendiente de aprobación"}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => setShowMainImagePreview(false)}
                className="w-8 h-8 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            <div className="bg-surface-3 border border-line rounded-xl overflow-hidden flex items-center justify-center max-h-[60vh] min-h-[260px]">
              {video.mainImageFileUrl ? (
                <img
                  src={resolvedMainImgUrl || video.mainImageFileUrl}
                  alt={video.mainImageFileName}
                  className="max-h-[60vh] w-auto object-contain"
                />
              ) : (
                <p className="text-sm text-muted py-12">Vista previa no disponible para este archivo.</p>
              )}
            </div>

            {video.mainImageComment && (
              <div className="bg-surface-3 border border-line rounded-xl px-3.5 py-2.5 text-xs text-muted">
                <span className="text-muted">Comentario registrado: </span>
                <strong className="text-amber">{video.mainImageComment}</strong>
              </div>
            )}

            {isAdmin && (
              <div className="space-y-3 pt-1 border-t border-line">
                <input
                  value={mainImageComment}
                  onChange={e => setMainImageComment(e.target.value)}
                  placeholder="Comentarios sobre la imagen principal (opcional)..."
                  className="w-full bg-surface-3 border border-line rounded-xl px-3.5 py-2.5 text-xs text-text placeholder:text-muted-2 outline-none focus:border-accent transition-colors"
                />
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      onSetMainImageStatus(video.id, "aprobada", mainImageComment.trim());
                      setMainImageComment("");
                      setShowMainImagePreview(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-mint text-on-accent text-xs font-display font-bold flex items-center justify-center gap-1.5 hover:opacity-95 transition-opacity"
                  >
                    <ThumbsUp size={14} /> Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSetMainImageStatus(video.id, "rechazada", mainImageComment.trim());
                      setMainImageComment("");
                      setShowMainImagePreview(false);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-display font-bold flex items-center justify-center gap-1.5 hover:bg-red-500/30 transition-colors"
                  >
                    <ThumbsDown size={14} /> Rechazar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function parseTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.max(0, Math.round(Number(t)));
  const m = t.match(/^(\d{1,3}):([0-5]?\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Botón sutil de descarga directa (sin abrir pestañas) con progreso y confirmación. */
function DownloadButton({ url, fileName, label, className = '' }: { url?: string | null; fileName?: string | null; label?: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [pct, setPct] = useState(0);
  const disabled = !url || state === 'loading';
  return (
    <button
      type="button"
      disabled={disabled}
      title={url ? `Descargar ${fileName || ''}`.trim() : 'Sin archivo'}
      onClick={async e => {
        e.stopPropagation();
        if (!url) return;
        setState('loading');
        setPct(0);
        try {
          await downloadMediaFile(url, fileName, p => setPct(p));
          setState('done');
        } catch {
          setState('error');
        } finally {
          setTimeout(() => setState(prev => (prev === 'loading' ? prev : 'idle')), 1800);
        }
      }}
      className={`inline-flex items-center justify-center gap-1.5 h-8 ${label ? 'px-2.5' : 'w-8'} rounded-lg border text-[11px] font-medium shrink-0 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
        state === 'done'
          ? 'bg-mint-dim text-mint border-mint/30'
          : state === 'error'
          ? 'bg-red-500/10 text-red-400 border-red-500/30'
          : 'bg-surface border-line text-muted hover:text-accent hover:border-accent/50 hover:bg-accent/10'
      } ${className}`}
    >
      {state === 'loading' ? (
        <><Loader2 size={13} className="animate-spin text-accent" />{pct > 0 && pct < 100 && <span className="font-tech text-accent">{pct}%</span>}</>
      ) : state === 'done' ? (
        <Check size={13} />
      ) : state === 'error' ? (
        <AlertCircle size={13} />
      ) : (
        <Download size={13} />
      )}
      {label && state !== 'loading' && <span>{state === 'done' ? 'Listo' : state === 'error' ? 'Reintentar' : label}</span>}
    </button>
  );
}

/** Barra de tiempo del video final: cabezal, marcas de corrección y punto seleccionado. */
function CorrectionTimeline({
  duration, currentTime, corrections, pickTime, onPick, onSeek, editable,
}: {
  duration: number; currentTime: number; corrections: Correction[]; pickTime: number | null;
  onPick: (t: number) => void; onSeek: (t: number) => void; editable: boolean;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const safeDur = Math.max(1, duration);
  const pctOf = (t: number) => `${Math.min(100, Math.max(0, (t / safeDur) * 100))}%`;
  const timeAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * safeDur);
  };
  return (
    <div className="select-none">
      <div
        ref={trackRef}
        onClick={e => { const t = timeAt(e.clientX); if (editable) onPick(t); onSeek(t); }}
        className="relative h-9 flex items-center cursor-pointer group"
        title={editable ? 'Haz clic para marcar el momento exacto de la corrección' : 'Haz clic para saltar a ese momento'}
      >
        <div className="w-full h-1.5 bg-surface-3 border border-line rounded-full overflow-hidden">
          <div className="h-full bg-accent/40 transition-[width] duration-150" style={{ width: pctOf(currentTime) }} />
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-accent shadow-[0_0_10px_rgba(53,214,228,0.6)] pointer-events-none" style={{ left: pctOf(currentTime) }} />
        {corrections.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={e => { e.stopPropagation(); onSeek(c.time); }}
            title={`${fmtTime(c.time)} · ${c.text}`}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1 h-6 rounded-full hover:w-1.5 hover:h-7 transition-all ${c.resolved ? 'bg-mint' : 'bg-red-500'}`}
            style={{ left: pctOf(c.time) }}
          />
        ))}
        {editable && pickTime !== null && (
          <div className="absolute -top-1 -translate-x-1/2 flex flex-col items-center pointer-events-none animate-fadeIn" style={{ left: pctOf(pickTime) }}>
            <span className="text-[9px] font-tech font-bold bg-amber text-on-accent rounded px-1 leading-4">{fmtTime(pickTime)}</span>
            <span className="w-px h-5 bg-amber" />
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-2 font-tech">
        <span>0:00</span>
        <span>{fmtTime(currentTime)} / {fmtTime(safeDur)}</span>
      </div>
    </div>
  );
}

/** Revisión del video final: aprobar / pedir correcciones con marcas de tiempo. */
function FinalReviewPanel({
  video, final, isAdmin, canResolve, duration, currentTime, canReadPlayerTime, onSeek,
}: {
  video: Video; final: Clip; isAdmin: boolean; canResolve: boolean; duration: number; currentTime: number;
  canReadPlayerTime: boolean; onSeek: (t: number) => void;
}) {
  const { setFinalVideoStatus, addCorrection, toggleCorrectionResolved, deleteCorrection } = useStore();
  const [comment, setComment] = useState('');
  const [rejectHint, setRejectHint] = useState(false);
  const [pickTime, setPickTime] = useState<number | null>(null);
  const [timeInput, setTimeInput] = useState('');
  const [corrText, setCorrText] = useState('');
  const [justAdded, setJustAdded] = useState(false);

  const isLatest = video.finalVideos[video.finalVideos.length - 1]?.id === final.id;
  const corrections = useMemo(
    () => video.corrections
      .filter(c => c.finalId === final.id || (!c.finalId && isLatest))
      .sort((a, b) => a.time - b.time),
    [video.corrections, final.id, isLatest]
  );
  const pending = corrections.filter(c => !c.resolved).length;
  const effectiveTime = pickTime ?? Math.round(currentTime);

  useEffect(() => { setTimeInput(fmtTime(effectiveTime)); }, [effectiveTime]);
  useEffect(() => { setPickTime(null); setComment(''); setRejectHint(false); }, [final.id]);

  const submitCorrection = () => {
    const text = corrText.trim();
    if (!text) return;
    const t = parseTime(timeInput) ?? effectiveTime;
    addCorrection(video.id, t, text, final.id);
    setCorrText('');
    setPickTime(null);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1600);
  };

  return (
    <div className="space-y-3 pt-2 border-t border-line">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-text truncate">Revisión: {final.name}</p>
        <div className="flex items-center gap-1.5 shrink-0">
          {pending > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 font-tech">{pending} por corregir</span>
          )}
          <span className={`text-[10px] px-2 py-0.5 rounded-full ${final.status === 'approved' ? 'bg-mint-dim text-mint' : final.status === 'rejected' ? 'bg-red-500/10 text-red-400' : 'bg-amber-dim text-amber'}`}>
            {final.status === 'approved' ? 'Aprobado' : final.status === 'rejected' ? 'Con correcciones' : 'Pendiente de revisión'}
          </span>
        </div>
      </div>

      {(final.rejectionReason || final.adminNote) && (
        <p className="text-xs text-amber bg-amber-dim/40 border border-amber/30 rounded-lg px-3 py-2">
          Comentario: <strong>{final.rejectionReason || final.adminNote}</strong>
        </p>
      )}

      {isAdmin && (
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => { setFinalVideoStatus(video.id, final.id, 'approved', comment.trim() || undefined); setComment(''); setRejectHint(false); }}
              title="Aprobar video final"
              className={`w-10 h-10 rounded-lg border flex items-center justify-center hover:-translate-y-0.5 transition-all duration-200 shrink-0 ${
                final.status === 'approved' ? 'bg-mint text-on-accent border-mint shadow-[0_0_15px_rgba(111,231,200,0.3)]' : 'bg-mint/10 text-mint border-mint/30 hover:bg-mint/20'
              }`}
            >
              <Check size={18} />
            </button>
            <button
              type="button"
              onClick={() => {
                if (comment.trim() || pending > 0) {
                  setFinalVideoStatus(video.id, final.id, 'rejected', comment.trim() || `${pending} corrección(es) marcadas en el video`);
                  setComment('');
                  setRejectHint(false);
                } else {
                  setRejectHint(true);
                }
              }}
              title="Pedir correcciones"
              className={`w-10 h-10 rounded-lg border flex items-center justify-center hover:-translate-y-0.5 transition-all duration-200 shrink-0 ${
                final.status === 'rejected' ? 'bg-red-500 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
              }`}
            >
              <X size={18} />
            </button>
            <input
              value={comment}
              onChange={e => setComment(e.target.value)}
              placeholder="Comentario general del video final..."
              className="flex-1 bg-surface-3 border border-line rounded-lg px-3 py-2 text-xs text-text placeholder:text-muted-2 outline-none focus:border-accent transition-colors"
            />
          </div>
          {rejectHint && (
            <p className="text-[11px] text-red-400">Escribe un comentario o marca al menos una corrección con tiempo, y vuelve a presionar la X.</p>
          )}
        </div>
      )}

      <div className="bg-surface-3/60 border border-line rounded-xl p-3 space-y-2.5">
        <p className="text-[11px] font-semibold text-muted flex items-center gap-1.5">
          <Clock size={12} className="text-accent" /> Correcciones en el tiempo del video
        </p>
        <CorrectionTimeline
          duration={duration}
          currentTime={currentTime}
          corrections={corrections}
          pickTime={pickTime}
          onPick={setPickTime}
          onSeek={onSeek}
          editable={isAdmin}
        />

        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1 bg-surface-2 border border-line rounded-lg pl-2 focus-within:border-amber transition-colors">
              <Clock size={12} className="text-amber" />
              <input
                value={timeInput}
                onChange={e => { setTimeInput(e.target.value); const t = parseTime(e.target.value); if (t !== null) setPickTime(t); }}
                className="w-14 bg-transparent py-2 text-xs font-tech font-bold text-amber outline-none"
                title="Minuto:segundo de la corrección"
              />
            </div>
            {canReadPlayerTime && (
              <button
                type="button"
                onClick={() => setPickTime(Math.round(currentTime))}
                className="text-[11px] text-muted hover:text-accent px-2 py-2 rounded-lg bg-surface-2 border border-line hover:border-accent/50 transition-colors"
                title="Usar el momento donde está pausado el video"
              >
                Usar tiempo actual
              </button>
            )}
            <input
              value={corrText}
              onChange={e => setCorrText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') submitCorrection(); }}
              placeholder="¿Qué hay que corregir en este momento?"
              className="flex-1 min-w-[160px] bg-surface-2 border border-line rounded-lg px-3 py-2 text-xs text-text placeholder:text-muted-2 outline-none focus:border-accent transition-colors"
            />
            <button
              type="button"
              onClick={submitCorrection}
              disabled={!corrText.trim()}
              className="flex items-center gap-1 text-xs font-semibold bg-accent text-on-accent rounded-lg px-3 py-2 hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {justAdded ? <><Check size={13} /> Marcada</> : <><Plus size={13} /> Marcar</>}
            </button>
          </div>
        )}
        {isAdmin && !canReadPlayerTime && (
          <p className="text-[10px] text-muted-2">Video de Google Drive: pausa donde quieras corregir y escribe el minuto (ej. 0:42), o haz clic en la barra.</p>
        )}

        {corrections.length === 0 ? (
          <p className="text-[11px] text-muted-2 text-center py-2">
            {isAdmin ? 'Sin correcciones. Pausa el video o haz clic en la barra y describe el ajuste.' : 'Sin correcciones en este video final.'}
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
            {corrections.map(c => (
              <li key={c.id} className={`flex items-start gap-2 rounded-lg px-2.5 py-2 border transition-colors ${c.resolved ? 'bg-mint/5 border-mint/20' : 'bg-surface-2 border-line'}`}>
                <button
                  type="button"
                  onClick={() => onSeek(c.time)}
                  className={`font-tech text-[11px] font-bold px-1.5 py-0.5 rounded shrink-0 transition-colors ${c.resolved ? 'bg-mint-dim text-mint' : 'bg-red-500/10 text-red-400 hover:bg-red-500/20'}`}
                  title="Ir a este momento"
                >
                  {fmtTime(c.time)}
                </button>
                <p className={`flex-1 text-xs leading-snug ${c.resolved ? 'text-muted line-through' : 'text-text'}`}>
                  {c.author === 'cliente' && <span className="text-[10px] font-semibold text-violet mr-1">CLIENTE</span>}
                  {c.text}
                </p>
                {(canResolve || isAdmin) && (
                  <button
                    type="button"
                    onClick={() => toggleCorrectionResolved(video.id, c.id)}
                    title={c.resolved ? 'Marcar como pendiente' : 'Marcar como corregida'}
                    className={`w-6 h-6 rounded-md border flex items-center justify-center shrink-0 transition-colors ${c.resolved ? 'bg-mint text-on-accent border-mint' : 'border-line text-muted-2 hover:text-mint hover:border-mint/50'}`}
                  >
                    <Check size={12} />
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => deleteCorrection(video.id, c.id)}
                    title="Eliminar corrección"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-muted-2 hover:text-red-400 hover:bg-red-500/10 shrink-0 transition-colors"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Tablero de Proyectos Iniciados del Administrador
export function TasksBoard() {
  const { brands, orders, setSelectedVideo, deleteBrandProject } = useStore();
  const [filter, setFilter] = useState<'todos' | QcStatus>('todos');
  const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null);
  const [confirmDeleteBrandId, setConfirmDeleteBrandId] = useState<string | null>(null);

  const filterOptions: ('todos' | QcStatus)[] = ['todos', 'sin_iniciar', 'pendiente', 'revision', 'correcciones', 'aprobado_senda', 'aprobado_cliente'];

  const brandGroups = useMemo(() => {
    return brands
      .map(b => {
        const sortedVids = [...b.videos].sort((a, bVid) => (a.videoNumber || 0) - (bVid.videoNumber || 0));
        const filteredVids = filter === 'todos' ? sortedVids : sortedVids.filter(v => v.qc === filter);
        const linkedOrder = orders.find(o => sortedVids.some(v => v.orderId === o.id) || `brand-${o.id}` === b.id) || orders.find(o => o.brand.trim().toLowerCase() === b.name.trim().toLowerCase());
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
                ? 'bg-accent text-on-accent border-accent shadow-[0_0_15px_rgba(53,214,228,0.3)]' 
                : 'bg-surface-2 text-muted border-line hover:border-muted-2 hover:text-text'
            }`}
          >
            {f === 'todos' ? 'Todos' : BOARD_QC_LABEL[f]}
          </button>
        ))}
      </div>

      {brandGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-line rounded-2xl bg-surface-2">
          <div className="w-16 h-16 rounded-full bg-surface-3 flex items-center justify-center mb-4">
            <Film className="w-8 h-8 text-muted-2" />
          </div>
          <p className="text-lg font-display font-medium text-text mb-1">Sin resultados</p>
          <p className="text-sm text-muted">No hay videos con este filtro o estado de QC seleccionado.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {brandGroups.map(({ brand, videos, totalVideos, linkedOrder }, idx) => {
            const isOpen = expandedBrandId === brand.id || expandedBrandId === null;
            return (
              <div key={brand.id} className="bg-surface-2 border border-line rounded-2xl overflow-hidden shadow-sm">
                <button
                  type="button"
                  onClick={() => setExpandedBrandId(prev => (prev === brand.id ? '__closed__' : brand.id))}
                  className="w-full flex items-center justify-between gap-4 p-5 hover:bg-surface-3/60 transition-colors text-left"
                >
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="w-8 h-8 rounded-xl bg-accent/10 text-accent border border-accent/30 flex items-center justify-center text-sm font-bold font-tech shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-lg font-display font-bold text-text truncate mb-0.5">
                        {brand.name} · <span className="text-accent font-tech text-sm">{totalVideos} videos</span>
                      </p>
                      <p className="text-xs text-muted truncate flex gap-2">
                        <span>{TEAM_ROLE_SHORT}: <strong className="text-muted">{teamNames(videos[0])}</strong></span>
                        {linkedOrder?.deliveryDate ? <span className="text-muted-2">| Entrega: {linkedOrder.deliveryDate}</span> : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0" onClick={e => e.stopPropagation()}>
                    {confirmDeleteBrandId === brand.id ? (
                      <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/40 rounded-xl px-2.5 py-1">
                        <span className="text-xs text-red-300 font-semibold">¿Borrar proyecto?</span>
                        <button
                          type="button"
                          onClick={() => {
                            deleteBrandProject(brand.id);
                            setConfirmDeleteBrandId(null);
                          }}
                          className="px-2 py-0.5 rounded-lg bg-red-500 text-white text-xs font-bold hover:bg-red-600"
                        >
                          Sí, borrar
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteBrandId(null)}
                          className="px-2 py-0.5 rounded-lg bg-surface-3 text-muted text-xs hover:text-text"
                        >
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteBrandId(brand.id)}
                        title="Eliminar proyecto iniciado"
                        className="p-2 rounded-xl text-muted hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/30 transition-all"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    <ChevronDown size={20} className={`text-muted transition-transform duration-300 ${isOpen ? 'rotate-180 text-accent' : ''}`} />
                  </div>
                </button>

                {isOpen && (
                  <div className="p-4 pt-2 border-t border-line bg-surface space-y-3">
                    {videos.map((v, vIndex) => (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setSelectedVideo(v)}
                        className="w-full flex items-center justify-between gap-4 p-4 bg-surface-2 border border-line rounded-xl hover:border-accent/50 hover:bg-surface-3 transition-all duration-300 text-left group"
                      >
                        <div className="flex items-center gap-4 min-w-0">
                          <span className="w-8 h-8 rounded-lg bg-surface border border-line font-tech text-xs font-bold text-accent flex items-center justify-center shrink-0 group-hover:bg-accent/10 transition-colors">
                            #{v.videoNumber || vIndex + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-text truncate mb-0.5">
                              Video {v.videoNumber || vIndex + 1} <span className="text-muted-2 font-normal ml-1">· {brand.name}</span>
                            </p>
                            <p className="text-[11px] text-muted truncate flex gap-2">
                              <span>Clips: {v.clips.length}</span>
                              <span className="text-muted-2">|</span>
                              <span>Finales: {v.finalVideos.length}</span>
                              <span className="text-muted-2">|</span>
                              <span>Feedback: {v.corrections.length}</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-xs font-semibold px-3 py-1 rounded-full ${BOARD_QC_CLASSES[v.qc]}`}>
                            {getProcessBadgeLabel(v)}
                          </span>
                          <ChevronRight size={18} className="text-muted-2 group-hover:text-accent transition-colors" />
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
