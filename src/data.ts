import type { Brand, Worker, NotificationItem, Config, PaidHistoryEntry, ChatMessage, CalendarEvent, ClassroomModule } from './types';

export const TIERS = [
  { key: 'corto', label: 'Corto (<30s)', points: 1, clipperPay: 2, editorPay: 3 },
  { key: 'medio', label: 'Medio (30-60s)', points: 2, clipperPay: 3, editorPay: 4 },
  { key: 'largo', label: 'Largo (1-2min)', points: 3, clipperPay: 4, editorPay: 6 },
  { key: 'extra', label: 'Extra (>2min)', points: 4, clipperPay: 5, editorPay: 8 },
];

export const CONFIG: Config = {
  tiers: TIERS,
  goals: {
    clipper: { daily: 5, monthly: 100 },
    editor: { daily: 5, monthly: 100 },
  },
};

export const INITIAL_BRANDS: Brand[] = [
  {
    id: 'br1',
    name: 'Nexora',
    videos: [
      { id: 'v1', name: 'Nexora · Demo Reel', clipperName: 'Mateo R.', editorName: 'Lucía P.', clipperId: 'w1', editorId: 'w2', qc: 'aprobado_senda', editorQc: 'aprobado_senda', duration: '00:45', durationSeconds: 45, tierSnapshot: TIERS[1], date: '2026-09-20', clips: [], finalVideos: [], corrections: [], finalUploaded: false, paid50: true, paid100: false, briefFileName: 'brief-nexora-demo.pdf', briefFileUrl: null, sentByClipper: true, mainImageFileName: null, mainImageFileUrl: null, mainImageStatus: null, mainImageComment: null },
      { id: 'v2', name: 'Nexora · Tutorial', clipperName: 'Mateo R.', editorName: 'Lucía P.', clipperId: 'w1', editorId: 'w2', qc: 'revision', editorQc: 'pendiente', duration: null, durationSeconds: 90, tierSnapshot: null, date: '2026-09-21', clips: [], finalVideos: [], corrections: [{ id: 'cr1', time: 8, text: 'El logo tapa el texto en este punto' }], finalUploaded: false, paid50: false, paid100: false, briefFileName: null, briefFileUrl: null, sentByClipper: false, mainImageFileName: null, mainImageFileUrl: null, mainImageStatus: null, mainImageComment: null },
    ],
  },
  {
    id: 'br2',
    name: 'Vortex Labs',
    videos: [
      { id: 'v3', name: 'Vortex · Launch', clipperName: 'Sofía M.', editorName: 'Diego T.', clipperId: 'w3', editorId: 'w4', qc: 'aprobado_cliente', editorQc: 'aprobado_cliente', duration: '01:30', durationSeconds: 90, tierSnapshot: TIERS[2], date: '2026-09-19', clips: [], finalVideos: [], corrections: [], finalUploaded: true, paid50: true, paid100: true, briefFileName: 'brief-vortex-launch.pdf', briefFileUrl: null, sentByClipper: true, mainImageFileName: null, mainImageFileUrl: null, mainImageStatus: 'aprobada', mainImageComment: null },
    ],
  },
  {
    id: 'br3',
    name: 'Auralis',
    videos: [
      { id: 'v4', name: 'Auralis · Case Study', clipperName: 'Mateo R.', editorName: 'Diego T.', clipperId: 'w1', editorId: 'w4', qc: 'sin_iniciar', editorQc: 'pendiente', duration: null, durationSeconds: 60, tierSnapshot: null, date: '2026-09-22', clips: [], finalVideos: [], corrections: [], finalUploaded: false, paid50: false, paid100: false, briefFileName: null, briefFileUrl: null, sentByClipper: false, mainImageFileName: null, mainImageFileUrl: null, mainImageStatus: null, mainImageComment: null },
      { id: 'v5', name: 'Auralis · Promo', clipperName: 'Sofía M.', editorName: 'Lucía P.', clipperId: 'w3', editorId: 'w2', qc: 'pendiente', editorQc: 'pendiente', duration: null, durationSeconds: 60, tierSnapshot: null, date: '2026-09-22', clips: [], finalVideos: [], corrections: [], finalUploaded: false, paid50: false, paid100: false, briefFileName: null, briefFileUrl: null, sentByClipper: false, mainImageFileName: null, mainImageFileUrl: null, mainImageStatus: 'pendiente', mainImageComment: null },
    ],
  },
];

export const INITIAL_WORKERS: Worker[] = [
  { id: 'w1', name: 'Mateo R.', role: 'clipper', cargo: 'Clipper', ingreso: '2026-06-01', estado: 'Activo', pointsToday: 3, pointsMonth: 45, streak: 4, bestStreak: 7, streakLog: ['on','on','on','on','off'], dayClosedToday: false, online: true, phone: '', email: '', bankInfo: '', country: '', restDay: 'Lunes', emailNotifications: false },
  { id: 'w2', name: 'Lucía P.', role: 'editor', cargo: 'Editora', ingreso: '2026-05-15', estado: 'Activo', pointsToday: 2, pointsMonth: 38, streak: 3, bestStreak: 5, streakLog: ['on','on','on','off','off'], dayClosedToday: false, online: false, phone: '', email: '', bankInfo: '', country: '', restDay: 'Martes', emailNotifications: false },
  { id: 'w3', name: 'Sofía M.', role: 'clipper', cargo: 'Clipper', ingreso: '2026-07-01', estado: 'Activo', pointsToday: 5, pointsMonth: 52, streak: 6, bestStreak: 9, streakLog: ['on','on','on','on','on'], dayClosedToday: true, online: true, phone: '', email: '', bankInfo: '', country: '', restDay: 'Miércoles', emailNotifications: false },
  { id: 'w4', name: 'Diego T.', role: 'editor', cargo: 'Editor', ingreso: '2026-04-20', estado: 'Activo', pointsToday: 4, pointsMonth: 61, streak: 2, bestStreak: 4, streakLog: ['on','on','off','off','off'], dayClosedToday: false, online: false, phone: '', email: '', bankInfo: '', country: '', restDay: 'Jueves', emailNotifications: false },
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  { id: 'n1', role: 'clipper', workerId: 'w1', category: 'qc_clip', text: 'Tu clip de Nexora · Tutorial fue aprobado por Senda', t: new Date(Date.now() - 2 * 3600 * 1000).toISOString() },
  { id: 'n2', role: 'clipper', workerId: 'w1', category: 'racha', text: 'Racha de 4 días activa', t: new Date(Date.now() - 5 * 3600 * 1000).toISOString() },
  { id: 'n3', role: 'editor', workerId: 'w2', category: 'clips_enviados', text: 'Nexora · Demo Reel lista para tu edición', t: new Date(Date.now() - 3600 * 1000).toISOString() },
  { id: 'n4', role: 'editor', workerId: 'w4', category: 'qc_video', text: 'Vortex · Launch aprobado por el cliente', t: new Date(Date.now() - 3 * 3600 * 1000).toISOString() },
  { id: 'n5', role: 'admin', category: 'racha', text: 'Sofía M. cerró el día con 5 puntos', t: new Date(Date.now() - 30 * 60 * 1000).toISOString() },
  { id: 'n6', role: 'admin', category: 'pago_50', text: 'Pago 50% liberado a Mateo R.', t: new Date(Date.now() - 3600 * 1000).toISOString() },
];

export const INITIAL_CHAT: ChatMessage[] = [
  { id: 'c1', type: 'sys', text: 'Canal creado para el proyecto Nexora' },
  { id: 'c2', type: 'in', text: '¿Tienen el material de grabación listo?' },
  { id: 'c3', type: 'out', text: 'Sí, lo subo hoy antes de las 6pm' },
  { id: 'c4', type: 'in', text: 'Perfecto, quedo atento' },
];

export const INITIAL_PAID_HISTORY: PaidHistoryEntry[] = [
  { videoName: 'Vortex · Launch', clipperId: 'w3', editorId: 'w4', durationKey: '01:30', date: '2026-09-19', paid100: true, tierSnapshot: TIERS[2] },
  { videoName: 'Nexora · Demo Reel', clipperId: 'w1', editorId: 'w2', durationKey: '00:45', date: '2026-09-20', paid100: false, tierSnapshot: TIERS[1] },
];

export const CALENDAR_EVENTS: CalendarEvent[] = [
  { id: 'ev1', day: 19, label: 'Vortex · Launch', color: 'mint' },
  { id: 'ev2', day: 22, label: 'Auralis · Case Study', color: 'accent' },
  { id: 'ev3', day: 22, label: 'Auralis · Promo', color: 'violet' },
  { id: 'ev4', day: 25, label: 'Reunión cliente (Zoom)', color: 'amber', link: 'https://zoom.us/j/1234567890', note: 'Reunión de seguimiento con el cliente' },
  { id: 'ev5', day: 30, label: 'Día de pago', color: 'mint', note: 'Se liberan los pagos de la quincena' },
  { id: 'ev6', day: 22, label: 'Descanso: Sofía M. (Clipper)', color: 'violet', note: 'Día de descanso semanal asignado' },
  { id: 'ev7', day: 23, label: 'Descanso: Diego T. (Editor)', color: 'violet', note: 'Día de descanso semanal asignado' },
];

const SAMPLE_VIDEO = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';

export const CLASSROOM_MODULES: ClassroomModule[] = [
  {
    id: 'm1', title: 'Módulo 1 · Fundamentos del clipping', desc: 'Aprende a identificar los mejores momentos y recortar con precisión.', color: 'accent',
    lessons: [
      { id: 'm1-l1', title: 'Lección 1 · Introducción al clipping', videoUrl: SAMPLE_VIDEO },
      { id: 'm1-l2', title: 'Lección 2 · Herramientas básicas', videoUrl: SAMPLE_VIDEO },
      { id: 'm1-l3', title: 'Lección 3 · Encuadre y duración', videoUrl: SAMPLE_VIDEO },
      { id: 'm1-l4', title: 'Lección 4 · Cómo identificar el momento clave', videoUrl: SAMPLE_VIDEO },
      { id: 'm1-l5', title: 'Lección 5 · Práctica guiada', videoUrl: SAMPLE_VIDEO },
    ],
  },
  {
    id: 'm2', title: 'Módulo 2 · Ritmo y narrativa', desc: 'Técnicas de pacing, transiciones y estructura de un demo reel.', color: 'mint',
    lessons: [
      { id: 'm2-l1', title: 'Lección 1 · Qué es el pacing', videoUrl: SAMPLE_VIDEO },
      { id: 'm2-l2', title: 'Lección 2 · Transiciones efectivas', videoUrl: SAMPLE_VIDEO },
      { id: 'm2-l3', title: 'Lección 3 · Ganchos narrativos', videoUrl: SAMPLE_VIDEO },
      { id: 'm2-l4', title: 'Lección 4 · Ritmo musical', videoUrl: SAMPLE_VIDEO },
      { id: 'm2-l5', title: 'Lección 5 · Storytelling en 30s', videoUrl: SAMPLE_VIDEO },
      { id: 'm2-l6', title: 'Lección 6 · Estructura de un demo reel', videoUrl: SAMPLE_VIDEO },
    ],
  },
  {
    id: 'm3', title: 'Módulo 3 · Color y sonido', desc: 'Corrección de color básica y mezcla de audio para reels.', color: 'amber',
    lessons: [
      { id: 'm3-l1', title: 'Lección 1 · Fundamentos de color', videoUrl: SAMPLE_VIDEO },
      { id: 'm3-l2', title: 'Lección 2 · Corrección de color básica', videoUrl: SAMPLE_VIDEO },
      { id: 'm3-l3', title: 'Lección 3 · Mezcla de audio', videoUrl: SAMPLE_VIDEO },
      { id: 'm3-l4', title: 'Lección 4 · Masterización rápida', videoUrl: SAMPLE_VIDEO },
    ],
  },
  {
    id: 'm4', title: 'Módulo 4 · Entrega y QC', desc: 'Formatos de exportación, checklist de calidad y flujo de Senda.', color: 'violet',
    lessons: [
      { id: 'm4-l1', title: 'Lección 1 · Formatos de exportación', videoUrl: SAMPLE_VIDEO },
      { id: 'm4-l2', title: 'Lección 2 · Checklist de calidad', videoUrl: SAMPLE_VIDEO },
      { id: 'm4-l3', title: 'Lección 3 · Flujo de trabajo en Senda', videoUrl: SAMPLE_VIDEO },
    ],
  },
];

export const CONTRACTS = [
  { id: 'ct1', worker: 'Mateo R.', role: 'Clipper', type: 'Servicios · Clipping', start: '2026-06-01', end: '—', status: 'Vigente' },
  { id: 'ct2', worker: 'Lucía P.', role: 'Editora', type: 'Servicios · Edición', start: '2026-05-15', end: '—', status: 'Vigente' },
  { id: 'ct3', worker: 'Sofía M.', role: 'Clipper', type: 'Servicios · Clipping', start: '2026-07-01', end: '—', status: 'Vigente' },
  { id: 'ct4', worker: 'Diego T.', role: 'Editor', type: 'Servicios · Edición', start: '2026-04-20', end: '2026-10-20', status: 'Vigente' },
];
