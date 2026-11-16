// Number Ticker (21st.dev · "Money Flow") adaptado a SENDA.
// Las cifras ruedan suavemente cuando cambian. Formato: $ con miles en español,
// centavos solo cuando hacen falta ($5 · $2,50).
import NumberFlow from '@number-flow/react';
import { cn } from '../../lib/utils';

type MoneyTickerProps = {
  value: number;
  className?: string;
  /** Fuerza los decimales; por defecto se muestran solo si el valor tiene centavos */
  decimals?: number;
};

export default function NumberTicker({ value, className, decimals }: MoneyTickerProps) {
  const safe = Number.isFinite(value) ? value : 0;
  const hasCents = Math.abs(safe % 1) > 0.001;
  const digits = decimals ?? (hasCents ? 2 : 0);
  return (
    // El signo va en el prefijo para que se lea "-$20" y no "$-20"
    <NumberFlow
      value={Math.abs(safe)}
      locales="es-CO"
      prefix={safe < 0 ? '-$' : '$'}
      format={{ minimumFractionDigits: digits, maximumFractionDigits: digits }}
      className={cn('tabular-nums', className)}
    />
  );
}

/** Contador animado para cantidades (videos, pendientes, personas). */
export function CountTicker({ value, className }: { value: number; className?: string }) {
  return <NumberFlow value={Number.isFinite(value) ? value : 0} locales="es-CO" className={cn('tabular-nums', className)} />;
}
