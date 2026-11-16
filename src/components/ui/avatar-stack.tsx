// Avatar Stack (21st.dev · "Avatares") adaptado a SENDA.
// Los perfiles no tienen foto: se usan iniciales con el color de marca.
import { cn } from '../../lib/utils';

export interface StackMember {
  id: string;
  name: string;
  online?: boolean;
}

export function initialsOf(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
}

export function AvatarStack({ members, max = 5, size = 32, className, onSelect }: {
  members: StackMember[];
  max?: number;
  size?: number;
  className?: string;
  onSelect?: (id: string) => void;
}) {
  const shown = members.slice(0, max);
  const rest = members.length - shown.length;
  return (
    <div className={cn('flex -space-x-2', className)}>
      {shown.map(m => (
        <button
          key={m.id}
          type="button"
          title={`${m.name}${m.online ? ' · en línea' : ''}`}
          onClick={() => onSelect?.(m.id)}
          className="relative rounded-full ring-2 ring-surface-2 bg-accent-dim text-accent font-tech font-bold flex items-center justify-center transition-transform duration-200 hover:-translate-y-1 hover:z-10"
          style={{ width: size, height: size, fontSize: size * 0.34 }}
        >
          {initialsOf(m.name)}
        </button>
      ))}
      {rest > 0 && (
        <span
          className="relative rounded-full ring-2 ring-surface-2 bg-surface-3 text-muted font-tech font-semibold flex items-center justify-center"
          style={{ width: size, height: size, fontSize: size * 0.32 }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

export default AvatarStack;
