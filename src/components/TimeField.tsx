import { useEffect, useRef, useState } from 'react';
import { Clock, Minus, Plus } from 'lucide-react';
import { fmtTime } from './CorrectionTimeline';

/** Convierte lo que la persona escribe en segundos. Acepta de todo, sin pelear:
 *  "30" → 0:30 · "130" → 1:30 · "0:30" / "0.30" / "0,30" / "0 30" → 0:30 · "1.5" → 1:05 · "0.030" → 0:30 */
export function parseFriendlyTime(raw: string): number | null {
  const t = raw.trim().replace(/[^\d:.,\s]/g, '');
  if (!/\d/.test(t)) return null;
  const parts = t.split(/[:.,\s]+/).filter(Boolean);
  if (parts.length >= 2) {
    const m = Number(parts[0]);
    const s = Number(parts[1]);
    if (!Number.isFinite(m) || !Number.isFinite(s)) return null;
    return m * 60 + s;
  }
  // Solo números: estilo cronómetro, los dos últimos dígitos son los segundos
  const digits = parts[0];
  const n = Number(digits);
  if (!Number.isFinite(n)) return null;
  if (digits.length <= 2) return n;
  return Number(digits.slice(0, -2)) * 60 + Number(digits.slice(-2));
}

/** Control de tiempo amigable: se puede escribir como uno quiera, o ajustar con botones y flechas. */
export function TimeField({
  value, max, onChange, accent = 'amber', disabled,
}: {
  value: number;
  /** Duración del video (opcional): el tiempo no pasa de aquí */
  max?: number;
  onChange: (seconds: number) => void;
  accent?: 'amber' | 'accent';
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null); // null = mostrando el valor real
  const inputRef = useRef<HTMLInputElement>(null);
  const limit = max && Number.isFinite(max) && max > 0 ? Math.floor(max) : Infinity;
  const clamp = (s: number) => Math.min(limit, Math.max(0, Math.round(s)));

  // Cuando el valor cambia desde afuera (el video avanza, se arrastra la línea) y no se está escribiendo, se actualiza solo
  useEffect(() => { if (document.activeElement !== inputRef.current) setDraft(null); }, [value]);

  const commit = () => {
    if (draft !== null) {
      const parsed = parseFriendlyTime(draft);
      if (parsed !== null) onChange(clamp(parsed));
    }
    setDraft(null);
  };
  const step = (delta: number) => { setDraft(null); onChange(clamp(value + delta)); };

  const color = accent === 'amber' ? 'text-amber' : 'text-accent';
  const ring = accent === 'amber' ? 'focus-within:border-amber' : 'focus-within:border-accent';
  const btn = 'h-8 min-w-[30px] px-1.5 rounded-md text-[11px] font-tech font-semibold text-muted hover:text-text hover:bg-surface-3 active:scale-95 transition disabled:opacity-40';

  return (
    <div className={`inline-flex items-center gap-0.5 bg-surface-2 border border-line rounded-lg px-1 transition-colors ${ring}`}>
      <Clock size={13} className={`${color} mx-1 shrink-0`} />
      <button type="button" disabled={disabled} onClick={() => step(-5)} className={btn} title="Retroceder 5 segundos">−5</button>
      <button type="button" disabled={disabled} onClick={() => step(-1)} className={btn} title="Retroceder 1 segundo"><Minus size={12} className="mx-auto" /></button>
      <input
        ref={inputRef}
        value={draft ?? fmtTime(value)}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        onFocus={e => { setDraft(fmtTime(value)); requestAnimationFrame(() => e.target.select()); }}
        onChange={e => setDraft(e.target.value.replace(/[^\d:.,\s]/g, '').slice(0, 7))}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); commit(); inputRef.current?.blur(); }
          else if (e.key === 'Escape') { setDraft(null); inputRef.current?.blur(); }
          else if (e.key === 'ArrowUp') { e.preventDefault(); step(e.shiftKey ? 5 : 1); }
          else if (e.key === 'ArrowDown') { e.preventDefault(); step(e.shiftKey ? -5 : -1); }
        }}
        title="Escribe el tiempo como quieras: 30 → 0:30 · 130 → 1:30 · 0.30 → 0:30. Enter para ir ahí. Flechas ↑↓ ajustan 1 s."
        className={`w-14 text-center bg-transparent py-1.5 text-sm font-tech font-bold ${color} outline-none rounded-md focus:bg-surface-3`}
      />
      <button type="button" disabled={disabled} onClick={() => step(1)} className={btn} title="Avanzar 1 segundo"><Plus size={12} className="mx-auto" /></button>
      <button type="button" disabled={disabled} onClick={() => step(5)} className={btn} title="Avanzar 5 segundos">+5</button>
    </div>
  );
}
