import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { Brand, Worker, WorkerCustomGoals, NotificationItem, NotificationCategory, Role, ThemeMode, ViewKey, Config, PaidHistoryEntry, ChatMessage, Video, QcStatus, ClipStatus, CalendarEvent, MainImageStatus, ClassroomModule, EmailLogEntry, Contract, ContractSignedUpload, ChatGroup, ChatMsg, Order, OrderStatus, FinanceSettings, FinanceDayClosing, AppExpense, PayrollPayment, CapacityProtocolConfig, ClientRecord } from './types';
import { INITIAL_BRANDS, INITIAL_WORKERS, INITIAL_NOTIFICATIONS, INITIAL_PAID_HISTORY, INITIAL_CHAT, CONFIG, CALENDAR_EVENTS, CLASSROOM_MODULES, INITIAL_ORDERS } from './data';
import { loadShared, saveShared, isSupabaseConfigured, supabase, subscribeToTable } from './lib/supabaseClient';
import { useAuth } from './lib/auth';

export interface AdminProfile { id: string; name: string; }

const HEARTBEAT_INTERVAL_MS = 15 * 1000;
const HEARTBEAT_TTL_MS = 35 * 1000;

const DEFAULT_FINANCE_SETTINGS: FinanceSettings = {
  clientPricePerVideo: 25,
  defaultClipperCost: 3,
  defaultEditorCost: 4,
};

const DEFAULT_CAPACITY_CONFIG: CapacityProtocolConfig = {
  safetyMarginPct: 15,
  defaultClipperDailyVideos: 20,
  defaultEditorDailyVideos: 20,
  workdayStartHour: 8,
  workdayEndHour: 20,
  maxNoResponseMinutes: 45,
  maxStalledHours: 3,
  urgentThresholdHours: 4,
};

const INITIAL_CLIENTS: ClientRecord[] = [
  {
    id: 'cli-1',
    name: 'Auralab',
    contactName: 'Dirección Creativa Auralab',
    email: 'contacto@auralab.co',
    phone: '+57 300 412 8890',
    country: 'Colombia',
    planType: 'mensual',
    pricePerVideo: 25,
    status: 'activo',
    notes: 'Prioridad en formato vertical dinámico con subtítulos limpios.',
    createdAt: '2025-01-15',
  },
  {
    id: 'cli-2',
    name: 'Kova Studio',
    contactName: 'Equipo Kova',
    email: 'produccion@kovastudio.com',
    phone: '+52 55 4890 2211',
    country: 'México',
    planType: 'paquete',
    pricePerVideo: 30,
    status: 'activo',
    notes: 'Entregas en tandas de alto impacto para pauta.',
    createdAt: '2025-02-01',
  },
  {
    id: 'cli-3',
    name: 'Nexo Digital',
    contactName: 'Marketing Nexo',
    email: 'hola@nexodigital.io',
    phone: '+34 612 990 114',
    country: 'España',
    planType: 'mensual',
    pricePerVideo: 28,
    status: 'activo',
    notes: 'Revisión de ganchos en los primeros 3 segundos.',
    createdAt: '2025-02-10',
  },
];

const LEGACY_DEFAULT_EVENT_IDS = new Set(['ev1', 'ev2', 'ev3', 'ev4', 'ev5', 'ev6', 'ev7']);

function sanitizeCalendarEvents(list: unknown): CalendarEvent[] {
  if (!Array.isArray(list)) return [];
  return list.filter((e): e is CalendarEvent => {
    if (!e || typeof e !== 'object') return false;
    const item = e as Record<string, unknown>;
    if (typeof item.id !== 'string' || LEGACY_DEFAULT_EVENT_IDS.has(item.id) || item.id.startsWith('auto-')) {
      return false;
    }
    return (
      typeof item.day === 'number' &&
      typeof item.month === 'number' &&
      typeof item.year === 'number' &&
      typeof item.label === 'string'
    );
  });
}

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

const STORAGE_PREFIX = 'senda_platform_';
type SharedKey =
  | 'brands'
  | 'notifications'
  | 'orders'
  | 'calendarEvents'
  | 'workerGoals'
  | 'workerPointsOverride'
  | 'financeSettings'
  | 'financeClosings'
  | 'appExpenses'
  | 'payrollPayments'
  | 'payrollAdjustments'
  | 'capacityProtocolConfig'
  | 'workerCapacities'
  | 'clients';

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

const CATEGORIES_BY_ROLE: Record<Role, NotificationCategory[]> = {
  clipper: ['trabajo_asignado', 'qc_clip', 'racha', 'pago_50', 'pago_100', 'mensaje'],
  editor: ['trabajo_asignado', 'clips_enviados', 'qc_video', 'racha', 'pago_50', 'pago_100', 'mensaje'],
  admin: ['trabajo_asignado', 'clips_enviados', 'qc_clip', 'qc_video', 'racha', 'pago_50', 'pago_100', 'mensaje', 'sistema'],
};

const DAY_MS = 24 * 60 * 60 * 1000;

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

interface WorkerPointsPatch {
  pointsToday?: number;
  pointsMonth?: number;
  goalDaily?: number;
  goalMonthly?: number;
  dayClosedToday?: boolean;
}

interface Store {
  role: Role;
  theme: ThemeMode;
  toggleTheme: () => void;
  view: ViewKey;
  setView: (v: ViewKey) => void;
  brands: Brand[];
  workers: Worker[];
  registeredUsersCount: number;
  refreshProfiles: () => Promise<void>;
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
  toggleDayClosed: (workerId: string) => void;
  updateWorkerPointsAndGoals: (workerId: string, patch: WorkerPointsPatch) => Promise<void>;
  getWorkerGoals: (workerId: string, workerRole?: 'clipper' | 'editor') => WorkerCustomGoals;
  togglePaid50: (videoId: string) => void;
  approveFinal: (videoId: string) => void;
  toggleOnline: (workerId: string) => void;
  calendarEvents: CalendarEvent[];
  addCalendarEvent: (e: Omit<CalendarEvent, 'id'>) => void;
  updateCalendarEvent: (id: string, patch: Partial<Omit<CalendarEvent, 'id'>>) => void;
  deleteCalendarEvent: (id: string) => void;
  updateWorkerProfile: (workerId: string, fields: Partial<Pick<Worker, 'phone' | 'email' | 'bankInfo' | 'country' | 'emailNotifications'>>) => void;

  contracts: Contract[];
  contractSignedUploads: ContractSignedUpload[];
  uploadContract: (title: string, role: 'clipper' | 'editor', workerId: string | null, fileName: string, fileUrl: string) => void;
  deleteContract: (contractId: string) => void;
  uploadSignedContract: (contractId: string, fileName: string, fileUrl: string) => void;

  chatGroups: ChatGroup[];
  chatMessages: ChatMsg[];
  adminProfiles: AdminProfile[];
  createChatGroup: (name: string, memberIds: string[]) => Promise<void>;
  sendChatGroupMessage: (groupId: string, text: string, fileName?: string, fileUrl?: string) => Promise<void>;
  ensureOwnAdminDm: () => Promise<string | null>;
  startAdminDm: (workerId: string) => Promise<string | null>;
  deleteChatGroup: (groupId: string) => Promise<void>;

  notificationsArchive: NotificationItem[];

  orders: Order[];
  addOrder: (o: Omit<Order, 'id' | 'createdAt'>) => void;
  updateOrder: (id: string, patch: Partial<Omit<Order, 'id' | 'createdAt'>>) => void;
  deleteOrder: (id: string) => void;
  assignClipper: (videoId: string, workerId: string) => void;
  assignProject: (brand: string, deliveryDate: string, deliveryTime: string, workerIds: string[], briefFileName?: string, briefFileUrl?: string) => void;
  workerCapacities: Record<string, number>;
  getWorkerCapacity: (workerId: string) => number;
  setWorkerCapacity: (workerId: string, capacity: number) => void;
  getWorkerWorkload: (workerId: string) => number;
  assignOrderTeam: (orderId: string, clipperId: string, editorId: string) => Promise<void>;
  assignOrderClipper: (orderId: string, clipperId: string) => Promise<void>;
  assignOrderEditor: (orderId: string, editorId: string) => Promise<void>;

  clients: ClientRecord[];
  addClient: (c: Omit<ClientRecord, 'id' | 'createdAt'>) => void;
  updateClient: (id: string, patch: Partial<Omit<ClientRecord, 'id' | 'createdAt'>>) => void;

  financeSettings: FinanceSettings;
  updateFinanceSettings: (patch: Partial<FinanceSettings>) => void;
  financeClosings: FinanceDayClosing[];
  recordFinanceDayClosing: (closing: Omit<FinanceDayClosing, 'id' | 'closedAt'>) => void;
  appExpenses: AppExpense[];
  addAppExpense: (expense: Omit<AppExpense, 'id'>) => void;
  deleteAppExpense: (id: string) => void;

  payrollPayments: PayrollPayment[];
  payrollAdjustments: Record<string, number>;
  setWorkerPayrollAdjustment: (workerId: string, amount: number) => void;
  recordPayrollPayment: (data: Omit<PayrollPayment, 'id' | 'paidAt'>) => void;
  revertPayrollPayment: (paymentId: string) => void;

  capacityConfig: CapacityProtocolConfig;
  updateCapacityConfig: (patch: Partial<CapacityProtocolConfig>) => void;
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
  const [workerGoalsMap, setWorkerGoalsMap] = useState<Record<string, WorkerCustomGoals>>(() => loadState('workerGoals', {} as Record<string, WorkerCustomGoals>));
  const [workerPointsOverride, setWorkerPointsOverride] = useState<Record<string, { pointsToday?: number; pointsMonth?: number; dayClosedToday?: boolean }>>(() => loadState('workerPointsOverride', {}));
  const [presenceOnlineIds, setPresenceOnlineIds] = useState<Set<string>>(() => new Set());
  const [heartbeatMap, setHeartbeatMap] = useState<Record<string, number>>({});
  const [nowTick, setNowTick] = useState<number>(() => Date.now());
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => applyNotificationReset(loadState('notifications', INITIAL_NOTIFICATIONS)));
  const [emailLog, setEmailLog] = useState<EmailLogEntry[]>(() => loadState('emailLog', [] as EmailLogEntry[]));
  const [chat, setChat] = useState<ChatMessage[]>(() => loadState('chat', INITIAL_CHAT));
  const [paidHistory, setPaidHistory] = useState<PaidHistoryEntry[]>(() => loadState('paidHistory', INITIAL_PAID_HISTORY));
  const [config] = useState<Config>(CONFIG);
  const [currentWorkerId, setCurrentWorkerId] = useState('w1');

  useEffect(() => {
    if (user?.id) setCurrentWorkerId(user.id);
  }, [user?.id]);

  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedClassroomModuleId, setSelectedClassroomModuleId] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() =>
    sanitizeCalendarEvents(loadState('calendarEvents', CALENDAR_EVENTS))
  );
  const [classroomModules, setClassroomModules] = useState<ClassroomModule[]>(() => loadState('classroomModules', CLASSROOM_MODULES));
  const [lessonCompletions, setLessonCompletions] = useState<Record<string, string[]>>(() => loadState('lessonCompletions', {} as Record<string, string[]>));
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [contractSignedUploads, setContractSignedUploads] = useState<ContractSignedUpload[]>([]);
  const [chatGroups, setChatGroups] = useState<ChatGroup[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>([]);
  const [adminProfiles, setAdminProfiles] = useState<AdminProfile[]>([]);
  const [notificationsArchive, setNotificationsArchive] = useState<NotificationItem[]>([]);
  const [orders, setOrders] = useState<Order[]>(() => loadState('orders', INITIAL_ORDERS));
  const [clients, setClients] = useState<ClientRecord[]>(() => loadState('clients', INITIAL_CLIENTS));
  const [workerCapacities, setWorkerCapacities] = useState<Record<string, number>>(() => loadState('workerCapacities', {} as Record<string, number>));
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings>(() => loadState('financeSettings', DEFAULT_FINANCE_SETTINGS));
  const [financeClosings, setFinanceClosings] = useState<FinanceDayClosing[]>(() => loadState('financeClosings', [] as FinanceDayClosing[]));
  const [appExpenses, setAppExpenses] = useState<AppExpense[]>(() => loadState('appExpenses', [] as AppExpense[]));
  const [payrollPayments, setPayrollPayments] = useState<PayrollPayment[]>(() => loadState('payrollPayments', [] as PayrollPayment[]));
  const [payrollAdjustments, setPayrollAdjustments] = useState<Record<string, number>>(() => loadState('payrollAdjustments', {} as Record<string, number>));
  const [capacityConfig, setCapacityConfig] = useState<CapacityProtocolConfig>(() => loadState('capacityProtocolConfig', DEFAULT_CAPACITY_CONFIG));

  const localWriteLockUntil = useRef<number>(0);
  const markLocalWrite = useCallback(() => {
    localWriteLockUntil.current = Date.now() + 2500;
  }, []);

  const persistShared = useCallback(<T,>(key: SharedKey, value: T) => {
    saveState(key, value);
    if (isSupabaseConfigured) {
      markLocalWrite();
      void saveShared(key, value);
    }
  }, [markLocalWrite]);

  useEffect(() => { persistShared('brands', brands); }, [brands, persistShared]);
  useEffect(() => { persistShared('orders', orders); }, [orders, persistShared]);
  useEffect(() => { persistShared('clients', clients); }, [clients, persistShared]);
  useEffect(() => { saveState('workers', workers); }, [workers]);
  useEffect(() => { persistShared('workerGoals', workerGoalsMap); }, [workerGoalsMap, persistShared]);
  useEffect(() => { persistShared('workerPointsOverride', workerPointsOverride); }, [workerPointsOverride, persistShared]);
  useEffect(() => { persistShared('financeSettings', financeSettings); }, [financeSettings, persistShared]);
  useEffect(() => { persistShared('financeClosings', financeClosings); }, [financeClosings, persistShared]);
  useEffect(() => { persistShared('appExpenses', appExpenses); }, [appExpenses, persistShared]);
  useEffect(() => { persistShared('payrollPayments', payrollPayments); }, [payrollPayments, persistShared]);
  useEffect(() => { persistShared('payrollAdjustments', payrollAdjustments); }, [payrollAdjustments, persistShared]);
  useEffect(() => { persistShared('capacityProtocolConfig', capacityConfig); }, [capacityConfig, persistShared]);
  useEffect(() => { persistShared('workerCapacities', workerCapacities); }, [workerCapacities, persistShared]);
  useEffect(() => { saveState('chat', chat); }, [chat]);
  useEffect(() => { saveState('paidHistory', paidHistory); }, [paidHistory]);
  useEffect(() => { persistShared('calendarEvents', calendarEvents); }, [calendarEvents, persistShared]);
  useEffect(() => { persistShared('notifications', notifications); }, [notifications, persistShared]);
  useEffect(() => { saveState('emailLog', emailLog); }, [emailLog]);
  useEffect(() => { saveState('classroomModules', classroomModules); }, [classroomModules]);
  useEffect(() => { saveState('lessonCompletions', lessonCompletions); }, [lessonCompletions]);

  const refreshOnlineHeartbeats = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const remoteHeartbeats = await loadShared<Record<string, number>>('online_heartbeats');
    if (remoteHeartbeats && typeof remoteHeartbeats === 'object') {
      setHeartbeatMap(remoteHeartbeats);
      setNowTick(Date.now());
    }
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    let active = true;
    (async () => {
      const remoteBrands = await loadShared<Brand[]>('brands');
      if (active && remoteBrands) setBrands(remoteBrands);
      const remoteNotifications = await loadShared<NotificationItem[]>('notifications');
      if (active && remoteNotifications) setNotifications(applyNotificationReset(remoteNotifications));
      const remoteOrders = await loadShared<Order[]>('orders');
      if (active && remoteOrders) setOrders(remoteOrders);
      const remoteClients = await loadShared<ClientRecord[]>('clients');
      if (active && Array.isArray(remoteClients) && remoteClients.length > 0) setClients(remoteClients);
      const remoteCalendar = await loadShared<CalendarEvent[]>('calendarEvents');
      if (active && remoteCalendar) setCalendarEvents(sanitizeCalendarEvents(remoteCalendar));
      const remoteWorkerGoals = await loadShared<Record<string, WorkerCustomGoals>>('workerGoals');
      if (active && remoteWorkerGoals && typeof remoteWorkerGoals === 'object') setWorkerGoalsMap(remoteWorkerGoals);
      const remotePointsOverride = await loadShared<Record<string, { pointsToday?: number; pointsMonth?: number; dayClosedToday?: boolean }>>('workerPointsOverride');
      if (active && remotePointsOverride && typeof remotePointsOverride === 'object') setWorkerPointsOverride(remotePointsOverride);
      const remoteFinSettings = await loadShared<FinanceSettings>('financeSettings');
      if (active && remoteFinSettings && typeof remoteFinSettings === 'object') setFinanceSettings({ ...DEFAULT_FINANCE_SETTINGS, ...remoteFinSettings });
      const remoteFinClosings = await loadShared<FinanceDayClosing[]>('financeClosings');
      if (active && Array.isArray(remoteFinClosings)) setFinanceClosings(remoteFinClosings);
      const remoteAppExpenses = await loadShared<AppExpense[]>('appExpenses');
      if (active && Array.isArray(remoteAppExpenses)) setAppExpenses(remoteAppExpenses);
      const remotePayrollPayments = await loadShared<PayrollPayment[]>('payrollPayments');
      if (active && Array.isArray(remotePayrollPayments)) setPayrollPayments(remotePayrollPayments);
      const remotePayrollAdj = await loadShared<Record<string, number>>('payrollAdjustments');
      if (active && remotePayrollAdj && typeof remotePayrollAdj === 'object') setPayrollAdjustments(remotePayrollAdj);
      const remoteCapConfig = await loadShared<CapacityProtocolConfig>('capacityProtocolConfig');
      if (active && remoteCapConfig && typeof remoteCapConfig === 'object') setCapacityConfig({ ...DEFAULT_CAPACITY_CONFIG, ...remoteCapConfig });
      const remoteWorkerCaps = await loadShared<Record<string, number>>('workerCapacities');
      if (active && remoteWorkerCaps && typeof remoteWorkerCaps === 'object') setWorkerCapacities(remoteWorkerCaps);
      const remoteHeartbeats = await loadShared<Record<string, number>>('online_heartbeats');
      if (active && remoteHeartbeats && typeof remoteHeartbeats === 'object') {
        setHeartbeatMap(remoteHeartbeats);
      }
    })();
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!isSupabaseConfigured) return;
    const unsub = subscribeToTable('platform_kv', () => {
      void (async () => {
        await refreshOnlineHeartbeats();
        if (Date.now() < localWriteLockUntil.current) return;
        const remoteBrands = await loadShared<Brand[]>('brands');
        if (remoteBrands) setBrands(remoteBrands);
        const remoteNotifications = await loadShared<NotificationItem[]>('notifications');
        if (remoteNotifications) setNotifications(applyNotificationReset(remoteNotifications));
        const remoteOrders = await loadShared<Order[]>('orders');
        if (remoteOrders) setOrders(remoteOrders);
        const remoteClients = await loadShared<ClientRecord[]>('clients');
        if (Array.isArray(remoteClients) && remoteClients.length > 0) setClients(remoteClients);
        const remoteCalendar = await loadShared<CalendarEvent[]>('calendarEvents');
        if (remoteCalendar) setCalendarEvents(sanitizeCalendarEvents(remoteCalendar));
        const remoteWorkerGoals = await loadShared<Record<string, WorkerCustomGoals>>('workerGoals');
        if (remoteWorkerGoals && typeof remoteWorkerGoals === 'object') setWorkerGoalsMap(remoteWorkerGoals);
        const remotePointsOverride = await loadShared<Record<string, { pointsToday?: number; pointsMonth?: number; dayClosedToday?: boolean }>>('workerPointsOverride');
        if (remotePointsOverride && typeof remotePointsOverride === 'object') setWorkerPointsOverride(remotePointsOverride);
        const remoteFinSettings = await loadShared<FinanceSettings>('financeSettings');
        if (remoteFinSettings && typeof remoteFinSettings === 'object') setFinanceSettings({ ...DEFAULT_FINANCE_SETTINGS, ...remoteFinSettings });
        const remoteFinClosings = await loadShared<FinanceDayClosing[]>('financeClosings');
        if (Array.isArray(remoteFinClosings)) setFinanceClosings(remoteFinClosings);
        const remoteAppExpenses = await loadShared<AppExpense[]>('appExpenses');
        if (Array.isArray(remoteAppExpenses)) setAppExpenses(remoteAppExpenses);
        const remotePayrollPayments = await loadShared<PayrollPayment[]>('payrollPayments');
        if (Array.isArray(remotePayrollPayments)) setPayrollPayments(remotePayrollPayments);
        const remotePayrollAdj = await loadShared<Record<string, number>>('payrollAdjustments');
        if (remotePayrollAdj && typeof remotePayrollAdj === 'object') setPayrollAdjustments(remotePayrollAdj);
        const remoteCapConfig = await loadShared<CapacityProtocolConfig>('capacityProtocolConfig');
        if (remoteCapConfig && typeof remoteCapConfig === 'object') setCapacityConfig({ ...DEFAULT_CAPACITY_CONFIG, ...remoteCapConfig });
        const remoteWorkerCaps = await loadShared<Record<string, number>>('workerCapacities');
        if (remoteWorkerCaps && typeof remoteWorkerCaps === 'object') setWorkerCapacities(remoteWorkerCaps);
      })();
    });
    return unsub;
  }, [refreshOnlineHeartbeats]);

  useEffect(() => {
    const id = setInterval(() => {
      setNotifications(prev => applyNotificationReset(prev));
    }, 60 * 1000);
    return () => clearInterval(id);
  }, []);

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
    void loadWorkersFromProfiles();
    const unsub = subscribeToTable('profiles', () => { void loadWorkersFromProfiles(); });
    return unsub;
  }, [loadWorkersFromProfiles, user?.id]);

  // --- Estado "En línea" en tiempo real ---
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase || !user?.id) {
      setPresenceOnlineIds(new Set());
      return;
    }

    const currentUserId = user.id;

    const sendHeartbeat = async (isAlive: boolean) => {
      if (role === 'admin') return;
      try {
        const currentMap = (await loadShared<Record<string, number>>('online_heartbeats')) || {};
        const now = Date.now();
        const cleaned: Record<string, number> = {};
        for (const [uid, ts] of Object.entries(currentMap)) {
          if (typeof ts === 'number' && now - ts < HEARTBEAT_TTL_MS && uid !== currentUserId) {
            cleaned[uid] = ts;
          }
        }
        if (isAlive) {
          cleaned[currentUserId] = now;
        }
        setHeartbeatMap(cleaned);
        setNowTick(now);
        await saveShared('online_heartbeats', cleaned);
        await supabase.from('profiles').update({ online: isAlive }).eq('id', currentUserId);
      } catch {
        // ignorar errores de red temporales
      }
    };

    const channel = supabase.channel('senda_online_presence', {
      config: {
        presence: { key: currentUserId },
      },
    });

    const syncOnlineUsers = () => {
      const state = channel.presenceState<{ user_id?: string }>();
      const nextIds = new Set<string>();
      for (const [key, presences] of Object.entries(state)) {
        if (Array.isArray(presences) && presences.length > 0) {
          nextIds.add(key);
          for (const p of presences) {
            if (p && typeof p.user_id === 'string') {
              nextIds.add(p.user_id);
            }
          }
        }
      }
      if (role !== 'admin') {
        nextIds.add(currentUserId);
      }
      setPresenceOnlineIds(nextIds);
    };

    channel
      .on('presence', { event: 'sync' }, syncOnlineUsers)
      .on('presence', { event: 'join' }, syncOnlineUsers)
      .on('presence', { event: 'leave' }, syncOnlineUsers)
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          if (role !== 'admin') {
            await channel.track({
              user_id: currentUserId,
              role,
              online_at: new Date().toISOString(),
            });
          }
          syncOnlineUsers();
        }
      });

    void sendHeartbeat(true);
    void refreshOnlineHeartbeats();

    const heartbeatTimer = setInterval(() => {
      setNowTick(Date.now());
      if (role !== 'admin') {
        void sendHeartbeat(true);
      } else {
        void refreshOnlineHeartbeats();
      }
    }, HEARTBEAT_INTERVAL_MS);

    const handlePageClose = () => {
      if (role !== 'admin') {
        void channel.untrack();
        void sendHeartbeat(false);
      }
    };

    window.addEventListener('pagehide', handlePageClose);
    window.addEventListener('beforeunload', handlePageClose);

    return () => {
      clearInterval(heartbeatTimer


cd /Users/nicolas/SENDA && cat << 'EOF' > src/views/CapacityView.tsx
import { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store';
import type { Order } from '../types';
import { CardNodeDeco } from '../components/BrandBackground';
import {
  Gauge, Scissors, Film, AlertTriangle, CheckCircle2, Clock,
  Sliders, Sparkles, RefreshCw, ShieldAlert, TrendingUp,
  UserPlus, Zap, Calendar, LayoutGrid, X, Users, ChevronDown, Timer, ArrowRight, Activity,
} from 'lucide-react';

type ActiveScreen = 'dashboard' | '1' | '2' | '3' | '4';
type AlertLevel = 'normal' | 'elevada' | 'cerca_limite' | 'comprometida' | 'sobrecapacidad';

const ALERT_META: Record<AlertLevel, { label: string; badgeClass: string; dotClass: string; ringColor: string; glowColor: string }> = {
  normal: {
    label: 'Operación Normal',
    badgeClass: 'bg-mint-dim text-mint border-mint/40',
    dotClass: 'bg-mint',
    ringColor: 'var(--mint)',
    glowColor: 'rgba(111,231,200,0.32)',
  },
  elevada: {
    label: 'Carga Elevada',
    badgeClass: 'bg-accent-dim text-accent border-accent/40',
    dotClass: 'bg-accent',
    ringColor: 'var(--accent)',
    glowColor: 'rgba(53,214,228,0.32)',
  },
  cerca_limite: {
    label: 'Cerca del Límite',
    badgeClass: 'bg-amber-dim text-amber border-amber/40',
    dotClass: 'bg-amber',
    ringColor: 'var(--amber)',
    glowColor: 'rgba(255,200,87,0.32)',
  },
  comprometida: {
    label: 'Capacidad Comprometida',
    badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/40',
    dotClass: 'bg-orange-400',
    ringColor: '#fb923c',
    glowColor: 'rgba(251,146,60,0.32)',
  },
  sobrecapacidad: {
    label: 'Sobrecapacidad',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/40',
    dotClass: 'bg-red-500',
    ringColor: '#ef4444',
    glowColor: 'rgba(239,68,68,0.35)',
  },
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatHour(h: number): string {
  const clamped = Math.max(0, Math.min(23, Math.floor(h)));
  const mins = Math.round((h - Math.floor(h)) * 60);
  return `${String(clamped).padStart(2, '0')}:${mins >= 30 ? '30' : '00'}`;
}

function isPlaceholderTestOrder(o: Order): boolean {
  const clean = (o.brand || '').trim().toLowerCase();
  return (
    clean === 'nuevo pedido' ||
    clean === 'nuevo cliente' ||
    clean.startsWith('nuevo pedido ') ||
    clean.startsWith('nuevo cliente ')
  );
}

export function CapacityView() {
  const {
    workers, orders, deleteOrder, brands, capacityConfig, updateCapacityConfig,
    getWorkerCapacity, setWorkerCapacity, assignOrderClipper, assignOrderEditor,
  } = useStore();

  const [screen, setScreen] = useState<ActiveScreen>('dashboard');
  const [showConfigModal, setShowConfigModal] = useState(false);

  // Purga automática de cualquier pedido fantasma de prueba
  useEffect(() => {
    for (const o of orders) {
      if (isPlaceholderTestOrder(o)) {
        deleteOrder(o.id);
      }
    }
  }, [orders, deleteOrder]);

  // --- Estado Punto 1 (Cotizador y Tandas: volumen 1..200 y complejidad) ---
  const [evalVideos, setEvalVideos] = useState<number>(30);
  const [evalComplexity, setEvalComplexity] = useState<'simple' | 'estandar' | 'alta'>('estandar');

  // --- Estado Punto 2 (Simulador) ---
  const [simExtraVideos, setSimExtraVideos] = useState<number>(40);
  const [simExtraClippers, setSimExtraClippers] = useState<number>(0);
  const [simExtraEditors, setSimExtraEditors] = useState<number>(0);
  const [simUnavailablePct, setSimUnavailablePct] = useState<number>(0);
  const [simEditorDemandBoostPct, setSimEditorDemandBoostPct] = useState<number>(0);

  // --- Estado Punto 3 (Protocolo y Alertas con filas desplegables) ---
  const [protocolRoleFilter, setProtocolRoleFilter] = useState<'todos' | 'clipper' | 'editor'>('todos');
  const [expandedWorkerId, setExpandedWorkerId] = useState<string | null>(null);
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);
  const [selectedClipperByOrder, setSelectedClipperByOrder] = useState<Record<string, string>>({});
  const [selectedEditorByOrder, setSelectedEditorByOrder] = useState<Record<string, string>>({});
  const [reassignedToastId, setReassignedToastId] = useState<string | null>(null);

  const clippers = useMemo(() => workers.filter(w => w.role === 'clipper'), [workers]);
  const editors = useMemo(() => workers.filter(w => w.role === 'editor'), [workers]);
  const allVideos = useMemo(() => brands.flatMap(b => b.videos), [brands]);

  // MOTOR DE CÁLCULO EN VIVO (Datos 100% intactos)
  const engine = useMemo(() => {
    const safetyFactor = Math.max(0.5, (100 - capacityConfig.safetyMarginPct) / 100);

    const physicalClippingDaily = clippers.reduce((sum, w) => sum + getWorkerCapacity(w.id), 0);
    const physicalEditingDaily = editors.reduce((sum, w) => sum + getWorkerCapacity(w.id), 0);

    const avgClipperDaily = clippers.length > 0 ? Math.round(physicalClippingDaily / clippers.length) : 10;
    const avgEditorDaily = editors.length > 0 ? Math.round(physicalEditingDaily / editors.length) : 10;

    const safeClippingDaily = Math.max(1, Math.floor(physicalClippingDaily * safetyFactor));
    const safeEditingDaily = Math.max(1, Math.floor(physicalEditingDaily * safetyFactor));

    const bottleneckStage: 'Clipping' | 'Edición' =
      safeEditingDaily <= safeClippingDaily ? 'Edición' : 'Clipping';
    const physicalBottleneckDaily = Math.min(physicalClippingDaily, physicalEditingDaily);
    const safeBottleneckDaily = Math.min(safeClippingDaily, safeEditingDaily);

    const activeOrders = orders.filter(o => o.status !== 'finalizado' && !isPlaceholderTestOrder(o));
    const committedByDate: Record<string, number> = {};
    for (const o of activeOrders) {
      const d = o.deliveryDate || todayIso();
      committedByDate[d] = (committedByDate[d] || 0) + Math.max(1, o.videoCount || 1);
    }

    const today = todayIso();
    const inProgressBoardVideos = allVideos.filter(v => v.qc !== 'aprobado_cliente' && v.qc !== 'sin_iniciar').length;
    const committedToday = (committedByDate[today] || 0) + inProgressBoardVideos;
    const totalActiveCommitted = activeOrders.reduce((s, o) => s + Math.max(1, o.videoCount || 1), 0) + inProgressBoardVideos;

    const clippingUtilPct = safeClippingDaily > 0 ? Math.round((committedToday / safeClippingDaily) * 100) : 0;
    const editingUtilPct = safeEditingDaily > 0 ? Math.round((committedToday / safeEditingDaily) * 100) : 0;
    const overallUtilPct = safeBottleneckDaily > 0 ? Math.round((committedToday / safeBottleneckDaily) * 100) : 0;

    let alertLevel: AlertLevel = 'normal';
    if (overallUtilPct > 100) alertLevel = 'sobrecapacidad';
    else if (overallUtilPct >= 90) alertLevel = 'comprometida';
    else if (overallUtilPct >= 78) alertLevel = 'cerca_limite';
    else if (overallUtilPct >= 58) alertLevel = 'elevada';

    const remainingSafeToday = Math.max(0, safeBottleneckDaily - committedToday);

    const videosWithRework = allVideos.filter(
      v => v.qc === 'correcciones' || v.corrections.length > 0 || v.clips.some(c => c.status === 'rejected')
    ).length;
    const reworkRatePct = allVideos.length > 0 ? Math.round((videosWithRework / allVideos.length) * 100) : 0;
    const effectiveRealCapacity = Math.max(1, Math.floor(safeBottleneckDaily * (1 - reworkRatePct / 200)));

    return {
      physicalClippingDaily,
      physicalEditingDaily,
      avgClipperDaily,
      avgEditorDaily,
      safeClippingDaily,
      safeEditingDaily,
      bottleneckStage,
      physicalBottleneckDaily,
      safeBottleneckDaily,
      committedByDate,
      committedToday,
      totalActiveCommitted,
      clippingUtilPct,
      editingUtilPct,
      overallUtilPct,
      alertLevel,
      remainingSafeToday,
      reworkRatePct,
      videosWithRework,
      effectiveRealCapacity,
      activeOrders,
    };
  }, [clippers, editors, allVideos, orders, capacityConfig.safetyMarginPct, getWorkerCapacity]);

  // COTIZADOR Y TANDAS (PUNTO 1)
  const evaluation = useMemo(() => {
    const baseDate = todayIso();
    const complexityMultiplier = evalComplexity === 'alta' ? 1.3 : evalComplexity === 'simple' ? 0.85 : 1.0;
    const committedOnTargetDate = engine.committedToday;
    const availableSafeOnTargetDate = Math.max(0, engine.safeBottleneckDaily - committedOnTargetDate);
    const maxImmediateAcceptable = Math.floor(availableSafeOnTargetDate / complexityMultiplier);
    const canAcceptFullOnDate = evalVideos <= maxImmediateAcceptable;

    const batches: { dayIndex: number; date: string; videos: number; capacityLeftAfter: number }[] = [];
    let remainingToSchedule = Math.max(1, evalVideos);
    let cursorDay = 0;

    while (remainingToSchedule > 0 && cursorDay < 20) {
      const dateStr = addDaysIso(baseDate, cursorDay);
      const alreadyCommitted =
        cursorDay === 0 ? engine.committedToday : (engine.committedByDate[dateStr] || 0);
      const freeSafeRaw = Math.max(0, engine.safeBottleneckDaily - alreadyCommitted);
      const maxVideosThisDay = Math.max(
        cursorDay === 0 ? 0 : 1,
        Math.floor(freeSafeRaw / complexityMultiplier)
      );

      if (maxVideosThisDay > 0) {
        const allocated = Math.min(remainingToSchedule, maxVideosThisDay);
        batches.push({
          dayIndex: batches.length + 1,
          date: dateStr,
          videos: allocated,
          capacityLeftAfter: Math.max(0, engine.safeBottleneckDaily - (alreadyCommitted + Math.ceil(allocated * complexityMultiplier))),
        });
        remainingToSchedule -= allocated;
      }
      cursorDay++;
    }

    const finalCompletionDate = batches.length > 0 ? batches[batches.length - 1].date : baseDate;
    const workHoursPerDay = Math.max(4, capacityConfig.workdayEndHour - capacityConfig.workdayStartHour);
    const lastBatch = batches[batches.length - 1];
    const loadRatio = lastBatch ? Math.min(1, lastBatch.videos / Math.max(1, engine.safeBottleneckDaily)) : 0.5;
    const rawStartHour = capacityConfig.workdayStartHour + Math.max(1.5, loadRatio * (workHoursPerDay - 2));
    const windowStart = Math.min(capacityConfig.workdayEndHour - 2, Math.max(capacityConfig.workdayStartHour + 1, rawStartHour));
    const windowEnd = Math.min(capacityConfig.workdayEndHour, windowStart + 2);

    const dayWord =
      finalCompletionDate === baseDate
        ? 'Hoy'
        : finalCompletionDate === addDaysIso(baseDate, 1)
        ? 'Mañana'
        : finalCompletionDate;

    const etaWindowText = `${dayWord} · ${formatHour(windowStart)} a ${formatHour(windowEnd)}`;

    return {
      committedOnTargetDate,
      availableSafeOnTargetDate,
      maxImmediateAcceptable,
      canAcceptFullOnDate,
      batches,
      finalCompletionDate,
      etaWindowText,
    };
  }, [evalVideos, evalComplexity, engine, capacityConfig]);

  // SIMULADOR (PUNTO 2)
  const simulation = useMemo(() => {
    const availFactor = Math.max(0.2, (100 - simUnavailablePct) / 100);
    const safetyFactor = Math.max(0.5, (100 - capacityConfig.safetyMarginPct) / 100);

    const simPhysicalClip = Math.floor(
      (engine.physicalClippingDaily + simExtraClippers * engine.avgClipperDaily) * availFactor
    );
    const simPhysicalEdit = Math.floor(
      (engine.physicalEditingDaily + simExtraEditors * engine.avgEditorDaily) * availFactor
    );

    const simSafeClip = Math.max(1, Math.floor(simPhysicalClip * safetyFactor));
    const simSafeEdit = Math.max(1, Math.floor(simPhysicalEdit * safetyFactor));

    const editorDemandFactor = 1 + simEditorDemandBoostPct / 100;
    const totalSimulatedDemand = Math.ceil((engine.committedToday + simExtraVideos) * editorDemandFactor);

    const simBottleneck: 'Clipping' | 'Edición' = simSafeEdit <= simSafeClip ? 'Edición' : 'Clipping';
    const simSafeLimit = Math.min(simSafeClip, simSafeEdit);
    const simFreeCapacity = Math.max(0, simSafeLimit - engine.committedToday);
    const simDeficit = Math.max(0, totalSimulatedDemand - simSafeLimit);
    const simUtilPct = Math.round((totalSimulatedDemand / Math.max(1, simSafeLimit)) * 100);
    const daysNeededForExtra = Math.max(1, Math.ceil(simExtraVideos / Math.max(1, simSafeLimit)));

    return {
      simSafeClip,
      simSafeEdit,
      simBottleneck,
      simSafeLimit,
      simFreeCapacity,
      totalSimulatedDemand,
      simDeficit,
      simUtilPct,
      daysNeededForExtra,
    };
  }, [
    engine,
    simExtraVideos,
    simExtraClippers,
    simExtraEditors,
    simUnavailablePct,
    simEditorDemandBoostPct,
    capacityConfig.safetyMarginPct,
  ]);

  // CARGA DIARIA DETALLADA POR CADA CLIPPER Y EDITOR
  const workersWorkloadToday = useMemo(() => {
    return workers.map(w => {
      const cap = getWorkerCapacity(w.id);

      const myOrders = engine.activeOrders.filter(o =>
        w.role === 'clipper'
          ? o.clipperId === w.id || o.assignedWorkerIds.includes(w.id)
          : o.editorId === w.id || o.assignedWorkerIds.includes(w.id)
      );

      const myActiveBoardVideos = allVideos.filter(v =>
        (w.role === 'clipper' ? v.clipperId === w.id : v.editorId === w.id) &&
        v.qc !== 'aprobado_cliente' &&
        v.qc !== 'sin_iniciar'
      );

      let simpleVideos = 0;
      let estandarVideos = 0;
      let altaVideos = 0;

      for (const o of myOrders) {
        const count = Math.max(1, o.videoCount || 1);
        const comp = o.complexity || (count >= 12 ? 'alta' : count <= 4 ? 'simple' : 'estandar');
        if (comp === 'simple') simpleVideos += count;
        else if (comp === 'alta') altaVideos += count;
        else estandarVideos += count;
      }

      for (const v of myActiveBoardVideos) {
        const alreadyInOrders = myOrders.some(o => o.boardVideoId === v.id);
        if (alreadyInOrders) continue;
        if (v.corrections.length > 0 || v.durationSeconds > 60) altaVideos += 1;
        else if (v.durationSeconds > 0 && v.durationSeconds <= 20) simpleVideos += 1;
        else estandarVideos += 1;
      }

      const totalVideosToday = simpleVideos + estandarVideos + altaVideos;
      const freeCapacity = Math.max(0, cap - totalVideosToday);
      const utilPct = Math.min(100, Math.round((totalVideosToday / Math.max(1, cap)) * 100));

      return {
        worker: w,
        capacity: cap,
        totalVideosToday,
        freeCapacity,
        utilPct,
        simpleVideos,
        estandarVideos,
        altaVideos,
        activeBrands: Array.from(new Set([
          ...myOrders.map(o => o.brand),
          ...myActiveBoardVideos.map(v => v.name),
        ])),
      };
    });
  }, [workers, engine.activeOrders, allVideos, getWorkerCapacity]);

  // COLA DE PEDIDOS CON ALERTA ACTIVA + HORA MÁXIMA DE REASIGNACIÓN
  const protocolAlertOrders = useMemo(() => {
    const now = Date.now();
    const workHoursPerDay = Math.max(4, capacityConfig.workdayEndHour - capacityConfig.workdayStartHour);
    const pairThroughputPerHour = Math.max(
      0.6,
      (Math.min(engine.avgClipperDaily, engine.avgEditorDaily) * ((100 - capacityConfig.safetyMarginPct) / 100)) / workHoursPerDay
    );

    return engine.activeOrders
      .map(o => {
        const deliveryTimeStr = o.deliveryTime || '18:00';
        const targetTs = o.deliveryDate
          ? new Date(`${o.deliveryDate}T${deliveryTimeStr}`).getTime()
          : now + 24 * 3600 * 1000;
        const hoursLeft = (targetTs - now) / (1000 * 3600);
        const count = Math.max(1, o.videoCount || 1);
        const complexity: 'simple' | 'estandar' | 'alta' =
          o.complexity || (count >= 12 ? 'alta' : count <= 4 ? 'simple' : 'estandar');

        const complexityFactor = complexity === 'alta' ? 1.35 : complexity === 'simple' ? 0.8 : 1.0;

        const productionHoursNeeded = Math.max(
          1.2,
          Math.round(((count * complexityFactor) / pairThroughputPerHour + 0.75) * 10) / 10
        );

        const maxReassignTs = targetTs - productionHoursNeeded * 3600 * 1000;
        const maxReassignDate = new Date(maxReassignTs);
        const maxReassignTimeStr = maxReassignDate.toLocaleTimeString('es-CO', {
          hour: '2-digit',
          minute: '2-digit',
          hour12: false,
        });
        const maxReassignDayIso = maxReassignDate.toISOString().slice(0, 10);
        const maxReassignDayLabel =
          maxReassignDayIso === todayIso()
            ? 'Hoy'
            : maxReassignDayIso === addDaysIso(todayIso(), 1)
            ? 'Mañana'
            : maxReassignDayIso;

        const hoursUntilMaxReassign = Math.round(((maxReassignTs - now) / (1000 * 3600)) * 10) / 10;
        const isPastMaxReassign = hoursUntilMaxReassign <= 0;

        let level: 'normal' | 'prioritario' | 'urgente' | 'critico' = o.priority || 'normal';

        if (isPastMaxReassign || hoursLeft <= 2) {
          level = 'critico';
        } else if (hoursUntilMaxReassign <= 2.5) {
          level = 'urgente';
        } else if (!o.clipperId || !o.editorId || complexity === 'alta') {
          level = 'prioritario';
        }

        const currentClipper = workers.find(w => w.id === o.clipperId) || null;
        const currentEditor = workers.find(w => w.id === o.editorId) || null;

        return {
          order: o,
          hoursLeft: Math.round(hoursLeft * 10) / 10,
          complexity,
          level,
          currentClipper,
          currentEditor,
          productionHoursNeeded,
          maxReassignLabel: `${maxReassignDayLabel} ${maxReassignTimeStr}`,
          hoursUntilMaxReassign,
          isPastMaxReassign,
        };
      })
      .filter(item => item.level !== 'normal')
      .sort((a, b) => {
        const rank = { critico: 0, urgente: 1, prioritario: 2, normal: 3 };
        return rank[a.level] - rank[b.level] || a.hoursUntilMaxReassign - b.hoursUntilMaxReassign;
      });
  }, [engine.activeOrders, engine.avgClipperDaily, engine.avgEditorDaily, capacityConfig, workers]);

  const handleAssignFromProtocol = async (order: Order) => {
    const chosenClipperId = selectedClipperByOrder[order.id] ?? order.clipperId ?? '';
    const chosenEditorId = selectedEditorByOrder[order.id] ?? order.editorId ?? '';

    if (chosenClipperId && chosenClipperId !== order.clipperId) {
      await assignOrderClipper(order.id, chosenClipperId);
    }
    if (chosenEditorId && chosenEditorId !== order.editorId) {
      await assignOrderEditor(order.id, chosenEditorId);
    }
    setReassignedToastId(order.id);
    setTimeout(() => {
      setReassignedToastId(prev => (prev === order.id ? null : prev));
      setExpandedOrderId(prev => (prev === order.id ? null : prev));
    }, 1800);
  };

  const alertMeta = ALERT_META[engine.alertLevel];

  const DOCK_ITEMS: { id: ActiveScreen; badge: string; title: string; icon: typeof Gauge }[] = [
    { id: 'dashboard', badge: '0', title: 'Dashboard Central', icon: LayoutGrid },
    { id: '1', badge: '1', title: 'Cotizador y Tandas', icon: Zap },
    { id: '2', badge: '2', title: 'Simulador', icon: Sparkles },
    { id: '3', badge: '3', title: 'Protocolo y Alertas', icon: ShieldAlert },
    { id: '4', badge: '4', title: 'Rendimiento y Equipo', icon: TrendingUp },
  ];

  // Parámetros del Reactor Radial Central
  const outerRadius = 80;
  const outerCircumference = 2 * Math.PI * outerRadius;
  const outerOffset = outerCircumference - (Math.min(100, engine.overallUtilPct) / 100) * outerCircumference;

  const innerRadius = 62;
  const innerCircumference = 2 * Math.PI * innerRadius;
  const safetyRatio = (100 - capacityConfig.safetyMarginPct) / 100;
  const innerOffset = innerCircumference - safetyRatio * innerCircumference;

  // Anillo para el Cotizador (Punto 1)
  const evalRingRadius = 54;
  const evalRingCirc = 2 * Math.PI * evalRingRadius;
  const evalRingOffset = evalRingCirc - (Math.min(200, evalVideos) / 200) * evalRingCirc;

  const filteredWorkloads = useMemo(() => {
    if (protocolRoleFilter === 'clipper') return workersWorkloadToday.filter(w => w.worker.role === 'clipper');
    if (protocolRoleFilter === 'editor') return workersWorkloadToday.filter(w => w.worker.role === 'editor');
    return workersWorkloadToday;
  }, [workersWorkloadToday, protocolRoleFilter]);

  return (
    <div className="p-6 max-w-6xl mx-auto min-h-[calc(100vh-4.5rem)] flex flex-col justify-between gap-6">
      {/* =====================================================================
          BARRA SUPERIOR FUTURISTA CON DOCK FLOTANTE DE LOGOS (0, 1, 2, 3, 4)
         ===================================================================== */}
      <div className="bg-surface-2/85 backdrop-blur-xl border border-line rounded-2xl px-4 py-3 flex items-center justify-between gap-4 flex-wrap shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]">
        <div className="flex items-center gap-3.5">
          <div className="relative w-11 h-11 rounded-2xl bg-gradient-to-br from-accent/25 via-surface-3 to-mint/20 border border-accent/40 text-accent flex items-center justify-center shadow-[0_0_24px_-4px_rgba(53,214,228,0.45)]">
            <Gauge size={21} />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-mint ring-2 ring-surface-2" />
          </div>
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight">
                {screen === 'dashboard'
                  ? 'Núcleo de Capacidad SENDA'
                  : DOCK_ITEMS.find(d => d.id === screen)?.title}
              </h2>
              <span className={`inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full border text-[11px] font-semibold ${alertMeta.badgeClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${alertMeta.dotClass} animate-ping`} />
                {alertMeta.label}
              </span>
            </div>
            <p className="text-[11px] font-tech text-muted-2 mt-0.5">
              TELEMETRÍA EN TIEMPO REAL · CUELLO DE BOTELLA: <strong className="text-accent">{engine.bottleneckStage.toUpperCase()}</strong>
            </p>
          </div>
        </div>

        {/* DOCK SUTIL DE ICONOS CON NUMERACIÓN */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-surface-3/90 border border-line rounded-2xl p-1.5">
            {DOCK_ITEMS.map(item => {
              const Icon = item.icon;
              const isActive = screen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScreen(item.id)}
                  title={item.title}
                  className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                    isActive
                      ? 'bg-gradient-to-br from-accent to-mint text-on-accent shadow-[0_0_22px_-2px_rgba(53,214,228,0.7)] scale-105'
                      : 'bg-surface-2/70 text-muted hover:text-text hover:bg-surface-2 border border-transparent hover:border-line'
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.5 : 2} />
                  {item.id !== 'dashboard' && (
                    <span
                      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full font-tech text-[9px] font-bold flex items-center justify-center border ${
                        isActive
                          ? 'bg-ink text-mint border-mint'
                          : 'bg-surface-3 text-muted-2 border-line group-hover:text-text'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowConfigModal(true)}
            title="Capacidad individual y margen"
            className="w-10 h-10 rounded-xl bg-surface-3/90 hover:bg-accent-dim border border-line hover:border-accent/40 flex items-center justify-center text-muted hover:text-accent transition-all"
          >
            <Sliders size={17} />
          </button>
        </div>
      </div>

      {/* =====================================================================
          PANTALLA 0: DASHBOARD CENTRAL (REACTOR ORBITAL + FLUJO CONECTADO DE CAPACIDAD)
         ===================================================================== */}
      {screen === 'dashboard' && (
        <div className="flex-1 flex flex-col justify-between gap-5 animate-fadeIn">
          <div
            className="relative flex-1 bg-surface-2 border border-accent/35 rounded-3xl p-6 sm:p-8 overflow-hidden flex flex-col justify-between"
            style={{
              boxShadow: `0 0 70px -22px ${alertMeta.glowColor}, inset 0 1px 0 0 rgba(255,255,255,0.06)`,
            }}
          >
            {/* Resplandores atmosféricos de fondo */}
            <div
              className="absolute -left-24 -top-24 w-96 h-96 rounded-full pointer-events-none blur-3xl opacity-25 animate-pulse"
              style={{ background: 'radial-gradient(circle, var(--accent), transparent 68%)' }}
            />
            <div
              className="absolute right-0 -bottom-28 w-[28rem] h-[28rem] rounded-full pointer-events-none blur-3xl opacity-20"
              style={{ background: 'radial-gradient(circle, var(--mint), transparent 68%)' }}
            />

            {/* Red de circuitos animados con partículas viajeras */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
              viewBox="0 0 1050 460"
              fill="none"
              preserveAspectRatio="xMidYMid slice"
            >
              <defs>
                <linearGradient id="sendaDashTrace1" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.05" />
                  <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.55" />
                  <stop offset="100%" stopColor="var(--mint)" stopOpacity="0.9" />
                </linearGradient>
                <filter id="dashNodeGlow" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="3.5" result="blur" />
                  <feComposite in="SourceGraphic" in2="blur" operator="over" />
                </filter>
              </defs>

              <path
                d="M 60 390 L 230 390 L 300 310 L 520 310 L 590 220 L 980 220"
                stroke="url(#sendaDashTrace1)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M 420 55 L 590 55 L 650 120 L 960 120"
                stroke="var(--mint)"
                strokeOpacity="0.3"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeDasharray="6 8"
              >
                <animate attributeName="stroke-dashoffset" values="0;28" dur="3.5s" repeatCount="indefinite" />
              </path>

              <circle r="4" fill="var(--mint)" filter="url(#dashNodeGlow)">
                <animateMotion dur="5s" repeatCount="indefinite" path="M 60 390 L 230 390 L 300 310 L 520 310 L 590 220 L 980 220" />
              </circle>
              <circle r="3.5" fill="var(--accent)" filter="url(#dashNodeGlow)">
                <animateMotion dur="4.2s" repeatCount="indefinite" path="M 420 55 L 590 55 L 650 120 L 960 120" />
              </circle>

              <circle cx="300" cy="310" r="4.5" fill="var(--accent)" />
              <circle cx="520" cy="310" r="5" fill="none" stroke="var(--mint)" strokeWidth="2" />
              <circle cx="590" cy="220" r="4.5" fill="var(--mint)" />
              <circle cx="650" cy="120" r="4" fill="var(--accent)" />
            </svg>

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto">
              {/* COLUMNA IZQUIERDA (4 cols): REACTOR ORBITAL MULTICAPA */}
              <div className="lg:col-span-4 flex flex-col items-center justify-center">
                <div className="relative w-56 h-56 flex items-center justify-center">
                  {/* Halo pulsante detrás del reactor */}
                  <div
                    className="absolute inset-6 rounded-full blur-2xl opacity-35 animate-pulse"
                    style={{ background: `radial-gradient(circle, ${alertMeta.ringColor}, transparent 70%)` }}
                  />

                  <svg className="w-56 h-56" viewBox="0 0 210 210">
                    {/* Anillo orbital exterior giratorio */}
                    <g transform="translate(105,105)">
                      <circle
                        r="96"
                        fill="none"
                        stroke="var(--accent)"
                        strokeOpacity="0.28"
                        strokeWidth="1.5"
                        strokeDasharray="4 8"
                      >
                        <animateTransform
                          attributeName="transform"
                          type="rotate"
                          from="0"
                          to="360"
                          dur="18s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    </g>

                    {/* Pista fondo anillo principal */}
                    <circle
                      cx="105"
                      cy="105"
                      r={outerRadius}
                      stroke="var(--surface-3)"
                      strokeWidth="11"
                      fill="none"
                    />
                    {/* Anillo Principal: % de Ocupación */}
                    <circle
                      cx="105"
                      cy="105"
                      r={outerRadius}
                      stroke={alertMeta.ringColor}
                      strokeWidth="11"
                      strokeLinecap="round"
                      fill="none"
                      transform="rotate(-90 105 105)"
                      strokeDasharray={outerCircumference}
                      strokeDashoffset={outerOffset}
                      className="transition-all duration-700 ease-out"
                    />

                    {/* Pista fondo anillo interno (Capacidad Segura) */}
                    <circle
                      cx="105"
                      cy="105"
                      r={innerRadius}
                      stroke="var(--surface-3)"
                      strokeWidth="5"
                      fill="none"
                      opacity="0.7"
                    />
                    <circle
                      cx="105"
                      cy="105"
                      r={innerRadius}
                      stroke="var(--accent)"
                      strokeWidth="5"
                      strokeLinecap="round"
                      fill="none"
                      transform="rotate(-90 105 105)"
                      strokeDasharray={innerCircumference}
                      strokeDashoffset={innerOffset}
                      opacity="0.65"
                    />
                  </svg>

                  {/* Núcleo central de datos del reactor */}
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[10px] font-tech uppercase tracking-[0.2em] text-muted-2">
                      OCUPACIÓN
                    </span>
                    <span className="font-display text-5xl font-bold font-tech tracking-tight mt-0.5">
                      {engine.overallUtilPct}%
                    </span>
                    <span className="mt-1.5 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-surface-3/90 border border-line text-[10px] font-tech text-accent">
                      <Activity size={10} /> Límite: {engine.bottleneckStage}
                    </span>
                  </div>
                </div>
              </div>

              {/* COLUMNA DERECHA (8 cols): PIPELINE CONECTADO DE 3 NODOS + TELEMETRÍA POR ETAPA */}
              <div className="lg:col-span-8 space-y-6">
                {/* Pipeline de 3 tarjetas con conectores de ecuación (Segura - En Cola = Aceptable Hoy) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch relative">
                  {/* Nodo 1: Capacidad Segura */}
                  <div className="group bg-surface/90 backdrop-blur-md border border-accent/40 hover:border-accent rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden transition-all shadow-[0_8px_30px_-12px_rgba(53,214,228,0.25)]">
                    <CardNodeDeco color="var(--accent)" />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-tech uppercase tracking-wider text-accent font-semibold">
                        01 · CAPACIDAD SEGURA
                      </span>
                      <span className="w-2 h-2 rounded-full bg-accent" />
                    </div>

                    <div className="my-3">
                      <p className="font-display text-4xl sm:text-5xl font-bold font-tech text-text tracking-tight">
                        {engine.safeBottleneckDaily}
                      </p>
                      <span className="text-xs text-muted">videos / día comercializables</span>
                    </div>

                    <div className="text-[11px] font-tech text-muted-2 pt-2.5 border-t border-line/70 flex justify-between">
                      <span>Física: <strong className="text-text">{engine.physicalBottleneckDaily}</strong></span>
                      <span className="text-accent">−{capacityConfig.safetyMarginPct}% margen</span>
                    </div>
                  </div>

                  {/* Nodo 2: En Cola / Comprometidos */}
                  <div className="group bg-surface/90 backdrop-blur-md border border-amber/40 hover:border-amber rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden transition-all shadow-[0_8px_30px_-12px_rgba(255,200,87,0.22)]">
                    <CardNodeDeco color="var(--amber)" />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-tech uppercase tracking-wider text-amber font-semibold">
                        02 · COMPROMETIDOS
                      </span>
                      <span className="w-2 h-2 rounded-full bg-amber animate-pulse" />
                    </div>

                    <div className="my-3">
                      <p className="font-display text-4xl sm:text-5xl font-bold font-tech text-amber tracking-tight">
                        {engine.committedToday}
                      </p>
                      <span className="text-xs text-muted">videos activos hoy</span>
                    </div>

                    <div className="text-[11px] font-tech text-muted-2 pt-2.5 border-t border-line/70 flex justify-between">
                      <span>Pedidos: <strong className="text-text">{engine.activeOrders.length}</strong></span>
                      <span>Cola total: <strong className="text-amber">{engine.totalActiveCommitted}</strong></span>
                    </div>
                  </div>

                  {/* Nodo 3: Aceptable Hoy (Hero Card) */}
                  <div className="group bg-gradient-to-br from-mint/20 via-surface/95 to-accent/15 backdrop-blur-md border-2 border-mint/70 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-[0_0_38px_-8px_rgba(111,231,200,0.42)]">
                    <CardNodeDeco color="var(--mint)" />
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-tech uppercase tracking-wider text-mint font-bold">
                        03 · ACEPTABLE HOY
                      </span>
                      <span className="relative flex h-2.5 w-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mint opacity-75" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-mint" />
                      </span>
                    </div>

                    <div className="my-3">
                      <p className="font-display text-5xl sm:text-6xl font-bold font-tech text-mint tracking-tight drop-shadow-[0_0_18px_rgba(111,231,200,0.3)]">
                        +{engine.remainingSafeToday}
                      </p>
                      <span className="text-xs text-mint/90">videos inmediatos</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setScreen('1')}
                      className="w-full text-xs font-bold text-on-accent bg-mint hover:opacity-95 rounded-xl py-2 px-3 flex items-center justify-center gap-1.5 transition-all shadow-[0_6px_18px_-4px_rgba(111,231,200,0.55)]"
                    >
                      Abrir Cotizador <ArrowRight size={13} />
                    </button>
                  </div>
                </div>

                {/* Módulos de Telemetría por Etapa: Clippers vs Editores */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Telemetría Clippers */}
                  <div className="bg-surface/85 backdrop-blur-md border border-line hover:border-accent/40 rounded-2xl p-4 space-y-3 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-accent-dim text-accent flex items-center justify-center">
                          <Scissors size={15} />
                        </div>
                        <div>
                          <p className="text-xs font-bold">Etapa Clipping ({clippers.length})</p>
                          <p className="text-[10px] font-tech text-muted-2">Promedio: {engine.avgClipperDaily} vid/día por persona</p>
                        </div>
                      </div>
                      <div className="text-right font-tech">
                        <span className="text-sm font-bold text-accent">{engine.safeClippingDaily}</span>
                        <span className="text-[11px] text-muted-2"> / {engine.physicalClippingDaily} fís</span>
                      </div>
                    </div>

                    {/* Barra segmentada estilo ecualizador */}
                    <div className="grid grid-cols-10 gap-1">
                      {Array.from({ length: 10 }).map((_, idx) => {
                        const activeSeg = (idx + 1) * 10 <= Math.max(10, engine.clippingUtilPct);
                        return (
                          <div
                            key={idx}
                            className={`h-2 rounded-sm transition-all duration-500 ${
                              activeSeg && engine.clippingUtilPct > 0
                                ? 'bg-accent shadow-[0_0_8px_rgba(53,214,228,0.6)]'
                                : 'bg-surface-3'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>

                  {/* Telemetría Editores */}
                  <div className="bg-surface/85 backdrop-blur-md border border-line hover:border-mint/40 rounded-2xl p-4 space-y-3 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg bg-mint-dim text-mint flex items-center justify-center">
                          <Film size={15} />
                        </div>
                        <div>
                          <p className="text-xs font-bold">Etapa Edición ({editors.length})</p>
                          <p className="text-[10px] font-tech text-muted-2">Promedio: {engine.avgEditorDaily} vid/día por persona</p>
                        </div>
                      </div>
                      <div className="text-right font-tech">
                        <span className="text-sm font-bold text-mint">{engine.safeEditingDaily}</span>
                        <span className="text-[11px] text-muted-2"> / {engine.physicalEditingDaily} fís</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-10 gap-1">
                      {Array.from({ length: 10 }).map((_, idx) => {
                        const activeSeg = (idx + 1) * 10 <= Math.max(10, engine.editingUtilPct);
                        return (
                          <div
                            key={idx}
                            className={`h-2 rounded-sm transition-all duration-500 ${
                              activeSeg && engine.editingUtilPct > 0
                                ? 'bg-mint shadow-[0_0_8px_rgba(111,231,200,0.6)]'
                                : 'bg-surface-3'
                            }`}
                          />
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PANTALLA 1: COTIZADOR Y TANDAS (DIAL INTERACTIVO 1..200 + TIMELINE DE TANDAS)
         ===================================================================== */}
      {screen === '1' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch animate-fadeIn">
          {/* Consola Izquierda: Dial Visual de Volumen + Selector de Complejidad */}
          <div className="lg:col-span-5 bg-surface-2 border border-accent/30 rounded-3xl p-6 flex flex-col justify-between space-y-6 relative overflow-hidden shadow-[0_0_45px_-18px_rgba(53,214,228,0.28)]">
            <CardNodeDeco color="var(--accent)" />

            <div className="flex items-center justify-between relative z-10">
              <span className="font-tech text-xs uppercase tracking-wider text-accent flex items-center gap-1.5 font-semibold">
                <Zap size={14} /> Consola de Volumen
              </span>
              <span className="font-tech text-[11px] px-2.5 py-0.5 rounded-full bg-surface-3 border border-line text-muted">
                Rango: 1 — 200 vid
              </span>
            </div>

            {/* Dial Circular + Slider de Volumen */}
            <div className="bg-surface-3/80 border border-line rounded-2xl p-5 space-y-5 my-auto relative z-10">
              <div className="flex items-center justify-between gap-4">
                <div className="relative w-28 h-28 flex items-center justify-center shrink-0">
                  <svg className="w-28 h-28 -rotate-90" viewBox="0 0 124 124">
                    <circle cx="62" cy="62" r={evalRingRadius} stroke="var(--surface-2)" strokeWidth="8" fill="none" />
                    <circle
                      cx="62"
                      cy="62"
                      r={evalRingRadius}
                      stroke="var(--accent)"
                      strokeWidth="8"
                      strokeLinecap="round"
                      fill="none"
                      strokeDasharray={evalRingCirc}
                      strokeDashoffset={evalRingOffset}
                      className="transition-all duration-300"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-3xl font-bold font-tech text-accent">{evalVideos}</span>
                    <span className="text-[9px] font-tech uppercase text-muted-2">videos</span>
                  </div>
                </div>

                <div className="flex-1 space-y-2">
                  <span className="text-xs text-muted block">Desliza para cotizar volumen</span>
                  <input
                    type="range"
                    min={1}
                    max={200}
                    value={evalVideos}
                    onChange={e => setEvalVideos(Number(e.target.value))}
                    className="w-full accent-accent cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] font-tech text-muted-2">
                    <span>1</span>
                    <span>50</span>
                    <span>100</span>
                    <span>150</span>
                    <span>200</span>
                  </div>
                </div>
              </div>

              {/* Botones rápidos de volumen */}
              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {[10, 25, 50, 100, 200].map(presetVal => (
                  <button
                    key={presetVal}
                    type="button"
                    onClick={() => setEvalVideos(presetVal)}
                    className={`py-1.5 rounded-lg font-tech text-xs border transition-all ${
                      evalVideos === presetVal
                        ? 'bg-accent-dim border-accent text-accent font-bold'
                        : 'bg-surface-2 border-line text-muted hover:text-text'
                    }`}
                  >
                    {presetVal}v
                  </button>
                ))}
              </div>
            </div>

            {/* Selector de Complejidad con estética neón */}
            <div className="space-y-2 relative z-10">
              <span className="text-xs font-tech uppercase tracking-wider text-muted-2 block">
                Nivel de Complejidad
              </span>
              <div className="grid grid-cols-3 gap-2.5">
                {(['simple', 'estandar', 'alta'] as const).map(c => {
                  const active = evalComplexity === c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEvalComplexity(c)}
                      className={`py-3 rounded-xl text-xs font-bold capitalize border transition-all ${
                        active
                          ? 'bg-gradient-to-r from-accent to-mint text-on-accent border-transparent shadow-[0_0_20px_-4px_rgba(53,214,228,0.6)]'
                          : 'bg-surface-3 text-muted border-line hover:text-text'
                      }`}
                    >
                      {c === 'simple' ? 'Simple' : c === 'estandar' ? 'Estándar' : 'Compleja'}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Consola Derecha: Dictamen + Ventana ETA + Cadena Visual de Tandas */}
          <div className="lg:col-span-7 bg-surface-2 border border-line rounded-3xl p-6 flex flex-col justify-between space-y-6 relative overflow-hidden">
            <CardNodeDeco color={evaluation.canAcceptFullOnDate ? 'var(--mint)' : 'var(--amber)'} />

            {/* Tarjetas gemelas de Dictamen y Ventana ETA */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 relative z-10">
              <div className={`rounded-2xl p-5 border flex flex-col justify-between ${
                evaluation.canAcceptFullOnDate
                  ? 'bg-gradient-to-br from-mint/20 to-surface-3 border-mint/50 shadow-[0_0_30px_-10px_rgba(111,231,200,0.35)]'
                  : 'bg-gradient-to-br from-amber/20 to-surface-3 border-amber/50 shadow-[0_0_30px_-10px_rgba(255,200,87,0.3)]'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="font-tech text-[11px] uppercase font-bold flex items-center gap-1.5">
                    {evaluation.canAcceptFullOnDate ? (
                      <><CheckCircle2 size={16} className="text-mint" /> Viabilidad Inmediata</>
                    ) : (
                      <><AlertTriangle size={16} className="text-amber" /> Distribución por Tandas</>
                    )}
                  </span>
                </div>
                <p className="font-display text-3xl sm:text-4xl font-bold font-tech mt-3">
                  {evaluation.canAcceptFullOnDate
                    ? `${evalVideos} vid en 1 día`
                    : `Máx. hoy: ${evaluation.maxImmediateAcceptable} vid`}
                </p>
                <span className="text-xs text-muted mt-1.5 font-tech">
                  Cupo seguro hoy: {evaluation.availableSafeOnTargetDate} de {engine.safeBottleneckDaily} vid
                </span>
              </div>

              <div className="bg-surface-3/90 border border-accent/40 rounded-2xl p-5 flex flex-col justify-between">
                <span className="font-tech text-[11px] uppercase text-accent font-bold flex items-center gap-1.5">
                  <Clock size={15} /> Ventana Estimada (ETA)
                </span>
                <p className="font-display text-2xl sm:text-3xl font-bold font-tech text-text mt-3">
                  {evaluation.etaWindowText}
                </p>
                <span className="text-xs text-mint mt-1.5 font-tech">
                  Cierre total del lote: {evaluation.finalCompletionDate}
                </span>
              </div>
            </div>

            {/* Línea de Tiempo de Tandas Conectadas */}
            <div className="flex-1 flex flex-col justify-center space-y-3 relative z-10">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase font-tech text-muted flex items-center gap-1.5">
                  <Calendar size={14} className="text-accent" /> Plan de Entregas ({evaluation.batches.length} {evaluation.batches.length === 1 ? 'Tanda' : 'Tandas'})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
                {evaluation.batches.map(b => {
                  const pctOfOrder = Math.round((b.videos / Math.max(1, evalVideos)) * 100);
                  return (
                    <div
                      key={b.date}
                      className="bg-surface-3/90 border border-line hover:border-accent/50 rounded-2xl p-4 space-y-3 relative overflow-hidden transition-all"
                    >
                      <div className="flex items-center justify-between text-[11px] font-tech">
                        <span className="px-2.5 py-0.5 rounded-full bg-accent-dim text-accent border border-accent/30 font-bold">
                          TANDA {b.dayIndex}
                        </span>
                        <span className="text-muted-2">{b.date === todayIso() ? 'Hoy' : b.date}</span>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <p className="font-display text-3xl font-bold font-tech text-text">
                          {b.videos} <span className="text-xs font-normal text-muted">vid</span>
                        </p>
                        <span className="font-tech text-xs text-mint font-bold">{pctOfOrder}%</span>
                      </div>

                      <div className="h-2 bg-surface-2 rounded-full overflow-hidden border border-line">
                        <div
                          className="h-full bg-gradient-to-r from-accent to-mint rounded-full transition-all duration-500"
                          style={{ width: `${pctOfOrder}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PANTALLA 2: SIMULADOR DE ESCENARIOS («¿QUÉ PASARÍA SI...?»)
         ===================================================================== */}
      {screen === '2' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch animate-fadeIn">
          {/* Controles del Laboratorio */}
          <div className="lg:col-span-6 bg-surface-2 border border-mint/30 rounded-3xl p-6 flex flex-col justify-between space-y-4 relative overflow-hidden shadow-[0_0_45px_-18px_rgba(111,231,200,0.22)]">
            <CardNodeDeco color="var(--mint)" />

            <div className="flex items-center justify-between relative z-10">
              <span className="font-tech text-xs uppercase tracking-wider text-mint font-semibold flex items-center gap-1.5">
                <Sparkles size={14} /> Mesa de Simulación Hipotética
              </span>
              <button
                type="button"
                onClick={() => {
                  setSimExtraVideos(0);
                  setSimExtraClippers(0);
                  setSimExtraEditors(0);
                  setSimUnavailablePct(0);
                  setSimEditorDemandBoostPct(0);
                }}
                className="text-xs text-muted hover:text-accent font-tech px-2.5 py-1 rounded-lg bg-surface-3 border border-line"
              >
                Restablecer 0
              </button>
            </div>

            <div className="space-y-3.5 my-auto relative z-10">
              <div className="bg-surface-3/90 border border-line rounded-2xl p-4">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xs font-semibold">Pico de demanda extra</span>
                  <span className="font-display text-2xl font-bold font-tech text-accent">+{simExtraVideos} videos</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={200}
                  step={5}
                  value={simExtraVideos}
                  onChange={e => setSimExtraVideos(Number(e.target.value))}
                  className="w-full accent-accent cursor-pointer"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-3/90 border border-accent/25 rounded-2xl p-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-semibold flex items-center gap-1">
                      <Scissors size={12} className="text-accent" /> + Clippers
                    </span>
                    <span className="font-display text-2xl font-bold font-tech text-accent">+{simExtraClippers}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={simExtraClippers}
                    onChange={e => setSimExtraClippers(Number(e.target.value))}
                    className="w-full accent-accent cursor-pointer"
                  />
                  <span className="text-[10px] font-tech text-muted-2 block mt-1.5">
                    Aporte: +{simExtraClippers * engine.avgClipperDaily} vid/día fís.
                  </span>
                </div>

                <div className="bg-surface-3/90 border border-mint/25 rounded-2xl p-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-semibold flex items-center gap-1">
                      <Film size={12} className="text-mint" /> + Editores
                    </span>
                    <span className="font-display text-2xl font-bold font-tech text-mint">+{simExtraEditors}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={simExtraEditors}
                    onChange={e => setSimExtraEditors(Number(e.target.value))}
                    className="w-full accent-mint cursor-pointer"
                  />
                  <span className="text-[10px] font-tech text-muted-2 block mt-1.5">
                    Aporte: +{simExtraEditors * engine.avgEditorDaily} vid/día fís.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-3/90 border border-line rounded-2xl p-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-semibold">Ausentismo equipo</span>
                    <span className="font-display text-xl font-bold font-tech text-amber">{simUnavailablePct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={5}
                    value={simUnavailablePct}
                    onChange={e => setSimUnavailablePct(Number(e.target.value))}
                    className="w-full accent-amber cursor-pointer"
                  />
                </div>

                <div className="bg-surface-3/90 border border-line rounded-2xl p-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-semibold">Exigencia edición</span>
                    <span className="font-display text-xl font-bold font-tech text-violet">+{simEditorDemandBoostPct}%</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={60}
                    step={5}
                    value={simEditorDemandBoostPct}
                    onChange={e => setSimEditorDemandBoostPct(Number(e.target.value))}
                    className="w-full accent-accent cursor-pointer"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Telemetría de Impacto Simulado */}
          <div className="lg:col-span-6 bg-surface-2 border border-line rounded-3xl p-6 flex flex-col justify-between space-y-5 relative overflow-hidden">
            <CardNodeDeco color={simulation.simDeficit > 0 ? 'var(--amber)' : 'var(--mint)'} />

            <div className="flex items-center justify-between relative z-10">
              <span className="font-tech text-xs uppercase tracking-wider text-muted font-semibold">
                Proyección de Impacto en Vivo
              </span>
              <span className={`font-tech text-xs px-2.5 py-0.5 rounded-full border ${
                simulation.simDeficit > 0
                  ? 'bg-red-500/15 text-red-400 border-red-500/30'
                  : 'bg-mint-dim text-mint border-mint/30'
              }`}>
                Ocupación Simulada: {simulation.simUtilPct}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 my-auto relative z-10">
              <div className="bg-surface-3/90 border border-mint/30 rounded-2xl p-5">
                <span className="text-[10px] font-tech uppercase text-mint block">Nueva Capacidad Segura</span>
                <p className="font-display text-4xl sm:text-5xl font-bold font-tech text-mint mt-2">
                  {simulation.simSafeLimit}
                </p>
                <span className="text-xs text-muted font-tech mt-1.5 block">
                  Clip: {simulation.simSafeClip} · Edic: {simulation.simSafeEdit}
                </span>
              </div>

              <div className="bg-surface-3/90 border border-accent/30 rounded-2xl p-5">
                <span className="text-[10px] font-tech uppercase text-accent block">Cuello de Botella</span>
                <p className="font-display text-3xl sm:text-4xl font-bold font-tech text-accent mt-2">
                  {simulation.simBottleneck}
                </p>
                <span className="text-xs text-muted font-tech mt-1.5 block">
                  Etapa que marca el techo
                </span>
              </div>

              <div className={`rounded-2xl p-5 border ${
                simulation.simDeficit > 0
                  ? 'bg-red-500/10 border-red-500/40'
                  : 'bg-mint-dim/30 border-mint/40'
              }`}>
                <span className="text-[10px] font-tech uppercase text-muted-2 block">Holgura / Déficit</span>
                <p className={`font-display text-3xl sm:text-4xl font-bold font-tech mt-2 ${
                  simulation.simDeficit > 0 ? 'text-red-400' : 'text-mint'
                }`}>
                  {simulation.simDeficit > 0 ? `-${simulation.simDeficit} vid` : `+${simulation.simFreeCapacity} vid`}
                </p>
                <span className="text-xs text-muted font-tech mt-1.5 block">
                  Demanda total: {simulation.totalSimulatedDemand} vid
                </span>
              </div>

              <div className="bg-surface-3/90 border border-amber/30 rounded-2xl p-5">
                <span className="text-[10px] font-tech uppercase text-amber block">Días para Absorber</span>
                <p className="font-display text-3xl sm:text-4xl font-bold font-tech text-amber mt-2">
                  {simulation.daysNeededForExtra}d
                </p>
                <span className="text-xs text-muted font-tech mt-1.5 block">
                  Dividido en tandas seguras
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PANTALLA 3: PROTOCOLO Y ALERTAS (RADAR DESPLEGABLE + HORA MÁXIMA DE REASIGNACIÓN)
         ===================================================================== */}
      {screen === '3' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch animate-fadeIn">
          {/* Columna Izquierda (5 cols): Radar de Carga Hoy por Creador (Filas Desplegables) */}
          <div className="lg:col-span-5 bg-surface-2 border border-line rounded-3xl p-5 flex flex-col justify-between space-y-4 relative overflow-hidden">
            <CardNodeDeco color="var(--accent)" />

            <div className="flex items-center justify-between gap-2 flex-wrap relative z-10">
              <span className="font-tech text-xs uppercase tracking-wider text-accent font-semibold flex items-center gap-1.5">
                <Users size={14} /> Carga Hoy por Creador
              </span>

              <div className="flex items-center gap-1 bg-surface-3 border border-line rounded-xl p-1">
                {(['todos', 'clipper', 'editor'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setProtocolRoleFilter(r)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      protocolRoleFilter === r ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'
                    }`}
                  >
                    {r === 'todos' ? 'Todos' : r === 'clipper' ? 'Clippers' : 'Editores'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 max-h-[470px] overflow-y-auto pr-1 my-auto relative z-10">
              {filteredWorkloads.map(item => {
                const isClipper = item.worker.role === 'clipper';
                const isOpen = expandedWorkerId === item.worker.id;
                const barColor =
                  item.utilPct >= 90 ? 'bg-red-500' : item.utilPct >= 70 ? 'bg-amber' : isClipper ? 'bg-accent' : 'bg-mint';

                return (
                  <div
                    key={item.worker.id}
                    className={`bg-surface-3/90 border rounded-2xl transition-all overflow-hidden ${
                      isOpen ? 'border-accent/60 shadow-lg' : 'border-line hover:border-accent/30'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedWorkerId(prev => (prev === item.worker.id ? null : item.worker.id))}
                      className="w-full px-3.5 py-3 flex items-center justify-between gap-3 text-left"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${item.worker.online ? 'bg-mint' : 'bg-muted-2'}`} />
                        <p className="text-xs sm:text-sm font-bold truncate">{item.worker.name}</p>
                        <span className={`text-[10px] font-tech px-1.5 py-0.5 rounded font-bold ${
                          isClipper ? 'bg-accent-dim text-accent' : 'bg-mint-dim text-mint'
                        }`}>
                          {isClipper ? 'C' : 'E'}
                        </span>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="w-16 h-1.5 bg-surface-2 rounded-full overflow-hidden hidden sm:block">
                          <div className={`h-full ${barColor} rounded-full`} style={{ width: `${item.utilPct}%` }} />
                        </div>
                        <span className="font-tech text-xs">
                          <strong className="text-text">{item.totalVideosToday}</strong>
                          <span className="text-muted-2">/{item.capacity}</span>
                        </span>
                        <span className="font-tech text-[10px] px-1.5 py-0.5 rounded bg-mint-dim/50 text-mint">
                          +{item.freeCapacity} lib
                        </span>
                        <ChevronDown
                          size={14}
                          className={`text-muted transition-transform duration-200 ${isOpen ? 'rotate-180 text-accent' : ''}`}
                        />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-3.5 pb-3.5 pt-2 border-t border-line/60 bg-surface-2/70 space-y-2 animate-fadeIn">
                        <div className="grid grid-cols-3 gap-1.5 text-[11px] font-tech text-center">
                          <div className="bg-surface-3 border border-line rounded-lg py-1.5">
                            <span className="text-muted-2 block text-[10px]">Simple</span>
                            <strong className="text-mint">{item.simpleVideos} vid</strong>
                          </div>
                          <div className="bg-surface-3 border border-line rounded-lg py-1.5">
                            <span className="text-muted-2 block text-[10px]">Estándar</span>
                            <strong className="text-accent">{item.estandarVideos} vid</strong>
                          </div>
                          <div className="bg-surface-3 border border-line rounded-lg py-1.5">
                            <span className="text-muted-2 block text-[10px]">Compleja</span>
                            <strong className="text-amber">{item.altaVideos} vid</strong>
                          </div>
                        </div>

                        {item.activeBrands.length > 0 && (
                          <p className="text-[11px] text-muted-2 font-tech truncate">
                            Activos: <span className="text-text">{item.activeBrands.join(' · ')}</span>
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Columna Derecha (7 cols): Pedidos con Alerta Activa + Cronómetro de Hora Máxima de Reasignación */}
          <div className="lg:col-span-7 bg-surface-2 border border-line rounded-3xl p-5 flex flex-col justify-between space-y-4 relative overflow-hidden">
            <CardNodeDeco color="var(--amber)" />

            <div className="flex items-center justify-between gap-2 flex-wrap relative z-10">
              <span className="font-tech text-xs uppercase tracking-wider text-amber font-semibold flex items-center gap-1.5">
                <ShieldAlert size={14} /> Pedidos con Alerta Activa ({protocolAlertOrders.length})
              </span>
              <span className="text-[11px] text-muted font-tech">
                Clic en un pedido para abrir consola de reasignación
              </span>
            </div>

            {protocolAlertOrders.length === 0 ? (
              <div className="my-auto text-center py-14 bg-surface-3/40 border border-dashed border-line rounded-2xl relative z-10">
                <CheckCircle2 size={30} className="text-mint mx-auto mb-2" />
                <p className="text-sm font-semibold">Sin pedidos con alerta activa</p>
                <p className="text-xs text-muted mt-1">
                  Todos los pedidos reales están dentro de su ventana segura de entrega.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[470px] overflow-y-auto pr-1 my-auto relative z-10">
                {protocolAlertOrders.map(item => {
                  const {
                    order,
                    hoursLeft,
                    complexity,
                    level,
                    currentClipper,
                    currentEditor,
                    productionHoursNeeded,
                    maxReassignLabel,
                    hoursUntilMaxReassign,
                    isPastMaxReassign,
                  } = item;

                  const isExpanded = expandedOrderId === order.id;

                  const badgeStyles = {
                    prioritario: 'bg-accent-dim text-accent border-accent/40',
                    urgente: 'bg-amber-dim text-amber border-amber/40',
                    critico: 'bg-red-500/15 text-red-400 border-red-500/40',
                    normal: 'bg-mint-dim text-mint border-mint/40',
                  }[level];

                  const complexityBadge = {
                    simple: 'text-mint border-mint/30 bg-mint-dim/40',
                    estandar: 'text-accent border-accent/30 bg-accent-dim/40',
                    alta: 'text-amber border-amber/30 bg-amber-dim/40',
                  }[complexity];

                  const selectedClipperId = selectedClipperByOrder[order.id] ?? order.clipperId ?? '';
                  const selectedEditorId = selectedEditorByOrder[order.id] ?? order.editorId ?? '';

                  return (
                    <div
                      key={order.id}
                      className={`bg-surface-3/90 border rounded-2xl transition-all overflow-hidden ${
                        isExpanded ? 'border-accent/60 shadow-lg' : 'border-line hover:border-accent/35'
                      }`}
                    >
                      <div className="p-3.5 flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-tech uppercase px-2.5 py-0.5 rounded-full border font-bold ${badgeStyles}`}>
                              {level}
                            </span>
                            <p className="text-sm font-bold truncate">
                              {order.brand} · <span className="text-accent font-tech">{order.videoCount} vid</span>
                            </p>
                            <span className={`text-[10px] font-tech uppercase px-2 py-0.5 rounded border ${complexityBadge}`}>
                              {complexity === 'alta' ? 'Compleja' : complexity}
                            </span>
                          </div>

                          <div className="flex items-center gap-3 flex-wrap text-[11px] font-tech">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md border font-semibold ${
                              isPastMaxReassign
                                ? 'bg-red-500/15 text-red-400 border-red-500/35'
                                : 'bg-amber-dim/60 text-amber border-amber/35'
                            }`}>
                              <Timer size={12} />
                              Hora máx. reasignar: {maxReassignLabel}
                              {isPastMaxReassign
                                ? ' (Límite superado)'
                                : ` (en ${hoursUntilMaxReassign}h)`}
                            </span>

                            <span className="text-muted-2">
                              Entrega: {order.deliveryDate} {order.deliveryTime || '18:00'} ({hoursLeft > 0 ? `${hoursLeft}h` : 'Vencido'})
                            </span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {reassignedToastId === order.id && (
                            <span className="text-xs text-mint font-semibold flex items-center gap-1">
                              <CheckCircle2 size={13} /> Listo
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setExpandedOrderId(prev => (prev === order.id ? null : order.id))}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-all ${
                              isExpanded
                                ? 'bg-accent text-on-accent border-accent'
                                : 'bg-surface-2 text-muted hover:text-text border-line'
                            }`}
                          >
                            <RefreshCw size={12} />
                            {isExpanded ? 'Cerrar' : 'Reasignar'}
                            <ChevronDown size={13} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                          </button>
                        </div>
                      </div>

                      {isExpanded && (
                        <div className="px-4 pb-4 pt-3 border-t border-line/70 bg-surface-2/80 space-y-3 animate-fadeIn">
                          <div className="flex items-center justify-between text-[11px] font-tech text-muted-2">
                            <span>Producción requerida: <strong className="text-text">{productionHoursNeeded}h netas</strong></span>
                            <span>
                              Actual: {currentClipper?.name || 'Sin Clipper'} / {currentEditor?.name || 'Sin Editor'}
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="text-[10px] font-tech uppercase text-accent block mb-1">
                                Asignar Clipper
                              </label>
                              <select
                                value={selectedClipperId}
                                onChange={e =>
                                  setSelectedClipperByOrder(prev => ({ ...prev, [order.id]: e.target.value }))
                                }
                                className="w-full bg-surface-3 border border-line rounded-xl px-2.5 py-2 text-xs outline-none focus:border-accent"
                              >
                                <option value="">Seleccionar Clipper...</option>
                                {workersWorkloadToday
                                  .filter(x => x.worker.role === 'clipper')
                                  .map(x => (
                                    <option key={x.worker.id} value={x.worker.id}>
                                      {x.worker.name} ({x.totalVideosToday}/{x.capacity} hoy · {x.freeCapacity} libres)
                                    </option>
                                  ))}
                              </select>
                            </div>

                            <div>
                              <label className="text-[10px] font-tech uppercase text-mint block mb-1">
                                Asignar Editor(a)
                              </label>
                              <select
                                value={selectedEditorId}
                                onChange={e =>
                                  setSelectedEditorByOrder(prev => ({ ...prev, [order.id]: e.target.value }))
                                }
                                className="w-full bg-surface-3 border border-line rounded-xl px-2.5 py-2 text-xs outline-none focus:border-mint"
                              >
                                <option value="">Seleccionar Editor(a)...</option>
                                {workersWorkloadToday
                                  .filter(x => x.worker.role === 'editor')
                                  .map(x => (
                                    <option key={x.worker.id} value={x.worker.id}>
                                      {x.worker.name} ({x.totalVideosToday}/{x.capacity} hoy · {x.freeCapacity} libres)
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>

                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => void handleAssignFromProtocol(order)}
                              className="flex items-center gap-1.5 bg-mint text-on-accent rounded-xl px-4 py-2 text-xs font-bold hover:opacity-95 transition-opacity"
                            >
                              <CheckCircle2 size={13} /> Confirmar Reasignación
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          PANTALLA 4: RENDIMIENTO REAL, RETRABAJO Y SEÑAL DE CONTRATACIÓN
         ===================================================================== */}
      {screen === '4' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch animate-fadeIn">
          {/* Embudo de Eficiencia: Física -> Segura -> Real Efectiva */}
          <div className="lg:col-span-5 bg-surface-2 border border-line rounded-3xl p-6 flex flex-col justify-between space-y-5 relative overflow-hidden">
            <CardNodeDeco color="var(--accent)" />

            <span className="font-tech text-xs uppercase tracking-wider text-accent font-semibold flex items-center gap-1.5 relative z-10">
              <Clock size={14} /> Calidad vs. Velocidad Efectiva
            </span>

            <div className="grid grid-cols-2 gap-4 my-auto relative z-10">
              <div className="bg-surface-3/90 border border-amber/30 rounded-2xl p-5">
                <span className="text-[10px] font-tech uppercase text-amber block">Fricción Retrabajo</span>
                <p className="font-display text-4xl sm:text-5xl font-bold font-tech text-amber mt-2">
                  {engine.reworkRatePct}%
                </p>
                <span className="text-xs text-muted font-tech mt-1.5 block">
                  {engine.videosWithRework} con correcciones
                </span>
              </div>

              <div className="bg-surface-3/90 border border-mint/40 rounded-2xl p-5">
                <span className="text-[10px] font-tech uppercase text-mint block">Capacidad Efectiva</span>
                <p className="font-display text-4xl sm:text-5xl font-bold font-tech text-mint mt-2">
                  {engine.effectiveRealCapacity}
                </p>
                <span className="text-xs text-muted font-tech mt-1.5 block">
                  videos netos / día
                </span>
              </div>
            </div>

            <div className="bg-surface-3/90 border border-line rounded-2xl p-4 space-y-2 relative z-10">
              <div className="flex items-center justify-between text-xs font-tech">
                <span className="text-muted">1. Teórica Física:</span>
                <strong className="text-text">{engine.physicalBottleneckDaily} vid/día</strong>
              </div>
              <div className="flex items-center justify-between text-xs font-tech">
                <span className="text-muted">2. Comercial Segura ({100 - capacityConfig.safetyMarginPct}%):</span>
                <strong className="text-accent">{engine.safeBottleneckDaily} vid/día</strong>
              </div>
              <div className="flex items-center justify-between text-xs font-tech">
                <span className="text-muted">3. Real Efectiva (post-QC):</span>
                <strong className="text-mint">{engine.effectiveRealCapacity} vid/día</strong>
              </div>
            </div>
          </div>

          {/* Tarjeta de Expansión de Equipo Basada en Promedios Reales */}
          <div className="lg:col-span-7 bg-surface-2 border border-mint/35 rounded-3xl p-6 flex flex-col justify-between space-y-5 relative overflow-hidden shadow-[0_0_50px_-18px_rgba(111,231,200,0.25)]">
            <CardNodeDeco color="var(--mint)" />

            <span className="font-tech text-xs uppercase tracking-wider text-mint font-semibold flex items-center gap-1.5 relative z-10">
              <UserPlus size={14} /> Señal de Contratación Basada en Promedios Reales
            </span>

            <div className="bg-gradient-to-br from-mint/15 via-surface-3 to-accent/10 border border-mint/40 rounded-2xl p-6 space-y-3 my-auto relative z-10">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-tech uppercase text-mint font-bold">
                  Etapa Limitante Actual: {engine.bottleneckStage}
                </span>
                <span className="font-tech text-xs px-3 py-0.5 rounded-full bg-surface-2 border border-mint/30 text-mint">
                  Promedio {engine.bottleneckStage}: {engine.bottleneckStage === 'Edición' ? engine.avgEditorDaily : engine.avgClipperDaily} vid/día
                </span>
              </div>

              <p className="font-display text-3xl sm:text-4xl font-bold text-text tracking-tight">
                +1 {engine.bottleneckStage === 'Edición' ? 'Editor(a)' : 'Clipper'} = +{Math.floor((engine.bottleneckStage === 'Edición' ? engine.avgEditorDaily : engine.avgClipperDaily) * ((100 - capacityConfig.safetyMarginPct) / 100))} videos seguros / día
              </p>

              <p className="text-xs text-muted font-tech">
                Expansión mensual proyectada: <strong className="text-mint">+{Math.floor((engine.bottleneckStage === 'Edición' ? engine.avgEditorDaily : engine.avgClipperDaily) * ((100 - capacityConfig.safetyMarginPct) / 100)) * 26} videos comerciales al mes</strong>.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4 relative z-10">
              <div className="bg-surface-3/90 border border-line rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-muted-2 block">Promedio Clipper</span>
                  <p className="font-display text-2xl font-bold font-tech text-accent">{engine.avgClipperDaily} vid/día</p>
                </div>
                <Scissors size={22} className="text-accent opacity-60" />
              </div>

              <div className="bg-surface-3/90 border border-line rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-muted-2 block">Promedio Editor(a)</span>
                  <p className="font-display text-2xl font-bold font-tech text-mint">{engine.avgEditorDaily} vid/día</p>
                </div>
                <Film size={22} className="text-mint opacity-60" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL DE CAPACIDAD INDIVIDUAL POR CREADOR Y MARGEN DE SEGURIDAD
         ===================================================================== */}
      {showConfigModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowConfigModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-surface-2 border border-line rounded-3xl max-w-2xl w-full p-6 space-y-5 animate-fadeIn"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold flex items-center gap-2">
                <Sliders size={18} className="text-accent" /> Capacidad Individual y Margen Operativo
              </h3>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="w-8 h-8 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="bg-surface-3 border border-line rounded-xl p-3.5 block">
                <span className="text-xs text-muted block mb-1">Margen de seguridad (%)</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={capacityConfig.safetyMarginPct}
                  onChange={e => updateCapacityConfig({ safetyMarginPct: Math.min(50, Math.max(0, Number(e.target.value) || 0)) })}
                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm font-tech outline-none focus:border-accent"
                />
              </label>

              <label className="bg-surface-3 border border-line rounded-xl p-3.5 block">
                <span className="text-xs text-muted block mb-1">Horario (Inicio — Fin h)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={22}
                    value={capacityConfig.workdayStartHour}
                    onChange={e => updateCapacityConfig({ workdayStartHour: Number(e.target.value) || 8 })}
                    className="w-full bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-sm font-tech outline-none focus:border-accent"
                  />
                  <span className="text-muted-2">-</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={capacityConfig.workdayEndHour}
                    onChange={e => updateCapacityConfig({ workdayEndHour: Number(e.target.value) || 20 })}
                    className="w-full bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-sm font-tech outline-none focus:border-accent"
                  />
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-72 overflow-y-auto pr-1">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-accent flex items-center justify-between">
                  <span>Clippers</span>
                  <span className="font-tech">Prom: {engine.avgClipperDaily} v/d</span>
                </span>
                {clippers.map(w => (
                  <div key={w.id} className="bg-surface-3 border border-line rounded-xl px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium truncate">{w.name}</span>
                    <input
                      type="number"
                      min={1}
                      value={getWorkerCapacity(w.id)}
                      onChange={e => setWorkerCapacity(w.id, Number(e.target.value) || 1)}
                      className="w-16 bg-surface-2 border border-line rounded-md px-2 py-1 text-xs font-tech text-center outline-none focus:border-accent"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-mint flex items-center justify-between">
                  <span>Editores</span>
                  <span className="font-tech">Prom: {engine.avgEditorDaily} v/d</span>
                </span>
                {editors.map(w => (
                  <div key={w.id} className="bg-surface-3 border border-line rounded-xl px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium truncate">{w.name}</span>
                    <input
                      type="number"
                      min={1}
                      value={getWorkerCapacity(w.id)}
                      onChange={e => setWorkerCapacity(w.id, Number(e.target.value) || 1)}
                      className="w-16 bg-surface-2 border border-line rounded-md px-2 py-1 text-xs font-tech text-center outline-none focus:border-mint"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
