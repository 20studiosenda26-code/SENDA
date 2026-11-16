// Flujo de producción de cada video (fuente única para Admin, Clipper · Asistente e Inicio).
//
// Orden real del trabajo:
//   1. Imagen principal (la sube el equipo, la aprueba el admin)
//   2. Clips (los sube el equipo, el admin los acepta o rechaza)
//   3. Video final (solo cuando todos los clips están aprobados; el admin lo aprueba → "Aprobado Senda")
//   4. Cliente revisa: aprueba ("Aprobado Cliente") o deja feedback → correcciones
import type { Video } from '../types';

export const latestFinalOf = (v: Video) => v.finalVideos[v.finalVideos.length - 1];

const done = (v: Video) => v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente' || v.qc === 'aprobado';

// ---------------------------------------------------------------------------
// Siguiente paso, visto por la persona responsable
// ---------------------------------------------------------------------------
export type WorkerStep =
  | 'subir_imagen' | 'subir_clips' | 'reemplazar_clips' | 'subir_final' | 'corregir'
  | 'revision_senda' | 'esperando_cliente' | 'listo';

export const WORKER_STEP_TEXT: Record<WorkerStep, string> = {
  subir_imagen: 'Sube la imagen principal',
  subir_clips: 'Sube y envía los clips',
  reemplazar_clips: 'Reemplaza los clips rechazados',
  subir_final: 'Sube el video final',
  corregir: 'Aplica las correcciones',
  revision_senda: 'En revisión de SENDA',
  esperando_cliente: 'Esperando aprobación del cliente',
  listo: 'Aprobado por el cliente',
};

export function workerStep(v: Video): WorkerStep {
  if (v.qc === 'aprobado_cliente') return 'listo';
  if (done(v)) return 'esperando_cliente';
  const final = latestFinalOf(v);
  if (final?.status === 'rejected') return 'corregir';
  if (v.qc === 'correcciones' && v.corrections.some(c => !c.resolved)) return 'corregir';
  if (final?.fileUrl && (!final.status || final.status === 'pending')) return 'revision_senda';
  if (v.clips.length > 0 && v.clips.every(c => c.status === 'approved')) return 'subir_final';
  if (v.clips.some(c => c.status === 'rejected')) return 'reemplazar_clips';
  if (v.mainImageStatus === 'pendiente') return 'revision_senda';
  if (v.mainImageStatus !== 'aprobada') return 'subir_imagen';
  if (v.sentByClipper && v.clips.some(c => c.fileUrl && (!c.status || c.status === 'pending'))) return 'revision_senda';
  return 'subir_clips';
}

// ---------------------------------------------------------------------------
// Etapa en el tablero del administrador (columnas del kanban)
// ---------------------------------------------------------------------------
export type BoardStage = 'imagen' | 'clips' | 'final' | 'correcciones' | 'cliente' | 'listo';

export const BOARD_STAGES: { key: BoardStage; label: string; hint: string }[] = [
  { key: 'imagen', label: 'Imagen principal', hint: 'Primer paso de cada video' },
  { key: 'clips', label: 'Clips', hint: 'Subida y revisión de clips' },
  { key: 'final', label: 'Video final', hint: 'Edición y revisión del final' },
  { key: 'correcciones', label: 'Correcciones', hint: 'Del admin o del cliente' },
  { key: 'cliente', label: 'Con el cliente', hint: 'Aprobado Senda · esperando cliente' },
  { key: 'listo', label: 'Aprobado cliente', hint: 'Video terminado' },
];

export function boardStage(v: Video): BoardStage {
  if (v.qc === 'aprobado_cliente') return 'listo';
  if (done(v)) return 'cliente';
  const step = workerStep(v);
  if (step === 'corregir') return 'correcciones';
  const final = latestFinalOf(v);
  if (final?.fileUrl || step === 'subir_final') return 'final';
  if (v.mainImageStatus === 'aprobada') return 'clips';
  return 'imagen';
}

/** ¿El video está esperando una acción del administrador? (y cuál) */
export function adminTurn(v: Video): string | null {
  if (done(v)) return null;
  const final = latestFinalOf(v);
  if (final?.fileUrl && (!final.status || final.status === 'pending')) return 'Revisar video final';
  if (v.clips.some(c => c.fileUrl && (!c.status || c.status === 'pending'))) return 'Revisar clips';
  if (v.mainImageStatus === 'pendiente') return 'Aprobar imagen';
  return null;
}
