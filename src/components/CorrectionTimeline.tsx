import { useRef } from 'react';
import type { Correction } from '../types';

export function fmtTime(t: number) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function parseTime(input: string): number | null {
  const t = input.trim();
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.max(0, Math.round(Number(t)));
  const m = t.match(/^(\d{1,3}):([0-5]?\d)$/);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** Barra de tiempo: cabezal, marcas de corrección y punto seleccionado (admin, clipper y cliente). */
export function CorrectionTimeline({
  duration, currentTime, corrections, pickTime, onPick, onSeek, editable, markerClass,
}: {
  duration: number; currentTime: number; corrections: Correction[]; pickTime: number | null;
  onPick: (t: number) => void; onSeek: (t: number) => void; editable: boolean;
  /** Color opcional por marca (p. ej. puntos en borrador del cliente) */
  markerClass?: (c: Correction) => string | null;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const safeDur = Math.max(1, duration);
  const pctOf = (t: number) => `${Math.min(100, Math.max(0, (t / safeDur) * 100))}%`;
  const timeAt = (clientX: number) => {
    const el = trackRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * safeDur);
  };
  return (
    <div className="select-none">
      <div
        ref={trackRef}
        // Arrastrar la barra mueve el video en vivo (enlazado con la vista previa)
        onPointerDown={e => {
          if ((e.target as HTMLElement).closest('button')) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          draggingRef.current = true;
          const t = timeAt(e.clientX);
          if (editable) onPick(t);
          onSeek(t);
        }}
        onPointerMove={e => {
          if (!draggingRef.current) return;
          const t = timeAt(e.clientX);
          if (editable) onPick(t);
          onSeek(t);
        }}
        onPointerUp={e => { draggingRef.current = false; e.currentTarget.releasePointerCapture(e.pointerId); }}
        onPointerCancel={() => { draggingRef.current = false; }}
        className="relative h-9 flex items-center cursor-pointer group touch-none"
        title={editable ? 'Haz clic para marcar el momento exacto de la corrección' : 'Haz clic para saltar a ese momento'}
      >
        <div className="w-full h-1.5 bg-surface-3 border border-line rounded-full overflow-hidden">
          <div className="h-full bg-accent/40" style={{ width: pctOf(currentTime) }} />
        </div>
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-accent shadow-[0_0_10px_rgba(53,214,228,0.6)] pointer-events-none" style={{ left: pctOf(currentTime) }} />
        {corrections.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={e => { e.stopPropagation(); onSeek(c.time); }}
            title={`${fmtTime(c.time)} · ${c.text}`}
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1 h-6 rounded-full hover:w-1.5 hover:h-7 transition-all ${markerClass?.(c) || (c.resolved ? 'bg-mint' : 'bg-red-500')}`}
            style={{ left: pctOf(c.time) }}
          />
        ))}
        {editable && pickTime !== null && (
          <div className="absolute -top-1 -translate-x-1/2 flex flex-col items-center pointer-events-none animate-fadeIn" style={{ left: pctOf(pickTime) }}>
            <span className="text-[9px] font-tech font-bold bg-amber text-on-accent rounded px-1 leading-4">{fmtTime(pickTime)}</span>
            <span className="w-px h-5 bg-amber" />
          </div>
        )}
      </div>
      <div className="flex justify-between text-[10px] text-muted-2 font-tech">
        <span>0:00</span>
        <span>{fmtTime(currentTime)} / {fmtTime(safeDur)}</span>
      </div>
    </div>
  );
}
