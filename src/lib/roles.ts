// Roles de SENDA.
// Solo existen dos roles: Administrador y "Clipper · Asistente de edición" (un único rol de equipo
// que envía imagen de referencia, clips y video final). Internamente se guarda como 'clipper'
// para no romper la base de datos; los antiguos usuarios 'editor' se tratan como este mismo rol.
import type { Role } from '../types';

/** Nombre visible del rol de equipo. Cámbialo aquí y se actualiza en toda la plataforma. */
export const TEAM_ROLE_LABEL = 'Clipper · Asistente de edición';
export const TEAM_ROLE_SHORT = 'Clipper · Asist.';
export const TEAM_ROLE_PLURAL = 'Clippers · Asistentes';

export function normalizeRole(role: unknown): Role {
  return role === 'admin' ? 'admin' : 'clipper';
}

export function roleLabel(role: unknown): string {
  return role === 'admin' ? 'Administrador' : TEAM_ROLE_LABEL;
}

/** ¿Esta persona participa en el video (como clipper o como responsable de la edición)? */
export function isAssignedTo(v: { clipperId?: string | null; editorId?: string | null }, workerId: string): boolean {
  return v.clipperId === workerId || v.editorId === workerId;
}
