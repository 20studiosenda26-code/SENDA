// Piezas compartidas de los Inicios (Admin, Clipper · Asistente y Cliente).
// Mismo lenguaje visual en toda SENDA: tarjetas de acción, listas de videos, paneles, estados vacíos.
import { useEffect, type ReactNode } from 'react';
import { ArrowRight, CheckCircle2, ChevronRight, Users, X } from 'lucide-react';
import { CountTicker } from '../ui/number-ticker';
import type { VideoWithBrand } from '../../lib/economics';
import type { Video } from '../../types';

export function deadlineMs(date?: string | null, time?: string | null): number {
  if (!date) return Number.NaN;
  return new Date(`${date}T${time || '23:59'}`).getTime();
}

export function countdownLabel(ms: number): string {
  if (!Number.isFinite(ms)) return 'Sin fecha';
  const diff = ms - Date.now();
  const abs = Math.abs(diff);
  const mins = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const span = mins < 60 ? `${mins} min` : hours < 24 ? `${hours} h` : `${days} ${days === 1 ? 'día' : 'días'}`;
  return diff < 0 ? `Vencido hace ${span}` : `Vence en ${span}`;
}

export function fmtDate(date?: string | null, time?: string | null): string {
  if (!date) return 'Sin fecha';
  const d = new Date(`${date}T12:00:00`);
  if (Number.isNaN(d.getTime())) return date;
  const label = d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  return time ? `${label} · ${time}` : label;
}

export const latestFinal = (v: Video) => v.finalVideos[v.finalVideos.length - 1];

export type Tone = 'accent' | 'amber' | 'red';

export const TONE: Record<Tone, { icon: string; ring: string; num: string }> = {
  accent: { icon: 'bg-accent-dim text-accent', ring: 'hover:border-accent/50', num: 'text-text' },
  amber: { icon: 'bg-amber-dim text-amber', ring: 'hover:border-amber/50', num: 'text-amber' },
  red: { icon: 'bg-red-500/10 text-red-400', ring: 'hover:border-red-500/50', num: 'text-red-400' },
};

export function AttentionTile({ label, hint, icon, tone, count, onClick }: { label: string; hint: string; icon: ReactNode; tone: Tone; count: number; onClick: () => void }) {
  const t = TONE[tone];
  const idle = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={idle}
      className={`relative text-left p-3.5 rounded-xl border transition-all duration-150 ${
        idle
          ? 'bg-surface-3/40 border-line/60 cursor-default'
          : `bg-surface-3 border-line ${t.ring} hover:-translate-y-0.5`
      }`}
    >
      {!idle && tone === 'red' && <span className="absolute top-3 right-3 w-2 h-2 rounded-full bg-red-400 animate-pulse" />}
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2.5 ${idle ? 'bg-surface-2 text-muted-2' : t.icon}`}>
        {idle ? <CheckCircle2 size={17} /> : icon}
      </div>
      <p className={`font-display text-2xl font-bold leading-none ${idle ? 'text-muted-2' : t.num}`}><CountTicker value={count} /></p>
      <p className={`text-xs font-medium mt-1.5 ${idle ? 'text-muted-2' : 'text-text'}`}>{label}</p>
      <p className="text-[10px] text-muted-2 mt-0.5 leading-snug">{idle ? 'Al día' : hint}</p>
    </button>
  );
}

export function FollowUpRow({ icon, label, count, onClick }: { icon: ReactNode; label: string; count: number; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={count === 0}
      className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-left text-sm text-muted enabled:hover:bg-surface-3 enabled:hover:text-text disabled:opacity-60 disabled:cursor-default transition-colors"
    >
      <span className="text-violet">{icon}</span>
      <span className="flex-1">{label}</span>
      <span className="font-tech text-xs font-semibold text-text">{count}</span>
      {count > 0 && <ChevronRight size={14} className="text-muted-2" />}
    </button>
  );
}

export function VideoList({ videos, detail, onOpen }: { videos: VideoWithBrand[]; detail: (v: Video) => string; onOpen: (v: Video) => void }) {
  if (videos.length === 0) return <p className="text-sm text-muted text-center py-6">Nada pendiente aquí.</p>;
  return (
    <div className="space-y-2">
      {videos.map(v => (
        <button
          key={v.id}
          type="button"
          onClick={() => onOpen(v)}
          className="w-full flex items-center justify-between gap-3 p-3 bg-surface-3 border border-line rounded-lg text-left hover:border-accent/40 transition-colors group"
        >
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{v.brandName} · {v.name}</p>
            <p className="text-xs text-muted-2 truncate">{detail(v)}</p>
          </div>
          <span className="text-xs text-accent font-medium flex items-center gap-1 shrink-0">Abrir <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" /></span>
        </button>
      ))}
    </div>
  );
}

export function MoneyCard({ icon, label, value, sub, tone, progress, highlight }: {
  icon: ReactNode; label: string; value: ReactNode; sub: string; tone: 'text' | 'amber' | 'violet' | 'mint'; progress?: number; highlight?: boolean;
}) {
  const color = { text: 'text-text', amber: 'text-amber', violet: 'text-violet', mint: 'text-mint' }[tone];
  const soft = { text: 'bg-surface-2 text-muted', amber: 'bg-amber-dim text-amber', violet: 'bg-violet-dim text-violet', mint: 'bg-mint-dim text-mint' }[tone];
  return (
    <div className={`p-4 rounded-xl border bg-surface-3 ${highlight ? 'border-mint/40' : 'border-line'}`}>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-7 h-7 rounded-md flex items-center justify-center ${soft}`}>{icon}</span>
        <span className="text-xs text-muted">{label}</span>
      </div>
      <p className={`font-display text-xl sm:text-2xl font-bold ${color}`}>{value}</p>
      {progress !== undefined && (
        <div className="h-1 bg-surface-2 rounded-full overflow-hidden mt-2">
          <div className="h-full bg-amber rounded-full transition-all duration-500" style={{ width: `${Math.min(100, Math.max(0, progress * 100))}%` }} />
        </div>
      )}
      <p className="text-[11px] text-muted-2 mt-1.5">{sub}</p>
    </div>
  );
}

export function Avatar({ name, online }: { name: string; online: boolean }) {
  const initials = name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '?';
  return (
    <span className="relative w-8 h-8 rounded-lg bg-accent-dim text-accent border border-accent/30 flex items-center justify-center text-[11px] font-bold font-tech shrink-0">
      {initials}
      <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface-3 ${online ? 'bg-mint' : 'bg-muted-2'}`} />
    </span>
  );
}

export function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-3 border border-line rounded-lg p-3">
      <p className="text-[10px] text-muted-2 uppercase tracking-wide">{label}</p>
      <p className="font-display text-lg font-bold mt-0.5">{value}</p>
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div className="flex flex-col items-center text-center py-8 px-4 border border-dashed border-line rounded-xl bg-surface-3/30">
      <div className="w-12 h-12 rounded-full bg-surface-3 text-accent flex items-center justify-center mb-3 shadow-[0_0_15px_rgba(53,214,228,0.1)]">{icon}</div>
      <p className="font-display font-semibold">{title}</p>
      <p className="text-xs text-muted mt-1 max-w-xs">{text}</p>
      {action && (
        <button type="button" onClick={action.onClick} className="mt-3 text-xs font-semibold text-accent hover:text-accent-strong flex items-center gap-1">
          {action.label} <ArrowRight size={13} />
        </button>
      )}
    </div>
  );
}

export function Modal({ title, icon, onClose, children }: { title: string; icon?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-[2px] flex items-start justify-center p-4 sm:p-6 overflow-y-auto animate-fadeIn" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()} className="bg-surface-2 border border-line rounded-xl w-full max-w-2xl mt-10 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold flex items-center gap-2 min-w-0">
            {icon || <Users size={18} className="text-accent" />}
            <span className="truncate">{title}</span>
          </h3>
          <button type="button" onClick={onClose} aria-label="Cerrar" className="w-8 h-8 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text transition-colors shrink-0">
            <X size={16} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Contador del encabezado (mismo de Tareas). Clic opcional para filtrar. */
export function StatChip({ label, value, tone, onClick }: { label: string; value: number; tone: 'accent' | 'amber' | 'red' | 'mint'; onClick?: () => void }) {
  const cls = { accent: 'text-accent', amber: 'text-amber', red: 'text-red-400', mint: 'text-mint' }[tone];
  const body = (
    <>
      <p className={`font-display text-xl font-bold leading-none ${value > 0 ? cls : 'text-muted-2'}`}><CountTicker value={value} /></p>
      <p className="text-[11px] text-muted mt-1">{label}</p>
    </>
  );
  const base = 'text-left bg-surface-2 border border-line rounded-xl px-3.5 py-2 min-w-[130px]';
  return onClick
    ? <button type="button" onClick={onClick} className={`${base} hover:border-accent/40 transition-colors`}>{body}</button>
    : <div className={base}>{body}</div>;
}
