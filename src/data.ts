import type { Brand, Worker, NotificationItem, Config, PaidHistoryEntry, ChatMessage, CalendarEvent, ClassroomModule, Order } from './types';

export const TIERS = [
  { key: 'corto', label: 'Corto (<30s)', points: 1, clipperPay: 2, editorPay: 3 },
  { key: 'medio', label: 'Medio (30-60s)', points: 2, clipperPay: 3, editorPay: 4 },
  { key: 'largo', label: 'Largo (>60s)', points: 3, clipperPay: 4, editorPay: 6 },
  { key: 'estandar', label: 'Estándar', points: 1.5, clipperPay: 2.5, editorPay: 3.5 },
];

export const DATA_SEED_VERSION = 'v3-production-real';

export const CONFIG: Config = {
  tiers: TIERS,
  goals: {
    clipper: { daily: 5, monthly: 100 },
    editor: { daily: 5, monthly: 100 },
  },
};

export const INITIAL_BRANDS: Brand[] = [];
export const INITIAL_WORKERS: Worker[] = [];
export const INITIAL_ORDERS: Order[] = [];
export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];
export const INITIAL_PAID_HISTORY: PaidHistoryEntry[] = [];
export const INITIAL_CHAT: ChatMessage[] = [];
export const CALENDAR_EVENTS: CalendarEvent[] = [];
export const CLASSROOM_MODULES: ClassroomModule[] = [];
