export type Role = 'clipper' | 'editor' | 'admin';
export type ThemeMode = 'dark' | 'light';
export type ViewKey = 'home' | 'tareas' | 'chat' | 'carpeta' | 'calendario' | 'classroom' | 'contratos' | 'perfil' | 'administracion' | 'configuracion';
export type QcStatus = 'sin_iniciar' | 'pendiente' | 'revision' | 'correcciones' | 'aprobado' | 'aprobado_senda' | 'aprobado_cliente';
export type EditorQcStatus = 'pendiente' | 'revision' | 'correcciones' | 'aprobado_senda' | 'aprobado_cliente';

export interface Tier {
  key: string;
  label: string;
  points: number;
  clipperPay: number;
  editorPay: number;
}

export interface Clip {
  id: string;
  name: string;
  note: string;
}

export interface Correction {
  time: number;
  text: string;
}

export interface Video {
  id: string;
  name: string;
  clipperName: string;
  editorName: string;
  clipperId: string;
  editorId: string;
  qc: QcStatus;
  editorQc: EditorQcStatus;
  duration: string | null;
  tierSnapshot: Tier | null;
  date: string;
  clips: Clip[];
  corrections: Correction[];
  finalUploaded: boolean;
  paid50: boolean;
  paid100: boolean;
}

export interface Brand {
  id: string;
  name: string;
  videos: Video[];
}

export interface Worker {
  id: string;
  name: string;
  role: 'clipper' | 'editor';
  cargo: string;
  ingreso: string;
  estado: string;
  pointsToday: number;
  pointsMonth: number;
  streak: number;
  bestStreak: number;
  streakLog: ('on' | 'off')[];
  dayClosedToday: boolean;
}

export interface NotificationItem {
  role: Role;
  text: string;
  t: string;
}

export interface ChatMessage {
  id: string;
  type: 'in' | 'out' | 'sys';
  text: string;
}

export interface PaidHistoryEntry {
  videoName: string;
  clipperId: string;
  editorId: string;
  durationKey: string;
  date: string;
  paid100: boolean;
  tierSnapshot: Tier;
}

export interface Config {
  tiers: Tier[];
  goals: {
    clipper: { daily: number; monthly: number };
    editor: { daily: number; monthly: number };
  };
}
