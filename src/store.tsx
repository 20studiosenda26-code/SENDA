import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { Brand, Worker, NotificationItem, Role, ThemeMode, ViewKey, Config, PaidHistoryEntry, ChatMessage, Video, QcStatus, CalendarEvent } from './types';
import { INITIAL_BRANDS, INITIAL_WORKERS, INITIAL_NOTIFICATIONS, INITIAL_PAID_HISTORY, INITIAL_CHAT, CONFIG, CALENDAR_EVENTS } from './data';

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
  chat: ChatMessage[];
  paidHistory: PaidHistoryEntry[];
  config: Config;
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
  sendVideo: (videoId: string) => void;
  sendChat: (text: string) => void;
  closeDay: (workerId: string) => void;
  togglePaid50: (videoId: string) => void;
  approveFinal: (videoId: string) => void;
  toggleOnline: (workerId: string) => void;
  calendarEvents: CalendarEvent[];
  addCalendarEvent: (e: Omit<CalendarEvent, 'id'>) => void;
  updateWorkerProfile: (workerId: string, fields: Partial<Pick<Worker, 'phone' | 'email' | 'bankInfo' | 'country'>>) => void;
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
  const [brands, setBrands] = useState<Brand[]>(INITIAL_BRANDS);
  const [workers, setWorkers] = useState<Worker[]>(INITIAL_WORKERS);
  const [notifications] = useState<NotificationItem[]>(INITIAL_NOTIFICATIONS);
  const [chat, setChat] = useState<ChatMessage[]>(INITIAL_CHAT);
  const [paidHistory, setPaidHistory] = useState<PaidHistoryEntry[]>(INITIAL_PAID_HISTORY);
  const [config] = useState<Config>(CONFIG);
  const [currentWorkerId, setCurrentWorkerId] = useState('w1');
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [selectedClassroomModuleId, setSelectedClassroomModuleId] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>(CALENDAR_EVENTS);

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
  }, [updateVideo]);

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
  }, [updateVideo]);

  const sendVideo = useCallback((videoId: string) => {
    updateVideo(videoId, v => ({
      ...v,
      sentByClipper: true,
      qc: v.qc === 'sin_iniciar' ? 'pendiente' : v.qc,
    }));
  }, [updateVideo]);

  const sendChat = useCallback((text: string) => {
    setChat(prev => [...prev, { id: `c-${Date.now()}`, type: 'out', text }]);
  }, []);

  const closeDay = useCallback((workerId: string) => {
    setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, dayClosedToday: true } : w));
  }, []);

  const togglePaid50 = useCallback((videoId: string) => {
    updateVideo(videoId, v => ({ ...v, paid50: !v.paid50 }));
  }, [updateVideo]);

  const toggleOnline = useCallback((workerId: string) => {
    setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, online: !w.online } : w));
  }, []);

  const addCalendarEvent = useCallback((e: Omit<CalendarEvent, 'id'>) => {
    setCalendarEvents(prev => [...prev, { ...e, id: `ev-${Date.now()}` }]);
  }, []);

  const updateWorkerProfile = useCallback((workerId: string, fields: Partial<Pick<Worker, 'phone' | 'email' | 'bankInfo' | 'country'>>) => {
    setWorkers(prev => prev.map(w => w.id === workerId ? { ...w, ...fields } : w));
  }, []);

  const approveFinal = useCallback((videoId: string) => {
    updateVideo(videoId, v => {
      const updated = { ...v, finalUploaded: true, paid100: true, qc: 'aprobado_cliente' as QcStatus, editorQc: 'aprobado_cliente' as const };
      if (updated.tierSnapshot && !updated.paid100) {
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
  }, [updateVideo]);

  const store: Store = {
    role, setRole, theme, toggleTheme, view, setView,
    brands, workers, notifications, chat, paidHistory, config,
    currentWorkerId, setCurrentWorkerId,
    selectedVideo, setSelectedVideo,
    selectedClassroomModuleId, setSelectedClassroomModuleId,
    setQc, addClip, addCorrection, updateCorrectionTime, uploadBrief, sendVideo,
    sendChat, closeDay, togglePaid50, approveFinal, toggleOnline,
    calendarEvents, addCalendarEvent, updateWorkerProfile,
  };

  return <Ctx.Provider value={store}>{children}</Ctx.Provider>;
}
