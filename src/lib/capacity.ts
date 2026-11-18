// Motor de Capacidad de Entrega de SENDA.
// Cada video pendiente se cuenta UNA sola vez (antes se sumaba el pedido + sus videos del tablero)
// y su trabajo se reparte en los días que quedan hasta la entrega, para comparar contra la
// capacidad diaria real de Clippers y Editores.
import type { Brand, Order, Video, Worker } from '../types';
import { addDaysIso, needsClipping, needsEditing, todayIso } from './economics';

export type Complexity = 'simple' | 'estandar' | 'alta';

export interface WorkUnit {
  key: string;
  brand: string;
  orderId: string | null;
  deliveryDate: string;
  complexity: Complexity;
  clipperId: string | null;
  editorId: string | null;
  clipRemaining: number;
  editRemaining: number;
}

export function orderComplexity(o: Pick<Order, 'complexity' | 'videoCount'>): Complexity {
  const count = Math.max(1, o.videoCount || 1);
  return o.complexity || (count >= 12 ? 'alta' : count <= 4 ? 'simple' : 'estandar');
}

export const COMPLEXITY_FACTOR: Record<Complexity, number> = { simple: 0.85, estandar: 1, alta: 1.3 };

/** Convierte pedidos + tablero en unidades de trabajo sin duplicados. */
export function buildWorkUnits(orders: Order[], brands: Brand[]): WorkUnit[] {
  const units: WorkUnit[] = [];
  const videos: (Video & { brandName: string })[] = brands.flatMap(b => b.videos.map(v => ({ ...v, brandName: b.name })));
  const claimed = new Set<string>();

  for (const o of orders) {
    if (o.status === 'finalizado') continue;
    const own = videos.filter(v => v.orderId === o.id || (o.boardVideoId && v.id === o.boardVideoId));
    own.forEach(v => claimed.add(v.id));
    const count = Math.max(1, o.videoCount || 1);
    if (own.length === 0) {
      // Pedido aún sin videos en el tablero: toda la carga es de quien lo tiene asignado
      units.push({
        key: o.id, brand: o.brand, orderId: o.id, deliveryDate: o.deliveryDate || todayIso(), complexity: orderComplexity(o),
        clipperId: o.clipperId || null, editorId: o.editorId || null, clipRemaining: count, editRemaining: count,
      });
      continue;
    }
    // Con videos: cada persona carga SOLO con los suyos (un pedido puede estar repartido entre varias)
    const byOwner = new Map<string, Video[]>();
    for (const v of own) {
      const owner = v.clipperId || v.editorId || o.clipperId || '';
      byOwner.set(owner, [...(byOwner.get(owner) || []), v]);
    }
    const multi = byOwner.size > 1;
    byOwner.forEach((vs, owner) => {
      const clipRemaining = vs.filter(needsClipping).length;
      const editRemaining = vs.filter(needsEditing).length;
      if (clipRemaining === 0 && editRemaining === 0) return;
      units.push({
        key: multi ? `${o.id}::${owner || 'sin'}` : o.id,
        brand: o.brand,
        orderId: o.id,
        deliveryDate: o.deliveryDate || todayIso(),
        complexity: orderComplexity(o),
        clipperId: owner || null,
        editorId: owner || null,
        clipRemaining,
        editRemaining,
      });
    });
  }

  // Videos sin pedido vinculado (históricos): cada uno es su propia unidad
  for (const v of videos) {
    if (claimed.has(v.id)) continue;
    const clip = needsClipping(v) ? 1 : 0;
    const edit = needsEditing(v) ? 1 : 0;
    if (!clip && !edit) continue;
    units.push({
      key: v.id,
      brand: v.brandName,
      orderId: v.orderId || null,
      deliveryDate: v.date || todayIso(),
      complexity: v.corrections.length > 0 || v.durationSeconds > 60 ? 'alta' : 'estandar',
      clipperId: v.clipperId || null,
      editorId: v.editorId || null,
      clipRemaining: clip,
      editRemaining: edit,
    });
  }
  return units;
}

function daysUntil(dateIso: string): number {
  const today = new Date(`${todayIso()}T12:00:00`).getTime();
  const target = new Date(`${dateIso}T12:00:00`).getTime();
  if (!Number.isFinite(target)) return 0;
  return Math.round((target - today) / 86400000);
}

/** Reparte el trabajo pendiente en los días hasta la entrega (vencido o de hoy = todo hoy). */
export function spreadLoad(units: WorkUnit[], pick: (u: WorkUnit) => number): Record<string, number> {
  const map: Record<string, number> = {};
  const today = todayIso();
  for (const u of units) {
    const amount = pick(u) * COMPLEXITY_FACTOR[u.complexity];
    if (amount <= 0) continue;
    const span = Math.max(0, daysUntil(u.deliveryDate)) + 1;
    const perDay = amount / span;
    for (let i = 0; i < span; i++) {
      const d = addDaysIso(today, i);
      map[d] = (map[d] || 0) + perDay;
    }
  }
  return map;
}

export interface WorkerDayLoad {
  todayLoad: number;
  pendingTotal: number;
  simple: number;
  estandar: number;
  alta: number;
  brands: string[];
}

export function workerDayLoad(worker: Pick<Worker, 'id' | 'role'>, units: WorkUnit[]): WorkerDayLoad {
  // Rol único: cada video pendiente ocupa a la persona de principio a fin
  const mine = units.filter(u => u.clipperId === worker.id || u.editorId === worker.id);
  const pick = (u: WorkUnit) => u.editRemaining;
  const res: WorkerDayLoad = { todayLoad: 0, pendingTotal: 0, simple: 0, estandar: 0, alta: 0, brands: [] };
  for (const u of mine) {
    const n = pick(u);
    if (n <= 0) continue;
    res.pendingTotal += n;
    res[u.complexity] += n;
    if (!res.brands.includes(u.brand)) res.brands.push(u.brand);
  }
  // La carga de una persona = TODOS sus videos asignados que aún no termina (cada video cuenta uno, sin importar el proyecto)
  res.todayLoad = res.pendingTotal;
  return res;
}
