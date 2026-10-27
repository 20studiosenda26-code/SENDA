import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { Brand, Worker, WorkerCustomGoals, NotificationItem, NotificationCategory, Role, ThemeMode, ViewKey, Config, PaidHistoryEntry, ChatMessage, Video, QcStatus, ClipStatus, CalendarEvent, MainImageStatus, ClassroomModule, EmailLogEntry, Contract, ContractSignedUpload, ChatGroup, ChatMsg, Order, OrderStatus, FinanceSettings, FinanceDayClosing, AppExpense, PayrollPayment, CapacityProtocolConfig } from './types';
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
  defaultClipperDailyVideos: 10,
  defaultEditorDailyVideos: 10,
  workdayStartHour: 8,
  workdayEndHour: 20,
  maxNoResponseMinutes: 45,
  maxStalledHours: 3,
  urgentThresholdHours: 4,
};

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
const DATA_SEED_VERSION = 'senda_v5_clean_data';

function ensureCleanThreeProjectsSeed() {
  try {
    const currentVer = localStorage.getItem(STORAGE_PREFIX + 'seed_version');
    if (currentVer !== DATA_SEED_VERSION) {
      localStorage.setItem(STORAGE_PREFIX + 'brands', JSON.stringify([]));
      localStorage.setItem(STORAGE_PREFIX + 'orders', JSON.stringify([]));
      localStorage.setItem(STORAGE_PREFIX + 'workers', JSON.stringify([]));
      localStorage.setItem(STORAGE_PREFIX + 'paidHistory', JSON.stringify([]));
      localStorage.setItem(STORAGE_PREFIX + 'notifications', JSON.stringify([]));
      localStorage.setItem(STORAGE_PREFIX + 'seed_version', DATA_SEED_VERSION);
    }
  } catch {
  }
}

ensureCleanThreeProjectsSeed();

type SharedKey =
  | 'brands' | 'notifications' | 'orders' | 'calendarEvents'
  | 'workerGoals' | 'workerPointsOverride' | 'financeSettings'
  | 'financeClosings' | 'appExpenses' | 'payrollPayments'
  | 'payrollAdjustments' | 'capacityProtocolConfig' | 'workerCapacities';

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
  } catch {}
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
      try { localStorage.setItem(key, String(now)); } catch {}
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
  submitClientFeedbackBatch: (videoId: string, items: { time: number; text: string }[]) => void;
  enableExtraClientFeedbackRound: (videoId: string) => void;
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
  deleteBrandProject: (brandId: string) => void;
  liquidateOrders: (orderIds: string[]) => void;
  assignClipper: (videoId: string, workerId: string) => void;
  assignProject: (brand: string, deliveryDate: string, deliveryTime: string, workerIds: string[], briefFileName?: string, briefFileUrl?: string) => void;
  workerCapacities: Record<string, number>;
  getWorkerCapacity: (workerId: string) => number;
  setWorkerCapacity: (workerId: string, capacity: number) => void;
  getWorkerWorkload: (workerId: string) => number;
  assignOrderTeam: (orderId: string, clipperId: string, editorId: string) => Promise<void>;
  assignOrderClipper: (orderId: string, clipperId: string) => Promise<void>;
  assignOrderEditor: (orderId: string, editorId: string) => Promise<void>;
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
  const [workerCapacities, setWorkerCapacities] = useState<Record<string, number>>(() => loadState('workerCapacities', {} as Record<string, number>));
  const [financeSettings, setFinanceSettings] = useState<FinanceSettings>(() => loadState('financeSettings', DEFAULT_FINANCE_SETTINGS));
  const [financeClosings, setFinanceClosings] = useState<FinanceDayClosing[]>(() => loadState('financeClosings', [] as FinanceDayClosing[]));
  const [appExpenses, setAppExpenses] = useState<AppExpense[]>(() => loadState('appExpenses', [] as AppExpense[]));
  const [payrollPayments, setPayrollPayments] = useState<PayrollPayment[]>(() => loadState('payrollPayments', [] as PayrollPayment[]));
  const [payrollAdjustments, setPayrollAdjustments] = useState<Record<string, number>>(() => loadState('payrollAdjustments', {} as Record<string, number>));
  const [capacityConfig, setCapacityConfig] = useState<CapacityProtocolConfig>(() => loadState('capacityProtocolConfig', DEFAULT_CAPACITY_CONFIG));

  const localWriteLockUntil = useRef<number>(0);
  const hydratedRef = useRef<boolean>(!isSupabaseConfigured);
  const markLocalWrite = useCallback(() => {
    localWriteLockUntil.current = Date.now() + 2500;
  }, []);

  const persistShared = useCallback(<T,>(key: SharedKey, value: T) => {
    saveState(key, value);
    if (isSupabaseConfigured && hydratedRef.current) {
      markLocalWrite();
      void saveShared(key, value);
    }
  }, [markLocalWrite]);

  useEffect(() => { persistShared('brands', brands); }, [brands, persistShared]);
  useEffect(() => { persistShared('orders', orders); }, [orders, persistShared]);
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
      const remoteSeedVer = await loadShared<string>('seed_version');
      if (remoteSeedVer !== DATA_SEED_VERSION) {
        await saveShared('brands', []);
        await saveShared('orders', []);
        await saveShared('seed_version', DATA_SEED_VERSION);
        if (active) {
          setBrands([]);
          setOrders([]);
        }
      } else {
        const remoteBrands = await loadShared<Brand[]>('brands');
        if (active && remoteBrands) setBrands(remoteBrands);
        const remoteOrders = await loadShared<Order[]>('orders');
        if (active && remoteOrders) setOrders(remoteOrders);
      }

      const remoteNotifications = await loadShared<NotificationItem[]>('notifications');
      if (active && remoteNotifications) setNotifications(applyNotificationReset(remoteNotifications));
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
      if (active) hydratedRef.current = true;
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
    if (clipperEditor.length > 0) {
      setWorkers(clipperEditor.map(workerFromProfileRow));
    }
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
      clearInterval(heartbeatTimer);
      window.removeEventListener('pagehide', handlePageClose);
      window.removeEventListener('beforeunload', handlePageClose);
      if (role !== 'admin') {
        void channel.untrack();
        void sendHeartbeat(false);
      }
      void supabase.removeChannel(channel);
    };
  }, [user?.id, role, refreshOnlineHeartbeats]);

  const workersWithOnline = useMemo(() => {
    return workers.map(w => {
      const isSelf = Boolean(user?.id && w.id === user.id);
      const inPresence = presenceOnlineIds.has(w.id);
      const lastBeat = heartbeatMap[w.id] || 0;
      const hasRecentBeat = lastBeat > 0 && (nowTick - lastBeat) < HEARTBEAT_TTL_MS;
      const defaultGoals = config.goals[w.role];
      const customGoals = workerGoalsMap[w.id];
      const override = workerPointsOverride[w.id];
      return {
        ...w,
        online: isSupabaseConfigured ? (isSelf || inPresence || hasRecentBeat) : w.online,
        pointsToday: override?.pointsToday !== undefined ? override.pointsToday : w.pointsToday,
        pointsMonth: override?.pointsMonth !== undefined ? override.pointsMonth : w.pointsMonth,
        dayClosedToday: override?.dayClosedToday !== undefined ? override.dayClosedToday : w.dayClosedToday,
        customGoalDaily: customGoals?.daily ?? defaultGoals.daily,
        customGoalMonthly: customGoals?.monthly ?? defaultGoals.monthly,
      };
    });
  }, [workers, user?.id, presenceOnlineIds, heartbeatMap, nowTick, config.goals, workerGoalsMap, workerPointsOverride]);

  const registeredUsersCount = useMemo(() => {
    if (!isSupabaseConfigured) return workersWithOnline.length + 1;
    const uniqueIds = new Set<string>();
    workersWithOnline.forEach(w => uniqueIds.add(w.id));
    adminProfiles.forEach(a => uniqueIds.add(a.id));
    if (user?.id) uniqueIds.add(user.id);
    return uniqueIds.size;
  }, [workersWithOnline, adminProfiles, user?.id]);

  const getWorkerGoals = useCallback((workerId: string, workerRole?: 'clipper' | 'editor'): WorkerCustomGoals => {
    const w = workers.find(x => x.id === workerId);
    const r = workerRole || w?.role || 'clipper';
    const base = config.goals[r];
    const custom = workerGoalsMap[workerId];
    return {
      daily: custom?.daily ?? base.daily,
      monthly: custom?.monthly ?? base.monthly,
    };
  }, [workers, config.goals, workerGoalsMap]);

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

  const workersRef = useRef<Worker[]>(workersWithOnline);
  useEffect(() => { workersRef.current = workersWithOnline; }, [workersWithOnline]);
  const brandsRef = useRef<Brand[]>(brands);
  useEffect(() => { brandsRef.current = brands; }, [brands]);
  const ordersRef = useRef<Order[]>(orders);
  useEffect(() => { ordersRef.current = orders; }, [orders]);
  const findVideo = useCallback((videoId: string): Video | null => {
    return brandsRef.current.flatMap(b => b.videos).find(v => v.id === videoId) || null;
  }, []);

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
    setBrands(prev => {
      const next = prev.map(b => ({
        ...b,
        videos: b.videos.map(v => v.id === videoId ? fn(v) : v),
      }));
      brandsRef.current = next;
      return next;
    });
  }, []);

  const setQc = useCallback((videoId: string, status: QcStatus) => {
    const prevVideo = findVideo(videoId);
    const parentBrand = brandsRef.current.find(b => b.videos.some(v => v.id === videoId));
    const wasPaid50 = prevVideo ? prevVideo.paid50 : false;
    const wasPaid100 = prevVideo ? prevVideo.paid100 : false;
    const todayStr = new Date().toISOString().slice(0, 10);

    updateVideo(videoId, v => ({
      ...v,
      qc: status,
      editorQc: status === 'aprobado_cliente' ? 'aprobado_cliente' : status === 'aprobado_senda' ? 'aprobado_senda' : v.editorQc,
      date: status === 'aprobado_cliente' ? todayStr : v.date,
      finalUploaded: status === 'aprobado_cliente' || status === 'aprobado_senda' ? true : v.finalUploaded,
      publishedToClient: status === 'aprobado_senda' || status === 'aprobado_cliente' ? true : v.publishedToClient,
      paid50: status === 'aprobado_senda' || status === 'aprobado_cliente' ? true : v.paid50,
      paid100: status === 'aprobado_cliente' ? true : v.paid100,
    }));

    setOrders(prev => {
      const next = prev.map(o => {
        const matches =
          o.id === prevVideo?.orderId ||
          o.boardVideoId === videoId ||
          (parentBrand && o.brand.trim().toLowerCase() === parentBrand.name.trim().toLowerCase());
        if (!matches) return o;
        const brandVideos = brandsRef.current.find(b => b.id === parentBrand?.id)?.videos || [];
        const allClientApproved = brandVideos.length > 0 && brandVideos.every(v => v.id === videoId ? status === 'aprobado_cliente' : v.qc === 'aprobado_cliente');
        const anySendaApproved = brandVideos.some(v => v.id === videoId ? (status === 'aprobado_senda' || status === 'aprobado_cliente') : (v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente'));

        let nextOrderStatus: OrderStatus = o.status;
        if (allClientApproved) nextOrderStatus = 'finalizado';
        else if (anySendaApproved) nextOrderStatus = 'aprobado_senda';
        else if (o.clipperId && o.editorId) nextOrderStatus = 'asignado';
        return { ...o, status: nextOrderStatus };
      });
      ordersRef.current = next;
      return next;
    });

    if (prevVideo) {
      const brandPrefix = parentBrand ? `${parentBrand.name} · ` : '';
      const label = status.replace(/_/g, ' ');
      pushNotification('clipper', 'qc_clip', `Estado de QC de "${brandPrefix}${prevVideo.name}": ${label}`, prevVideo.clipperId);
      pushNotification('editor', 'qc_video', `Estado de QC de "${brandPrefix}${prevVideo.name}": ${label}`, prevVideo.editorId);
      pushNotification(
        'admin',
        'qc_video',
        status === 'aprobado_senda'
          ? `${brandPrefix}${prevVideo.name}: Aprobado Senda · Subido automáticamente a Clientes`
          : `${brandPrefix}${prevVideo.name}: estado de QC cambiado a ${label}`
      );

      if (status === 'aprobado_senda' && !wasPaid50) {
        pushNotification('clipper', 'pago_50', `Se liberó el 50% de pago de "${brandPrefix}${prevVideo.name}" (Aprobado Senda)`, prevVideo.clipperId);
        pushNotification('editor', 'pago_50', `Se liberó el 50% de pago de "${brandPrefix}${prevVideo.name}" (Aprobado Senda)`, prevVideo.editorId);
      }
      if (status === 'aprobado_cliente' && !wasPaid100) {
        pushNotification('clipper', 'pago_100', `Se liberó el 100% de pago de "${brandPrefix}${prevVideo.name}" (Aprobado Cliente)`, prevVideo.clipperId);
        pushNotification('editor', 'pago_100', `Se liberó el 100% de pago de "${brandPrefix}${prevVideo.name}" (Aprobado Cliente)`, prevVideo.editorId);
      }
    }
  }, [updateVideo, findVideo, pushNotification]);

  const submitClientFeedbackBatch = useCallback((videoId: string, items: { time: number; text: string }[]) => {
    if (items.length === 0) return;
    const prevVideo = findVideo(videoId);
    const parentBrand = brandsRef.current.find(b => b.videos.some(v => v.id === videoId));

    updateVideo(videoId, v => {
      const used = v.clientFeedbackRoundsUsed ?? 0;
      const max = v.clientFeedbackMaxRounds ?? 1;
      if (used >= max) return v;
      const nextRound = used + 1;
      const newCorrections = items.map((it, idx) => ({
        id: `corr-cli-${Date.now()}-${idx}`,
        time: it.time,
        text: `[Feedback Cliente · Ronda ${nextRound}] ${it.text}`,
        author: 'cliente' as const,
        round: nextRound,
      }));
      return {
        ...v,
        qc: 'correcciones',
        editorQc: 'correcciones',
        corrections: [...v.corrections, ...newCorrections],
        clientFeedbackRoundsUsed: nextRound,
        clientFeedbackMaxRounds: max,
      };
    });

    if (prevVideo) {
      const brandPrefix = parentBrand ? `${parentBrand.name} · ` : '';
      pushNotification('editor', 'qc_video', `El cliente envió ${items.length} corrección(es) en "${brandPrefix}${prevVideo.name}"`, prevVideo.editorId);
      pushNotification('admin', 'qc_video', `Cliente envió su ronda de feedback (${items.length} punto(s)) en "${brandPrefix}${prevVideo.name}"`);
    }
  }, [updateVideo, findVideo, pushNotification]);

  const enableExtraClientFeedbackRound = useCallback((videoId: string) => {
    const prevVideo = findVideo(videoId);
    const parentBrand = brandsRef.current.find(b => b.videos.some(v => v.id === videoId));
    updateVideo(videoId, v => ({
      ...v,
      clientFeedbackMaxRounds: (v.clientFeedbackMaxRounds ?? 1) + 1,
    }));
    if (prevVideo) {
      const brandPrefix = parentBrand ? `${parentBrand.name} · ` : '';
      pushNotification('admin', 'sistema', `Se habilitó 1 nueva tanda de feedback para el cliente en "${brandPrefix}${prevVideo.name}"`);
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

  const setClipMarkerTime = useCallback((videoId: string, clipId: string, time: number) => {
    updateVideo(videoId, v => ({
      ...v,
      clips: v.clips.map(c => c.id === clipId ? { ...c, markerTime: time } : c),
    }));
  }, [updateVideo]);

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
      corrections: [...v.corrections, { id: `corr-${Date.now()}`, time, text, author: 'admin' }],
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
      qc: v.qc === 'pendiente' || v.qc === 'sin_iniciar' ? 'revision' : v.qc,
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
    pushNotification('admin', 'mensaje', `Nuevo mensaje en el chat: "${text}"`);
  }, [pushNotification]);

  const closeDay = useCallback((workerId: string) => {
    setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, dayClosedToday: true } : w));
    setWorkerPointsOverride(prev => ({
      ...prev,
      [workerId]: { ...(prev[workerId] || {}), dayClosedToday: true },
    }));
    if (isSupabaseConfigured && supabase) {
      void supabase.from('profiles').update({ day_closed_today: true }).eq('id', workerId);
    }
    const w = workersRef.current.find(x => x.id === workerId);
    if (w) {
      const targetRole: Role = w.role === 'clipper' ? 'clipper' : 'editor';
      pushNotification(targetRole, 'racha', `Racha del día actualizada: ${w.streak} días seguidos`, w.id);
      pushNotification('admin', 'racha', `${w.name} cerró el día con ${w.pointsToday} puntos (racha: ${w.streak})`);
    }
  }, [pushNotification]);

  const toggleDayClosed = useCallback((workerId: string) => {
    const w = workersRef.current.find(x => x.id === workerId);
    const nextClosed = w ? !w.dayClosedToday : true;
    setWorkers(prev => prev.map(x => x.id === workerId ? { ...x, dayClosedToday: nextClosed } : x));
    setWorkerPointsOverride(prev => ({
      ...prev,
      [workerId]: { ...(prev[workerId] || {}), dayClosedToday: nextClosed },
    }));
    if (isSupabaseConfigured && supabase) {
      void supabase.from('profiles').update({ day_closed_today: nextClosed }).eq('id', workerId);
    }
    if (w && nextClosed) {
      const targetRole: Role = w.role === 'clipper' ? 'clipper' : 'editor';
      pushNotification(targetRole, 'racha', `Racha del día actualizada: ${w.streak} días seguidos`, w.id);
      pushNotification('admin', 'racha', `${w.name} cerró el día con ${w.pointsToday} puntos (racha: ${w.streak})`);
    }
  }, [pushNotification]);

  const updateWorkerPointsAndGoals = useCallback(async (workerId: string, patch: WorkerPointsPatch) => {
    const w = workersRef.current.find(x => x.id === workerId);
    const baseRole = w?.role || 'clipper';
    const currentGoals = getWorkerGoals(workerId, baseRole);

    if (patch.goalDaily !== undefined || patch.goalMonthly !== undefined) {
      const nextGoals: WorkerCustomGoals = {
        daily: patch.goalDaily !== undefined ? Math.max(1, Math.round(patch.goalDaily)) : currentGoals.daily,
        monthly: patch.goalMonthly !== undefined ? Math.max(1, Math.round(patch.goalMonthly)) : currentGoals.monthly,
      };
      setWorkerGoalsMap(prev => {
        const updated = { ...prev, [workerId]: nextGoals };
        saveState('workerGoals', updated);
        if (isSupabaseConfigured) {
          markLocalWrite();
          void saveShared('workerGoals', updated);
        }
        return updated;
      });
    }

    if (patch.pointsToday !== undefined || patch.pointsMonth !== undefined || patch.dayClosedToday !== undefined) {
      const nextPtsToday = patch.pointsToday !== undefined ? Math.max(0, Math.round(patch.pointsToday)) : (w?.pointsToday ?? 0);
      const nextPtsMonth = patch.pointsMonth !== undefined ? Math.max(0, Math.round(patch.pointsMonth)) : (w?.pointsMonth ?? 0);
      const nextClosed = patch.dayClosedToday !== undefined ? patch.dayClosedToday : (w?.dayClosedToday ?? false);

      setWorkers(prev => prev.map(item => item.id === workerId ? {
        ...item,
        pointsToday: nextPtsToday,
        pointsMonth: nextPtsMonth,
        dayClosedToday: nextClosed,
      } : item));

      setWorkerPointsOverride(prev => {
        const updated = {
          ...prev,
          [workerId]: {
            pointsToday: nextPtsToday,
            pointsMonth: nextPtsMonth,
            dayClosedToday: nextClosed,
          },
        };
        saveState('workerPointsOverride', updated);
        if (isSupabaseConfigured) {
          markLocalWrite();
          void saveShared('workerPointsOverride', updated);
        }
        return updated;
      });

      if (isSupabaseConfigured && supabase) {
        await supabase.from('profiles').update({
          points_today: nextPtsToday,
          points_month: nextPtsMonth,
          day_closed_today: nextClosed,
        }).eq('id', workerId);
      }
    }
  }, [getWorkerGoals, markLocalWrite]);

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
    setCalendarEvents(prev => [...prev, { ...e, id: `ev-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` }]);
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

  const deleteChatGroup = useCallback(async (groupId: string) => {
    if (!isSupabaseConfigured || !supabase || !user || role !== 'admin') return;
    await supabase.from('chat_groups').delete().eq('id', groupId);
    void loadChat();
  }, [user, role, loadChat]);

  const approveFinal = useCallback((videoId: string) => {
    setQc(videoId, 'aprobado_cliente');
  }, [setQc]);

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

  const assignClipper = useCallback((videoId: string, workerId: string) => {
    setBrands(prev => prev.map(b => ({
      ...b,
      videos: b.videos.map(v => v.id === videoId ? {
        ...v,
        clipperId: workerId,
        clipperName: workersWithOnline.find(w => w.id === workerId)?.name || 'Desconocido',
        qc: 'pendiente'
      } : v),
    })));
  }, [workersWithOnline]);

  const addOrder = useCallback((o: Omit<Order, 'id' | 'createdAt'>) => {
    const newOrd: Order = {
      ...o,
      paymentStatus: 'completado',
      id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    setOrders(prev => {
      const next = [newOrd, ...prev];
      ordersRef.current = next;
      saveState('orders', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('orders', next);
      }
      return next;
    });
  }, [markLocalWrite]);

  const updateOrder = useCallback((id: string, patch: Partial<Omit<Order, 'id' | 'createdAt'>>) => {
    setOrders(prev => {
      const next = prev.map(o => o.id === id ? { ...o, ...patch } : o);
      ordersRef.current = next;
      saveState('orders', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('orders', next);
      }
      return next;
    });
  }, [markLocalWrite]);

  const deleteOrder = useCallback((id: string) => {
    const targetOrder = ordersRef.current.find(o => o.id === id);
    const nextOrders = ordersRef.current.filter(o => o.id !== id);
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    saveState('orders', nextOrders);
    if (isSupabaseConfigured) {
      markLocalWrite();
      void saveShared('orders', nextOrders);
    }

    setBrands(prev => {
      const otherOrdersSameBrand = targetOrder
        ? nextOrders.some(o => o.brand.trim().toLowerCase() === targetOrder.brand.trim().toLowerCase())
        : false;
      const nextBrands = prev
        .map(b => {
          const isSameBrand = targetOrder && b.name.trim().toLowerCase() === targetOrder.brand.trim().toLowerCase();
          const filteredVideos = b.videos.filter(v => {
            if (v.orderId === id) return false;
            if (!v.orderId && isSameBrand && !otherOrdersSameBrand) return false;
            return true;
          });
          return { ...b, videos: filteredVideos };
        })
        .filter(b => b.videos.length > 0);

      brandsRef.current = nextBrands;
      saveState('brands', nextBrands);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('brands', nextBrands);
      }
      return nextBrands;
    });
  }, [markLocalWrite]);

  const deleteBrandProject = useCallback((brandId: string) => {
    const targetBrand = brandsRef.current.find(b => b.id === brandId);
    const linkedOrderIds = new Set<string>();
    if (targetBrand) {
      targetBrand.videos.forEach(v => {
        if (v.orderId) linkedOrderIds.add(v.orderId);
      });
      ordersRef.current.forEach(o => {
        if (o.brand.trim().toLowerCase() === targetBrand.name.trim().toLowerCase()) {
          linkedOrderIds.add(o.id);
        }
      });
    }

    if (linkedOrderIds.size > 0) {
      const nextOrders = ordersRef.current.filter(o => !linkedOrderIds.has(o.id));
      ordersRef.current = nextOrders;
      setOrders(nextOrders);
      saveState("orders", nextOrders);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared("orders", nextOrders);
      }
    }

    const nextBrands = brandsRef.current.filter(b => b.id !== brandId);
    brandsRef.current = nextBrands;
    setBrands(nextBrands);
    saveState("brands", nextBrands);
    if (isSupabaseConfigured) {
      markLocalWrite();
      void saveShared("brands", nextBrands);
    }
  }, [markLocalWrite]);

  const liquidateOrders = useCallback((orderIds: string[]) => {
    setOrders(prev => {
      const next = prev.filter(o => !orderIds.includes(o.id));
      saveState('orders', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('orders', next);
      }
      return next;
    });

    setBrands(prev => {
      const next = prev.map(b => ({
        ...b,
        videos: b.videos.filter(v => !orderIds.includes(v.orderId || ''))
      })).filter(b => b.videos.length > 0);
      saveState('brands', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('brands', next);
      }
      return next;
    });
  }, [markLocalWrite]);

  const assignProject = useCallback((brand: string, deliveryDate: string, deliveryTime: string, workerIds: string[], briefFileName?: string, briefFileUrl?: string) => {
    addOrder({
      brand, videoCount: workerIds.length || 1, deliveryDate, deliveryTime,
      status: 'sin_asignar' as OrderStatus, assignedWorkerIds: workerIds,
      briefFileName: briefFileName || null, briefFileUrl: briefFileUrl || null,
    });
  }, [addOrder]);

  const getWorkerCapacity = useCallback((workerId: string): number => {
    const w = workersRef.current.find(x => x.id === workerId);
    const defaultByRole = w?.role === 'editor' ? capacityConfig.defaultEditorDailyVideos : capacityConfig.defaultClipperDailyVideos;
    return workerCapacities[workerId] ?? w?.dailyCapacity ?? defaultByRole;
  }, [workerCapacities, capacityConfig.defaultClipperDailyVideos, capacityConfig.defaultEditorDailyVideos]);

  const setWorkerCapacity = useCallback((workerId: string, capacity: number) => {
    setWorkerCapacities(prev => ({ ...prev, [workerId]: Math.max(1, Math.round(capacity) || 1) }));
  }, []);

  const getWorkerWorkload = useCallback((workerId: string): number => {
    const activeVideos = brandsRef.current
      .flatMap(b => b.videos)
      .filter(v => (v.clipperId === workerId || v.editorId === workerId) && v.qc !== 'aprobado_cliente' && v.qc !== 'sin_iniciar');
    return activeVideos.length;
  }, []);

  const upsertBoardVideoForOrder = useCallback((order: Order, clipperId: string | null, editorId: string | null): string => {
    const clipper = clipperId ? workersRef.current.find(w => w.id === clipperId) : null;
    const editor = editorId ? workersRef.current.find(w => w.id === editorId) : null;
    const count = Math.max(1, order.videoCount || 1);
    let firstVideoId = order.boardVideoId || `${order.id}-v1`;

    setBrands(prev => {
      const existingBrand = prev.find(b => b.name.trim().toLowerCase() === order.brand.trim().toLowerCase());
      const currentVideos = existingBrand ? existingBrand.videos : [];
      const orderVideos = currentVideos.filter(v => v.orderId === order.id);

      const nextVideosForOrder: Video[] = [];
      for (let i = 1; i <= count; i++) {
        const existingVid =
          orderVideos.find(v => v.videoNumber === i) ||
          orderVideos[i - 1] ||
          null;

        const vidId = existingVid?.id || `${order.id}-v${i}`;
        if (i === 1) firstVideoId = vidId;

        if (existingVid) {
          nextVideosForOrder.push({
            ...existingVid,
            name: `Video ${i}`,
            videoNumber: i,
            orderId: order.id,
            clipperId: clipperId || existingVid.clipperId,
            clipperName: clipper ? clipper.name : existingVid.clipperName,
            editorId: editorId || existingVid.editorId,
            editorName: editor ? editor.name : existingVid.editorName,
            briefFileName: order.briefFileName || existingVid.briefFileName || null,
            briefFileUrl: order.briefFileUrl || existingVid.briefFileUrl || null,
          });
        } else {
          nextVideosForOrder.push({
            id: vidId,
            name: `Video ${i}`,
            videoNumber: i,
            orderId: order.id,
            clipperName: clipper?.name || 'Sin asignar',
            editorName: editor?.name || 'Sin asignar',
            clipperId: clipperId || '',
            editorId: editorId || '',
            qc: 'pendiente',
            editorQc: 'pendiente',
            duration: null,
            durationSeconds: 45,
            tierSnapshot: CONFIG.tiers[1],
            date: order.deliveryDate || new Date().toISOString().slice(0, 10),
            clips: [],
            finalVideos: [],
            corrections: [],
            finalUploaded: false,
            paid50: false,
            paid100: false,
            briefFileName: order.briefFileName || null,
            briefFileUrl: order.briefFileUrl || null,
            sentByClipper: false,
            mainImageFileName: null,
            mainImageFileUrl: null,
            mainImageStatus: null,
            mainImageComment: null,
            publishedToClient: false,
            clientFeedbackRoundsUsed: 0,
            clientFeedbackMaxRounds: 1,
          });
        }
      }

      let nextBrands: Brand[];
      if (existingBrand) {
        const otherVideos = existingBrand.videos.filter(v => v.orderId && v.orderId !== order.id);
        nextBrands = prev.map(b => (b.id === existingBrand.id ? { ...b, videos: [...otherVideos, ...nextVideosForOrder] } : b));
      } else {
        const newBrand: Brand = {
          id: `brand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: order.brand,
          videos: nextVideosForOrder,
        };
        nextBrands = [newBrand, ...prev];
      }

      brandsRef.current = nextBrands;
      saveState('brands', nextBrands);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('brands', nextBrands);
      }
      return nextBrands;
    });

    return firstVideoId;
  }, [markLocalWrite]);

  const assignOrderTeam = useCallback(async (orderId: string, clipperId: string, editorId: string) => {
    const order = ordersRef.current.find(o => o.id === orderId);
    if (!order) return;
    const clipper = workersRef.current.find(w => w.id === clipperId);
    const editor = workersRef.current.find(w => w.id === editorId);

    const videoId = upsertBoardVideoForOrder(order, clipperId, editorId);
    const nextOrders = ordersRef.current.map(o => o.id === orderId ? {
      ...o,
      clipperId,
      editorId,
      assignedWorkerIds: Array.from(new Set([clipperId, editorId])),
      status: 'asignado' as OrderStatus,
      promotedToBoard: true,
      boardVideoId: videoId,
    } : o);
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    saveState('orders', nextOrders);
    if (isSupabaseConfigured) {
      markLocalWrite();
      await saveShared('orders', nextOrders);
    }

    const msg = `Te hemos asignado el proyecto "${order.brand}" (${order.videoCount} videos individuales). Revisa Video 1 a Video ${order.videoCount} en Tareas.`;
    if (clipper) pushNotification('clipper', 'trabajo_asignado', msg, clipperId);
    if (editor) pushNotification('editor', 'trabajo_asignado', msg, editorId);
  }, [pushNotification, upsertBoardVideoForOrder, markLocalWrite]);

  const notifyPersonAssigned = useCallback(async (order: Order, targetRole: 'clipper' | 'editor', workerId: string) => {
    const worker = workersRef.current.find(w => w.id === workerId);
    if (!worker) return;
    const msg = `Te hemos asignado el proyecto "${order.brand}" (${order.videoCount} videos). Revisa cada video individualmente en Tareas.`;
    pushNotification(targetRole, 'trabajo_asignado', msg, workerId);
  }, [pushNotification]);

  const assignOrderClipper = useCallback(async (orderId: string, clipperId: string) => {
    const order = ordersRef.current.find(o => o.id === orderId);
    if (!order) return;
    const currentEditorId = order.editorId || null;
    const nowFull = Boolean(clipperId && currentEditorId);
    const videoId = nowFull ? upsertBoardVideoForOrder(order, clipperId, currentEditorId) : (order.boardVideoId || null);

    const updatedOrder: Order = {
      ...order,
      clipperId,
      assignedWorkerIds: Array.from(new Set([...(order.assignedWorkerIds || []).filter(id => id !== order.clipperId), clipperId, ...(currentEditorId ? [currentEditorId] : [])])),
      status: (nowFull ? 'asignado' : 'sin_asignar') as OrderStatus,
      promotedToBoard: nowFull,
      boardVideoId: videoId,
    };

    const nextOrders = ordersRef.current.map(o => o.id === orderId ? updatedOrder : o);
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    saveState('orders', nextOrders);
    if (isSupabaseConfigured) {
      markLocalWrite();
      await saveShared('orders', nextOrders);
    }
    await notifyPersonAssigned(updatedOrder, 'clipper', clipperId);
  }, [notifyPersonAssigned, upsertBoardVideoForOrder, markLocalWrite]);

  const assignOrderEditor = useCallback(async (orderId: string, editorId: string) => {
    const order = ordersRef.current.find(o => o.id === orderId);
    if (!order) return;
    const currentClipperId = order.clipperId || null;
    const nowFull = Boolean(currentClipperId && editorId);
    const videoId = nowFull ? upsertBoardVideoForOrder(order, currentClipperId, editorId) : (order.boardVideoId || null);

    const updatedOrder: Order = {
      ...order,
      editorId,
      assignedWorkerIds: Array.from(new Set([...(order.assignedWorkerIds || []).filter(id => id !== order.editorId), editorId, ...(currentClipperId ? [currentClipperId] : [])])),
      status: (nowFull ? 'asignado' : 'sin_asignar') as OrderStatus,
      promotedToBoard: nowFull,
      boardVideoId: videoId,
    };

    const nextOrders = ordersRef.current.map(o => o.id === orderId ? updatedOrder : o);
    ordersRef.current = nextOrders;
    setOrders(nextOrders);
    saveState('orders', nextOrders);
    if (isSupabaseConfigured) {
      markLocalWrite();
      await saveShared('orders', nextOrders);
    }
    await notifyPersonAssigned(updatedOrder, 'editor', editorId);
  }, [notifyPersonAssigned, upsertBoardVideoForOrder, markLocalWrite]);

  const updateFinanceSettings = useCallback((patch: Partial<FinanceSettings>) => {
    setFinanceSettings(prev => {
      const next: FinanceSettings = {
        clientPricePerVideo: patch.clientPricePerVideo !== undefined ? Math.max(1, Number(patch.clientPricePerVideo) || 1) : prev.clientPricePerVideo,
        defaultClipperCost: patch.defaultClipperCost !== undefined ? Math.max(0, Number(patch.defaultClipperCost) || 0) : prev.defaultClipperCost,
        defaultEditorCost: patch.defaultEditorCost !== undefined ? Math.max(0, Number(patch.defaultEditorCost) || 0) : prev.defaultEditorCost,
      };
      saveState('financeSettings', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('financeSettings', next);
      }
      return next;
    });
  }, [markLocalWrite]);

  const recordFinanceDayClosing = useCallback((closing: Omit<FinanceDayClosing, 'id' | 'closedAt'>) => {
    const entry: FinanceDayClosing = {
      ...closing,
      id: `close-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      closedAt: new Date().toISOString(),
    };
    setFinanceClosings(prev => {
      const next = [entry, ...prev].slice(0, 90);
      saveState('financeClosings', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('financeClosings', next);
      }
      return next;
    });
  }, [markLocalWrite]);

  const addAppExpense = useCallback((expense: Omit<AppExpense, 'id'>) => {
    const newItem: AppExpense = {
      ...expense,
      id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    setAppExpenses(prev => {
      const next = [newItem, ...prev];
      saveState('appExpenses', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('appExpenses', next);
      }
      return next;
    });
  }, [markLocalWrite]);

  const deleteAppExpense = useCallback((id: string) => {
    setAppExpenses(prev => {
      const next = prev.filter(x => x.id !== id);
      saveState('appExpenses', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('appExpenses', next);
      }
      return next;
    });
  }, [markLocalWrite]);

  const setWorkerPayrollAdjustment = useCallback((workerId: string, amount: number) => {
    setPayrollAdjustments(prev => {
      const next = { ...prev, [workerId]: Math.max(0, Math.round(amount) || 0) };
      saveState('payrollAdjustments', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('payrollAdjustments', next);
      }
      return next;
    });
  }, [markLocalWrite]);

  const recordPayrollPayment = useCallback((data: Omit<PayrollPayment, 'id' | 'paidAt'>) => {
    const entry: PayrollPayment = {
      ...data,
      id: `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      paidAt: new Date().toISOString(),
    };
    setPayrollPayments(prev => {
      const next = [entry, ...prev];
      saveState('payrollPayments', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('payrollPayments', next);
      }
      return next;
    });
  }, [markLocalWrite]);

  const revertPayrollPayment = useCallback((paymentId: string) => {
    setPayrollPayments(prev => {
      const next = prev.filter(p => p.id !== paymentId);
      saveState('payrollPayments', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('payrollPayments', next);
      }
      return next;
    });
  }, [markLocalWrite]);

  const updateCapacityConfig = useCallback((patch: Partial<CapacityProtocolConfig>) => {
    setCapacityConfig(prev => {
      const next: CapacityProtocolConfig = { ...prev, ...patch };
      saveState('capacityProtocolConfig', next);
      if (isSupabaseConfigured) {
        markLocalWrite();
        void saveShared('capacityProtocolConfig', next);
      }
      return next;
    });
  }, [markLocalWrite]);

  const store: Store = {
    role, theme, toggleTheme, view, setView,
    brands, workers: workersWithOnline, registeredUsersCount, refreshProfiles: loadWorkersFromProfiles,
    notifications, deleteNotification, clearNotifications, emailLog,
    chat, paidHistory, config,
    currentWorkerId, setCurrentWorkerId,
    selectedVideo, setSelectedVideo,
    selectedClassroomModuleId, setSelectedClassroomModuleId,
    setQc, addClip, replaceClip, setClipStatus, setClipMarkerTime, acceptAllClips,
    addCorrection, updateCorrectionTime, submitClientFeedbackBatch, enableExtraClientFeedbackRound,
    uploadBrief, addFinalVideo,
    uploadMainImage, setMainImageStatus, sendVideo,
    sendChat, closeDay, toggleDayClosed, updateWorkerPointsAndGoals, getWorkerGoals,
    togglePaid50, approveFinal, toggleOnline,
    calendarEvents, addCalendarEvent, updateCalendarEvent, deleteCalendarEvent, updateWorkerProfile,
    classroomModules, addClassroomModule, deleteClassroomModule, addClassroomLesson, deleteClassroomLesson,
    lessonCompletions, markLessonComplete,
    contracts, contractSignedUploads, uploadContract, deleteContract, uploadSignedContract,
    chatGroups, chatMessages, adminProfiles, createChatGroup, sendChatGroupMessage, ensureOwnAdminDm, startAdminDm,
    deleteChatGroup,
    notificationsArchive,
    orders, addOrder, updateOrder, deleteOrder, deleteBrandProject, liquidateOrders, assignProject, assignClipper,
    workerCapacities, getWorkerCapacity, setWorkerCapacity, getWorkerWorkload, assignOrderTeam,
    assignOrderClipper, assignOrderEditor,
    financeSettings, updateFinanceSettings, financeClosings, recordFinanceDayClosing,
    appExpenses, addAppExpense, deleteAppExpense,
    payrollPayments, payrollAdjustments, setWorkerPayrollAdjustment, recordPayrollPayment, revertPayrollPayment,
    capacityConfig, updateCapacityConfig,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
