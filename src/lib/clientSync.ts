// Sincronización segura del portal de clientes.
//
// Cada cliente NO lee los datos internos (pedidos de otras marcas, precios, pagos, equipo).
// El equipo publica para cada cliente una copia limpia en `client_view_<id>`.
// El cliente escribe sus acciones (brief, feedback, aprobación) en `client_inbox_<id>`;
// la sesión del administrador las aplica a los datos reales y confirma en `client_ack_<id>`.
// Las reglas de la base de datos (migración 0004) impiden que un cliente lea o escriba otra cosa.
import type { Brand, ClientAction, ClientView, Correction, Order, Video } from '../types';

export const clientViewKey = (clientId: string) => `client_view_${clientId}`;
export const clientInboxKey = (clientId: string) => `client_inbox_${clientId}`;
export const clientAckKey = (clientId: string) => `client_ack_${clientId}`;
export const CLIENT_CATALOG_KEY = 'clientCatalog';

export function newClientActionId(): string {
  return `act-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const isDelivered = (v: Video) => Boolean(v.publishedToClient || v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente');

function sanitizeOrder(o: Order): Order {
  return {
    id: o.id,
    brand: o.brand,
    videoCount: o.videoCount,
    deliveryDate: o.deliveryDate,
    deliveryTime: o.deliveryTime,
    status: o.status,
    assignedWorkerIds: [],
    clipperId: o.clipperId ? 'asignado' : null,
    editorId: null,
    briefFileName: o.briefFileName ?? null,
    briefFileUrl: o.briefFileUrl ?? null,
    avatarName: o.avatarName ?? null,
    avatarId: o.avatarId ?? null,
    references: o.references || [],
    clientNotes: o.clientNotes ?? null,
    editingStyleId: o.editingStyleId ?? null,
    editingStyleName: o.editingStyleName ?? null,
    briefConfirmedAt: o.briefConfirmedAt ?? null,
    createdAt: o.createdAt,
    promotedToBoard: o.promotedToBoard,
    invoiceNumber: o.invoiceNumber ?? null,
    invoiceDate: o.invoiceDate ?? null,
    invoiceFileName: o.invoiceFileName ?? null,
    invoiceFileUrl: o.invoiceFileUrl ?? null,
    clientId: o.clientId ?? null,
  };
}

function sanitizeVideo(v: Video): Video {
  const delivered = isDelivered(v);
  const approved = v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente';
  const final = v.finalVideos[v.finalVideos.length - 1];
  // Si el equipo está corrigiendo tras el feedback, el cliente sigue viendo la versión que ya revisó
  const shownUrl = approved ? final?.fileUrl : final?.previousVersions?.[final.previousVersions.length - 1]?.fileUrl || final?.fileUrl;
  return {
    id: v.id,
    name: v.name,
    videoNumber: v.videoNumber,
    orderId: v.orderId,
    clipperName: '',
    editorName: '',
    clipperId: '',
    editorId: '',
    // Lo interno se resume: el cliente solo distingue "en producción" de "entregado"
    qc: !delivered ? 'pendiente' : approved ? v.qc : 'correcciones',
    editorQc: 'pendiente',
    duration: v.duration,
    durationSeconds: v.durationSeconds,
    tierSnapshot: null,
    date: v.date,
    clips: [],
    finalVideos: delivered && final ? [{ id: final.id, name: final.name, note: '', fileName: null, fileUrl: shownUrl ?? null }] : [],
    corrections: v.corrections.filter(c => c.author === 'cliente'),
    finalUploaded: delivered,
    paid50: false,
    paid100: false,
    publishedToClient: delivered,
    clientFeedbackRoundsUsed: v.clientFeedbackRoundsUsed ?? 0,
    clientFeedbackMaxRounds: v.clientFeedbackMaxRounds ?? 1,
  };
}

/** Copia limpia de los proyectos de un cliente. */
export function buildClientView(clientId: string, orders: Order[], brands: Brand[]): ClientView {
  const myOrders = orders.filter(o => o.clientId === clientId);
  const ids = new Set(myOrders.map(o => o.id));
  const myBrands: Brand[] = [];
  for (const o of myOrders) {
    const videos = brands.flatMap(b => b.videos).filter(v => v.orderId === o.id || v.id === o.boardVideoId);
    myBrands.push({ id: `brand-${o.id}`, name: o.brand, videos: videos.map(sanitizeVideo) });
  }
  return {
    orders: myOrders.filter(o => ids.has(o.id)).map(sanitizeOrder),
    brands: myBrands,
    updatedAt: new Date().toISOString(),
  };
}

/** Aplica en la vista del cliente sus acciones aún no procesadas (respuesta inmediata en pantalla). */
export function applyClientActions(view: ClientView, actions: ClientAction[]): ClientView {
  let orders = view.orders;
  let brands = view.brands;
  const mapVideo = (videoId: string, fn: (v: Video) => Video) => {
    brands = brands.map(b => ({ ...b, videos: b.videos.map(v => (v.id === videoId ? fn(v) : v)) }));
  };
  for (const a of actions) {
    if (a.type === 'brief') {
      orders = orders.map(o => (o.id === a.orderId ? { ...o, ...a.patch } : o));
    } else if (a.type === 'feedback') {
      mapVideo(a.videoId, v => {
        const used = v.clientFeedbackRoundsUsed ?? 0;
        if (used >= (v.clientFeedbackMaxRounds ?? 1)) return v;
        const round = used + 1;
        const corrections: Correction[] = a.items.map((it, i) => ({
          id: `${a.id}-${i}`, time: it.time, text: it.text, author: 'cliente', round, resolved: false,
        }));
        return { ...v, qc: 'correcciones', corrections: [...v.corrections, ...corrections], clientFeedbackRoundsUsed: round };
      });
    } else if (a.type === 'approve') {
      mapVideo(a.videoId, v => ({ ...v, qc: 'aprobado_cliente' }));
    }
  }
  return { ...view, orders, brands };
}

/** ¿Este cliente es dueño del pedido / video sobre el que actúa? (seguridad al procesar la bandeja) */
export function clientOwnsTarget(clientId: string, action: ClientAction, orders: Order[], brands: Brand[]): boolean {
  if (action.type === 'brief') return orders.some(o => o.id === action.orderId && o.clientId === clientId);
  const video = brands.flatMap(b => b.videos).find(v => v.id === action.videoId);
  if (!video) return false;
  const order = orders.find(o => o.id === video.orderId || o.boardVideoId === video.id);
  return Boolean(order && order.clientId === clientId);
}
