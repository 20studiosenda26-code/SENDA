export type Role = 'clipper' | 'editor' | 'admin';
export type ThemeMode = 'dark' | 'light';
export type ViewKey = 'home' | 'tareas' | 'chat' | 'calendario' | 'classroom' | 'contratos' | 'perfil' | 'administracion' | 'configuracion';
export type QcStatus = 'sin_iniciar' | 'pendiente' | 'revision' | 'correcciones' | 'aprobado' | 'aprobado_senda' | 'aprobado_cliente';
export type EditorQcStatus = 'pendiente' | 'revision' | 'correcciones' | 'aprobado_senda' | 'aprobado_cliente';
export type MainImageStatus = 'pendiente' | 'aprobada' | 'rechazada';
export type ClipStatus = 'pending' | 'approved' | 'rejected';

export interface Tier {
  key: string;
  label: string;
  points: number;
  clipperPay: number;
  editorPay: number;
}

export interface ClipVersion {
  fileName: string | null;
  fileUrl: string | null;
  replacedAt: string;
}

export interface Clip {
  id: string;
  name: string;
  note: string;
  fileName?: string | null;
  fileUrl?: string | null;
  /** Estado de revisión del clip por parte del Admin. */
  status?: ClipStatus;
  /** Motivo escrito por el Admin cuando el clip se rechaza. */
  rejectionReason?: string | null;
  /** Nota interna del Admin asociada al clip (no necesariamente un rechazo). */
  adminNote?: string | null;
  /** Quién revisó el clip (por ahora siempre "Admin", no hay login de admins individuales). */
  reviewedBy?: string | null;
  /** Fecha/hora ISO de la última revisión (aprobación o rechazo). */
  reviewedAt?: string | null;
  /** Momento (en segundos) señalado por el Admin dentro del video del clip. */
  markerTime?: number | null;
  /** Número de versión actual (1 = original, sube con cada resubida). */
  version?: number;
  /** Historial de versiones anteriores, si el Clipper resubió el video. */
  previousVersions?: ClipVersion[];
}

export interface Correction {
  id: string;
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
  durationSeconds: number;
  tierSnapshot: Tier | null;
  date: string;
  clips: Clip[];
  finalVideos: Clip[];
  corrections: Correction[];
  finalUploaded: boolean;
  paid50: boolean;
  paid100: boolean;
  briefFileName?: string | null;
  briefFileUrl?: string | null;
  sentByClipper?: boolean;
  mainImageFileName?: string | null;
  mainImageFileUrl?: string | null;
  mainImageStatus?: MainImageStatus | null;
  mainImageComment?: string | null;
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
  online: boolean;
  phone?: string;
  email?: string;
  bankInfo?: string;
  country?: string;
  restDay?: string;
  /** Si el trabajador activó recibir notificaciones de Senda en su correo */
  emailNotifications?: boolean;
}

export interface CalendarEvent {
  id: string;
  day: number;
  label: string;
  color: string;
  link?: string;
  note?: string;
}

export type NotificationCategory =
  | 'trabajo_asignado'
  | 'clips_enviados'
  | 'qc_clip'
  | 'qc_video'
  | 'racha'
  | 'pago_50'
  | 'pago_100'
  | 'mensaje'
  | 'sistema';

export interface NotificationItem {
  id: string;
  role: Role;
  /** Si se define, la notificación es solo para este trabajador. Si no, es para todos los del rol (ej. todos los admins). */
  workerId?: string | null;
  category: NotificationCategory;
  text: string;
  /** Fecha/hora ISO de creación */
  t: string;
  read?: boolean;
}

export interface EmailLogEntry {
  id: string;
  workerId: string;
  to: string;
  subject: string;
  body: string;
  t: string;
}

export interface ClassroomLesson {
  id: string;
  title: string;
  videoUrl: string | null;
  fileName?: string | null;
}

export interface ClassroomModule {
  id: string;
  title: string;
  desc: string;
  color: string;
  lessons: ClassroomLesson[];
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
