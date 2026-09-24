import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from 'react';
import type { Brand, Worker, NotificationItem, NotificationCategory, Role, ThemeMode, ViewKey, Config, PaidHistoryEntry, ChatMessage, Video, QcStatus, ClipStatus, CalendarEvent, MainImageStatus, ClassroomModule, EmailLogEntry, Contract, ContractSignedUpload, ChatGroup, ChatMsg } from './types';
import { INITIAL_BRANDS, INITIAL_WORKERS, INITIAL_NOTIFICATIONS, INITIAL_PAID_HISTORY, INITIAL_CHAT, CONFIG, CALENDAR_EVENTS, CLASSROOM_MODULES } from './data';
import { loadShared, saveShared, isSupabaseConfigured, supabase, subscribeToTable } from './lib/supabaseClient';
import { useAuth } from './lib/auth';

// --- Perfil "admin" liviano, usado para armar grupos de chat (el Admin
// necesita ver/incluir a los administradores además de clíper/editores). ---
export interface AdminProfile { id: string; name: string; }

function workerFromProfileRow(p: Record<string, unknown>): Worker {
  return {
    id: p.id as string,
    name: (p.name as string) || '',
    role: (p.role as 'clipper' | 'editor'),
    cargo: (p.cargo as string) || ((p.role as string) === 'clipper' ? 'Clipper' : 'Editor(a)'),
    ingreso: (p.created_at as string) ? String(p.created_at).slice(0, 10) : '',
    estado: (p.estado as string) || 'Activo',
    pointsToday: (p.points_today as number) || 0,
    pointsMonth: (p.points_month as number) || 0,
    streak: (p.streak as number) || 0,
    bestStreak: (p.best_streak as number) || 0,
    streakLog: (Array.isArray(p.streak_log) ? p.streak_log : []) as ('on' | 'off')[],
    dayClosedToday: !!p.day_closed_today,
    online: !!p.online,
    phone: (p.phone as string) || '',
    email: (p.contact_email as string) || '',
    bankInfo: (p.bank_info as string) || '',
    country: (p.country as string) || '',
    restDay: (p.rest_day as string) || '',
    emailNotifications: !!p.email_notifications,
  };
}

// --- Persistencia ---
// Las tareas/videos (con sus clips, imágenes principales, notas, estados de
// aprobación/rechazo) y las notificaciones son la información que Clipper y
// Admin comparten entre sí, y por eso viven en Supabase (tabla `platform_kv`,
// ver supabase/migrations): un mismo dato se ve igual desde cualquier
// dispositivo, navegador o sesión. El resto de la plataforma (equipo, chat,
// calendario, academia) no fue parte de esta corrección y sigue igual que
// antes, guardado en localStorage.
//
// Si Supabase todavía no está configurado (faltan las variables de entorno),
// la app no se rompe: sigue guardando en localStorage como respaldo, tal
// como funcionaba antes, hasta que se configure la conexión.
const STORAGE_PREFIX = 'senda_platform_';
type SharedKey = 'brands' | 'notifications';

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

// Guarda un dato compartido (brands/notifications): siempre en localStorage
// como respaldo instantáneo, y además en Supabase cuando está configurado,
// que es la fuente real compartida entre dispositivos.
function persistShared<T>(key: SharedKey, value: T) {
  saveState(key, value);
  if (isSupabaseConfigured) void saveShared(key, value);
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
  replaceClip: (videoId: string, clipId: string, fileName: string, fileUrl: string) => void;
  setClipStatus: (videoId: string, clipId: string, status: ClipStatus, reason?: string) => void;
  setClipMarkerTime: (videoId: string, clipId: string, time: number) => void;
  acceptAllClips: (videoId: string) => void;
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
  updateCalendarEvent: (id: string, patch: Partial<Omit<CalendarEvent, 'id'>>) => void;
  deleteCalendarEvent: (id: string) => void;
  updateWorkerProfile: (workerId: string, fields: Partial<Pick<Worker, 'phone' | 'email' | 'bankInfo' | 'country' | 'emailNotifications'>>) => void;

  // --- Contratos ---
  contracts: Contract[];
  contractSignedUploads: ContractSignedUpload[];
  uploadContract: (title: string, role: 'clipper' | 'editor', workerId: string | null, fileName: string, fileUrl: string) => void;
  deleteContract: (contractId: string) => void;
  uploadSignedContract: (contractId: string, fileName: string, fileUrl: string) => void;

  // --- Chat (grupos + privados) ---
  chatGroups: ChatGroup[];
  chatMessages: ChatMsg[];
  adminProfiles: AdminProfile[];
  createChatGroup: (name: string, memberIds: string[]) => Promise<void>;
  sendChatGroupMessage: (groupId: string, text: string, fileName?: string, fileUrl?: string) => Promise<void>;
  ensureOwnAdminDm: () => Promise<string | null>;
  startAdminDm: (workerId: string) => Promise<string | null>;

  // --- Notificaciones permanentes (para la pestaña "Notificaciones" del chat) ---
  notificationsArchive: NotificationItem[];
}

const Ctx = createContext<Store | null>(null);

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore must be used within StoreProvider');
  return s;
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const role: Role = user?.role || 'clipper';
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

  // El "trabajador actual" siempre debe ser la persona que inició sesión
  // (no un usuario de ejemplo fijo). Así el nombre, cargo, puntos y demás
  // datos que se muestran en Perfil/Inicio/Tareas corresponden siempre a
  // la cuenta con la que se entró, sea quien sea.
  useEffect(() => {
    if (user?.id) setCurrentWorkerId(user.id);
  }, [user?.id]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedClassroomModuleId, setSelectedClassroomModuleId] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => loadState('calendarEvents', CALENDAR_EVENTS));
  const [classroomModules, setClassroomModules] = useState<ClassroomModule[]>(() => loadState('classroomModules', CLASSROOM_MODULES));
  const [lessonCompletions, setLessonCompletions] = useState<Record<string, string[]>>(() => loadState('lessonCompletions', {} as Record<string, string[]>));
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractSignedUploads, setContractSignedUploads] = useState<ContractSignedUpload[]>([]);
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<AdminProfile[]>([]);
  const [notificationsArchive, setNotificationsArchive] = useState<NotificationItem[]>([]);

  // Guarda automáticamente cualquier cambio (archivos subidos, notas,
  // correcciones, imágenes, videos finales) para que quede visible para
  // quien corresponda incluso después de recargar la página.
  useEffect(() => { persistShared('brands', brands); }, [brands]);
  useEffect(() => { saveState('workers', workers); }, [workers]);
  useEffect(() => { saveState('chat', chat); }, [chat]);
  useEffect(() => { saveState('paidHistory', paidHistory); }, [paidHistory]);
  useEffect(() => { saveState('calendarEvents', calendarEvents); }, [calendarEvents]);
  useEffect(() => { persistShared('notifications', notifications); }, [notifications]);
  useEffect(() => { saveState('emailLog', emailLog); }, [emailLog]);
  useEffect(() => { saveState('classroomModules', classroomModules); }, [classroomModules]);
  useEffect(() => { saveState('lessonCompletions', lessonCompletions); }, [lessonCompletions]);

  // Al abrir la plataforma (o entrar desde otro dispositivo/navegador),
  // se trae la versión real y compartida de tareas/clips/imágenes y
  // notificaciones desde Supabase, para que se vea lo mismo en todos lados.
  // Si Supabase no está configurado, se queda con lo que ya se cargó de
  // localStorage arriba (comportamiento anterior).
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    (async () => {
      const remoteBrands = await loadShared<Brand[]>('brands');
      if (active && remoteBrands) setBrands(remoteBrands);
      const remoteNotifications = await loadShared<NotificationItem[]>('notifications');
      if (active && remoteNotifications) setNotifications(applyNotificationReset(remoteNotifications));
    })();
    return () => { active = false; };
  }, []);

  // --- Todo en vivo: cuando algo cambia en Supabase (en cualquier sesión,
  // dispositivo o navegador), se refleja automáticamente aquí, sin que
  // nadie tenga que recargar la página. ---
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const unsub = subscribeToTable('platform_kv', () => {
      void (async () => {
        const remoteBrands = await loadShared<Brand[]>('brands');
        if (remoteBrands) setBrands(remoteBrands);
        const remoteNotifications = await loadShared<NotificationItem[]>('notifications');
        if (remoteNotifications) setNotifications(applyNotificationReset(remoteNotifications));
      })();
    });
    return unsub;
  }, []);

  // Revisa cada minuto si ya pasaron 24 horas para reiniciar las
  // notificaciones de clíper/editor mientras la app sigue abierta.
  useEffect(() => {
    const id = setInterval(() => {
      setNotifications(prev => applyNotificationReset(prev));
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

  // --- Trabajadores reales: se cargan desde `profiles` (usuarios de verdad
  // registrados por el Admin), con toda su información (nombre, cargo,
  // puntos, teléfono, banco, etc.) y se mantienen sincronizados en vivo. ---
  const loadWorkersFromProfiles = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('profiles').select('*');
    if (!data) return;
    const clipperEditor = data.filter((p: Record<string, unknown>) => p.role === 'clipper' || p.role === 'editor');
    setWorkers(clipperEditor.map(workerFromProfileRow));
    setAdminProfiles(
      data
        .filter((p: Record<string, unknown>) => p.role === 'admin')
        .map((p: Record<string, unknown>) => ({ id: p.id as string, name: (p.name as string) || '' }))
    );
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    // Se vuelve a cargar cada vez que cambia la sesión (login/logout), no
    // solo al montar la app: si esto se ejecuta antes de que la sesión de
    // Supabase termine de restaurarse, la consulta a `profiles` (protegida
    // por RLS) puede no traer nada, y sin este re-disparo el perfil de
    // quien inició sesión (sobre todo cliper/editor) se quedaba "vacío"
    // hasta que algo más disparara una recarga.
    void loadWorkersFromProfiles();
    const unsub = subscribeToTable('profiles', () => { void loadWorkersFromProfiles(); });
    return unsub;
  }, [loadWorkersFromProfiles, user?.id]);

  // --- Estado "en línea" automático ---
  // Al iniciar sesión, el cliper/editor debe verse "En línea" de inmediato
  // (antes había que activarlo a mano). Al cerrar sesión o cerrar la
  // pestaña, se marca "No en línea" para que el admin siempre vea el
  // estado real del equipo.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user?.id || role === 'admin') return;
    const workerId = user.id;
    setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, online: true } : w));
    void supabase.from('profiles').update({ online: true }).eq('id', workerId);

    const markOffline = () => {
      if (!supabase) return;
      void supabase.from('profiles').update({ online: false }).eq('id', workerId);
    };
    window.addEventListener('beforeunload', markOffline);
    return () => {
      window.removeEventListener('beforeunload', markOffline);
    };
  }, [user?.id, role]);

  // --- Contratos: carga inicial + tiempo real ---
  const loadContracts = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('contracts').select('*').order('created_at', { ascending: false });
    if (data) {
      setContracts(data.map((c: Record<string, unknown>) => ({
        id: c.id as string, title: c.title as string, role: c.role as 'clipper' | 'editor',
        workerId: (c.worker_id as string) || null, fileName: c.file_name as string, fileUrl: c.file_url as string,
        uploadedBy: (c.uploaded_by as string) || null, createdAt: c.created_at as string,
      })));
    }
    const { data: signed } = await supabase.from('contract_signed_uploads').select('*');
    if (signed) {
      setContractSignedUploads(signed.map((s: Record<string, unknown>) => ({
        id: s.id as string, contractId: s.contract_id as string, workerId: s.worker_id as string,
        fileName: s.file_name as string, fileUrl: s.file_url as string, uploadedAt: s.uploaded_at as string,
      })));
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;
    void loadContracts();
    const unsub1 = subscribeToTable('contracts', () => { void loadContracts(); });
    const unsub2 = subscribeToTable('contract_signed_uploads', () => { void loadContracts(); });
    return () => { unsub1(); unsub2(); };
  }, [loadContracts, user]);

  // --- Chat: grupos, miembros y mensajes, con tiempo real ---
  const loadChat = useCallback(async () => {
    if (!supabase || !user) return;
    const { data: groups } = await supabase.from('chat_groups').select('*').order('created_at', { ascending: true });
    const { data: members } = await supabase.from('chat_group_members').select('*');
    if (groups && members) {
      const byGroup: Record<string, string[]> = {};
      for (const m of members as Record<string, unknown>[]) {
        const gid = m.group_id as string;
        (byGroup[gid] = byGroup[gid] || []).push(m.user_id as string);
      }
      setChatGroups(groups.map((g: Record<string, unknown>) => ({
        id: g.id as string, name: g.name as string, isDm: !!g.is_dm,
        createdBy: (g.created_by as string) || null, createdAt: g.created_at as string,
        memberIds: byGroup[g.id as string] || [],
      })));
    }
    const { data: msgs } = await supabase.from('chat_messages').select('*, profiles(name)').order('created_at', { ascending: true });
    if (msgs) {
      setChatMessages(msgs.map((m: Record<string, unknown>) => ({
        id: m.id as string, groupId: m.group_id as string, senderId: m.sender_id as string,
        senderName: ((m.profiles as { name?: string } | null)?.name) || '',
        text: (m.text as string) || '', fileName: (m.file_name as string) || null, fileUrl: (m.file_url as string) || null,
        createdAt: m.created_at as string,
      })));
    }
  }, [user]);

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;
    void loadChat();
    const unsub1 = subscribeToTable('chat_groups', () => { void loadChat(); });
    const unsub2 = subscribeToTable('chat_group_members', () => { void loadChat(); });
    const unsub3 = subscribeToTable('chat_messages', () => { void loadChat(); });
    return () => { unsub1(); unsub2(); unsub3(); };
  }, [loadChat, user]);

  // Cada persona (clíper/editor) siempre debe tener un chat privado con el
  // Admin listo, sin que nadie tenga que crearlo a mano.
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user || role === 'admin') return;
    (async () => {
      const already = chatGroups.some(g => g.isDm && g.memberIds.includes(user.id));
      if (already) return;
      const { data: existing } = await supabase!
        .from('chat_groups')
        .select('id, chat_group_members!inner(user_id)')
        .eq('is_dm', true)
        .eq('chat_group_members.user_id', user.id)
        .maybeSingle();
      if (existing) return;
      const { data: newGroup } = await supabase!
        .from('chat_groups')
        .insert({ name: `Admin · ${user.name}`, is_dm: true, created_by: user.id })
        .select('id')
        .single();
      if (newGroup) {
        const { data: admins } = await supabase!.from('profiles').select('id').eq('role', 'admin');
        const rows = [{ group_id: newGroup.id, user_id: user.id }, ...((admins || []).map((a: { id: string }) => ({ group_id: newGroup.id, user_id: a.id })))];
        await supabase!.from('chat_group_members').upsert(rows);
        void loadChat();
      }
    })();
  }, [user, role, chatGroups, loadChat]);

  // --- Notificaciones permanentes (pestaña "Notificaciones" del chat) ---
  const loadNotificationsArchive = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.from('notifications_log').select('*').order('created_at', { ascending: false }).limit(500);
    if (data) {
      setNotificationsArchive(data.map((n: Record<string, unknown>) => ({
        id: n.id as string, role: n.role as Role, workerId: (n.worker_id as string) || null,
        category: n.category as NotificationCategory, text: n.text as string, t: n.created_at as string,
      })));
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured || !user) return;
    void loadNotificationsArchive();
    const unsub = subscribeToTable('notifications_log', () => { void loadNotificationsArchive(); });
    return unsub;
  }, [loadNotificationsArchive, user]);

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
    setNotificationsArchive(prev => [item, ...prev]);
    if (isSupabaseConfigured && supabase) {
      void supabase.from('notifications_log').insert({
        id: item.id, role: item.role, worker_id: item.workerId, category: item.category, text: item.text,
      });
    }

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
      clips: [...v.clips, {
        id: `clip-${Date.now()}`, name, note,
        fileName: fileName || null, fileUrl: fileUrl || null,
        status: 'pending', rejectionReason: null, adminNote: null,
        reviewedBy: null, reviewedAt: null, markerTime: null,
        version: 1, previousVersions: [],
      }],
    }));
  }, [updateVideo]);

  // El Clipper reemplaza el archivo de un clip que ya subió (por ejemplo,
  // tras un rechazo). Se conserva el mismo clip (mismo id), se guarda la
  // versión anterior en el historial y vuelve a quedar "pending" para que
  // el Admin lo revise de nuevo.
  const replaceClip = useCallback((videoId: string, clipId: string, fileName: string, fileUrl: string) => {
    updateVideo(videoId, v => ({
      ...v,
      clips: v.clips.map(c => c.id === clipId ? {
        ...c,
        fileName, fileUrl,
        status: 'pending' as ClipStatus,
        rejectionReason: null,
        reviewedBy: null,
        reviewedAt: null,
        markerTime: null,
        version: (c.version || 1) + 1,
        previousVersions: [
          ...(c.previousVersions || []),
          { fileName: c.fileName || null, fileUrl: c.fileUrl || null, replacedAt: new Date().toISOString() },
        ],
      } : c),
    }));
  }, [updateVideo]);

  // El Admin marca un momento concreto (en segundos) dentro del video del
  // clip que está revisando.
  const setClipMarkerTime = useCallback((videoId: string, clipId: string, time: number) => {
    updateVideo(videoId, v => ({
      ...v,
      clips: v.clips.map(c => c.id === clipId ? { ...c, markerTime: time } : c),
    }));
  }, [updateVideo]);

  // El Admin aprueba o rechaza un clip puntual, con motivo opcional (obligatorio
  // en la interfaz cuando se rechaza). Notifica al Clipper correspondiente.
  const setClipStatus = useCallback((videoId: string, clipId: string, status: ClipStatus, reason?: string) => {
    updateVideo(videoId, v => ({
      ...v,
      clips: v.clips.map(c => c.id === clipId ? {
        ...c,
        status,
        rejectionReason: status === 'rejected' ? (reason || '') : null,
        reviewedBy: 'Admin',
        reviewedAt: new Date().toISOString(),
      } : c),
    }));
    const v = findVideo(videoId);
    const clip = v?.clips.find(c => c.id === clipId);
    if (v) {
      if (status === 'approved') {
        pushNotification('clipper', 'qc_clip', `Clip aceptado: tu clip "${clip?.name || ''}" de "${v.name}" fue aceptado.`, v.clipperId);
      } else if (status === 'rejected') {
        pushNotification('clipper', 'qc_clip', `Clip rechazado: tu clip "${clip?.name || ''}" de "${v.name}" fue rechazado. Motivo: ${reason || 'Sin motivo especificado'}`, v.clipperId);
      }
    }
  }, [updateVideo, findVideo, pushNotification]);

  // El Admin acepta de una vez todos los clips pendientes de esta tarea
  // (y solo de esta tarea). Notifica al Clipper una sola vez.
  const acceptAllClips = useCallback((videoId: string) => {
    const v = findVideo(videoId);
    const clipsToApprove = v ? v.clips.filter(c => c.fileUrl && c.status !== 'approved') : [];
    updateVideo(videoId, vid => ({
      ...vid,
      clips: vid.clips.map(c => c.fileUrl ? {
        ...c, status: 'approved' as ClipStatus, rejectionReason: null, reviewedBy: 'Admin', reviewedAt: new Date().toISOString(),
      } : c),
    }));
    if (v && clipsToApprove.length > 0) {
      const text = clipsToApprove.length === 1
        ? `Clip aceptado: tu clip correspondiente al video "${v.name}" fue aceptado.`
        : `Clips aceptados: tus clips correspondientes al video "${v.name}" fueron aceptados.`;
      pushNotification('clipper', 'qc_clip', text, v.clipperId);
    }
  }, [updateVideo, findVideo, pushNotification]);

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
    setWorkers(prev => {
      const current = prev.find(w => w.id === workerId);
      const next = current ? !current.online : true;
      if (isSupabaseConfigured && supabase) {
        void supabase.from('profiles').update({ online: next }).eq('id', workerId);
      }
      return prev.map(w => w.id === workerId ? { ...w, online: next } : w);
    });
  }, []);

  const addCalendarEvent = useCallback((e: Omit<CalendarEvent, 'id'>) => {
    setCalendarEvents(prev => [...prev, { ...e, id: `ev-${Date.now()}` }]);
  }, []);

  const updateCalendarEvent = useCallback((id: string, patch: Partial<Omit<CalendarEvent, 'id'>>) => {
    setCalendarEvents(prev => prev.map(e => e.id === id ? { ...e, ...patch } : e));
  }, []);

  const deleteCalendarEvent = useCallback((id: string) => {
    setCalendarEvents(prev => prev.filter(e => e.id !== id));
  }, []);

  const updateWorkerProfile = useCallback((workerId: string, fields: Partial<Pick<Worker, 'phone' | 'email' | 'bankInfo' | 'country' | 'emailNotifications'>>) => {
    setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, ...fields } : w));
    if (isSupabaseConfigured && supabase) {
      const dbFields: Record<string, unknown> = {};
      if (fields.phone !== undefined) dbFields.phone = fields.phone;
      if (fields.email !== undefined) dbFields.contact_email = fields.email;
      if (fields.bankInfo !== undefined) dbFields.bank_info = fields.bankInfo;
      if (fields.country !== undefined) dbFields.country = fields.country;
      if (fields.emailNotifications !== undefined) dbFields.email_notifications = fields.emailNotifications;
      void supabase.from('profiles').update(dbFields).eq('id', workerId);
    }
  }, []);

  // --- Contratos ---
  const uploadContract = useCallback((title: string, role: 'clipper' | 'editor', workerId: string | null, fileName: string, fileUrl: string) => {
    if (!isSupabaseConfigured || !supabase) return;
    void supabase.from('contracts').insert({
      title, role, worker_id: workerId, file_name: fileName, file_url: fileUrl, uploaded_by: user?.id || null,
    }).then(() => loadContracts());
  }, [user, loadContracts]);

  const deleteContract = useCallback((contractId: string) => {
    if (!isSupabaseConfigured || !supabase) return;
    void supabase.from('contracts').delete().eq('id', contractId).then(() => loadContracts());
  }, [loadContracts]);

  const uploadSignedContract = useCallback((contractId: string, fileName: string, fileUrl: string) => {
    if (!isSupabaseConfigured || !supabase || !user) return;
    void supabase.from('contract_signed_uploads').upsert({
      contract_id: contractId, worker_id: user.id, file_name: fileName, file_url: fileUrl, uploaded_at: new Date().toISOString(),
    }, { onConflict: 'contract_id,worker_id' }).then(() => loadContracts());
  }, [user, loadContracts]);

  // --- Chat ---
  const createChatGroup = useCallback(async (name: string, memberIds: string[]) => {
    if (!isSupabaseConfigured || !supabase || !user) return;
    const { data: group } = await supabase.from('chat_groups').insert({ name, is_dm: false, created_by: user.id }).select('id').single();
    if (!group) return;
    const allIds = Array.from(new Set([user.id, ...memberIds]));
    await supabase.from('chat_group_members').upsert(allIds.map(uid => ({ group_id: group.id, user_id: uid })));
    void loadChat();
  }, [user, loadChat]);

  const sendChatGroupMessage = useCallback(async (groupId: string, text: string, fileName?: string, fileUrl?: string) => {
    if (!isSupabaseConfigured || !supabase || !user) return;
    await supabase.from('chat_messages').insert({
      group_id: groupId, sender_id: user.id, text, file_name: fileName || null, file_url: fileUrl || null,
    });
    void loadChat();
  }, [user, loadChat]);

  const ensureOwnAdminDm = useCallback(async (): Promise<string | null> => {
    if (!isSupabaseConfigured || !supabase || !user) return null;
    const existing = chatGroups.find(g => g.isDm && g.memberIds.includes(user.id));
    return existing ? existing.id : null;
  }, [user, chatGroups]);

  const startAdminDm = useCallback(async (workerId: string): Promise<string | null> => {
    if (!isSupabaseConfigured || !supabase || !user) return null;
    const existing = chatGroups.find(g => g.isDm && g.memberIds.includes(workerId));
    if (existing) return existing.id;
    const targetWorker = workersRef.current.find(w => w.id === workerId);
    const { data: newGroup } = await supabase.from('chat_groups').insert({
      name: `Admin · ${targetWorker?.name || 'Usuario'}`, is_dm: true, created_by: user.id,
    }).select('id').single();
    if (!newGroup) return null;
    await supabase.from('chat_group_members').upsert([
      { group_id: newGroup.id, user_id: workerId },
      { group_id: newGroup.id, user_id: user.id },
    ]);
    void loadChat();
    return newGroup.id as string;
  }, [user, chatGroups, loadChat]);

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
    role, theme, toggleTheme, view, setView,
    brands, workers, notifications, deleteNotification, clearNotifications, emailLog,
    chat, paidHistory, config,
    currentWorkerId, setCurrentWorkerId,
    selectedVideo, setSelectedVideo,
    selectedClassroomModuleId, setSelectedClassroomModuleId,
    setQc, addClip, replaceClip, setClipStatus, setClipMarkerTime, acceptAllClips,
    addCorrection, updateCorrectionTime, uploadBrief, addFinalVideo,
    uploadMainImage, setMainImageStatus, sendVideo,
    sendChat, closeDay, togglePaid50, approveFinal, toggleOnline,
    calendarEvents, addCalendarEvent, updateCalendarEvent, deleteCalendarEvent, updateWorkerProfile,
    classroomModules, addClassroomModule, deleteClassroomModule, addClassroomLesson, deleteClassroomLesson,
    lessonCompletions, markLessonComplete,
    contracts, contractSignedUploads, uploadContract, deleteContract, uploadSignedContract,
    chatGroups, chatMessages, adminProfiles, createChatGroup, sendChatGroupMessage, ensureOwnAdminDm, startAdminDm,
    notificationsArchive,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
