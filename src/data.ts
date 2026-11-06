import type { Config, Brand, Worker, NotificationItem, PaidHistoryEntry, ChatMessage, CalendarEvent, ClassroomModule, Order } from './types';

export const INITIAL_BRANDS: Brand[] = [];
export const INITIAL_WORKERS: Worker[] = [];
export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];
export const INITIAL_PAID_HISTORY: PaidHistoryEntry[] = [];
export const INITIAL_CHAT: ChatMessage[] = [];
export const INITIAL_ORDERS: Order[] = [];
export const CALENDAR_EVENTS: CalendarEvent[] = [];
export const CLASSROOM_MODULES: ClassroomModule[] = [];

export const CONFIG: Config = {
  tiers: [],
  goals: {
    clipper: { daily: 10, monthly: 200 },
    editor: { daily: 10, monthly: 200 },
  },
};
