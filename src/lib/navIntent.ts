// Navegación con destino exacto entre secciones.
// Permite que un botón (por ejemplo en Inicio) abra otra vista directamente en una
// pestaña, carpeta o conversación concreta, sin tocar el store global.
// La vista destino lee el destino UNA sola vez al montarse (takeNavIntent).
import type { ViewKey } from '../types';

let pending: { view: ViewKey; target: string } | null = null;

export function setNavIntent(view: ViewKey, target: string): void {
  pending = { view, target };
}

/** Devuelve el destino pendiente para esta vista (y lo consume), o null. */
export function takeNavIntent(view: ViewKey): string | null {
  if (!pending || pending.view !== view) return null;
  const target = pending.target;
  pending = null;
  return target;
}
