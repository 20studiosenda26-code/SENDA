import { createContext, useContext, useState, useCallback, useEffect, useRef, useMemo, type ReactNode } from 'react';
import type { Brand, Worker, NotificationItem, NotificationCategory, Role, ThemeMode, ViewKey, Config, PaidHistoryEntry, ChatMessage, Video, QcStatus, ClipStatus, CalendarEvent, MainImageStatus, ClassroomModule, EmailLogEntry, Contract, ContractSignedUpload, ChatGroup, ChatMsg, Order, OrderStatus } from './types';
import { INITIAL_BRANDS, INITIAL_WORKERS, INITIAL_NOTIFICATIONS, INITIAL_PAID_HISTORY, INITIAL_CHAT, CONFIG, CALENDAR_EVENTS, CLASSROOM_MODULES, INITIAL_ORDERS, DEFAULT_DAILY_CAPACITY } from './data';
import { loadShared, saveShared, isSupabaseConfigured, supabase, subscribeToTable } from './lib/supabaseClient';
import { useAuth } from './lib/auth';

export interface AdminProfile { id: string; name: string; }

const HEARTBEAT_INTERVAL_MS = 15 * 1000;
const HEARTBEAT_TTL_MS = 35 * 1000;

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
type SharedKey = 'brands' | 'notifications' | 'orders';

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

function persistShared<T>(key: SharedKey, value: T) {
  saveState(key, value);
  if (isSupabaseConfigured) void saveShared(key, value);
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
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(() => loadState('calendarEvents', CALENDAR_EVENTS));
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

  useEffect(() => { persistShared('brands', brands); }, [brands]);
  useEffect(() => { persistShared('orders', orders); }, [orders]);
  useEffect(() => { saveState('workers', workers); }, [workers]);
  useEffect(() => { saveState('chat', chat); }, [chat]);
  useEffect(() => { saveState('paidHistory', paidHistory); }, [paidHistory]);
  useEffect(() => { saveState('calendarEvents', calendarEvents); }, [calendarEvents]);
  useEffect(() => { persistShared('notifications', notifications); }, [notifications]);
  useEffect(() => { saveState('emailLog', emailLog); }, [emailLog]);
  useEffect(() => { saveState('classroomModules', classroomModules); }, [classroomModules]);
  useEffect(() => { saveState('lessonCompletions', lessonCompletions); }, [lessonCompletions]);
  useEffect(() => { saveState('workerCapacities', workerCapacities); }, [workerCapacities]);

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
        const remoteBrands = await loadShared<Brand[]>('brands');
        if (remoteBrands) setBrands(remoteBrands);
        const remoteNotifications = await loadShared<NotificationItem[]>('notifications');
        if (remoteNotifications) setNotifications(applyNotificationReset(remoteNotifications));
        const remoteOrders = await loadShared<Order[]>('orders');
        if (remoteOrders) setOrders(remoteOrders);
        await refreshOnlineHeartbeats();
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

  // --- Estado "En línea" en tiempo real (Supabase Realtime Presence + Heartbeat en platform_kv + profiles) ---
  // Mantiene al usuario "En línea" mientras tenga la página abierta en su navegador
  // (incluso si está en otra pestaña) y lo pasa a "No en línea" apenas cierra la pestaña o sesión.
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
    if (!isSupabaseConfigured) return workers;
    return workers.map(w => {
      const isSelf = Boolean(user?.id && w.id === user.id);
      const inPresence = presenceOnlineIds.has(w.id);
      const lastBeat = heartbeatMap[w.id] || 0;
      const hasRecentBeat = lastBeat > 0 && (nowTick - lastBeat) < HEARTBEAT_TTL_MS;
      return {
        ...w,
        online: isSelf || inPresence || hasRecentBeat,
      };
    });
  }, [workers, user?.id, presenceOnlineIds, heartbeatMap, nowTick]);

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

    const v = brands.flatMap(b => b.videos).find(vid => vid.id === videoId);
    const w = workersWithOnline.find(wrk => wrk.id === workerId);
    if (v && w) {
      pushNotification('clipper', 'trabajo_asignado', `Nuevo trabajo asignado: "${v.name}"`, workerId);
      pushNotification('admin', 'trabajo_asignado', `El proyecto "${v.name}" ha sido asignado a ${w.name}`);
    }
  }, [brands, workersWithOnline, pushNotification]);

  const addOrder = useCallback((o: Omit<Order, 'id' | 'createdAt'>) => {
    setOrders(prev => [{ ...o, id: `ord-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, createdAt: new Date().toISOString() }, ...prev]);
  }, []);

  const updateOrder = useCallback((id: string, patch: Partial<Omit<Order, 'id' | 'createdAt'>>) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
  }, []);

  const deleteOrder = useCallback((id: string) => {
    setOrders(prev => prev.filter(o => o.id !== id));
  }, []);

  const assignProject = useCallback((brand: string, deliveryDate: string, deliveryTime: string, workerIds: string[], briefFileName?: string, briefFileUrl?: string) => {
    addOrder({
      brand, videoCount: workerIds.length || 1, deliveryDate, deliveryTime,
      status: 'sin_asignar' as OrderStatus, assignedWorkerIds: workerIds,
      briefFileName: briefFileName || null, briefFileUrl: briefFileUrl || null,
    });
    for (const workerId of workerIds) {
      const w = workersRef.current.find(x => x.id === workerId);
      const roleFor: Role = w?.role === 'editor' ? 'editor' : 'clipper';
      pushNotification(roleFor, 'trabajo_asignado', `Nuevo trabajo asignado: "${brand}" · entrega ${deliveryDate} ${deliveryTime}`, workerId);
    }
    pushNotification('admin', 'trabajo_asignado', `Pedido de "${brand}" asignado a ${workerIds.length} persona(s)`);
  }, [addOrder, pushNotification]);

  const getWorkerCapacity = useCallback((workerId: string): number => {
    return workerCapacities[workerId] ?? DEFAULT_DAILY_CAPACITY;
  }, [workerCapacities]);

  const setWorkerCapacity = useCallback((workerId: string, capacity: number) => {
    setWorkerCapacities(prev => ({ ...prev, [workerId]: Math.max(1, Math.round(capacity) || 1) }));
  }, []);

  const getWorkerWorkload = useCallback((workerId: string): number => {
    return ordersRef.current.filter(o => o.status !== 'finalizado' && (o.clipperId === workerId || o.editorId === workerId)).length;
  }, []);

  const createBoardVideoForOrder = useCallback((order: Order, clipperId: string, editorId: string): string => {
    const clipper = workersRef.current.find(w => w.id === clipperId);
    const editor = workersRef.current.find(w => w.id === editorId);
    const videoId = `vid-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const newVideo: Video = {
      id: videoId,
      name: order.brand,
      clipperName: clipper?.name || 'Sin asignar',
      editorName: editor?.name || 'Sin asignar',
      clipperId, editorId,
      qc: 'sin_iniciar',
      editorQc: 'pendiente',
      duration: null,
      durationSeconds: 0,
      tierSnapshot: null,
      date: new Date().toISOString().slice(0, 10),
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
    };
    setBrands(prev => {
      const existing = prev.find(b => b.name.trim().toLowerCase() === order.brand.trim().toLowerCase());
      if (existing) {
        return prev.map(b => (b.id === existing.id ? { ...b, videos: [newVideo, ...b.videos] } : b));
      }
      const newBrand: Brand = { id: `brand-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, name: order.brand, videos: [newVideo] };
      return [newBrand, ...prev];
    });
    return videoId;
  }, []);

  const assignOrderTeam = useCallback(async (orderId: string, clipperId: string, editorId: string) => {
    const order = ordersRef.current.find(o => o.id === orderId);
    if (!order) return;
    const clipper = workersRef.current.find(w => w.id === clipperId);
    const editor = workersRef.current.find(w => w.id === editorId);

    const videoId = order.promotedToBoard ? order.boardVideoId : createBoardVideoForOrder(order, clipperId, editorId);
    updateOrder(orderId, {
      clipperId, editorId,
      assignedWorkerIds: [clipperId, editorId],
      status: 'asignado' as OrderStatus,
      promotedToBoard: true,
      boardVideoId: videoId,
    });

    const when = order.deliveryDate
      ? `el ${order.deliveryDate}${order.deliveryTime ? ` a las \${order.deliveryTime}` : ''}`
      : 'sin fecha de entrega definida todavía';
    const msg = `Te hemos asignado el proyecto "${order.brand}" (${order.videoCount} videos). Tienes que entregarlo ${when}. Revisa el brief y las referencias en Tareas.`;

    if (clipper) pushNotification('clipper', 'trabajo_asignado', msg, clipperId);
    if (editor) pushNotification('editor', 'trabajo_asignado', msg, editorId);
    pushNotification('admin', 'trabajo_asignado', `Proyecto "${order.brand}" asignado a ${clipper?.name || 'un clíper'} (clíper) y ${editor?.name || 'una editora'} (editor(a)).`);

    if (isSupabaseConfigured) {
      try {
        for (const workerId of [clipperId, editorId]) {
          const groupId = await startAdminDm(workerId);
          if (groupId) await sendChatGroupMessage(groupId, msg);
        }
      } catch {
        // Si el mensaje de chat falla, la notificación ya quedó registrada.
      }
    }
  }, [updateOrder, pushNotification, startAdminDm, sendChatGroupMessage, createBoardVideoForOrder]);

  const notifyPersonAssigned = useCallback(async (order: Order, role: 'clipper' | 'editor', workerId: string) => {
    const worker = workersRef.current.find(w => w.id === workerId);
    if (!worker) return;
    const when = order.deliveryDate
      ? `el ${order.deliveryDate}${order.deliveryTime ? ` a las \${order.deliveryTime}` : ''}`
      : 'sin fecha de entrega definida todavía';
    const msg = `Te hemos asignado el proyecto "${order.brand}" (${order.videoCount} videos). Tienes que entregarlo ${when}. Revisa el brief y las referencias en Tareas.`;
    pushNotification(role, 'trabajo_asignado', msg, workerId);
    pushNotification('admin', 'trabajo_asignado', `Proyecto "${order.brand}" asignado a ${worker.name} (${role === 'clipper' ? 'clíper' : 'editor(a)'}).`);
    if (isSupabaseConfigured) {
      try {
        const groupId = await startAdminDm(workerId);
        if (groupId) await sendChatGroupMessage(groupId, msg);
      } catch {
        // Si el mensaje de chat falla, la notificación ya quedó registrada.
      }
    }
  }, [pushNotification, startAdminDm, sendChatGroupMessage]);

  const assignOrderClipper = useCallback(async (orderId: string, clipperId: string) => {
    const order = ordersRef.current.find(o => o.id === orderId);
    if (!order) return;
    const nowFull = !!order.editorId;
    const videoId = nowFull && !order.promotedToBoard ? createBoardVideoForOrder(order, clipperId, order.editorId as string) : order.boardVideoId;
    updateOrder(orderId, {
      clipperId,
      assignedWorkerIds: Array.from(new Set([...(order.assignedWorkerIds || []), clipperId])),
      status: (nowFull ? 'asignado' : 'sin_asignar') as OrderStatus,
      ...(nowFull ? { promotedToBoard: true, boardVideoId: videoId } : {}),
    });
    await notifyPersonAssigned(order, 'clipper', clipperId);
  }, [updateOrder, notifyPersonAssigned, createBoardVideoForOrder]);

  const assignOrderEditor = useCallback(async (orderId: string, editorId: string) => {
    const order = ordersRef.current.find(o => o.id === orderId);
    if (!order) return;
    const nowFull = !!order.clipperId;
    const videoId = nowFull && !order.promotedToBoard ? createBoardVideoForOrder(order, order.clipperId as string, editorId) : order.boardVideoId;
    updateOrder(orderId, {
      editorId,
      assignedWorkerIds: Array.from(new Set([...(order.assignedWorkerIds || []), editorId])),
      status: (nowFull ? 'asignado' : 'sin_asignar') as OrderStatus,
      ...(nowFull ? { promotedToBoard: true, boardVideoId: videoId } : {}),
    });
    await notifyPersonAssigned(order, 'editor', editorId);
  }, [updateOrder, notifyPersonAssigned, createBoardVideoForOrder]);

  const store: Store = {
    role, theme, toggleTheme, view, setView,
    brands, workers: workersWithOnline, notifications, deleteNotification, clearNotifications, emailLog,
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
    deleteChatGroup,
    notificationsArchive,
    orders, addOrder, updateOrder, deleteOrder, assignProject, assignClipper,
    workerCapacities, getWorkerCapacity, setWorkerCapacity, getWorkerWorkload, assignOrderTeam,
    assignOrderClipper, assignOrderEditor,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
