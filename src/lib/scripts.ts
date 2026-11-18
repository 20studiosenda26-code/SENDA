import type { Order, OrderScript, ScriptReview } from '../types';

/** Huella corta del contenido de un guión (para saber si cambió desde que el cliente lo revisó) */
export function scriptHash(s: Pick<OrderScript, 'title' | 'text'>): string {
  const str = `${s.title}\n${s.text}`;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return String(h >>> 0);
}

/** Todos los guiones del proyecto, en orden: primero los de SENDA y luego los propios del cliente.
 *  El guión N corresponde al video N. */
export function allScripts(order: Pick<Order, 'scripts' | 'clientScripts'>): OrderScript[] {
  return [
    ...(order.scripts || []).map(s => ({ ...s, source: 'agencia' as const })),
    ...(order.clientScripts || []).map(s => ({ ...s, source: 'cliente' as const })),
  ];
}

/** Revisión vigente de un guión (si SENDA lo cambió después, ya no cuenta) */
export function reviewOf(order: Pick<Order, 'scriptReviews'>, script: OrderScript): ScriptReview | null {
  const r = (order.scriptReviews || []).find(x => x.scriptId === script.id);
  if (!r) return null;
  if (script.source !== 'cliente' && r.hash && r.hash !== scriptHash(script)) return null;
  return r;
}

export const REVIEW_LABEL: Record<ScriptReview['status'], string> = {
  approved: 'Aprobado',
  rejected: 'Rechazado',
  feedback: 'Con feedback',
};
