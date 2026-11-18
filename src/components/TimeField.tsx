import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Clock } from 'lucide-react';
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

/** Control de tiempo amigable, como un reproductor:  ‹‹  ‹  0:30  ›  ››
 *  ‹ › mueven 1 segundo, ‹‹ ›› mueven 5 segundos (mantener presionado avanza seguido).
 *  También se puede escribir el tiempo como uno quiera. */
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
  const valueRef = useRef(value);
  valueRef.current = value;
  const timers = useRef<{ wait?: number; repeat?: number }>({});
  const limit = max && Number.isFinite(max) && max > 0 ? Math.floor(max) : Infinity;
  const clamp = (s: number) => Math.min(limit, Math.max(0, Math.round(s)));

  // Cuando el valor cambia desde afuera (el video avanza, se arrastra la línea) y no se está escribiendo, se actualiza solo
  useEffect(() => { if (document.activeElement !== inputRef.current) setDraft(null); }, [value]);

  const stopHold = () => {
    window.clearTimeout(timers.current.wait);
    window.clearInterval(timers.current.repeat);
  };
  useEffect(() => {
    // Seguro: si se suelta el botón fuera del control, el avance se detiene
    window.addEventListener('pointerup', stopHold);
    return () => { window.removeEventListener('pointerup', stopHold); stopHold(); };
  }, []);

  const step = (delta: number) => {
    setDraft(null);
    const next = clamp(valueRef.current + delta);
    valueRef.current = next;
    onChange(next);
  };
  const startHold = (delta: number) => {
    stopHold();
    step(delta);
    timers.current.wait = window.setTimeout(() => {
      timers.current.repeat = window.setInterval(() => step(delta), 90);
    }, 380);
  };

  const commit = () => {
    if (draft !== null) {
      const parsed = parseFriendlyTime(draft);
      if (parsed !== null) onChange(clamp(parsed));
    }
    setDraft(null);
  };

  const color = accent === 'amber' ? 'text-amber' : 'text-accent';
  const ring = accent === 'amber' ? 'focus-within:border-amber' : 'focus-within:border-accent';

  // Función (no componente) para que los botones no se recreen en cada actualización
  const arrow = (delta: number, label: string, icon: React.ReactNode) => (
    <button
      type="button"
      disabled={disabled}
      aria-label={label}
      title={label}
      onPointerDown={e => { e.preventDefault(); startHold(delta); }}
      onPointerUp={stopHold}
      onPointerLeave={stopHold}
      onPointerCancel={stopHold}
      // Con teclado (Enter / Espacio) el clic llega sin puntero
      onClick={e => { if (e.detail === 0) step(delta); }}
      className="h-8 w-7 rounded-md flex items-center justify-center text-muted-2 hover:text-text hover:bg-surface-3 active:scale-90 transition disabled:opacity-40"
    >
      {icon}
    </button>
  );

  return (
    <div className="relative group inline-block">
      <div className={`inline-flex items-center bg-surface-2 border border-line rounded-lg px-1 transition-colors ${ring}`}>
        <Clock size={13} className={`${color} mx-1.5 shrink-0`} />
        {arrow(-5, 'Retroceder 5 segundos', <ChevronsLeft size={15} />)}
        {arrow(-1, 'Retroceder 1 segundo', <ChevronLeft size={15} />)}
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
          aria-label="Minuto y segundo"
          className={`w-14 text-center bg-transparent py-1.5 text-sm font-tech font-bold ${color} outline-none rounded-md focus:bg-surface-3`}
        />
        {arrow(1, 'Avanzar 1 segundo', <ChevronRight size={15} />)}
        {arrow(5, 'Avanzar 5 segundos', <ChevronsRight size={15} />)}
      </div>
      {/* Pista: solo aparece al pasar el mouse o escribir */}
      <div className="pointer-events-none absolute left-0 top-full mt-1.5 z-20 whitespace-nowrap rounded-lg border border-line bg-surface-3 px-2.5 py-1.5 text-[10px] leading-relaxed text-muted opacity-0 translate-y-0.5 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:translate-y-0 transition-all duration-150 shadow-lg">
        <span className="font-tech text-text">‹ ›</span> 1 segundo · <span className="font-tech text-text">‹‹ ››</span> 5 segundos
        <br />Escribe <span className="font-tech text-text">30</span> o <span className="font-tech text-text">1.05</span> y pulsa Enter
      </div>
    </div>
  );
}
