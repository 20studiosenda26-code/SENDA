import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { Brand, Worker, NotificationItem, NotificationCategory, Role, ThemeMode, ViewKey, Config, PaidHistoryEntry, ChatMessage, Video, QcStatus, CalendarEvent, MainImageStatus, ClassroomModule, EmailLogEntry } from './types';
import { INITIAL_BRANDS, INITIAL_WORKERS, INITIAL_NOTIFICATIONS, INITIAL_PAID_HISTORY, INITIAL_CHAT, CONFIG, CALENDAR_EVENTS, CLASSROOM_MODULES } from './data';

// --- Persistencia local: todo lo que se sube (briefs, clips, imagenes, videos
// finales, correcciones, notas) queda guardado en la plataforma (localStorage)
// y sobrevive a recargas de página, para que cualquiera con acceso lo vea. ---
const STORAGE_PREFIX = 'senda_platform_';

function loadState<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveState<T>(key: string, value: T) {
  try {
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(value));
  } catch {
    // almacenamiento lleno o no disponible: se ignora silenciosamente
  }
}

// --- Notificaciones ---
// Cada rol solo puede recibir ciertas categorías de notificación, tal como
// se definió con el cliente: el clíper y el editor reciben únicamente lo
// que les corresponde a su flujo de trabajo; el admin recibe todo.
const CATEGORIES_BY_ROLE: Record<Role, NotificationCategory[]> = {
  clipper: ['trabajo_asignado', 'qc_clip', 'racha', 'pago_50', 'pago_100', 'mensaje'],
  editor: ['trabajo_asignado', 'clips_enviados', 'qc_video', 'racha', 'pago_50', 'pago_100', 'mensaje'],
  admin: ['trabajo_asignado', 'clips_enviados', 'qc_clip', 'qc_video', 'racha', 'pago_50', 'pago_100', 'mensaje', 'sistema'],
};

const DAY_MS = 24 * 60 * 60 * 1000;

// Las notificaciones de clíper y editor se reinician cada 24 horas (se
// guardan todas mientras tanto). Las del admin nunca se reinician solas:
// solo se borran manualmente desde el panel de administración.
function applyNotificationReset(list: NotificationItem[]): NotificationItem[] {
  const now = Date.now();
  const resetRoles: Role[] = ['clipper', 'editor'];
  let result = list;
  for (const r of resetRoles) {
    const key = STORAGE_PREFIX + 'notif_reset_' + r;
    const lastResetRaw = localStorage.getItem(key);
    const lastReset = lastResetRaw ? Number(lastResetRaw) : 0;
    if (!lastResetRaw || now - lastReset >= DAY_MS) {
      result = result.filter(n => n.role !== r);
      try { localStorage.setItem(key, String(now)); } catch { /* ignorar */ }
    }
  }
  return result;
}

interface Store {
  role: Role;
  setRole: (r: Role) => void;
  theme: ThemeMode;
  toggleTheme: () => void;
  view: ViewKey;
  setView: (v: ViewKey) => void;
  brands: Brand[];
  workers: Worker[];
  notifications: NotificationItem[];
  deleteNotification: (id: string) => void;
  clearNotifications: (role: Role) => void;
  emailLog: EmailLogEntry[];
  chat: ChatMessage[];
  paidHistory: PaidHistoryEntry[];
  config: Config;
  classroomModules: ClassroomModule[];
  addClassroomModule: (title: string, desc: string, color: string) => void;
  deleteClassroomModule: (moduleId: string) => void;
  addClassroomLesson: (moduleId: string, title: string, videoUrl?: string, fileName?: string) => void;
  deleteClassroomLesson: (moduleId: string, lessonId: string) => void;
  lessonCompletions: Record<string, string[]>;
  markLessonComplete: (workerId: string, lessonId: string) => void;
  currentWorkerId: string;
  setCurrentWorkerId: (id: string) => void;
  selectedVideo: Video | null;
  setSelectedVideo: (v: Video | null) => void;
  selectedClassroomModuleId: string | null;
  setSelectedClassroomModuleId: (id: string | null) => void;
  setQc: (videoId: string, status: QcStatus) => void;
  addClip: (videoId: string, name: string, note: string, fileName?: string, fileUrl?: string) => void;
  addCorrection: (videoId: string, time: number, text: string) => void;
  updateCorrectionTime: (videoId: string, correctionId: string, time: number) => void;
  uploadBrief: (videoId: string, fileName: string, fileUrl: string) => void;
  addFinalVideo: (videoId: string, name: string, note: string, fileName?: string, fileUrl?: string) => void;
  uploadMainImage: (videoId: string, fileName: string, fileUrl: string) => void;
  setMainImageStatus: (videoId: string, status: MainImageStatus, comment: string) => void;
  sendVideo: (videoId: string) => void;
  sendChat: (text: string) => void;
  closeDay: (workerId: string) => void;
  togglePaid50: (videoId: string) => void;
  approveFinal: (videoId: string) => void;
  toggleOnline: (workerId: string) => void;
  calendarEvents: CalendarEvent[];
  addCalendarEvent: (e: Omit<CalendarEvent, 'id'>) => void;
  updateWorkerProfile: (workerId: string, fields: Partial<Pick<Worker, 'phone' | 'email' | 'bankInfo' | 'country' | 'emailNotifications'>>) => void;
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used within StoreProvider');
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [role, setRole] = useState<Role>('clipper');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [view, setView] = useState<ViewKey>('home');
  const [brands, setBrands] = useState<Brand[]>(() => loadState('brands', INITIAL_BRANDS));
  const [workers, setWorkers] = useState<Worker[]>(() => loadState('workers', INITIAL_WORKERS));
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => applyNotificationReset(loadState('notifications', INITIAL_NOTIFICATIONS)));
  const [emailLog, setEmailLog] = useState<EmailLogEntry[]>(() => loadState('emailLog', [] as EmailLogEntry[]));
  const [chat, setChat] = useState<ChatMessage[]>(() => loadState('chat', INITIAL_CHAT));
  const [paidHistory, setPaidHistory] = useState<PaidHistoryEntry[]>(() => loadState('paidHistory', INITIAL_PAID_HISTORY));
  const [config] = useState<Config>(CONFIG);
  const [currentWorkerId, setCurrentWorkerId] = useState('w1');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedClassroomModuleId, setSelectedClassroomModuleId] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => loadState('calendarEvents', CALENDAR_EVENTS));
  const [classroomModules, setClassroomModules] = useState<ClassroomModule[]>(() => loadState('classroomModules', CLASSROOM_MODULES));
  const [lessonCompletions, setLessonCompletions] = useState<Record<string, string[]>>(() => loadState('lessonCompletions', {} as Record<string, string[]>));

  // Guarda automáticamente cualquier cambio (archivos subidos, notas,
  // correcciones, imágenes, videos finales) para que quede visible para
  // quien corresponda incluso después de recargar la página.
  useEffect(() => { saveState('brands', brands); }, [brands]);
  useEffect(() => { saveState('workers', workers); }, [workers]);
  useEffect(() => { saveState('chat', chat); }, [chat]);
  useEffect(() => { saveState('paidHistory', paidHistory); }, [paidHistory]);
  useEffect(() => { saveState('calendarEvents', calendarEvents); }, [calendarEvents]);
  useEffect(() => { saveState('notifications', notifications); }, [notifications]);
  useEffect(() => { saveState('emailLog', emailLog); }, [emailLog]);
  useEffect(() => { saveState('classroomModules', classroomModules); }, [classroomModules]);
  useEffect(() => { saveState('lessonCompletions', lessonCompletions); }, [lessonCompletions]);

  // Revisa cada minuto si ya pasaron 24 horas para reiniciar las
  // notificaciones de clíper/editor mientras la app sigue abierta.
  useEffect(() => {
    const id = setInterval(() => {
      setNotifications(prev => applyNotificationReset(prev));
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // Referencia siempre actualizada a `workers`, para poder leer el correo y
  // la preferencia de notificaciones dentro de callbacks sin generar
  // dependencias circulares ni funciones desactualizadas.
  const workersRef = useRef<Worker[]>(workers);
  useEffect(() => { workersRef.current = workers; }, [workers]);
  const brandsRef = useRef<Brand[]>(brands);
  useEffect(() => { brandsRef.current = brands; }, [brands]);
  const findVideo = useCallback((videoId: string): Video | null => {
    return brandsRef.current.flatMap(b => b.videos).find(v => v.id === videoId) || null;
  }, []);

  // Crea una notificación respetando qué categorías puede recibir cada rol,
  // la guarda (se acumulan todas) y, si el trabajador destino activó
  // "recibir notificaciones al correo", deja registro en el log de correos
  // simulado (ver nota en sendEmailNotification más abajo).
  const pushNotification = useCallback((role: Role, category: NotificationCategory, text: string, workerId?: string | null) => {
    if (!CATEGORIES_BY_ROLE[role].includes(category)) return;
    const item: NotificationItem = {
      id: `notif-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      role, workerId: workerId ?? null, category, text,
      t: new Date().toISOString(),
    };
    setNotifications(prev => [item, ...prev]);

    if (workerId) {
      const w = workersRef.current.find(x => x.id === workerId);
      if (w && w.emailNotifications && w.email) {
        // NOTA IMPORTANTE: esta app es un front-end (SPA) sin servidor propio,
        // por lo que no puede enviar correos reales desde el navegador. Aquí
        // se deja el correo "listo para enviar" en un registro (emailLog),
        // simulando el envío. Para que llegue de verdad a la bandeja de
        // entrada del clíper/editor/admin hace falta conectar un servicio de
        // envío (ej. una función backend con Resend, SendGrid o SMTP) que
        // lea este mismo registro y lo despache.
        setEmailLog(prev => [{
          id: `mail-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          workerId, to: w.email!, subject: 'Notificación de SENDA', body: text,
          t: new Date().toISOString(),
        }, ...prev]);
      }
    }
  }, []);

  const deleteNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearNotifications = useCallback((role: Role) => {
    setNotifications(prev => prev.filter(n => n.role !== role));
  }, []);

  const setSelectedVideo = useCallback((v: Video | null) => {
    setSelectedVideoId(v ? v.id : null);
  }, []);

  const selectedVideo = selectedVideoId
    ? brands.flatMap(b => b.videos).find(v => v.id === selectedVideoId) || null
    : null;

  const toggleTheme = useCallback(() => {
    setTheme(t => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const updateVideo = useCallback((videoId: string, fn: (v: Video) => Video) => {
    setBrands(prev => prev.map(b => ({
      ...b,
      videos: b.videos.map(v => v.id === videoId ? fn(v) : v),
    })));
  }, []);

  const setQc = useCallback((videoId: string, status: QcStatus) => {
    updateVideo(videoId, v => ({ ...v, qc: status }));
    const v = findVideo(videoId);
    if (v) {
      const label = status.replace(/_/g, ' ');
      pushNotification('clipper', 'qc_clip', `Estado de QC de tu clip "${v.name}": ${label}`, v.clipperId);
      pushNotification('editor', 'qc_video', `Estado de QC del video "${v.name}": ${label}`, v.editorId);
      pushNotification('admin', 'qc_video', `${v.name}: estado de QC cambiado a ${label}`);
    }
  }, [updateVideo, findVideo, pushNotification]);

  const addClip = useCallback((videoId: string, name: string, note: string, fileName?: string, fileUrl?: string) => {
    updateVideo(videoId, v => ({
      ...v,
      clips: [...v.clips, { id: `clip-${Date.now()}`, name, note, fileName: fileName || null, fileUrl: fileUrl || null }],
    }));
  }, [updateVideo]);

  const addCorrection = useCallback((videoId: string, time: number, text: string) => {
    updateVideo(videoId, v => ({
      ...v,
      corrections: [...v.corrections, { id: `corr-${Date.now()}`, time, text }],
      qc: v.qc === 'sin_iniciar' || v.qc === 'pendiente' ? 'correcciones' : v.qc,
    }));
  }, [updateVideo]);

  const updateCorrectionTime = useCallback((videoId: string, correctionId: string, time: number) => {
    updateVideo(videoId, v => ({
      ...v,
      corrections: v.corrections.map(c => c.id === correctionId ? { ...c, time } : c),
    }));
  }, [updateVideo]);

  const uploadBrief = useCallback((videoId: string, fileName: string, fileUrl: string) => {
    updateVideo(videoId, v => ({ ...v, briefFileName: fileName, briefFileUrl: fileUrl }));
    const v = findVideo(videoId);
    if (v) {
      pushNotification('clipper', 'trabajo_asignado', `Nuevo trabajo asignado: "${v.name}"`, v.clipperId);
      pushNotification('editor', 'trabajo_asignado', `Nuevo trabajo asignado: "${v.name}"`, v.editorId);
      pushNotification('admin', 'trabajo_asignado', `Se asignó el trabajo "${v.name}" a ${v.clipperName} y ${v.editorName}`);
    }
  }, [updateVideo, findVideo, pushNotification]);

  const addFinalVideo = useCallback((videoId: string, name: string, note: string, fileName?: string, fileUrl?: string) => {
    updateVideo(videoId, v => ({
      ...v,
      finalVideos: [...v.finalVideos, { id: `final-${Date.now()}`, name, note, fileName: fileName || null, fileUrl: fileUrl || null }],
    }));
  }, [updateVideo]);

  const uploadMainImage = useCallback((videoId: string, fileName: string, fileUrl: string) => {
    updateVideo(videoId, v => ({
      ...v,
      mainImageFileName: fileName,
      mainImageFileUrl: fileUrl,
      mainImageStatus: 'pendiente',
      mainImageComment: null,
    }));
  }, [updateVideo]);

  const setMainImageStatus = useCallback((videoId: string, status: MainImageStatus, comment: string) => {
    updateVideo(videoId, v => ({ ...v, mainImageStatus: status, mainImageComment: comment || null }));
  }, [updateVideo]);

  const sendVideo = useCallback((videoId: string) => {
    updateVideo(videoId, v => ({
      ...v,
      sentByClipper: true,
      qc: v.qc === 'sin_iniciar' ? 'pendiente' : v.qc,
    }));
    const v = findVideo(videoId);
    if (v) {
      pushNotification('editor', 'clips_enviados', `Clips de "${v.name}" enviados, listos para empezar a editar`, v.editorId);
      pushNotification('admin', 'clips_enviados', `${v.clipperName} envió los clips de "${v.name}"`);
    }
  }, [updateVideo, findVideo, pushNotification]);

  const sendChat = useCallback((text: string) => {
    setChat(prev => [...prev, { id: `c-${Date.now()}`, type: 'out', text }]);
    // Notifica el mensaje enviado en la bandeja de mensajes: al admin
    // siempre (supervisa todos los canales) y también queda visible como
    // "movimiento" en su panel.
    pushNotification('admin', 'mensaje', `Nuevo mensaje en el chat: "${text}"`);
  }, [pushNotification]);

  const closeDay = useCallback((workerId: string) => {
    setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, dayClosedToday: true } : w));
    const w = workersRef.current.find(x => x.id === workerId);
    if (w) {
      const role: Role = w.role === 'clipper' ? 'clipper' : 'editor';
      pushNotification(role, 'racha', `Racha del día actualizada: ${w.streak} días seguidos`, w.id);
      pushNotification('admin', 'racha', `${w.name} cerró el día con ${w.pointsToday} puntos (racha: ${w.streak})`);
    }
  }, [pushNotification]);

  const togglePaid50 = useCallback((videoId: string) => {
    const v = findVideo(videoId);
    const willBePaid = v ? !v.paid50 : false;
    updateVideo(videoId, vid => ({ ...vid, paid50: !vid.paid50 }));
    if (v && willBePaid) {
      pushNotification('clipper', 'pago_50', `Se liberó el 50% de pago de "${v.name}"`, v.clipperId);
      pushNotification('editor', 'pago_50', `Se liberó el 50% de pago de "${v.name}"`, v.editorId);
      pushNotification('admin', 'pago_50', `50% de pago liberado para "${v.name}" (${v.clipperName} / ${v.editorName})`);
    }
  }, [updateVideo, findVideo, pushNotification]);

  const toggleOnline = useCallback((workerId: string) => {
    setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, online: !w.online } : w));
  }, []);

  const addCalendarEvent = useCallback((e: Omit<CalendarEvent, 'id'>) => {
    setCalendarEvents(prev => [...prev, { ...e, id: `ev-${Date.now()}` }]);
  }, []);

  const updateWorkerProfile = useCallback((workerId: string, fields: Partial<Pick<Worker, 'phone' | 'email' | 'bankInfo' | 'country' | 'emailNotifications'>>) => {
    setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, ...fields } : w));
  }, []);

  const approveFinal = useCallback((videoId: string) => {
    const v = findVideo(videoId);
    const wasAlreadyPaid100 = v ? v.paid100 : true;
    updateVideo(videoId, vid => {
      const updated = { ...vid, finalUploaded: true, paid100: true, qc: 'aprobado_cliente' as QcStatus, editorQc: 'aprobado_cliente' as const };
      if (updated.tierSnapshot && !vid.paid100) {
        setPaidHistory(prev => [...prev, {
          videoName: updated.name,
          clipperId: updated.clipperId,
          editorId: updated.editorId,
          durationKey: updated.duration || '',
          date: new Date().toISOString().slice(0, 10),
          paid100: true,
          tierSnapshot: updated.tierSnapshot!,
        }]);
      }
      return updated;
    });
    if (v && !wasAlreadyPaid100) {
      pushNotification('clipper', 'pago_100', `Se liberó el 100% de pago de "${v.name}"`, v.clipperId);
      pushNotification('editor', 'pago_100', `Se liberó el 100% de pago de "${v.name}"`, v.editorId);
      pushNotification('admin', 'pago_100', `100% de pago liberado para "${v.name}" (${v.clipperName} / ${v.editorName})`);
    }
  }, [updateVideo, findVideo, pushNotification]);

  // --- Classroom (Academia Senda) ---
  const addClassroomModule = useCallback((title: string, desc: string, color: string) => {
    setClassroomModules(prev => [...prev, { id: `mod-${Date.now()}`, title, desc, color, lessons: [] }]);
  }, []);

  const deleteClassroomModule = useCallback((moduleId: string) => {
    setClassroomModules(prev => prev.filter(m => m.id !== moduleId));
  }, []);

  const addClassroomLesson = useCallback((moduleId: string, title: string, videoUrl?: string, fileName?: string) => {
    setClassroomModules(prev => prev.map(m => m.id === moduleId ? {
      ...m,
      lessons: [...m.lessons, { id: `lesson-${Date.now()}`, title, videoUrl: videoUrl || null, fileName: fileName || null }],
    } : m));
  }, []);

  const deleteClassroomLesson = useCallback((moduleId: string, lessonId: string) => {
    setClassroomModules(prev => prev.map(m => m.id === moduleId ? {
      ...m,
      lessons: m.lessons.filter(l => l.id !== lessonId),
    } : m));
  }, []);

  const markLessonComplete = useCallback((workerId: string, lessonId: string) => {
    setLessonCompletions(prev => {
      const current = prev[workerId] || [];
      if (current.includes(lessonId)) return prev;
      return { ...prev, [workerId]: [...current, lessonId] };
    });
  }, []);

  const store: Store = {
    role, setRole, theme, toggleTheme, view, setView,
    brands, workers, notifications, deleteNotification, clearNotifications, emailLog,
    chat, paidHistory, config,
    currentWorkerId, setCurrentWorkerId,
    selectedVideo, setSelectedVideo,
    selectedClassroomModuleId, setSelectedClassroomModuleId,
    setQc, addClip, addCorrection, updateCorrectionTime, uploadBrief, addFinalVideo,
    uploadMainImage, setMainImageStatus, sendVideo,
    sendChat, closeDay, togglePaid50, approveFinal, toggleOnline,
    calendarEvents, addCalendarEvent, updateWorkerProfile,
    classroomModules, addClassroomModule, deleteClassroomModule, addClassroomLesson, deleteClassroomLesson,
    lessonCompletions, markLessonComplete,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
