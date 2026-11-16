// Rueda del equipo (pedido para SENDA).
// Las personas giran lentamente alrededor de un núcleo que muestra cuántas están en línea.
// Cada avatar lleva un circulito: cian (azul de marca) = activo · gris = desconectado.
// El giro se pausa al pasar el mouse para poder hacer clic con calma.
import type { CSSProperties } from 'react';
import { cn } from '../../lib/utils';
import { initialsOf, type StackMember } from './avatar-stack';

interface TeamOrbitProps {
  members: StackMember[];
  size?: number;
  className?: string;
  onSelect?: (id: string) => void;
  /** Segundos por vuelta */
  speed?: number;
}

export function TeamOrbit({ members, size = 280, className, onSelect, speed = 90 }: TeamOrbitProps) {
  // Activos primero para que queden repartidos de forma visible en el anillo exterior
  const ordered = [...members].sort((a, b) => Number(Boolean(b.online)) - Number(Boolean(a.online)));
  const outerCap = ordered.length > 10 ? 10 : ordered.length;
  const rings = [
    { list: ordered.slice(0, outerCap), radius: size * 0.41 },
    { list: ordered.slice(outerCap, outerCap + 8), radius: size * 0.25 },
  ].filter(r => r.list.length > 0);
  const hidden = Math.max(0, ordered.length - outerCap - 8);
  const online = members.filter(m => m.online).length;
  const avatar = Math.round(Math.max(30, Math.min(42, size * 0.14)));
  const center = size / 2;

  return (
    <div className={cn('senda-orbit-wrap relative mx-auto select-none', className)} style={{ width: size, height: size }}>
      {/* Anillos decorativos */}
      <div aria-hidden="true" className="absolute inset-[9%] rounded-full border border-dashed border-muted-2/50" />
      {rings.length > 1 && <div aria-hidden="true" className="absolute inset-[25%] rounded-full border border-dashed border-muted-2/30" />}
      <div aria-hidden="true" className="absolute inset-[34%] rounded-full bg-accent/5 blur-xl" />

      {/* Núcleo */}
      <div className="absolute inset-[36%] rounded-full bg-surface-3 border border-line flex flex-col items-center justify-center text-center shadow-[0_0_30px_-10px_rgba(53,214,228,0.45)]">
        <p className="font-display font-bold leading-none text-text" style={{ fontSize: size * 0.1 }}>
          {online}<span className="text-muted-2" style={{ fontSize: size * 0.06 }}>/{members.length}</span>
        </p>
        <p className="text-[10px] text-muted mt-1 flex items-center gap-1">
          <span className={cn('w-1.5 h-1.5 rounded-full', online > 0 ? 'bg-accent animate-pulse' : 'bg-muted-2')} />
          en línea
        </p>
      </div>

      {/* Personas girando */}
      {rings.map((ring, ri) => (
        <div
          key={ri}
          className="senda-orbit absolute inset-0"
          style={{ '--orbit-speed': `${speed + ri * 30}s`, animationDirection: ri % 2 ? 'reverse' : 'normal' } as CSSProperties}
        >
          {ring.list.map((m, i) => {
            const angle = (i / ring.list.length) * Math.PI * 2 - Math.PI / 2;
            const left = center + Math.cos(angle) * ring.radius - avatar / 2;
            const top = center + Math.sin(angle) * ring.radius - avatar / 2;
            return (
              <div key={m.id} className="absolute" style={{ left, top, width: avatar, height: avatar }}>
                <div
                  className="senda-orbit h-full w-full"
                  style={{ '--orbit-speed': `${speed + ri * 30}s`, animationDirection: ri % 2 ? 'normal' : 'reverse' } as CSSProperties}
                >
                  <button
                    type="button"
                    onClick={() => onSelect?.(m.id)}
                    title={`${m.name} · ${m.online ? 'Activo' : 'Desconectado'}`}
                    aria-label={`${m.name}, ${m.online ? 'activo' : 'desconectado'}`}
                    className={cn(
                      'relative h-full w-full rounded-full font-tech font-bold flex items-center justify-center ring-2 transition-transform duration-200 hover:scale-110 focus-visible:outline-none focus-visible:ring-accent',
                      m.online
                        ? 'bg-accent-dim text-accent ring-accent/60 shadow-[0_0_14px_-2px_rgba(53,214,228,0.55)]'
                        : 'bg-surface-3 text-muted ring-line grayscale'
                    )}
                    style={{ fontSize: avatar * 0.32 }}
                  >
                    {initialsOf(m.name)}
                    <span
                      className={cn(
                        'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-surface-2',
                        m.online ? 'bg-accent' : 'bg-muted-2'
                      )}
                      style={{ width: avatar * 0.3, height: avatar * 0.3 }}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {hidden > 0 && (
        <span className="absolute bottom-0 right-0 text-[10px] font-tech px-2 py-0.5 rounded-full bg-surface-3 border border-line text-muted">+{hidden}</span>
      )}
    </div>
  );
}

export default TeamOrbit;
