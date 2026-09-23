import type { Brand, Worker, NotificationItem, Config, PaidHistoryEntry, ChatMessage, CalendarEvent } from './types';

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
      { id: 'v1', name: 'Nexora · Demo Reel', clipperName: 'Mateo R.', editorName: 'Lucía P.', clipperId: 'w1', editorId: 'w2', qc: 'aprobado_senda', editorQc: 'aprobado_senda', duration: '00:45', durationSeconds: 45, tierSnapshot: TIERS[1], date: '2026-09-20', clips: [], corrections: [], finalUploaded: false, paid50: true, paid100: false, briefFileName: 'brief-nexora-demo.pdf', briefFileUrl: null, sentByClipper: true },
      { id: 'v2', name: 'Nexora · Tutorial', clipperName: 'Mateo R.', editorName: 'Lucía P.', clipperId: 'w1', editorId: 'w2', qc: 'revision', editorQc: 'pendiente', duration: null, durationSeconds: 90, tierSnapshot: null, date: '2026-09-21', clips: [], corrections: [{ id: 'cr1', time: 8, text: 'El logo tapa el texto en este punto' }], finalUploaded: false, paid50: false, paid100: false, briefFileName: null, briefFileUrl: null, sentByClipper: false },
    ],
  },
  {
    id: 'br2',
    name: 'Vortex Labs',
    videos: [
      { id: 'v3', name: 'Vortex · Launch', clipperName: 'Sofía M.', editorName: 'Diego T.', clipperId: 'w3', editorId: 'w4', qc: 'aprobado_cliente', editorQc: 'aprobado_cliente', duration: '01:30', durationSeconds: 90, tierSnapshot: TIERS[2], date: '2026-09-19', clips: [], corrections: [], finalUploaded: true, paid50: true, paid100: true, briefFileName: 'brief-vortex-launch.pdf', briefFileUrl: null, sentByClipper: true },
    ],
  },
  {
    id: 'br3',
    name: 'Auralis',
    videos: [
      { id: 'v4', name: 'Auralis · Case Study', clipperName: 'Mateo R.', editorName: 'Diego T.', clipperId: 'w1', editorId: 'w4', qc: 'sin_iniciar', editorQc: 'pendiente', duration: null, durationSeconds: 60, tierSnapshot: null, date: '2026-09-22', clips: [], corrections: [], finalUploaded: false, paid50: false, paid100: false, briefFileName: null, briefFileUrl: null, sentByClipper: false },
      { id: 'v5', name: 'Auralis · Promo', clipperName: 'Sofía M.', editorName: 'Lucía P.', clipperId: 'w3', editorId: 'w2', qc: 'pendiente', editorQc: 'pendiente', duration: null, durationSeconds: 60, tierSnapshot: null, date: '2026-09-22', clips: [], corrections: [], finalUploaded: false, paid50: false, paid100: false, briefFileName: null, briefFileUrl: null, sentByClipper: false },
    ],
  },
];

export const INITIAL_WORKERS: Worker[] = [
  { id: 'w1', name: 'Mateo R.', role: 'clipper', cargo: 'Clipper', ingreso: '2026-06-01', estado: 'Activo', pointsToday: 3, pointsMonth: 45, streak: 4, bestStreak: 7, streakLog: ['on','on','on','on','off'], dayClosedToday: false, online: true, phone: '', email: '', bankInfo: '', country: '', restDay: 'Lunes' },
  { id: 'w2', name: 'Lucía P.', role: 'editor', cargo: 'Editora', ingreso: '2026-05-15', estado: 'Activo', pointsToday: 2, pointsMonth: 38, streak: 3, bestStreak: 5, streakLog: ['on','on','on','off','off'], dayClosedToday: false, online: false, phone: '', email: '', bankInfo: '', country: '', restDay: 'Martes' },
  { id: 'w3', name: 'Sofía M.', role: 'clipper', cargo: 'Clipper', ingreso: '2026-07-01', estado: 'Activo', pointsToday: 5, pointsMonth: 52, streak: 6, bestStreak: 9, streakLog: ['on','on','on','on','on'], dayClosedToday: true, online: true, phone: '', email: '', bankInfo: '', country: '', restDay: 'Miércoles' },
  { id: 'w4', name: 'Diego T.', role: 'editor', cargo: 'Editor', ingreso: '2026-04-20', estado: 'Activo', pointsToday: 4, pointsMonth: 61, streak: 2, bestStreak: 4, streakLog: ['on','on','off','off','off'], dayClosedToday: false, online: false, phone: '', email: '', bankInfo: '', country: '', restDay: 'Jueves' },
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  { role: 'clipper', text: 'Tu clip de Nexora · Tutorial fue aprobado por Senda', t: 'hace 2h' },
  { role: 'clipper', text: 'Racha de 4 días activa', t: 'hace 5h' },
  { role: 'editor', text: 'Nexora · Demo Reel lista para tu edición', t: 'hace 1h' },
  { role: 'editor', text: 'Vortex · Launch aprobado por el cliente', t: 'hace 3h' },
  { role: 'admin', text: 'Sofía M. cerró el día con 5 puntos', t: 'hace 30min' },
  { role: 'admin', text: 'Pago 50% liberado a Mateo R.', t: 'hace 1h' },
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

export const CLASSROOM_MODULES = [
  {
    id: 'm1', title: 'Módulo 1 · Fundamentos del clipping', desc: 'Aprende a identificar los mejores momentos y recortar con precisión.', lessons: 5, done: 3, color: 'accent',
    currentLesson: 'Lección 4 · Cómo identificar el momento clave', videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  },
  {
    id: 'm2', title: 'Módulo 2 · Ritmo y narrativa', desc: 'Técnicas de pacing, transiciones y estructura de un demo reel.', lessons: 6, done: 6, color: 'mint',
    currentLesson: 'Lección 6 · Estructura de un demo reel', videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  },
  {
    id: 'm3', title: 'Módulo 3 · Color y sonido', desc: 'Corrección de color básica y mezcla de audio para reels.', lessons: 4, done: 1, color: 'amber',
    currentLesson: 'Lección 2 · Corrección de color básica', videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  },
  {
    id: 'm4', title: 'Módulo 4 · Entrega y QC', desc: 'Formatos de exportación, checklist de calidad y flujo de Senda.', lessons: 3, done: 0, color: 'violet',
    currentLesson: 'Lección 1 · Formatos de exportación', videoUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  },
];

export const CONTRACTS = [
  { id: 'ct1', worker: 'Mateo R.', role: 'Clipper', type: 'Servicios · Clipping', start: '2026-06-01', end: '—', status: 'Vigente' },
  { id: 'ct2', worker: 'Lucía P.', role: 'Editora', type: 'Servicios · Edición', start: '2026-05-15', end: '—', status: 'Vigente' },
  { id: 'ct3', worker: 'Sofía M.', role: 'Clipper', type: 'Servicios · Clipping', start: '2026-07-01', end: '—', status: 'Vigente' },
  { id: 'ct4', worker: 'Diego T.', role: 'Editor', type: 'Servicios · Edición', start: '2026-04-20', end: '2026-10-20', status: 'Vigente' },
];
