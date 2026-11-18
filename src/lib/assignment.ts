// Reparto de los videos de un proyecto entre varias personas.
// Se puede dar TODO el proyecto a una persona, o 1, 2, 3… videos a cada una (sin límite).
// Lo ya aprobado (Aprobado Senda / pagado) se queda con quien lo hizo y no se mueve.
import type { Video } from '../types';

export interface Slot {
  /** Posición (0 = Video 1) */
  index: number;
  videoId: string | null;
  owner: string | null;
  /** Ya aprobado o pagado: no se puede mover */
  frozen: boolean;
  /** Para mostrar: "Video 3" */
  label: string;
  qc?: string;
}

export interface Allocation {
  workerId: string;
  count: number;
}

export const isFrozenVideo = (v: Pick<Video, 'qc' | 'paid50'>) => v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente' || Boolean(v.paid50);

/** Un cupo por video del proyecto, con quién lo tiene hoy (si ya existe en el tablero). */
export function buildSlots(videoCount: number, videos: Video[]): Slot[] {
  const total = Math.max(1, Math.floor(videoCount) || 1);
  const byNumber = new Map<number, Video>();
  const sorted = videos.slice().sort((a, b) => (a.videoNumber || 0) - (b.videoNumber || 0));
  sorted.forEach((v, i) => byNumber.set(v.videoNumber || i + 1, v));
  return Array.from({ length: total }, (_, i) => {
    const v = byNumber.get(i + 1) || null;
    return {
      index: i,
      videoId: v?.id ?? null,
      owner: v ? (v.clipperId || v.editorId || null) : null,
      frozen: v ? isFrozenVideo(v) : false,
      label: `Video ${i + 1}`,
      qc: v?.qc,
    };
  });
}

/** Cuántos videos se pueden mover (los no aprobados). */
export const movableCount = (slots: Slot[]) => slots.filter(s => !s.frozen).length;

/** Reparto actual por persona (solo videos movibles). */
export function currentAllocation(slots: Slot[]): Allocation[] {
  const m = new Map<string, number>();
  for (const s of slots) if (!s.frozen && s.owner) m.set(s.owner, (m.get(s.owner) || 0) + 1);
  return Array.from(m, ([workerId, count]) => ({ workerId, count }));
}

/**
 * Convierte "a cada persona X videos" en "el video N va con tal persona", moviendo lo menos posible:
 * primero cada persona conserva los videos que ya tenía (hasta su cantidad nueva) y luego se llenan los huecos.
 * Los videos congelados conservan a su dueño. Devuelve, por cupo, la persona asignada.
 */
export function distribute(slots: Slot[], alloc: Allocation[]): (string | null)[] {
  const remaining = new Map<string, number>();
  for (const a of alloc) if (a.count > 0) remaining.set(a.workerId, (remaining.get(a.workerId) || 0) + a.count);
  const result: (string | null)[] = slots.map(s => (s.frozen ? s.owner : null));

  // 1) conservar lo que cada persona ya tenía
  slots.forEach((s, i) => {
    if (s.frozen || !s.owner) return;
    const left = remaining.get(s.owner) || 0;
    if (left > 0) { result[i] = s.owner; remaining.set(s.owner, left - 1); }
  });
  // 2) llenar los huecos en el orden en que se eligieron las personas
  const queue = alloc.filter(a => a.count > 0).map(a => a.workerId);
  slots.forEach((s, i) => {
    if (s.frozen || result[i]) return;
    const w = queue.find(id => (remaining.get(id) || 0) > 0);
    if (w) { result[i] = w; remaining.set(w, (remaining.get(w) || 0) - 1); }
  });
  return result;
}

/** Persona con más videos (la "responsable principal" del pedido para lo que aún lee un solo responsable). */
export function primaryWorker(owners: (string | null)[]): string | null {
  const m = new Map<string, number>();
  owners.forEach(o => { if (o) m.set(o, (m.get(o) || 0) + 1); });
  let best: string | null = null; let n = 0;
  m.forEach((c, id) => { if (c > n) { n = c; best = id; } });
  return best;
}
