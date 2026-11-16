// Núcleo económico y operativo único de SENDA.
// Finanzas, Nóminas, Perfil, Capacidad e Inicio leen de aquí para que todas
// las cifras coincidan en toda la plataforma (una sola fuente de verdad).
//
// REGLA DE PAGO (rol único "Clipper · Asistente de edición"):
//   Cada video entregado paga $5 en total a la persona responsable:
//   · 50% ($2,50) cuando SENDA lo aprueba ("Aprobado Senda")
//   · 50% ($2,50) cuando el cliente lo aprueba ("Aprobado Cliente")
//   El monto por video se cambia en Admin → Ajustes (o por pedido al crearlo).
import type { Brand, FinanceSettings, Order, PayrollPayment, PayrollReportItem, Video, Worker } from '../types';

export const CURRENCY_SIGN = String.fromCharCode(36);
export const DEFAULT_PAY_PER_VIDEO = 5;
export const DEFAULT_CLIENT_PRICE = 25;
/** Parte del pago que se libera en cada aprobación */
export const PAY_SPLIT = 0.5;

/** Dinero con miles en español y centavos solo cuando hacen falta: $5 · $2,50 · $1.250 */
export function fmtMoney(n: number): string {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const hasCents = Math.abs(v % 1) > 0.001;
  const body = Math.abs(v).toLocaleString('es-CO', { minimumFractionDigits: hasCents ? 2 : 0, maximumFractionDigits: 2 });
  return `${v < 0 ? '-' : ''}${CURRENCY_SIGN}${body}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function finiteOr(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && value !== null && value !== undefined && value !== '' ? n : fallback;
}

const normBrand = (s: string) => (s || '').trim().toLowerCase();

/** Pedido al que pertenece un video: por orderId, luego video principal, luego nombre de marca. */
export function findOrderForVideo(video: Video, brandName: string, orders: Order[]): Order | null {
  if (video.orderId) {
    const byId = orders.find(o => o.id === video.orderId);
    if (byId) return byId;
  }
  const byBoard = orders.find(o => o.boardVideoId === video.id);
  if (byBoard) return byBoard;
  return orders.find(o => normBrand(o.brand) === normBrand(brandName)) || null;
}

/** Ajustes de finanzas con valores seguros. Los ajustes antiguos (pago por clips + pago por edición) pasan a la regla de $5 por video. */
export function normalizeFinanceSettings(raw?: Partial<FinanceSettings> | null): FinanceSettings {
  const price = finiteOr(raw?.clientPricePerVideo, DEFAULT_CLIENT_PRICE);
  const pay = finiteOr(raw?.payPerVideo, DEFAULT_PAY_PER_VIDEO);
  return {
    clientPricePerVideo: Math.max(0, price),
    payPerVideo: Math.max(0, pay),
    // Campos heredados: se mantienen sincronizados para no romper datos guardados
    defaultClipperCost: Math.max(0, pay),
    defaultEditorCost: 0,
  };
}

export interface UnitEconomics {
  price: number;
  /** Pago total por video a la persona responsable (ej. $5) */
  creatorPay: number;
  /** @deprecated usar creatorPay (igual a creatorPay) */
  clipperPay: number;
  /** @deprecated siempre 0: ya no existe el rol de editor */
  editorPay: number;
}

/** Precio del cliente y pago al equipo por video: valor del pedido → Ajustes. */
export function unitEconomics(_video: Video | null, order: Order | null, settings: FinanceSettings): UnitEconomics {
  const s = normalizeFinanceSettings(settings);
  const creatorPay = Math.max(0, finiteOr(order?.creatorPayPerVideo, s.payPerVideo));
  return {
    price: Math.max(0, finiteOr(order?.unitPriceClient, s.clientPricePerVideo)),
    creatorPay,
    clipperPay: creatorPay,
    editorPay: 0,
  };
}

export type PayStage = 'senda' | 'cliente';

/** Qué tramos de pago ya se liberaron para este video. */
export function videoPayStages(v: Video): Record<PayStage, boolean> {
  const cliente = v.qc === 'aprobado_cliente' || Boolean(v.paid100);
  const senda = cliente || v.qc === 'aprobado_senda' || v.qc === 'aprobado' || Boolean(v.paid50);
  return { senda, cliente };
}

/** Lo que ya ganó la persona con este video (0, 50% o 100% del pago). */
export function videoEarned(v: Video, creatorPay: number): number {
  const st = videoPayStages(v);
  return (st.senda ? creatorPay * PAY_SPLIT : 0) + (st.cliente ? creatorPay * PAY_SPLIT : 0);
}

/** Persona que cobra el video (rol único: el responsable asignado). */
export function videoPayee(v: Pick<Video, 'clipperId' | 'editorId'>): string | null {
  return v.clipperId || v.editorId || null;
}

// ---------------------------------------------------------------------------
// Etapas del flujo de producción
// ---------------------------------------------------------------------------

/** El equipo ya terminó su parte (Senda aprobó o el cliente aprobó). */
export function isTeamDone(v: Video): boolean {
  return v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente' || v.qc === 'aprobado';
}

/** El clipper aún tiene trabajo pendiente en este video. */
export function needsClipping(v: Video): boolean {
  return !isTeamDone(v) && !v.sentByClipper;
}

/** El editor aún tiene trabajo pendiente en este video (incluye correcciones). */
export function needsEditing(v: Video): boolean {
  return !isTeamDone(v);
}

export interface VideoWithBrand extends Video {
  brandName: string;
}

export function flattenVideos(brands: Brand[]): VideoWithBrand[] {
  return brands.flatMap(b => b.videos.map(v => ({ ...v, brandName: b.name })));
}

/** Pedidos activos que todavía no tienen videos en el tablero (sin promover). */
export function unpromotedOrders(orders: Order[], videos: Video[]): Order[] {
  const withVideos = new Set(videos.map(v => v.orderId).filter(Boolean) as string[]);
  return orders.filter(o => o.status !== 'finalizado' && !withVideos.has(o.id) && !o.promotedToBoard);
}

/** Carga real de un creador: videos pendientes de SU etapa + pedidos preasignados sin promover. */
export function workerWorkload(worker: Pick<Worker, 'id' | 'role'>, videos: Video[], orders: Order[]): number {
  // Rol único: la persona hace clips, imagen y video final, así que cuenta todo video no terminado
  const mine = videos.filter(v => (v.clipperId === worker.id || v.editorId === worker.id) && needsEditing(v)).length;
  const pre = unpromotedOrders(orders, videos)
    .filter(o => o.clipperId === worker.id || o.editorId === worker.id)
    .reduce((s, o) => s + Math.max(1, o.videoCount || 1), 0);
  return mine + pre;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------

const STAGE_LABEL: Record<PayStage, string> = {
  senda: '50% · Aprobado Senda',
  cliente: '50% · Aprobado Cliente',
};

export const payItemKey = (videoId: string, stage?: PayStage | null) => `${videoId}:${stage || 'total'}`;

/** Tramos ganados por una persona: hasta 2 filas por video (50% Senda + 50% Cliente). */
export function workerEarnedItems(
  worker: Pick<Worker, 'id' | 'role'>,
  brands: Brand[],
  orders: Order[],
  settings: FinanceSettings
): PayrollReportItem[] {
  const items: PayrollReportItem[] = [];
  for (const v of flattenVideos(brands)) {
    if (videoPayee(v) !== worker.id) continue;
    const st = videoPayStages(v);
    if (!st.senda && !st.cliente) continue;
    const order = findOrderForVideo(v, v.brandName, orders);
    const half = unitEconomics(v, order, settings).creatorPay * PAY_SPLIT;
    (['senda', 'cliente'] as PayStage[]).forEach(stage => {
      if (!st[stage]) return;
      const at = stage === 'senda' ? v.sendaApprovedAt : v.clientApprovedAt;
      items.push({
        videoId: v.id,
        stage,
        projectName: `${v.name} · ${STAGE_LABEL[stage]}`,
        brandName: v.brandName,
        date: (at || v.date || '').slice(0, 10),
        videosCount: 1,
        unitPay: half,
        subtotal: half,
      });
    });
  }
  return items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

/** Tramos ya pagados a esta persona en cualquier ciclo de nómina. */
export function paidItemKeys(payments: PayrollPayment[], workerId: string): Set<string> {
  const set = new Set<string>();
  for (const p of payments) {
    if (p.workerId !== workerId) continue;
    for (const it of p.reportItems || []) {
      if (it.stage) set.add(payItemKey(it.videoId, it.stage));
      else {
        // Pagos anteriores a la regla 50/50: cubrían el video completo
        set.add(payItemKey(it.videoId, 'senda'));
        set.add(payItemKey(it.videoId, 'cliente'));
      }
    }
  }
  return set;
}

/** @deprecated usar paidItemKeys */
export function paidVideoIds(payments: PayrollPayment[], workerId: string): Set<string> {
  const set = new Set<string>();
  for (const p of payments) if (p.workerId === workerId) for (const it of p.reportItems || []) set.add(it.videoId);
  return set;
}

export interface WorkerPayrollStatus {
  earnedItems: PayrollReportItem[];
  pendingItems: PayrollReportItem[];
  totalEarned: number;
  totalPaid: number;
  pendingAmount: number;
}

export function workerPayrollStatus(
  worker: Pick<Worker, 'id' | 'role'>,
  brands: Brand[],
  orders: Order[],
  settings: FinanceSettings,
  payments: PayrollPayment[]
): WorkerPayrollStatus {
  const earnedItems = workerEarnedItems(worker, brands, orders, settings);
  const paid = paidItemKeys(payments, worker.id);
  const pendingItems = earnedItems.filter(i => !paid.has(payItemKey(i.videoId, i.stage)));
  const totalEarned = earnedItems.reduce((s, i) => s + i.subtotal, 0);
  const totalPaid = payments.filter(p => p.workerId === worker.id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const pendingAmount = pendingItems.reduce((s, i) => s + i.subtotal, 0);
  return { earnedItems, pendingItems, totalEarned, totalPaid, pendingAmount };
}

export interface WorkerEarningsSummary {
  /** Ganado hoy (tramos liberados hoy) */
  earnedToday: number;
  /** Ganado en el mes en curso */
  earnedMonth: number;
  /** Ganado en total (historial) */
  earnedTotal: number;
  /** Ganado y aún no pagado en Nóminas */
  pending: number;
  /** Ya pagado en Nóminas */
  paidTotal: number;
  /** Videos con el 50% liberado que esperan al cliente (y lo que falta por ganar en ellos) */
  waitingClientVideos: number;
  waitingClientAmount: number;
  /** Videos aprobados por el cliente (100% ganado) */
  clientApprovedVideos: number;
  /** Videos aún en producción y lo que valen si se aprueban */
  inProductionVideos: number;
  inProductionAmount: number;
}

/** Resumen de ganancias de una persona con la regla de $5 por video (misma fuente que Nóminas). */
export function workerEarningsSummary(
  worker: Pick<Worker, 'id' | 'role'>,
  brands: Brand[],
  orders: Order[],
  settings: FinanceSettings,
  payments: PayrollPayment[]
): WorkerEarningsSummary {
  const status = workerPayrollStatus(worker, brands, orders, settings, payments);
  const today = todayIso();
  const month = today.slice(0, 7);
  const sum = (pred: (d: string) => boolean) => status.earnedItems.filter(i => pred(i.date || '')).reduce((s, i) => s + i.subtotal, 0);
  let waitingClientVideos = 0, waitingClientAmount = 0, clientApprovedVideos = 0, inProductionVideos = 0, inProductionAmount = 0;
  for (const v of flattenVideos(brands)) {
    if (videoPayee(v) !== worker.id) continue;
    const pay = unitEconomics(v, findOrderForVideo(v, v.brandName, orders), settings).creatorPay;
    const st = videoPayStages(v);
    if (st.cliente) clientApprovedVideos += 1;
    else if (st.senda) { waitingClientVideos += 1; waitingClientAmount += pay * PAY_SPLIT; }
    else { inProductionVideos += 1; inProductionAmount += pay; }
  }
  return {
    earnedToday: sum(d => d === today),
    earnedMonth: sum(d => d.startsWith(month)),
    earnedTotal: status.totalEarned,
    pending: status.pendingAmount,
    paidTotal: status.totalPaid,
    waitingClientVideos,
    waitingClientAmount,
    clientApprovedVideos,
    inProductionVideos,
    inProductionAmount,
  };
}
