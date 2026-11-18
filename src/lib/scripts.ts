import type { Order, OrderScript, ScriptChoice, ScriptReview } from '../types';

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

// ---------------------------------------------------------------------------
// Un avatar por video (obligatorio). El video N usa la elección "v{N}".
// ---------------------------------------------------------------------------

export const slotKey = (index: number) => `v${index + 1}`;
export const videoSlots = (order: Pick<Order, 'videoCount'>) => Math.max(1, Math.floor(Number(order.videoCount) || 1));

const hasAvatar = (c?: Pick<ScriptChoice, 'avatarId' | 'avatarCustomText' | 'avatarRefUrl'> | null) =>
  Boolean(c && (c.avatarId || c.avatarCustomText?.trim() || c.avatarRefUrl));

/** Elección del video número index+1 (compatible con datos guardados por guión y con el avatar único antiguo) */
export function choiceForSlot(order: Order, index: number): ScriptChoice | null {
  const choices = order.scriptChoices || [];
  const direct = choices.find(c => c.scriptId === slotKey(index));
  if (direct) return direct;
  const script = allScripts(order)[index];
  const byScript = script ? choices.find(c => c.scriptId === script.id) : undefined;
  if (byScript) return byScript;
  if (index === 0 && order.avatarId !== undefined && (order.avatarId || order.avatarCustomText || order.avatarRefUrl)) {
    return {
      scriptId: slotKey(0), avatarId: order.avatarId, avatarName: order.avatarName, avatarImageUrl: order.avatarImageUrl,
      avatarCustomText: order.avatarCustomText, avatarRefUrl: order.avatarRefUrl, styleId: order.editingStyleId, styleName: order.editingStyleName,
    };
  }
  return null;
}

/** ¿El brief permite empezar a producir? Debe estar confirmado y con un avatar por cada video. */
export function briefReadiness(order: Order): { ready: boolean; total: number; chosen: number; confirmed: boolean; reason: string } {
  const total = videoSlots(order);
  let chosen = 0;
  for (let i = 0; i < total; i++) if (hasAvatar(choiceForSlot(order, i))) chosen++;
  const confirmed = Boolean(order.briefConfirmedAt);
  const ready = confirmed && chosen === total;
  const reason = !confirmed
    ? 'El cliente todavía no confirmó su brief.'
    : chosen < total ? `Faltan avatares: tiene ${chosen} de ${total}.` : '';
  return { ready, total, chosen, confirmed, reason };
}
