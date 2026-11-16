// Glow Card (21st.dev · "Spotlight Card" + tarjetas del "Tech Stack Bento") adaptada a SENDA.
// - El borde se ilumina y un foco de luz sigue al cursor dentro de la tarjeta.
// - Una cuadrícula tenue aparece solo alrededor del cursor (look "estudio creativo").
// - Usa los colores de marca (cian por defecto) y funciona en modo oscuro y claro.
// - Rendimiento: la posición del cursor se guarda en variables CSS, sin volver a renderizar React.
import { useRef, type CSSProperties, type PointerEvent, type ReactNode } from 'react';
import { cn } from '../../lib/utils';

export type GlowTone = 'accent' | 'mint' | 'amber' | 'violet' | 'red';

const TONE_VAR: Record<GlowTone, string> = {
  accent: 'var(--accent)',
  mint: 'var(--mint)',
  amber: 'var(--amber)',
  violet: 'var(--violet)',
  red: '#f87171',
};

interface GlowCardProps {
  children: ReactNode;
  className?: string;
  /** Clases del contenido interno (padding, layout) */
  contentClassName?: string;
  tone?: GlowTone;
  /** Tamaño del foco de luz en px */
  spotlight?: number;
}

export function GlowCard({ children, className, contentClassName, tone = 'accent', spotlight = 380 }: GlowCardProps) {
  const ref = useRef<HTMLDivElement>(null);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    el.style.setProperty('--gx', `${e.clientX - r.left}px`);
    el.style.setProperty('--gy', `${e.clientY - r.top}px`);
  };

  const style = {
    '--tone': TONE_VAR[tone],
    '--spot': `${spotlight}px`,
  } as CSSProperties;

  const gridMask = 'radial-gradient(220px circle at var(--gx, 50%) var(--gy, 50%), black, transparent 75%)';

  return (
    <div
      ref={ref}
      onPointerMove={onPointerMove}
      style={style}
      className={cn('group/glow relative isolate rounded-xl border border-line bg-surface-2', className)}
    >
      {/* Foco de luz que sigue al cursor */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover/glow:opacity-100"
        style={{ background: 'radial-gradient(var(--spot) circle at var(--gx, 50%) var(--gy, 50%), color-mix(in srgb, var(--tone) 11%, transparent), transparent 65%)' }}
      />
      {/* Cuadrícula tenue alrededor del cursor */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 rounded-[inherit] opacity-0 transition-opacity duration-500 group-hover/glow:opacity-100"
        style={{
          backgroundImage:
            'linear-gradient(color-mix(in srgb, var(--text) 7%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--text) 7%, transparent) 1px, transparent 1px)',
          backgroundSize: '26px 26px',
          maskImage: gridMask,
          WebkitMaskImage: gridMask,
        }}
      />
      {/* Borde que se enciende cerca del cursor */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-px rounded-[inherit] p-px opacity-0 transition-opacity duration-500 group-hover/glow:opacity-100"
        style={{
          background: 'radial-gradient(240px circle at var(--gx, 50%) var(--gy, 50%), color-mix(in srgb, var(--tone) 85%, transparent), transparent 70%)',
          WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
          WebkitMaskComposite: 'xor',
          mask: 'linear-gradient(#000 0 0) content-box exclude, linear-gradient(#000 0 0)',
        }}
      />
      <div className={cn('relative h-full', contentClassName)}>{children}</div>
    </div>
  );
}

export default GlowCard;
