import type { Video } from '../types';

/**
 * Cuando el estado de QC de un video es "pendiente", este texto indica de
 * qué lado está esperando: si el Clipper todavía no mandó (o no terminó de
 * mandar) los clips, es "(Clips)"; si los clips ya llegaron y lo que falta
 * es el video final del Editor, es "(Edición)".
 */
export function pendingRoleSuffix(video: Pick<Video, 'clips' | 'sentByClipper'>): string {
  const clipsListos = video.sentByClipper && video.clips.length > 0;
  return clipsListos ? '(Edición)' : '(Clips)';
}

/** Etiqueta legible para un estado de QC. Si es "pendiente", agrega de quién está pendiente (Clipper o Editor). */
export function qcStatusLabel(qc: string, video: Pick<Video, 'clips' | 'sentByClipper'>): string {
  const base = qc.replace(/_/g, ' ');
  if (qc === 'pendiente') return `${base} ${pendingRoleSuffix(video)}`;
  return base;
}
