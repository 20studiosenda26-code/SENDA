// Núcleo económico y operativo único de SENDA.
// Finanzas, Nóminas, Perfil, Capacidad e Inicio leen de aquí para que todas
// las cifras coincidan en toda la plataforma (una sola fuente de verdad).
import type { Brand, FinanceSettings, Order, PayrollPayment, PayrollReportItem, Video, Worker } from '../types';

export const CURRENCY_SIGN = String.fromCharCode(36);

export function fmtMoney(n: number): string {
  const clean = Math.round(Number(n) || 0);
  return CURRENCY_SIGN + clean.toLocaleString('es-CO');
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

export interface UnitEconomics {
  price: number;
  clipperPay: number;
  editorPay: number;
}

/** Precio y pagos por video: valores del pedido → nivel del video → valores por defecto de Ajustes. */
export function unitEconomics(video: Video | null, order: Order | null, settings: FinanceSettings): UnitEconomics {
  const tier = video?.tierSnapshot as (Partial<{ clipperPay: number; editorPay: number }> | null | undefined);
  return {
    price: Math.max(0, finiteOr(order?.unitPriceClient, settings.clientPricePerVideo)),
    clipperPay: Math.max(0, finiteOr(order?.unitClipperPay, finiteOr(tier?.clipperPay, settings.defaultClipperCost))),
    editorPay: Math.max(0, finiteOr(order?.unitEditorPay, finiteOr(tier?.editorPay, settings.defaultEditorCost))),
  };
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
  const mine = videos.filter(v =>
    worker.role === 'clipper'
      ? v.clipperId === worker.id && needsClipping(v)
      : v.editorId === worker.id && needsEditing(v)
  ).length;
  const pre = unpromotedOrders(orders, videos)
    .filter(o => (worker.role === 'clipper' ? o.clipperId === worker.id : o.editorId === worker.id))
    .reduce((s, o) => s + Math.max(1, o.videoCount || 1), 0);
  return mine + pre;
}

// ---------------------------------------------------------------------------
// Nómina
// ---------------------------------------------------------------------------

/** Ítems ganados (Aprobado Cliente) de un creador: 1 fila por video. */
export function workerEarnedItems(
  worker: Pick<Worker, 'id' | 'role'>,
  brands: Brand[],
  orders: Order[],
  settings: FinanceSettings
): PayrollReportItem[] {
  const items: PayrollReportItem[] = [];
  for (const v of flattenVideos(brands)) {
    const isMine = worker.role === 'clipper' ? v.clipperId === worker.id : v.editorId === worker.id;
    if (!isMine) continue;
    if (v.qc !== 'aprobado_cliente' && !v.paid100) continue;
    const order = findOrderForVideo(v, v.brandName, orders);
    const eco = unitEconomics(v, order, settings);
    const unitPay = worker.role === 'clipper' ? eco.clipperPay : eco.editorPay;
    items.push({
      videoId: v.id,
      projectName: v.name,
      brandName: v.brandName,
      date: v.date,
      videosCount: 1,
      unitPay,
      subtotal: unitPay,
    });
  }
  return items.sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** Videos que ya fueron pagados a este creador en cualquier ciclo de nómina. */
export function paidVideoIds(payments: PayrollPayment[], workerId: string): Set<string> {
  const set = new Set<string>();
  for (const p of payments) {
    if (p.workerId !== workerId) continue;
    for (const it of p.reportItems || []) set.add(it.videoId);
  }
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
  const paid = paidVideoIds(payments, worker.id);
  const pendingItems = earnedItems.filter(i => !paid.has(i.videoId));
  const totalEarned = earnedItems.reduce((s, i) => s + i.subtotal, 0);
  const totalPaid = payments.filter(p => p.workerId === worker.id).reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const pendingAmount = pendingItems.reduce((s, i) => s + i.subtotal, 0);
  return { earnedItems, pendingItems, totalEarned, totalPaid, pendingAmount };
}
