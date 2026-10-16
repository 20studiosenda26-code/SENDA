export type Role = 'clipper' | 'editor' | 'admin';
export type ThemeMode = 'dark' | 'light';
export type ViewKey = 'home' | 'tareas' | 'chat' | 'calendario' | 'classroom' | 'contratos' | 'perfil' | 'clientes' | 'finanzas' | 'nominas' | 'capacidad' | 'administracion';
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
  status?: ClipStatus;
  rejectionReason?: string | null;
  adminNote?: string | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  markerTime?: number | null;
  version?: number;
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

export interface WorkerCustomGoals {
  daily: number;
  monthly: number;
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
  emailNotifications?: boolean;
  dailyCapacity?: number;
  customGoalDaily?: number;
  customGoalMonthly?: number;
}

export interface CalendarEvent {
  id: string;
  day: number;
  month: number;
  year: number;
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
  workerId?: string | null;
  category: NotificationCategory;
  text: string;
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

export interface Contract {
  id: string;
  title: string;
  role: 'clipper' | 'editor';
  workerId: string | null;
  fileName: string;
  fileUrl: string;
  uploadedBy: string | null;
  createdAt: string;
}

export interface ContractSignedUpload {
  id: string;
  contractId: string;
  workerId: string;
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
}

export type OrderStatus = 'aprobado_senda' | 'aprobado_cliente' | 'sin_asignar' | 'asignado' | 'finalizado' | 'incompleto';

export interface OrderReference {
  id: string;
  name: string;
  url: string;
}

export interface Order {
  id: string;
  brand: string;
  videoCount: number;
  deliveryDate: string;
  deliveryTime: string;
  status: OrderStatus;
  assignedWorkerIds: string[];
  clipperId?: string | null;
  editorId?: string | null;
  briefFileName?: string | null;
  briefFileUrl?: string | null;
  avatarName?: string | null;
  avatarFileUrl?: string | null;
  references?: OrderReference[];
  clientNotes?: string | null;
  createdAt: string;
  promotedToBoard?: boolean;
  boardVideoId?: string | null;
  unitPriceClient?: number;
  unitClipperPay?: number;
  unitEditorPay?: number;
  clipsPerVideo?: number;
  priority?: 'normal' | 'prioritario' | 'urgente' | 'critico';
  complexity?: 'simple' | 'estandar' | 'alta';
}

export interface FinanceSettings {
  clientPricePerVideo: number;
  defaultClipperCost: number;
  defaultEditorCost: number;
}

export interface AppExpense {
  id: string;
  label: string;
  category: 'creditos_ia' | 'suscripcion' | 'herramienta';
  amount: number;
  date: string;
}

export interface FinanceDayClosing {
  id: string;
  closedAt: string;
  periodLabel: string;
  deferredRevenue: number;
  accruedGrossRevenue: number;
  realizedNetRevenue: number;
  totalCreatorPayouts: number;
  totalAppExpenses?: number;
  projectsCount: number;
}

export interface PayrollReportItem {
  videoId: string;
  projectName: string;
  brandName: string;
  date: string;
  videosCount: number;
  unitPay: number;
  subtotal: number;
}

export interface PayrollPayment {
  id: string;
  workerId: string;
  workerName: string;
  role: 'clipper' | 'editor';
  amount: number;
  weekKey: string;
  weekendLabel: string;
  receiptFileName: string | null;
  receiptFileUrl: string | null;
  reportItems?: PayrollReportItem[];
  bankSnapshot?: string | null;
  note?: string | null;
  paidAt: string;
}

export interface CapacityProtocolConfig {
  safetyMarginPct: number;
  defaultClipperDailyVideos: number;
  defaultEditorDailyVideos: number;
  workdayStartHour: number;
  workdayEndHour: number;
  maxNoResponseMinutes: number;
  maxStalledHours: number;
  urgentThresholdHours: number;
}

export interface ChatGroup {
  id: string;
  name: string;
  isDm: boolean;
  createdBy: string | null;
  createdAt: string;
  memberIds: string[];
}

export interface ChatMsg {
  id: string;
  groupId: string;
  senderId: string;
  senderName: string;
  text: string;
  fileName?: string | null;
  fileUrl?: string | null;
  createdAt: string;
}
