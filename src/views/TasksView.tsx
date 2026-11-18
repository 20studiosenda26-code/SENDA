import { useStore } from '../store';
import type { Video, QcStatus, ClipStatus, MainImageStatus, Clip } from '../types';
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
  ThumbsUp, ThumbsDown, Check, RotateCcw, Loader2, FolderOpen,
  Clock, ChevronRight, ChevronDown, User, Link2, StickyNote, Folders, Trash2, ArrowLeft, Palette, Settings2
} from 'lucide-react';
import { useState, useRef, useEffect, useMemo } from 'react';
import { AdminTasksRoot } from './AdminTasksPanels';
import { CorrectionTimeline, fmtTime } from '../components/CorrectionTimeline';
import { TimeField } from '../components/TimeField';
import { MediaIdentity } from '../components/MediaIdentity';
import { ClientMirror } from '../components/ClientMirror';
import { findAvatar } from '../lib/avatarGallery';
import { ReassignModal } from '../components/tasks/ReassignModal';
import { allScripts, choiceForSlot } from '../lib/scripts';
import { findStyle } from '../lib/styleCatalog';
import { useDriveVideo } from '../lib/useDriveVideo';
import { isAssignedTo, TEAM_ROLE_SHORT } from '../lib/roles';
import { findOrderForVideo, fmtMoney, unitEconomics, videoEarned } from '../lib/economics';
import { DriveFolderField } from '../components/DriveFolderField';
import { ClientAccountField } from '../components/ClientAccountField';
import { countdownLabel, deadlineMs, fmtDate } from '../components/home/home-bits';
import { adminTurn, WORKER_STEP_TEXT, workerStep } from '../lib/videoFlow';

/** Nombre(s) del responsable: uno solo si la misma persona hace clips y edición. */
function teamNames(v?: Pick<Video, 'clipperName' | 'editorName' | 'clipperId' | 'editorId'> | null): string {
  if (!v) return 'Sin asignar';
  if (!v.editorId || v.editorId === v.clipperId) return v.clipperName || 'Sin asignar';
  if (!v.clipperId) return v.editorName || 'Sin asignar';
  return `${v.clipperName} + ${v.editorName}`;
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
                    {linkedOrder && (linkedOrder.avatarName || linkedOrder.editingStyleName || linkedOrder.briefFileName || (linkedOrder.references && linkedOrder.references.length > 0) || linkedOrder.clientNotes) && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                        <div className="bg-surface-2 border border-line rounded-lg p-2.5">
                          <p className="text-[10px] text-muted-2 uppercase flex items-center gap-1 mb-1"><User size={11} /> Avatar</p>
                          <p className="truncate">{linkedOrder.avatarName || 'Sin avatar especificado'}</p>
                          {linkedOrder.editingStyleName && <p className="truncate text-accent text-[11px] mt-0.5">Estilo: {linkedOrder.editingStyleName}</p>}
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
                            <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full ${BOARD_QC_CLASSES[v.qc]}`} title={getProcessBadgeLabel(v)}>
                              {WORKER_STEP_TEXT[workerStep(v)]}
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
  video, brandName, onClose, onSetQc, onAddClip, onReplaceClip, onSetClipStatus, onAcceptAllClips,
  onUploadBrief, onAddFinalVideo, onUploadMainImage, onSetMainImageStatus, onSendVideo, role,
}: {
  video: Video; brandName: string; onClose: () => void; onSetQc: (id: string, s: QcStatus) => void; onAddClip: (id: string, name: string, note: string, fileName?: string, fileUrl?: string) => void;
  onReplaceClip: (id: string, clipId: string, fileName: string, fileUrl: string) => void; onSetClipStatus: (id: string, clipId: string, status: ClipStatus, reason?: string) => void;
  onSetClipMarkerTime: (id: string, clipId: string, time: number) => void; onAcceptAllClips: (id: string) => void; onAddCorrection: (id: string, time: number, text: string) => void;
  onUpdateCorrectionTime: (id: string, correctionId: string, time: number) => void; onUploadBrief: (id: string, fileName: string, fileUrl: string) => void;
  onAddFinalVideo: (id: string, name: string, note: string, fileName?: string, fileUrl?: string) => void; onUploadMainImage: (id: string, fileName: string, fileUrl: string) => void;
  onSetMainImageStatus: (id: string, status: MainImageStatus, comment: string) => void; onSendVideo: (id: string) => void; role: string;
}) {
  const { setVideoDuration } = useStore();
  const [showClipForm, setShowClipForm] = useState(false);
  const [showFinalForm, setShowFinalForm] = useState(false);
  const [clipName, setClipName] = useState('');
  const [clipNote, setClipNote] = useState('');
  const [clipFileName, setClipFileName] = useState('');
  const [clipFileUrl, setClipFileUrl] = useState('');
  const [finalName, setFinalName] = useState('');
  const [finalNote, setFinalNote] = useState('');
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
  // Drive se reproduce en el reproductor propio; si Google lo bloquea, se usa su visor (sin control de tiempo)
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
  // El video final solo se habilita cuando el admin aceptó TODOS los clips generados
  const allClipsApproved = video.clips.length > 0 && video.clips.every(c => c.status === 'approved');
  const pendingClipsCount = video.clips.filter(c => c.status !== 'approved').length;
  // Carpeta de Drive del proyecto (si el admin la vinculó); si no, la carpeta general
  const { orders: allOrders, clientCatalog, generateBriefPdf } = useStore();
  const [generatingBrief, setGeneratingBrief] = useState(false);
  const projectDriveUrl = findOrderForVideo(video, brandName, allOrders)?.driveFolderUrl || getGoogleDriveFolderUrl();
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
  // Videos de Drive: se descargan una vez y se reproducen desde SENDA (línea de tiempo siempre enlazada)
  const drive = useDriveVideo(activeMedia && !isImageFile(activeMedia.fileName) ? resolvedClipUrl : null);

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
      setNotifiedClips(false);
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

  // --- Contexto del video: pedido, fecha real, videos hermanos, pago y paso actual ---
  const { brands: allBrands, financeSettings, deleteClip, enableExtraClientFeedbackRound, setSelectedVideo: openVideo } = useStore();
  const order = findOrderForVideo(video, brandName, allOrders);
  const makeBriefPdf = async () => {
    if (!order) return;
    setGeneratingBrief(true);
    await generateBriefPdf(order.id);
    setGeneratingBrief(false);
  };
  const deadline = deadlineMs(order?.deliveryDate || video.date, order?.deliveryTime);
  const siblings = (allBrands.find(b => b.videos.some(x => x.id === video.id))?.videos || [])
    .slice()
    .sort((a, b) => (a.videoNumber || 0) - (b.videoNumber || 0));
  const creatorPay = unitEconomics(video, order, financeSettings).creatorPay;
  const earnedHere = videoEarned(video, creatorPay);
  const stepIndex = video.qc === 'aprobado_cliente' ? 4
    : (video.qc === 'aprobado_senda' || video.qc === 'aprobado') ? 3
    : allClipsApproved ? 2
    : isMainImageApproved ? 1 : 0;
  const myStep = workerStep(video);
  const turnText = isAdmin
    ? adminTurn(video)
    : (['subir_imagen', 'subir_clips', 'reemplazar_clips', 'subir_final', 'corregir'] as string[]).includes(myStep) ? WORKER_STEP_TEXT[myStep] : null;
  const waitingText = isAdmin ? (turnText ? null : WORKER_STEP_TEXT[myStep]) : (turnText ? null : WORKER_STEP_TEXT[myStep]);
  const roundsUsed = video.clientFeedbackRoundsUsed ?? 0;
  const roundsMax = video.clientFeedbackMaxRounds ?? 1;
  const pendingReviewClips = video.clips.filter(c => c.fileUrl && (!c.status || c.status === 'pending')).length;
  const [notifiedClips, setNotifiedClips] = useState(false);
  const [confirmDeleteClipId, setConfirmDeleteClipId] = useState<string | null>(null);
  const [mainImageError, setMainImageError] = useState<string | null>(null);
  const [confirmQc, setConfirmQc] = useState<QcStatus | null>(null);
  const clipNumberTaken = Boolean(clipName) && video.clips.some(c => String(c.name).replace(/\D/g, '') === clipName);

  // Escape vuelve a la lista (si no hay un panel abierto encima)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (showMainImagePreview || showDriveConfigModal) return;
      onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, showMainImagePreview, showDriveConfigModal]);

  const decideMainImage = (status: MainImageStatus) => {
    const note = mainImageComment.trim();
    if (status === 'rechazada' && !note) {
      setMainImageError('Escribe qué hay que cambiar para rechazar la imagen.');
      return;
    }
    onSetMainImageStatus(video.id, status, note);
    setMainImageComment('');
    setMainImageError(null);
    setShowMainImagePreview(false);
  };

  return (
    <div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-4 animate-fadeIn">
      {/* Encabezado */}
      <div className="flex flex-col xl:flex-row xl:items-start xl:justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <button onClick={onClose} title="Volver a Tareas (Esc)" className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-muted hover:text-text hover:border-accent hover:bg-accent/10 transition-all shrink-0 mt-0.5">
            <ArrowLeft size={18} />
          </button>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-display text-2xl xl:text-3xl font-bold truncate">
                {brandName ? `${brandName} · ${video.name}` : video.name}
              </h2>
              <span className={`text-xs font-medium px-2.5 py-0.5 rounded-full ${BOARD_QC_CLASSES[video.qc]}`}>{BOARD_QC_LABEL[video.qc]}</span>
            </div>
            <p className="text-sm text-muted mt-0.5 flex flex-wrap gap-x-2">
              <span>{TEAM_ROLE_SHORT}: <span className="text-text">{teamNames(video)}</span></span>
              <span className="text-muted-2">·</span>
              <span>Entrega {fmtDate(order?.deliveryDate || video.date, order?.deliveryTime)}</span>
              {stepIndex < 3 && (
                <span className={Number.isFinite(deadline) && deadline < Date.now() ? 'text-red-400 font-medium' : 'text-amber'}>· {countdownLabel(deadline)}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!isAdmin && (
            <span className="inline-flex items-center gap-2 bg-surface-2 border border-line rounded-lg px-3 py-2 text-xs" title="50% al Aprobado Senda + 50% al Aprobado Cliente">
              <span className="text-muted">Vale</span> <strong className="font-tech text-text">{fmtMoney(creatorPay)}</strong>
              <span className="text-muted-2">·</span>
              <span className="text-muted">ganado</span> <strong className="font-tech text-mint">{fmtMoney(earnedHere)}</strong>
            </span>
          )}
          {siblings.length > 1 && (
            <div className="flex items-center gap-1 bg-surface-2 border border-line rounded-lg p-1" aria-label="Videos del proyecto">
              {siblings.map(sv => {
                const active = sv.id === video.id;
                const doneSv = sv.qc === 'aprobado_cliente' || sv.qc === 'aprobado_senda';
                return (
                  <button
                    key={sv.id}
                    type="button"
                    onClick={() => !active && openVideo(sv)}
                    title={`${sv.name} · ${BOARD_QC_LABEL[sv.qc]}`}
                    className={`relative min-w-[34px] h-8 px-2 rounded-md text-xs font-tech font-bold transition-colors ${active ? 'bg-accent text-on-accent' : 'text-muted hover:text-text hover:bg-surface-3'}`}
                  >
                    {sv.videoNumber || sv.name.replace(/\D/g, '') || '•'}
                    {!active && <span className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${doneSv ? 'bg-mint' : adminTurn(sv) && isAdmin ? 'bg-accent' : 'bg-transparent'}`} />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Barra de pasos */}
      <div className="bg-surface-2 border border-line rounded-xl px-4 py-3">
        <div className="grid grid-cols-5 gap-2">
          {['Imagen principal', 'Clips', 'Video final', 'Aprobado Senda', 'Aprobado cliente'].map((label, i) => (
            <div key={label} className="min-w-0">
              <div className={`h-1.5 rounded-full transition-colors ${i < stepIndex ? 'bg-mint' : i === stepIndex ? 'bg-accent animate-pulse' : 'bg-surface-3'}`} />
              <p className={`text-[11px] mt-1.5 truncate flex items-center gap-1 ${i < stepIndex ? 'text-mint' : i === stepIndex ? 'text-accent font-semibold' : 'text-muted-2'}`}>
                {i < stepIndex ? <CheckCircle2 size={11} /> : <span className="font-tech">{i + 1}</span>} {label}
              </p>
            </div>
          ))}
        </div>
        <p className="text-xs mt-2.5 flex items-center gap-1.5">
          {turnText ? (
            <><span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" /><span className="text-accent font-semibold">Te toca: {turnText}</span></>
          ) : (
            <><Clock size={12} className="text-muted-2" /><span className="text-muted">{waitingText}</span></>
          )}
        </p>
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
        {/* Columna izquierda: visor grande + revisión del clip o del video final */}
        <div className="lg:col-span-7 bg-surface-2 border border-line rounded-xl p-5 space-y-4 lg:sticky lg:top-20">
          {activeMedia && (
            <div className="flex items-center justify-between gap-2 -mb-1">
              <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full ${activeFinal ? 'bg-mint-dim text-mint' : 'bg-accent-dim text-accent'}`}>
                {activeFinal ? <VideoIcon size={12} /> : <Play size={12} />}
                {activeFinal ? 'Video final' : `Clip ${activeMedia.name}`}
              </span>

            </div>
          )}
          <div className="relative w-full min-h-[520px] max-h-[640px] bg-surface-3 border border-line rounded-xl flex items-center justify-center overflow-hidden mx-auto">
            {loadingClipMedia || drive.loading ? (
              <div className="text-center p-6 space-y-2">
                <Loader2 size={32} className="text-accent animate-spin mx-auto" />
                <p className="text-xs text-muted">Cargando archivo en alta calidad...</p>
              </div>
            ) : activeMedia?.fileUrl && resolvedClipUrl ? (
              isGoogleDriveUrl(resolvedClipUrl) && drive.failed && !isImageFile(activeMedia.fileName) ? (
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
                  key={`${activeMedia.id}-${drive.src}`}
                  ref={playerRef}
                  src={drive.src || undefined}
                  onError={drive.onError}
                  controls
                  autoPlay={Boolean(playing)}
                  playsInline
                  onLoadedMetadata={e => {
                    const d = e.currentTarget.duration;
                    setMediaDuration(Number.isFinite(d) ? d : 0);
                    setMediaTime(0);
                    // Se guarda sola la duración real del video final (la usan admin y cliente)
                    if (activeFinal && d > 0 && Number.isFinite(d)) setVideoDuration(video.id, d);
                  }}
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

          {activeMedia?.fileUrl && !isImageFile(activeMedia.fileName) && (
            <MediaIdentity
              label={activeFinal ? `Video final · versión ${activeFinal.version || 1}` : `Clip · ${activeMedia.name}`}
              url={activeMedia.fileUrl}
            />
          )}

          {isAdmin && activeFinal && (
            <ClientMirror video={video} currentUrl={activeFinal.fileUrl || null} clientId={findOrderForVideo(video, brandName, allOrders)?.clientId || null} />
          )}

          {activeFinal && (
            <FinalReviewPanel
              video={video}
              final={activeFinal}
              isAdmin={isAdmin}
              canResolve={!isAdmin}
              duration={mediaDuration || (video.durationKnown ? video.durationSeconds : 0) || Math.max(60, ...video.corrections.map(c => c.time + 5))}
              currentTime={mediaTime}
              canReadPlayerTime={Boolean(resolvedClipUrl && !(isGoogleDriveUrl(resolvedClipUrl) && drive.failed))}
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

        {/* Columna derecha: los pasos del video en orden */}
        <div className="lg:col-span-5 space-y-4">
          {/* Paso 1 · Imagen principal */}
          <div className="bg-surface-2 border border-line rounded-xl p-5">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-display text-base font-semibold text-text flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-surface-3 text-[11px] font-tech flex items-center justify-center text-accent">1</span>
                <ImageIcon size={16} className="text-violet" /> Imagen principal
              </h3>
              {video.mainImageStatus && (
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  video.mainImageStatus === 'aprobada' ? 'bg-mint-dim text-mint' : video.mainImageStatus === 'rechazada' ? 'bg-red-500/10 text-red-400' : 'bg-amber-dim text-amber'
                }`}>
                  {video.mainImageStatus === 'aprobada' ? 'Aprobada' : video.mainImageStatus === 'rechazada' ? 'Rechazada' : 'Esperando aprobación'}
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => video.mainImageFileUrl && setShowMainImagePreview(true)}
                disabled={!video.mainImageFileUrl}
                title={video.mainImageFileUrl ? 'Ver en grande' : 'Sin imagen'}
                className="w-28 h-36 shrink-0 rounded-lg bg-surface-3 border border-line overflow-hidden flex items-center justify-center hover:border-accent/50 transition-colors disabled:cursor-default"
              >
                {video.mainImageFileUrl ? (
                  <img src={resolvedMainImgUrl || video.mainImageFileUrl} alt="Imagen principal" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon size={22} className="text-muted-2" />
                )}
              </button>
              <div className="flex-1 min-w-0 space-y-2">
                <p className="text-xs text-muted truncate">{video.mainImageFileName || 'Todavía no hay imagen principal.'}</p>
                {video.mainImageComment && (
                  <p className="text-xs text-amber bg-amber-dim/40 border border-amber/30 rounded-lg px-2.5 py-1.5">Comentario: <strong>{video.mainImageComment}</strong></p>
                )}
                {isClipper && (
                  <>
                    <input ref={mainImageInputRef} type="file" accept="image/*" className="hidden" onChange={handleMainImageFile} />
                    <button
                      onClick={() => mainImageInputRef.current?.click()}
                      disabled={uploadingMainImage}
                      title={isMainImageApproved ? 'Reemplazarla la vuelve a revisión del admin' : undefined}
                      className="text-xs bg-violet text-on-accent rounded-md px-3 py-1.5 font-medium hover:-translate-y-0.5 transition-all flex items-center gap-1.5 disabled:opacity-70"
                    >
                      {uploadingMainImage
                        ? <><Loader2 size={12} className="animate-spin" /> <span className="font-tech font-bold">{uploadPct}%</span></>
                        : <><Upload size={12} /> {video.mainImageFileName ? 'Reemplazar imagen' : 'Subir imagen'}</>}
                    </button>
                    {isMainImageApproved && <p className="text-[10px] text-muted-2">Si la reemplazas, vuelve a revisión del administrador.</p>}
                  </>
                )}
                {isAdmin && video.mainImageStatus === 'pendiente' && (
                  <div className="space-y-2">
                    <input
                      value={mainImageComment}
                      onChange={e => { setMainImageComment(e.target.value); setMainImageError(null); }}
                      placeholder="Comentario (obligatorio para rechazar)"
                      className="w-full bg-surface-3 border border-line rounded-lg px-3 py-1.5 text-xs text-text placeholder:text-muted-2 outline-none focus:border-accent"
                    />
                    <div className="flex gap-2">
                      <button type="button" onClick={() => decideMainImage('aprobada')} className="flex-1 py-1.5 rounded-lg bg-mint text-on-accent text-xs font-bold flex items-center justify-center gap-1 hover:opacity-90">
                        <ThumbsUp size={13} /> Aprobar
                      </button>
                      <button type="button" onClick={() => decideMainImage('rechazada')} className="flex-1 py-1.5 rounded-lg bg-red-500/15 border border-red-500/40 text-red-300 text-xs font-bold flex items-center justify-center gap-1 hover:bg-red-500/25">
                        <ThumbsDown size={13} /> Rechazar
                      </button>
                    </div>
                    {mainImageError && <p className="text-[11px] text-red-400">{mainImageError}</p>}
                  </div>
                )}
                {isAdmin && !video.mainImageFileName && <p className="text-[11px] text-muted-2">Esperando que el responsable la suba.</p>}
              </div>
            </div>
          </div>

          <div className="bg-surface-2 border border-line rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-base font-semibold text-text flex items-center gap-2">
                <span className="w-5 h-5 rounded-md bg-surface-3 text-[11px] font-tech flex items-center justify-center text-accent">2</span>
                <Film size={16} className="text-accent" /> Clips
                {video.clips.length > 0 && <span className="text-xs font-normal text-muted-2">{video.clips.filter(c => c.status === 'approved').length}/{video.clips.length} aprobados</span>}
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
              {isAdmin && pendingReviewClips > 0 && (
                <button onClick={() => setConfirmAcceptAll(true)} className="text-xs bg-mint-dim text-mint rounded-md px-2.5 py-1.5 font-medium hover:bg-mint/20 hover:-translate-y-0.5 transition-all duration-300 flex items-center gap-1">
                  <Check size={12} /> Aceptar {pendingReviewClips} pendiente{pendingReviewClips === 1 ? "" : "s"}
                </button>
              )}
            </div>

            {confirmAcceptAll && (
              <div className="mb-4 p-4 bg-surface-3 border border-line rounded-lg">
                <p className="text-sm text-text mb-3">¿Aceptar los {pendingReviewClips} clip(s) pendientes de {video.name}? Los rechazados siguen esperando reemplazo.</p>
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
                {clipNumberTaken && <p className="text-[11px] text-amber">Ya hay un clip #{clipName}. Elige otro número o reemplaza ese clip en la lista.</p>}
                {!clipFileUrl && !uploadingNewClip && clipName && !clipNumberTaken && <p className="text-[11px] text-muted-2">Sube el archivo del clip para poder guardarlo.</p>}
                <button
                  onClick={() => {
                    if (clipName && clipFileUrl && !clipNumberTaken) {
                      onAddClip(video.id, clipName, clipNote, clipFileName || undefined, clipFileUrl);
                      setClipName(""); setClipNote(""); setClipFileName(""); setClipFileUrl(""); setShowClipForm(false);
                      setNotifiedClips(false);
                    }
                  }}
                  disabled={uploadingNewClip || !clipName || !clipFileUrl || clipNumberTaken}
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
                    <p className="text-sm font-medium text-text">Los clips se habilitan al aprobar la imagen principal</p>
                    <p className="text-xs text-muted max-w-md mx-auto">
                      {!video.mainImageFileName
                        ? "Primero sube la Imagen principal (paso 1) para que el administrador la revise."
                        : video.mainImageStatus === "rechazada"
                        ? `Tu Imagen principal fue rechazada${video.mainImageComment ? `: "${video.mainImageComment}"` : ""}. Sube una nueva en el paso 1.`
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

                      </div>
                      {isClipper && (
                        <div onClick={e => e.stopPropagation()} className="shrink-0 flex items-center gap-1.5">
                          {c.status !== 'approved' && (
                            confirmDeleteClipId === c.id ? (
                              <span className="flex items-center gap-1 bg-red-500/15 border border-red-500/40 rounded-md px-1.5 py-1">
                                <button type="button" onClick={() => { deleteClip(video.id, c.id); setConfirmDeleteClipId(null); if (activeClip?.id === c.id) setPlaying(null); }} className="text-[10px] font-bold text-white bg-red-500 rounded px-1.5 py-0.5">Quitar</button>
                                <button type="button" onClick={() => setConfirmDeleteClipId(null)} className="text-[10px] text-muted px-1">No</button>
                              </span>
                            ) : (
                              <button type="button" onClick={() => setConfirmDeleteClipId(c.id)} title="Quitar este clip" className="p-1.5 rounded-md text-muted-2 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                                <Trash2 size={12} />
                              </button>
                            )
                          )}
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

            {isClipper && video.clips.length > 0 && (() => {
              const canNotify = !video.sentByClipper || (pendingReviewClips > 0 && !notifiedClips && !allClipsApproved);
              return (
                <button
                  onClick={() => { onSendVideo(video.id); setNotifiedClips(true); }}
                  disabled={!canNotify}
                  className={`w-full mt-4 rounded-lg py-3 text-sm font-bold flex items-center justify-center gap-2 transition-all duration-300 ${
                    !canNotify
                      ? "bg-mint-dim text-mint cursor-default"
                      : "bg-accent text-on-accent hover:shadow-[0_0_20px_rgba(53,214,228,0.5)] hover:-translate-y-0.5"
                  }`}
                >
                  {!video.sentByClipper
                    ? <><Send size={16} /> Enviar clips al administrador</>
                    : canNotify
                    ? <><Send size={16} /> Avisar al admin: {pendingReviewClips} clip(s) nuevos o reemplazados</>
                    : allClipsApproved
                    ? <><CheckCircle2 size={16} /> Clips aprobados</>
                    : <><CheckCircle2 size={16} /> Clips enviados · esperando revisión</>}
                </button>
              );
            })()}
          </div>

          {(isEditor || isAdmin) && (
            <div className="bg-surface-2 border border-line rounded-xl p-5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-display text-base font-semibold text-text flex items-center gap-2">
                  <span className="w-5 h-5 rounded-md bg-surface-3 text-[11px] font-tech flex items-center justify-center text-accent">3</span>
                  <VideoIcon size={16} className="text-mint" /> Video final
                </h3>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setBridgeUrlDraft(getGoogleDriveBridgeUrl());
                        setFolderUrlDraft(getGoogleDriveFolderUrl());
                        setShowDriveConfigModal(true);
                      }}
                      title={getGoogleDriveBridgeUrl() ? 'Puente automático activo' : getGoogleDriveFolderUrl() ? 'Carpeta vinculada' : 'Sin configurar'}
                      className="text-xs text-muted hover:text-mint bg-surface-3 border border-line hover:border-mint/40 rounded-md px-2.5 py-1.5 font-medium flex items-center gap-1.5 transition-colors"
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${getGoogleDriveBridgeUrl() || getGoogleDriveFolderUrl() ? 'bg-mint' : 'bg-muted-2'}`} />
                      Drive
                    </button>
                  )}
                  {isAdmin && !latestFinal && (
                    <span className="text-[11px] text-muted-2">{allClipsApproved ? 'Esperando que lo suban' : 'Se habilita al aceptar todos los clips'}</span>
                  )}
                  {!isAdmin && (allClipsApproved ? (
                    <button onClick={() => setShowFinalForm(s => !s)} className="text-sm text-accent hover:text-text flex items-center gap-1 transition-colors">
                      {latestFinal ? <><RotateCcw size={14} /> Reemplazar</> : <><Plus size={14} /> Subir video final</>}
                    </button>
                  ) : (
                    <span className="text-xs text-amber bg-amber-dim border border-amber/30 px-2.5 py-1 rounded-lg flex items-center gap-1.5 select-none" title="El administrador debe aceptar todos los clips generados">
                      <Lock size={12} /> {video.clips.length === 0 ? 'Primero sube los clips' : `Faltan ${pendingClipsCount} clip(s) por aceptar`}
                    </span>
                  ))}
                </div>
              </div>
              {showFinalForm && !isAdmin && allClipsApproved && (
                <div className="mb-4 space-y-3 p-4 bg-surface-3 rounded-lg border border-line animate-fadeIn">
                  {latestFinal && (
                    <p className="text-xs text-muted">Se reemplazará el video final actual. Las correcciones marcadas se conservan para que el administrador las verifique.</p>
                  )}
                  {/* El video final se entrega SOLO por Google Drive: 1) subirlo a la carpeta del proyecto 2) pegar su enlace */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <a
                      href={projectDriveUrl || undefined}
                      target="_blank"
                      rel="noreferrer"
                      aria-disabled={!projectDriveUrl}
                      className={`flex items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-semibold border transition-colors ${
                        projectDriveUrl ? 'bg-mint/10 border-mint/40 text-mint hover:bg-mint/20' : 'bg-surface border-line text-muted-2 pointer-events-none'
                      }`}
                    >
                      <FolderOpen size={16} /> 1. Abrir carpeta de Drive
                    </a>
                    <div className="flex items-center gap-2 text-xs text-muted bg-surface border border-line rounded-lg px-3 py-2">
                      <Upload size={14} className="text-accent shrink-0" /> Sube ahí el video y copia su enlace
                    </div>
                  </div>
                  {!projectDriveUrl && (
                    <p className="text-[11px] text-amber">El administrador aún no vinculó la carpeta de Drive de este proyecto.</p>
                  )}

                  <div className="space-y-1.5">
                    <span className="text-xs font-medium text-muted">2. Pega el enlace del video final</span>
                    <div className="flex items-center gap-2 bg-surface border border-line rounded-lg px-3 focus-within:border-mint transition-colors">
                      <Link2 size={14} className="text-muted-2 shrink-0" />
                      <input
                        value={finalDriveLinkInput}
                        onChange={e => { setFinalDriveLinkInput(e.target.value); setUploadErrorMsg(null); }}
                        placeholder="https://drive.google.com/file/d/..."
                        className="flex-1 bg-transparent py-2.5 text-xs text-text placeholder:text-muted-2 outline-none"
                      />
                      {finalDriveLinkInput.trim() && (
                        isGoogleDriveUrl(finalDriveLinkInput.trim())
                          ? <CheckCircle2 size={15} className="text-mint shrink-0" />
                          : <AlertCircle size={15} className="text-red-400 shrink-0" />
                      )}
                    </div>
                    <p className="text-[10px] text-muted-2">En Drive: clic derecho al video → Compartir → “Cualquier persona con el enlace” → Copiar enlace.</p>
                  </div>


                  {uploadErrorMsg && (
                    <p className="text-xs text-amber bg-amber-dim/40 border border-amber/40 rounded-md px-3 py-2">{uploadErrorMsg}</p>
                  )}

                  <button
                    onClick={() => {
                      const link = finalDriveLinkInput.trim();
                      if (!isGoogleDriveUrl(link)) {
                        setUploadErrorMsg('Pega un enlace de un archivo de Google Drive (drive.google.com/file/d/...).');
                        return;
                      }
                      onAddFinalVideo(video.id, finalName || `${video.name} final`, finalNote, `${video.name} final (Drive)`, link);
                      setFinalName(""); setFinalNote(""); setFinalDriveLinkInput(""); setUploadErrorMsg(null); setShowFinalForm(false);
                    }}
                    disabled={!finalDriveLinkInput.trim()}
                    className="w-full bg-accent text-on-accent rounded-md py-2.5 text-sm font-bold disabled:opacity-50 hover:shadow-[0_0_15px_rgba(53,214,228,0.4)] transition-all duration-300"
                  >
                    {latestFinal ? "Reemplazar video final" : "Guardar video final"}
                  </button>
                </div>
              )}
              {video.finalVideos.length === 0 ? (
                <div className="text-center py-6 text-muted-2 border border-dashed border-line rounded-lg">
                  <p className="text-sm">Sin video final</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {video.finalVideos.slice(-1).map(fv => {
                    const isPlayingThis = activeFinal?.id === fv.id;
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
                                const open = video.corrections.filter(c => !c.resolved).length;
                                return open > 0 ? <span className="text-[10px] font-tech px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">{open} corrección(es)</span> : null;
                              })()}
                              {fv.status === 'approved' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-mint-dim text-mint">Aprobado</span>}
                              {fv.status === 'rejected' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">Rechazado</span>}
                              {(fv.version || 1) > 1 && <span className="text-[10px] font-tech px-1.5 py-0.5 rounded bg-surface-2 text-muted-2">Reemplazado {(fv.version || 1) - 1}×</span>}
                            </div>
                            {fv.note && <p className="text-xs text-muted mb-1">{fv.note}</p>}
                          </div>
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

          {/* Brief del cliente (lo necesita el responsable para producir) */}
          <div className="bg-surface-2 border border-line rounded-xl p-5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-base font-semibold text-text flex items-center gap-2">
                <FileText size={16} className="text-accent" /> Brief del cliente
              </h3>
              <div className="flex items-center gap-1.5">
                {isAdmin && (
                  <>
                    <input ref={briefInputRef} type="file" className="hidden" onChange={handleBriefFile} />
                    <button
                      onClick={() => briefInputRef.current?.click()}
                      className="text-xs bg-accent text-on-accent rounded-md px-2.5 py-1.5 font-medium hover:-translate-y-0.5 transition-all flex items-center gap-1"
                    >
                      {uploadingBrief ? <><Loader2 size={12} className="animate-spin" /> {uploadPct}%</> : <><Upload size={12} /> {video.briefFileName ? 'Reemplazar archivo' : 'Subir archivo'}</>}
                    </button>
                  </>
                )}
                {(() => {
                  const briefUrl = video.briefFileUrl || order?.briefFileUrl;
                  if (briefUrl) {
                    return <DownloadButton url={briefUrl} fileName={video.briefFileName || order?.briefFileName} label="Descargar brief (PDF)"
                      className="!h-9 !px-3.5 !text-xs !font-semibold !bg-accent !text-on-accent !border-accent hover:!bg-accent-strong hover:!text-on-accent" />;
                  }
                  // Aún no hay PDF: quien lo necesite lo genera al instante con los datos del brief del cliente
                  if (order?.briefConfirmedAt) {
                    return (
                      <button type="button" disabled={generatingBrief} onClick={() => { void makeBriefPdf(); }}
                        className="h-9 px-3.5 rounded-lg bg-accent text-on-accent text-xs font-semibold flex items-center gap-1.5 hover:bg-accent-strong disabled:opacity-60">
                        {generatingBrief ? <><Loader2 size={13} className="animate-spin" /> Generando…</> : <><Download size={13} /> Generar y descargar brief (PDF)</>}
                      </button>
                    );
                  }
                  return <span className="text-[11px] text-muted-2 bg-surface-3 border border-line rounded-lg px-2.5 py-2">El cliente aún no confirma el brief</span>;
                })()}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {(() => {
                // Con servicio de guiones: el guión N, su avatar y su estilo son los del video N
                const idx = (video.videoNumber || 1) - 1;
                const sc = order ? allScripts(order)[idx] : undefined;
                const ch = order ? choiceForSlot(order, idx) : null;
                const avatarId = ch?.avatarId;
                const av = findAvatar(avatarId, clientCatalog.avatars, ch?.avatarImageUrl, ch?.avatarName);
                const customText = ch?.avatarCustomText;
                const refUrl = ch?.avatarRefUrl;
                const avName = ch?.avatarName;
                const styleName = ch?.styleName;
                const styleDesc = findStyle(ch?.styleId, clientCatalog.styles)?.description;
                return (
                  <>
                    {sc && (
                      <details className="bg-surface-3 border border-line rounded-lg p-2.5 col-span-2" open>
                        <summary className="cursor-pointer text-[10px] uppercase tracking-wide text-muted-2 font-tech">Guión {idx + 1} · {sc.title}</summary>
                        {sc.text && <p className="text-text whitespace-pre-line mt-2 leading-relaxed">{sc.text}</p>}
                        {sc.fileUrl && <a href={sc.fileUrl} target="_blank" rel="noreferrer" className="text-accent text-xs font-semibold mt-2 inline-block">Abrir guión en PDF ({sc.fileName || 'archivo'})</a>}
                      </details>
                    )}
                    <div className="bg-surface-3 border border-line rounded-lg p-2.5 flex gap-2.5">
                      {(av?.imageUrl || refUrl) && (
                        <a href={av?.imageUrl || refUrl || '#'} target="_blank" rel="noreferrer" className="w-14 aspect-[3/4] rounded-md overflow-hidden border border-line shrink-0 bg-surface-2">
                          <img src={av?.imageUrl || refUrl || ''} alt="Avatar" className="w-full h-full object-cover" />
                        </a>
                      )}
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-wide text-muted-2 font-tech flex items-center gap-1 mb-1"><User size={11} /> Avatar</p>
                        <p className="text-text">{av?.name || avName || (customText ? 'Avatar propio' : null) || <span className="text-muted-2">Sin elegir</span>}</p>
                        {!av && customText && <p className="text-muted text-[11px] mt-0.5 line-clamp-3">{customText}</p>}
                      </div>
                    </div>
                    <div className="bg-surface-3 border border-line rounded-lg p-2.5">
                      <p className="text-[10px] uppercase tracking-wide text-muted-2 font-tech flex items-center gap-1 mb-1"><Palette size={11} /> Estilo</p>
                      <p className="text-text">{styleName || <span className="text-muted-2">Sin elegir</span>}</p>
                      {styleDesc && <p className="text-muted text-[11px] mt-0.5 line-clamp-3">{styleDesc}</p>}
                    </div>
                  </>
                );
              })()}
              <div className="bg-surface-3 border border-line rounded-lg p-2.5 col-span-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-2 font-tech flex items-center gap-1 mb-1"><Link2 size={11} /> Referencias</p>
                {order?.references && order.references.length > 0 ? (
                  <ul className="space-y-0.5">
                    {order.references.map(r => <li key={r.id}><a href={r.url} target="_blank" rel="noreferrer" className="text-accent hover:text-accent-strong break-all">{r.name}</a></li>)}
                  </ul>
                ) : <p className="text-muted-2">Sin referencias</p>}
              </div>
              <div className="bg-surface-3 border border-line rounded-lg p-2.5 col-span-2">
                <p className="text-[10px] uppercase tracking-wide text-muted-2 font-tech flex items-center gap-1 mb-1"><StickyNote size={11} /> Notas del cliente</p>
                <p className="text-text whitespace-pre-line">{order?.clientNotes || <span className="text-muted-2">Sin notas</span>}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Cliente: rondas de feedback (visible para todos) */}
      {(video.publishedToClient || stepIndex >= 3 || roundsUsed > 0) && (
        <div className="bg-surface-2 border border-line rounded-xl px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm flex items-center gap-2">
            <Eye size={15} className="text-violet" />
            <span className="text-muted">Revisión del cliente:</span>
            <span className="text-text font-medium">
              {video.qc === 'aprobado_cliente' ? 'Aprobado por el cliente' : roundsUsed >= roundsMax ? 'Usó sus rondas de feedback' : 'Puede aprobar o dejar feedback'}
            </span>
            <span className="font-tech text-xs text-muted-2">· ronda {Math.min(roundsUsed, roundsMax)}/{roundsMax}</span>
          </p>
          {isAdmin && video.qc !== 'aprobado_cliente' && roundsUsed >= roundsMax && (
            <button
              type="button"
              onClick={() => enableExtraClientFeedbackRound(video.id)}
              className="text-xs font-semibold text-violet border border-violet/40 rounded-lg px-3 py-1.5 hover:bg-violet/10 transition-colors"
            >
              Dar una ronda extra al cliente
            </button>
          )}
        </div>
      )}

      {/* Estado manual (solo admin, opción avanzada) */}
      {isAdmin && (
        <details className="bg-surface-2 border border-line rounded-xl group">
          <summary className="cursor-pointer select-none px-5 py-3.5 text-sm text-muted hover:text-text flex items-center gap-2">
            <Settings2 size={15} /> Estado manual (avanzado)
            <span className="text-[11px] text-muted-2">· actual: {BOARD_QC_LABEL[video.qc]}</span>
          </summary>
          <div className="px-5 pb-4 space-y-3">
            <p className="text-[11px] text-muted-2">Normalmente el estado cambia solo con cada aprobación. Úsalo solo para corregir un caso puntual.</p>
            <div className="flex flex-wrap gap-2">
              {qcOptions.map(q => (
                <button
                  key={q}
                  onClick={() => {
                    if (q === video.qc) return;
                    if (q === 'aprobado_senda' || q === 'aprobado_cliente') setConfirmQc(q);
                    else onSetQc(video.id, q);
                  }}
                  className={`text-xs font-medium px-3.5 py-2 rounded-md border transition-all ${
                    video.qc === q
                      ? "bg-accent text-on-accent border-accent"
                      : "bg-surface-3 text-muted border-line hover:text-text hover:border-muted-2"
                  }`}
                >
                  {qcStatusLabel(q, video)}
                </button>
              ))}
            </div>
            {confirmQc && (
              <div className="flex items-center justify-between gap-3 flex-wrap bg-amber-dim/40 border border-amber/30 rounded-lg px-3 py-2.5 text-xs animate-fadeIn">
                <span className="text-amber">
                  {confirmQc === 'aprobado_senda'
                    ? 'Esto publica el video al cliente y libera el 50% del pago. ¿Continuar?'
                    : 'Esto marca el video como aprobado por el cliente y libera el 100% del pago. ¿Continuar?'}
                </span>
                <span className="flex gap-2">
                  <button type="button" onClick={() => setConfirmQc(null)} className="px-3 py-1 rounded-md bg-surface-3 text-muted hover:text-text">Cancelar</button>
                  <button type="button" onClick={() => { onSetQc(video.id, confirmQc); setConfirmQc(null); }} className="px-3 py-1 rounded-md bg-amber text-on-accent font-semibold">Sí, cambiar</button>
                </span>
              </div>
            )}
          </div>
        </details>
      )}


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
                  <p>2. Pega este código reemplazando <code>ID_DE_TU_CARPETA</code> por el ID de tu carpeta general. Los videos de cada proyecto irán a la carpeta que vincules en ese proyecto:</p>
                  <pre className="bg-black/60 p-2.5 rounded-lg text-[10.5px] text-mint overflow-x-auto select-all">{
`function doPost(e) {
  var data = JSON.parse(e.postData.contents);
  var folder = DriveApp.getFolderById(data.folderId || "ID_DE_TU_CARPETA");
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
                  placeholder="Comentario (obligatorio para rechazar)..."
                  className="w-full bg-surface-3 border border-line rounded-xl px-3.5 py-2.5 text-xs text-text placeholder:text-muted-2 outline-none focus:border-accent transition-colors"
                />
                {mainImageError && <p className="text-[11px] text-red-400">{mainImageError}</p>}
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => decideMainImage("aprobada")}
                    className="flex-1 py-2.5 rounded-xl bg-mint text-on-accent text-xs font-display font-bold flex items-center justify-center gap-1.5 hover:opacity-95 transition-opacity"
                  >
                    <ThumbsUp size={14} /> Aprobar
                  </button>
                  <button
                    type="button"
                    onClick={() => decideMainImage("rechazada")}
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

/** Revisión del video final: aprobar / pedir correcciones con marcas de tiempo. */
function FinalReviewPanel({
  video, final, isAdmin, canResolve, duration, currentTime, canReadPlayerTime, onSeek,
}: {
  video: Video; final: Clip; isAdmin: boolean; canResolve: boolean; duration: number; currentTime: number;
  canReadPlayerTime: boolean; onSeek: (t: number) => void;
}) {
  const { setFinalVideoStatus, addCorrection, toggleCorrectionResolved, deleteCorrection } = useStore();
  const [pickTime, setPickTime] = useState<number | null>(null);
  const [corrText, setCorrText] = useState('');
  const [justAdded, setJustAdded] = useState(false);
  const [rejectNote, setRejectNote] = useState('');
  const [rejectHint, setRejectHint] = useState(false);

  const corrections = useMemo(
    () => video.corrections
      .slice()
      .sort((a, b) => a.time - b.time),
    [video.corrections]
  );
  const pending = corrections.filter(c => !c.resolved).length;
  const effectiveTime = pickTime ?? Math.round(currentTime);

  useEffect(() => { setPickTime(null); }, [final.id]);

  const submitCorrection = () => {
    const text = corrText.trim();
    if (!text) return;
    const t = effectiveTime;
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

      {(video.qc === 'aprobado_senda' || video.qc === 'aprobado_cliente') && (
        <p className="text-xs text-mint bg-mint-dim/40 border border-mint/30 rounded-lg px-3 py-2 flex items-center gap-1.5">
          <CheckCircle2 size={13} /> {video.qc === 'aprobado_cliente' ? 'Aprobado por el cliente. Video terminado.' : 'Aprobado Senda: ya está en el portal del cliente esperando su revisión.'}
        </p>
      )}

      {isAdmin && video.qc !== 'aprobado_senda' && video.qc !== 'aprobado_cliente' && (
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setFinalVideoStatus(video.id, final.id, 'approved')}
            title="Aprueba el video final: pasa a Aprobado Senda, se publica al cliente y se libera el 50% del pago"
            className={`flex-1 h-10 rounded-lg border flex items-center justify-center gap-1.5 text-xs font-semibold hover:-translate-y-0.5 transition-all duration-200 ${
              final.status === 'approved' ? 'bg-mint text-on-accent border-mint shadow-[0_0_15px_rgba(111,231,200,0.3)]' : 'bg-mint/10 text-mint border-mint/30 hover:bg-mint/20'
            }`}
          >
            <Check size={16} /> {final.status === 'approved' ? 'Aprobado Senda' : 'Aprobar · Aprobado Senda'}
          </button>
          <button
            type="button"
            onClick={() => {
              const note = rejectNote.trim();
              // Rechazar sin decir qué corregir deja al equipo sin saber qué hacer
              if (pending === 0 && !note) { setRejectHint(true); return; }
              const reason = [pending > 0 ? `${pending} corrección(es) marcadas en el video` : '', note].filter(Boolean).join(' · ');
              setFinalVideoStatus(video.id, final.id, 'rejected', reason);
              setRejectNote(''); setRejectHint(false);
            }}
            title="Rechazar: el clipper debe subir el video corregido"
            className={`flex-1 h-10 rounded-lg border flex items-center justify-center gap-1.5 text-xs font-semibold hover:-translate-y-0.5 transition-all duration-200 ${
              final.status === 'rejected' ? 'bg-red-500 text-white border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/20'
            }`}
          >
            <X size={16} /> {final.status === 'rejected' ? 'Rechazado' : 'Rechazar'}
          </button>
        </div>
      )}

      {isAdmin && final.status !== 'approved' && video.qc !== 'aprobado_senda' && video.qc !== 'aprobado_cliente' && (
        <div className="space-y-1">
          <input
            value={rejectNote}
            onChange={e => { setRejectNote(e.target.value); setRejectHint(false); }}
            placeholder="Motivo general del rechazo (opcional si marcas correcciones abajo)"
            className="w-full bg-surface-3 border border-line rounded-lg px-3 py-2 text-xs text-text placeholder:text-muted-2 outline-none focus:border-accent"
          />
          {rejectHint && <p className="text-[11px] text-red-400">Para rechazar, marca al menos una corrección en la línea de tiempo o escribe el motivo.</p>}
        </div>
      )}

      {!isAdmin && final.status === 'rejected' && (
        <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
          El video final fue rechazado. Aplica las correcciones y usa <strong>Reemplazar</strong> en “Video final”.
        </p>
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
            <TimeField
              value={effectiveTime}
              max={duration}
              onChange={t => { setPickTime(t); onSeek(t); }}
            />
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
export function TasksBoard({ scope = 'activos', search = '', person = 'todos', embedded = false }: {
  scope?: 'activos' | 'finalizados';
  search?: string;
  person?: string;
  /** Dentro de la pantalla de Tareas del admin (sin márgenes propios) */
  embedded?: boolean;
}) {
  const { brands, orders, workers, setSelectedVideo, deleteBrandProject } = useStore();
  const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null);
  const [confirmDeleteBrandId, setConfirmDeleteBrandId] = useState<string | null>(null);
  const [reassign, setReassign] = useState<{ orderId: string; brand: string; current: string | null } | null>(null);

  const brandGroups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return brands
      .map(b => {
        const sortedVids = [...b.videos].sort((a, bVid) => (a.videoNumber || 0) - (bVid.videoNumber || 0));
        const linkedOrder = orders.find(o => sortedVids.some(v => v.orderId === o.id) || `brand-${o.id}` === b.id) || null;
        const allApproved = sortedVids.length > 0 && sortedVids.every(v => v.qc === 'aprobado_cliente');
        const dl = deadlineMs(linkedOrder?.deliveryDate || sortedVids[0]?.date, linkedOrder?.deliveryTime);
        return { brand: b, videos: sortedVids, linkedOrder, allApproved, dl };
      })
      .filter(g => g.videos.length > 0)
      .filter(g => (scope === 'finalizados' ? g.allApproved : !g.allApproved))
      .filter(g => !q || g.brand.name.toLowerCase().includes(q))
      .filter(g => person === 'todos' || g.videos.some(v => v.clipperId === person || v.editorId === person))
      .sort((a, b) => (Number.isFinite(a.dl) ? a.dl : Infinity) - (Number.isFinite(b.dl) ? b.dl : Infinity));
  }, [brands, orders, scope, search, person]);

  return (
    <div className={embedded ? 'space-y-3' : 'p-6 max-w-6xl mx-auto space-y-3'}>
      {brandGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-line rounded-2xl bg-surface-2">
          <div className="w-14 h-14 rounded-full bg-surface-3 flex items-center justify-center mb-3">
            <Film className="w-7 h-7 text-muted-2" />
          </div>
          <p className="text-lg font-display font-medium text-text mb-1">{scope === 'finalizados' ? 'Aún no hay proyectos terminados' : 'Sin proyectos en producción'}</p>
          <p className="text-sm text-muted">{search || person !== 'todos' ? 'Prueba con otra búsqueda o responsable.' : scope === 'finalizados' ? 'Aquí quedan los proyectos con todos sus videos aprobados por el cliente.' : 'Asigna un pedido desde Por asignar para empezar.'}</p>
        </div>
      ) : (
        brandGroups.map(({ brand, videos, linkedOrder, dl }) => {
          const isOpen = expandedBrandId === brand.id || (expandedBrandId === null && brandGroups.length <= 3);
          const responsibleId = videos[0]?.clipperId || videos[0]?.editorId || null;
          const responsible = workers.find(w => w.id === responsibleId)?.name || teamNames(videos[0]);
          const doneSenda = videos.filter(v => v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente').length;
          const doneClient = videos.filter(v => v.qc === 'aprobado_cliente').length;
          const late = scope === 'activos' && doneSenda < videos.length && Number.isFinite(dl) && dl < Date.now();
          return (
            <div key={brand.id} className="bg-surface-2 border border-line rounded-xl overflow-hidden">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setExpandedBrandId(prev => (prev === brand.id ? '__closed__' : brand.id))}
                onKeyDown={e => { if (e.key === 'Enter') setExpandedBrandId(prev => (prev === brand.id ? '__closed__' : brand.id)); }}
                className="w-full flex items-center justify-between gap-4 p-4 hover:bg-surface-3/60 transition-colors text-left cursor-pointer"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-base font-display font-bold text-text truncate">
                    {brand.name} <span className="text-muted-2 font-normal text-sm">· {videos.length} video{videos.length === 1 ? '' : 's'}</span>
                  </p>
                  <p className="text-xs text-muted mt-0.5 flex flex-wrap gap-x-2">
                    <span>{TEAM_ROLE_SHORT}: <strong className="text-text font-medium">{responsible}</strong></span>
                    <span className="text-muted-2">·</span>
                    <span>{fmtDate(linkedOrder?.deliveryDate || videos[0]?.date, linkedOrder?.deliveryTime)}</span>
                    {scope === 'activos' && <span className={late ? 'text-red-400 font-medium' : 'text-amber'}>· {countdownLabel(dl)}</span>}
                  </p>
                  <div className="flex items-center gap-2 mt-2 max-w-md">
                    <div className="relative h-1.5 flex-1 bg-surface-3 rounded-full overflow-hidden">
                      <div className="absolute inset-y-0 left-0 bg-accent/40 rounded-full" style={{ width: `${(doneSenda / videos.length) * 100}%` }} />
                      <div className="absolute inset-y-0 left-0 bg-mint rounded-full" style={{ width: `${(doneClient / videos.length) * 100}%` }} />
                    </div>
                    <span className="text-[10px] font-tech text-muted-2 whitespace-nowrap">{doneSenda} Senda · {doneClient} cliente</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                  {scope === 'activos' && linkedOrder && (
                    <button
                      type="button"
                      onClick={() => { setReassign({ orderId: linkedOrder.id, brand: brand.name, current: responsibleId }); }}
                      className="text-xs font-medium text-accent border border-accent/30 rounded-lg px-2.5 py-1.5 hover:bg-accent/10 transition-colors"
                    >
                      Cambiar responsable
                    </button>
                  )}
                  {confirmDeleteBrandId === brand.id ? (
                    <div className="flex items-center gap-1.5 bg-red-500/15 border border-red-500/40 rounded-lg px-2 py-1">
                      <span className="text-[11px] text-red-300 font-semibold">¿Borrar este proyecto?</span>
                      <button type="button" onClick={() => { deleteBrandProject(brand.id); setConfirmDeleteBrandId(null); }} className="px-2 py-0.5 rounded bg-red-500 text-white text-[11px] font-bold hover:bg-red-600">Sí</button>
                      <button type="button" onClick={() => setConfirmDeleteBrandId(null)} className="px-1.5 py-0.5 rounded bg-surface-3 text-muted text-[11px] hover:text-text">No</button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDeleteBrandId(brand.id)} title="Eliminar solo este proyecto" className="p-2 rounded-lg text-muted-2 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                      <Trash2 size={15} />
                    </button>
                  )}
                  <ChevronDown size={18} className={`text-muted transition-transform duration-300 ${isOpen ? 'rotate-180 text-accent' : ''}`} />
                </div>
              </div>

              {isOpen && (
                <div className="p-4 pt-3 border-t border-line bg-surface/60 space-y-3">
                  {linkedOrder && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      <ClientAccountField order={linkedOrder} />
                      <DriveFolderField order={linkedOrder} compact />
                    </div>
                  )}
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
                    {videos.map((v, vIndex) => {
                      const turn = adminTurn(v);
                      return (
                        <button
                          key={v.id}
                          type="button"
                          onClick={() => setSelectedVideo(v)}
                          className={`w-full flex items-center justify-between gap-3 p-3 bg-surface-2 border rounded-lg hover:bg-surface-3 transition-all text-left group ${turn ? 'border-accent/50' : 'border-line hover:border-accent/40'}`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="w-8 h-8 rounded-lg bg-surface border border-line font-tech text-xs font-bold text-accent flex items-center justify-center shrink-0">
                              #{v.videoNumber || vIndex + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-text truncate">{v.name}</p>
                              <p className="text-[11px] truncate">
                                {turn
                                  ? <span className="text-accent font-semibold">Te toca: {turn}</span>
                                  : <span className="text-muted">{WORKER_STEP_TEXT[workerStep(v)]}</span>}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full ${BOARD_QC_CLASSES[v.qc]}`}>{BOARD_QC_LABEL[v.qc]}</span>
                            <ChevronRight size={16} className="text-muted-2 group-hover:text-accent transition-colors" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {reassign && (() => {
        const target = orders.find(o => o.id === reassign.orderId);
        return target ? <ReassignModal order={target} onClose={() => setReassign(null)} /> : null;
      })()}
    </div>
  );
}
