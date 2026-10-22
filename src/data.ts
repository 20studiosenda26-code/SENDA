import type { Brand, Worker, NotificationItem, Config, PaidHistoryEntry, ChatMessage, CalendarEvent, ClassroomModule, Order } from './types';

const TODAY_ISO = new Date().toISOString().slice(0, 10);

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
      {
        id: 'v1',
        name: 'Nexora',
        clipperName: 'Mateo R.',
        editorName: 'Lucía P.',
        clipperId: 'w1',
        editorId: 'w2',
        qc: 'revision',
        editorQc: 'revision',
        duration: '00:45',
        durationSeconds: 45,
        tierSnapshot: TIERS[1],
        date: TODAY_ISO,
        clips: [
          {
            id: 'clip-nex-1',
            name: 'Hook Principal · Nexora',
            note: 'Recorte dinámico listo para revisión de Admin',
            fileName: 'nexora-hook-v1.mp4',
            fileUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
            status: 'pending',
            rejectionReason: null,
            adminNote: null,
            reviewedBy: null,
            reviewedAt: null,
            markerTime: null,
            version: 1,
            previousVersions: [],
          },
        ],
        finalVideos: [
          {
            id: 'final-nex-1',
            name: 'Nexora · Corte Final v1',
            note: 'Listo para visto bueno o corrección del Administrador',
            fileName: 'nexora-final-v1.mp4',
            fileUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
          },
        ],
        corrections: [],
        finalUploaded: false,
        paid50: false,
        paid100: false,
        briefFileName: 'brief-nexora-campana.pdf',
        briefFileUrl: null,
        sentByClipper: true,
        mainImageFileName: 'portada-nexora.png',
        mainImageFileUrl: null,
        mainImageStatus: 'pendiente',
        mainImageComment: null,
      },
    ],
  },
  {
    id: 'br2',
    name: 'Vortex Labs',
    videos: [
      {
        id: 'v2',
        name: 'Vortex Labs',
        clipperName: 'Sofía M.',
        editorName: 'Lucía P.',
        clipperId: 'w3',
        editorId: 'w2',
        qc: 'aprobado_cliente',
        editorQc: 'aprobado_cliente',
        duration: '01:15',
        durationSeconds: 75,
        tierSnapshot: TIERS[2],
        date: TODAY_ISO,
        clips: [
          {
            id: 'clip-vor-1',
            name: 'Vortex · Intro & Demo',
            note: 'Clip aprobado por Senda',
            fileName: 'vortex-intro.mp4',
            fileUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
            status: 'approved',
            rejectionReason: null,
            adminNote: null,
            reviewedBy: 'Admin',
            reviewedAt: new Date().toISOString(),
            markerTime: null,
            version: 1,
            previousVersions: [],
          },
        ],
        finalVideos: [
          {
            id: 'final-vor-1',
            name: 'Vortex Labs · Master Final',
            note: 'Entregado y aprobado por el cliente hoy',
            fileName: 'vortex-master-final.mp4',
            fileUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
          },
        ],
        corrections: [],
        finalUploaded: true,
        paid50: true,
        paid100: true,
        briefFileName: 'brief-vortex-launch.pdf',
        briefFileUrl: null,
        sentByClipper: true,
        mainImageFileName: null,
        mainImageFileUrl: null,
        mainImageStatus: 'aprobada',
        mainImageComment: null,
      },
    ],
  },
  {
    id: 'br3',
    name: 'Auralis',
    videos: [
      {
        id: 'v3',
        name: 'Auralis',
        clipperName: 'Mateo R.',
        editorName: 'Lucía P.',
        clipperId: 'w1',
        editorId: 'w2',
        qc: 'pendiente',
        editorQc: 'pendiente',
        duration: '00:50',
        durationSeconds: 50,
        tierSnapshot: TIERS[1],
        date: TODAY_ISO,
        clips: [
          {
            id: 'clip-aur-1',
            name: 'Auralis · Testimonio Clave',
            note: 'Clip enviado por Clipper para revisión QC',
            fileName: 'auralis-clip-1.mp4',
            fileUrl: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
            status: 'pending',
            rejectionReason: null,
            adminNote: null,
            reviewedBy: null,
            reviewedAt: null,
            markerTime: null,
            version: 1,
            previousVersions: [],
          },
        ],
        finalVideos: [],
        corrections: [],
        finalUploaded: false,
        paid50: false,
        paid100: false,
        briefFileName: 'brief-auralis-q4.pdf',
        briefFileUrl: null,
        sentByClipper: true,
        mainImageFileName: null,
        mainImageFileUrl: null,
        mainImageStatus: null,
        mainImageComment: null,
      },
    ],
  },
];

export const DEFAULT_DAILY_CAPACITY = 10;

export const INITIAL_WORKERS: Worker[] = [
  { id: 'w1', name: 'Mateo R.', role: 'clipper', cargo: 'Clipper', ingreso: '2026-06-01', estado: 'Activo', pointsToday: 5, pointsMonth: 45, streak: 4, bestStreak: 7, streakLog: ['on','on','on','on','off'], dayClosedToday: false, online: true, phone: '+57 300 111 2233', email: 'mateo@senda.studio', bankInfo: 'Bancolombia - 45890012345 - Mateo Rojas (Ahorros)', country: 'Colombia', restDay: 'Lunes', emailNotifications: false, dailyCapacity: 10 },
  { id: 'w2', name: 'Lucía P.', role: 'editor', cargo: 'Editora', ingreso: '2026-05-15', estado: 'Activo', pointsToday: 6, pointsMonth: 38, streak: 3, bestStreak: 5, streakLog: ['on','on','on','off','off'], dayClosedToday: false, online: true, phone: '+57 310 222 3344', email: 'lucia@senda.studio', bankInfo: 'Nequi - 3102223344 - Lucía Pérez (Ahorros)', country: 'Colombia', restDay: 'Martes', emailNotifications: false, dailyCapacity: 10 },
  { id: 'w3', name: 'Sofía M.', role: 'clipper', cargo: 'Clipper', ingreso: '2026-07-01', estado: 'Activo', pointsToday: 5, pointsMonth: 52, streak: 6, bestStreak: 9, streakLog: ['on','on','on','on','on'], dayClosedToday: true, online: true, phone: '+57 315 444 5566', email: 'sofia@senda.studio', bankInfo: 'Davivienda - 05600099887 - Sofía Méndez (Ahorros)', country: 'Colombia', restDay: 'Miércoles', emailNotifications: false, dailyCapacity: 8 },
  { id: 'w4', name: 'Diego T.', role: 'editor', cargo: 'Editor', ingreso: '2026-04-20', estado: 'Activo', pointsToday: 0, pointsMonth: 61, streak: 2, bestStreak: 4, streakLog: ['on','on','off','off','off'], dayClosedToday: false, online: false, phone: '+57 320 777 8899', email: 'diego@senda.studio', bankInfo: 'Bancolombia - 91230044556 - Diego Torres (Ahorros)', country: 'Colombia', restDay: 'Jueves', emailNotifications: false, dailyCapacity: 10 },
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  { id: 'n1', role: 'admin', category: 'qc_clip', text: 'Mateo R. subió clips en Nexora y Auralis para Control de Calidad', t: new Date(Date.now() - 25 * 60 * 1000).toISOString() },
  { id: 'n2', role: 'admin', category: 'qc_video', text: 'Lucía P. subió el video final de Nexora para revisión', t: new Date(Date.now() - 15 * 60 * 1000).toISOString() },
  { id: 'n3', role: 'admin', category: 'pago_100', text: 'Vortex Labs fue aprobado por el cliente · Utilidad registrada hoy', t: new Date(Date.now() - 45 * 60 * 1000).toISOString() },
];

export const INITIAL_CHAT: ChatMessage[] = [
  { id: 'c1', type: 'sys', text: 'Canal activo para los 3 proyectos principales de SENDA' },
  { id: 'c2', type: 'in', text: 'Ya dejé arriba el corte final de Nexora y los clips de Auralis.' },
  { id: 'c3', type: 'out', text: 'Perfecto, paso a revisarlos en Control de Calidad.' },
];

export const INITIAL_PAID_HISTORY: PaidHistoryEntry[] = [
  { videoName: 'Vortex Labs', clipperId: 'w3', editorId: 'w2', durationKey: '01:15', date: TODAY_ISO, paid100: true, tierSnapshot: TIERS[2] },
];

export const CALENDAR_EVENTS: CalendarEvent[] = [];

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

export const INITIAL_ORDERS: Order[] = [
  {
    id: 'ord1',
    brand: 'Nexora',
    videoCount: 6,
    deliveryDate: TODAY_ISO,
    deliveryTime: '18:00',
    status: 'asignado',
    assignedWorkerIds: ['w1', 'w2'],
    clipperId: 'w1',
    editorId: 'w2',
    promotedToBoard: true,
    boardVideoId: 'v1',
    unitPriceClient: 25,
    unitClipperPay: 3,
    unitEditorPay: 4,
    complexity: 'estandar',
    priority: 'urgente',
    paymentStatus: 'completado',
    invoiceNumber: `FAC-${TODAY_ISO.replace(/-/g, '')}-NEXO-101`,
    invoiceDate: TODAY_ISO,
    briefFileName: 'brief-nexora-campana.pdf',
    briefFileUrl: null,
    avatarName: 'Avatar "Nexa" (tech, neutro)',
    avatarFileUrl: null,
    references: [{ id: 'ref1', name: 'Referencia de guion — Reel dinámico', url: '#' }],
    clientNotes: 'Priorizar subtítulos dinámicos y cierre con llamado a la acción claro.',
    createdAt: new Date(Date.now() - 4 * 3600 * 1000).toISOString(),
  },
  {
    id: 'ord2',
    brand: 'Auralis',
    videoCount: 5,
    deliveryDate: TODAY_ISO,
    deliveryTime: '20:30',
    status: 'asignado',
    assignedWorkerIds: ['w1', 'w2'],
    clipperId: 'w1',
    editorId: 'w2',
    promotedToBoard: true,
    boardVideoId: 'v3',
    unitPriceClient: 25,
    unitClipperPay: 3,
    unitEditorPay: 4,
    complexity: 'estandar',
    priority: 'prioritario',
    paymentStatus: 'completado',
    invoiceNumber: `FAC-${TODAY_ISO.replace(/-/g, '')}-AURA-102`,
    invoiceDate: TODAY_ISO,
    briefFileName: 'brief-auralis-q4.pdf',
    briefFileUrl: null,
    avatarName: 'Avatar "Auri" (elegante)',
    avatarFileUrl: null,
    references: [],
    clientNotes: 'Enfocar los primeros 3 segundos en el caso de estudio.',
    createdAt: new Date(Date.now() - 3 * 3600 * 1000).toISOString(),
  },
  {
    id: 'ord3',
    brand: 'Vortex Labs',
    videoCount: 4,
    deliveryDate: TODAY_ISO,
    deliveryTime: '15:00',
    status: 'finalizado',
    assignedWorkerIds: ['w3', 'w2'],
    clipperId: 'w3',
    editorId: 'w2',
    promotedToBoard: true,
    boardVideoId: 'v2',
    unitPriceClient: 25,
    unitClipperPay: 4,
    unitEditorPay: 6,
    complexity: 'simple',
    priority: 'normal',
    paymentStatus: 'completado',
    invoiceNumber: `FAC-${TODAY_ISO.replace(/-/g, '')}-VORT-103`,
    invoiceDate: TODAY_ISO,
    briefFileName: 'brief-vortex-launch.pdf',
    briefFileUrl: null,
    avatarName: 'Avatar "Nova" (versión oscura)',
    avatarFileUrl: null,
    references: [],
    clientNotes: 'Proyecto aprobado por el cliente y liquidado hoy.',
    createdAt: new Date(Date.now() - 6 * 3600 * 1000).toISOString(),
  },
];

export const CONTRACTS = [
  { id: 'ct1', worker: 'Mateo R.', role: 'Clipper', type: 'Servicios · Clipping', start: '2026-06-01', end: '—', status: 'Vigente' },
  { id: 'ct2', worker: 'Lucía P.', role: 'Editora', type: 'Servicios · Edición', start: '2026-05-15', end: '—', status: 'Vigente' },
  { id: 'ct3', worker: 'Sofía M.', role: 'Clipper', type: 'Servicios · Clipping', start: '2026-07-01', end: '—', status: 'Vigente' },
  { id: 'ct4', worker: 'Diego T.', role: 'Editor', type: 'Servicios · Edición', start: '2026-04-20', end: '2026-10-20', status: 'Vigente' },
];
