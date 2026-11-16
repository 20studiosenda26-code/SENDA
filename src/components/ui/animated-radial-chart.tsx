// Animated Radial Chart (21st.dev) adaptado a SENDA.
// Medio círculo que se llena animado hasta el valor. Degradado cian → mint de marca
// (ámbar → rojo cuando se pasa del umbral de alerta). Funciona en oscuro y claro.
import { animate, motion, useMotionValue, useTransform } from 'framer-motion';
import { useEffect, useId } from 'react';
import { cn } from '../../lib/utils';

interface AnimatedRadialChartProps {
  /** 0 a 100 */
  value?: number;
  size?: number;
  strokeWidth?: number;
  className?: string;
  showLabels?: boolean;
  duration?: number;
  /** Texto pequeño bajo el porcentaje */
  caption?: string;
  /** Desde este % el arco cambia a colores de alerta */
  warnAt?: number;
}

export function AnimatedRadialChart({
  value = 0,
  size = 240,
  strokeWidth: customStrokeWidth,
  className,
  showLabels = true,
  duration = 1.6,
  caption,
  warnAt = 90,
}: AnimatedRadialChartProps) {
  const uid = useId().replace(/:/g, '');
  const target = Math.min(100, Math.max(0, Number(value) || 0));
  const warn = target >= warnAt;

  const strokeWidth = customStrokeWidth ?? Math.max(12, size * 0.06);
  const radius = size * 0.38;
  const center = size / 2;
  const circumference = Math.PI * radius;
  const innerLineRadius = radius - strokeWidth - 4;
  const innerRadius = radius - strokeWidth / 2;
  const height = size * 0.62;

  const animatedValue = useMotionValue(0);
  const offset = useTransform(animatedValue, [0, 100], [circumference, 0]);
  const progressAngle = useTransform(animatedValue, [0, 100], [-Math.PI, 0]);
  const x1 = useTransform(progressAngle, a => center + Math.cos(a) * innerRadius);
  const y1 = useTransform(progressAngle, a => center + Math.sin(a) * innerRadius);
  const x2 = useTransform(progressAngle, a => center + Math.cos(a) * innerRadius - Math.cos(a) * 26);
  const y2 = useTransform(progressAngle, a => center + Math.sin(a) * innerRadius - Math.sin(a) * 26);
  const rounded = useTransform(animatedValue, v => Math.round(v));

  useEffect(() => {
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const controls = animate(animatedValue, target, { duration: reduce ? 0 : duration, ease: 'easeOut' });
    return controls.stop;
  }, [target, animatedValue, duration]);

  const fontSize = Math.max(18, size * 0.13);
  const labelFontSize = Math.max(10, size * 0.045);
  const arc = (r: number) => `M ${center - r} ${center} A ${r} ${r} 0 0 1 ${center + r} ${center}`;

  return (
    <div className={cn('relative', className)} style={{ width: size, height }}>
      <svg width={size} height={height} viewBox={`0 0 ${size} ${height}`} className="overflow-visible">
        <defs>
          <linearGradient id={`track-${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" style={{ stopColor: 'var(--surface-3)' }} />
            <stop offset="100%" style={{ stopColor: 'var(--line)' }} />
          </linearGradient>
          <linearGradient id={`progress-${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" style={{ stopColor: warn ? 'var(--amber)' : 'var(--accent-strong)' }} />
            <stop offset="100%" style={{ stopColor: warn ? '#f87171' : 'var(--mint)' }} />
          </linearGradient>
          <filter id={`glow-${uid}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <path d={arc(innerLineRadius)} fill="none" style={{ stroke: 'var(--muted-2)' }} strokeWidth="1" strokeDasharray="2 4" opacity="0.6" />
        <path d={arc(radius)} fill="none" stroke={`url(#track-${uid})`} strokeWidth={strokeWidth} strokeLinecap="round" />
        <motion.path
          d={arc(radius)}
          fill="none"
          stroke={`url(#progress-${uid})`}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          style={{ strokeDashoffset: offset }}
          filter={`url(#glow-${uid})`}
        />
        <motion.line x1={x1} y1={y1} x2={x2} y2={y2} style={{ stroke: 'var(--muted)' }} strokeWidth="1" />
      </svg>

      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center" style={{ top: center - fontSize * 0.9 }}>
        <motion.div
          className="font-display font-bold tracking-tight text-text leading-none"
          style={{ fontSize }}
          initial={{ opacity: 0, scale: 0.6 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.45, delay: duration * 0.4 }}
        >
          <motion.span>{rounded}</motion.span>
          <span className="text-muted" style={{ fontSize: fontSize * 0.55 }}>%</span>
        </motion.div>
        {caption && <p className="text-[11px] text-muted-2 mt-1 text-center">{caption}</p>}
      </div>

      {showLabels && (
        <>
          <span className="absolute text-muted-2 font-tech" style={{ fontSize: labelFontSize, left: center - radius - strokeWidth / 2, top: center + strokeWidth / 2 + 2 }}>0%</span>
          <span className="absolute text-muted-2 font-tech" style={{ fontSize: labelFontSize, left: center + radius - strokeWidth, top: center + strokeWidth / 2 + 2 }}>100%</span>
        </>
      )}
    </div>
  );
}

export default AnimatedRadialChart;
