import { useStore } from '../store';
import {
  ChevronLeft, ChevronRight, Plus, ExternalLink, Pencil, Trash2, CalendarDays, Clock, Video, GraduationCap,
  Flag, PartyPopper, Package, CalendarClock,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { GlowCard } from '../components/ui/spotlight-card';
import { EmptyState, Modal, countdownLabel, deadlineMs } from '../components/home/home-bits';
import type { CalendarEvent } from '../types';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

/** Tipo de evento = color (se guarda en `color` para no romper datos existentes) */
const KINDS: Record<string, { label: string; icon: typeof Video; chip: string; dot: string }> = {
  accent: { label: 'Reunión', icon: Video, chip: 'bg-accent/15 text-accent border-accent/30', dot: 'bg-accent' },
  violet: { label: 'Capacitación', icon: GraduationCap, chip: 'bg-violet/15 text-violet border-violet/30', dot: 'bg-violet' },
  amber: { label: 'Recordatorio', icon: Flag, chip: 'bg-amber/15 text-amber border-amber/30', dot: 'bg-amber' },
  mint: { label: 'Celebración', icon: PartyPopper, chip: 'bg-mint/15 text-mint border-mint/30', dot: 'bg-mint' },
};
const kindOf = (c: string) => KINDS[c] || KINDS.accent;

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const eventMs = (e: CalendarEvent) => deadlineMs(isoOf(e.year, e.month, e.day), e.time || '09:00');

type Delivery = { id: string; brand: string; date: string; time: string; videos: number };
type Upcoming =
  | { kind: 'event'; ms: number; ev: CalendarEvent }
  | { kind: 'delivery'; ms: number; d: Delivery };

interface Draft { id: string | null; date: string; time: string; label: string; color: string; link: string; note: string }
const emptyDraft = (date: string): Draft => ({ id: null, date, time: '', label: '', color: 'accent', link: '', note: '' });

export function CalendarView() {
  const { role, calendarEvents, addCalendarEvent, updateCalendarEvent, deleteCalendarEvent, orders, currentWorkerId } = useStore();
  const isAdmin = role === 'admin';

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60 * 1000);
    return () => clearInterval(id);
  }, []);

  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [draft, setDraft] = useState<Draft | null>(null);
  const [draftError, setDraftError] = useState('');
  const [viewing, setViewing] = useState<CalendarEvent | null>(null);

  const isViewingCurrentMonth = month === now.getMonth() && year === now.getFullYear();
  const todayIso = isoOf(now.getFullYear(), now.getMonth(), now.getDate());

  // Entregas de pedidos: el admin ve todas; el equipo solo las suyas
  const deliveries = useMemo<Delivery[]>(() => orders
    .filter(o => o.deliveryDate && o.status !== 'finalizado' && o.status !== 'aprobado_cliente')
    .filter(o => isAdmin || o.clipperId === currentWorkerId || (o.assignedWorkerIds || []).includes(currentWorkerId))
    .map(o => ({ id: o.id, brand: o.brand, date: o.deliveryDate, time: o.deliveryTime, videos: o.videoCount })),
  [orders, isAdmin, currentWorkerId]);

  const upcoming = useMemo<Upcoming[]>(() => {
    const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const to = from + 15 * 86400000;
    const items: Upcoming[] = [
      ...calendarEvents.map(ev => ({ kind: 'event' as const, ms: eventMs(ev), ev })),
      ...deliveries.map(d => ({ kind: 'delivery' as const, ms: deadlineMs(d.date, d.time), d })),
    ];
    return items.filter(i => Number.isFinite(i.ms) && i.ms >= from && i.ms < to).sort((a, b) => a.ms - b.ms);
  }, [calendarEvents, deliveries, now]);

  const todayItems = upcoming.filter(i => new Date(i.ms).toDateString() === now.toDateString());
  const laterItems = upcoming.filter(i => !todayItems.includes(i));

  const goPrevMonth = () => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); };
  const goNextMonth = () => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); };
  const goToday = () => { setMonth(now.getMonth()); setYear(now.getFullYear()); };

  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();
  const cells: { day: number; inMonth: boolean }[] = [];
  for (let i = offset - 1; i >= 0; i--) cells.push({ day: prevMonthDays - i, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true });
  let trailing = 1;
  while (cells.length < 42) cells.push({ day: trailing++, inMonth: false });

  const monthEvents = calendarEvents.filter(e => e.month === month && e.year === year);
  const monthDeliveries = deliveries.filter(d => d.date.startsWith(`${year}-${pad(month + 1)}`));

  const openNew = (date?: string) => { setDraftError(''); setDraft(emptyDraft(date || (isViewingCurrentMonth ? todayIso : isoOf(year, month, 1)))); };
  const openEdit = (ev: CalendarEvent) => {
    setViewing(null); setDraftError('');
    setDraft({ id: ev.id, date: isoOf(ev.year, ev.month, ev.day), time: ev.time || '', label: ev.label, color: ev.color, link: ev.link || '', note: ev.note || '' });
  };

  const saveDraft = () => {
    if (!draft) return;
    const [y, m, d] = draft.date.split('-').map(Number);
    if (!y || !m || !d) { setDraftError('Elige una fecha.'); return; }
    if (!draft.label.trim()) { setDraftError('Escribe un título.'); return; }
    const link = draft.link.trim();
    if (link && !/^https?:\/\//i.test(link)) { setDraftError('El enlace debe empezar por https://'); return; }
    const data = { day: d, month: m - 1, year: y, label: draft.label.trim(), color: draft.color, time: draft.time || undefined, link: link || undefined, note: draft.note.trim() || undefined };
    if (draft.id) updateCalendarEvent(draft.id, data); else addCalendarEvent(data);
    setMonth(m - 1); setYear(y);
    setDraft(null);
  };

  const remove = (ev: CalendarEvent) => {
    if (!window.confirm(`¿Eliminar "${ev.label}" del calendario?`)) return;
    deleteCalendarEvent(ev.id);
    setViewing(null); setDraft(null);
  };

  const todayLabel = now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  const inputCls = 'w-full bg-surface-3 border border-line rounded-md px-3 py-2 text-sm text-text outline-none focus:border-accent';

  return (
    <div className="px-6 xl:px-8 py-6 max-w-[1440px] mx-auto space-y-5 animate-fadeIn">
      <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <p className="text-[11px] font-tech uppercase tracking-[0.18em] text-accent flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" /> En vivo
          </p>
          <h2 className="font-display text-3xl xl:text-4xl font-bold mt-1">Calendario</h2>
          <p className="text-muted text-sm mt-1">
            Reuniones, capacitaciones y entregas del equipo. Hoy es <span className="text-text">{todayLabel}</span>.
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => openNew()} className="bg-accent text-on-accent rounded-lg px-4 py-2.5 text-sm font-semibold hover:bg-accent-strong transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(53,214,228,0.25)] self-start xl:self-auto">
            <Plus size={16} /> Nuevo evento
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-8">
          <GlowCard tone="accent" contentClassName="p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
              <h3 className="font-display text-xl font-semibold flex items-center gap-2">
                <CalendarDays size={18} className="text-accent" /> {MONTHS[month]} {year}
              </h3>
              <div className="flex items-center gap-1.5">
                {!isViewingCurrentMonth && (
                  <button onClick={goToday} className="px-3 h-9 rounded-lg bg-accent-dim border border-accent/30 text-accent text-xs font-medium hover:bg-accent/20 transition-colors">Hoy</button>
                )}
                <button onClick={goPrevMonth} aria-label="Mes anterior" className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text hover:border-accent/40 transition-colors"><ChevronLeft size={18} /></button>
                <button onClick={goNextMonth} aria-label="Mes siguiente" className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text hover:border-accent/40 transition-colors"><ChevronRight size={18} /></button>
              </div>
            </div>

            <div className="flex flex-wrap gap-3 mb-3 text-[11px] text-muted-2">
              {Object.entries(KINDS).map(([k, v]) => (
                <span key={k} className="flex items-center gap-1.5"><span className={`w-2 h-2 rounded-full ${v.dot}`} />{v.label}</span>
              ))}
              <span className="flex items-center gap-1.5"><Package size={11} className="text-amber" />Entrega de pedido</span>
            </div>

            <div className="grid grid-cols-7 gap-1.5 mb-1.5">
              {DAYS.map((d, i) => <div key={d} className={`text-center text-xs font-medium py-1.5 ${i >= 5 ? 'text-muted-2/70' : 'text-muted-2'}`}>{d}</div>)}
            </div>
            <div key={`${year}-${month}`} className="grid grid-cols-7 gap-1.5 animate-fadeIn">
              {cells.map((cell, i) => {
                const iso = isoOf(year, month, cell.day);
                const events = cell.inMonth ? monthEvents.filter(e => e.day === cell.day).sort((a, b) => (a.time || '').localeCompare(b.time || '')) : [];
                const dels = cell.inMonth ? monthDeliveries.filter(d => d.date === iso) : [];
                const isToday = cell.inMonth && iso === todayIso;
                return (
                  <div
                    key={i}
                    onClick={() => { if (isAdmin && cell.inMonth) openNew(iso); }}
                    className={`group min-h-[104px] p-1.5 rounded-lg border transition-colors ${
                      !cell.inMonth ? 'bg-surface-3/30 border-transparent'
                        : isToday ? 'bg-accent-dim border-accent/50 ring-1 ring-accent/40'
                          : 'bg-surface-3 border-line hover:border-accent/30'
                    } ${isAdmin && cell.inMonth ? 'cursor-pointer' : ''}`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs leading-none font-tech ${!cell.inMonth ? 'text-muted-2/40' : isToday ? 'text-accent font-bold' : 'text-muted'}`}>{cell.day}</span>
                      {isToday && <span className="text-[9px] font-bold uppercase text-accent">Hoy</span>}
                      {!isToday && isAdmin && cell.inMonth && <Plus size={11} className="text-muted-2 opacity-0 group-hover:opacity-100 transition-opacity" />}
                    </div>
                    <div className="mt-1 space-y-1">
                      {events.slice(0, 3).map(e => (
                        <button
                          key={e.id}
                          onClick={ev => { ev.stopPropagation(); setViewing(e); }}
                          title={e.note || e.label}
                          className={`w-full text-left text-[11px] px-1.5 py-0.5 rounded border truncate block hover:brightness-125 transition ${kindOf(e.color).chip}`}
                        >
                          {e.time && <span className="font-tech mr-1 opacity-80">{e.time}</span>}{e.label}
                        </button>
                      ))}
                      {events.length > 3 && <p className="text-[10px] text-muted-2 px-1">+{events.length - 3} más</p>}
                      {dels.map(d => (
                        <div key={d.id} title={`Entrega ${d.brand} · ${d.videos} video(s)`} className="text-[11px] px-1.5 py-0.5 rounded border border-dashed border-amber/40 text-amber truncate flex items-center gap-1">
                          <Package size={10} className="shrink-0" /> {d.brand}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </GlowCard>
        </div>

        <div className="lg:col-span-4 space-y-5">
          <GlowCard tone="amber" contentClassName="p-5">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
              <Clock size={18} className="text-amber" /> Hoy
              <span className="text-xs font-normal text-muted-2">{todayItems.length} en agenda</span>
            </h3>
            {todayItems.length === 0 ? (
              <p className="text-sm text-muted">Nada agendado para hoy.</p>
            ) : (
              <div className="space-y-2">{todayItems.map(it => <UpcomingRow key={it.kind === 'event' ? it.ev.id : it.d.id} item={it} onOpen={setViewing} highlight />)}</div>
            )}
          </GlowCard>

          <GlowCard tone="violet" contentClassName="p-5">
            <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
              <CalendarClock size={18} className="text-violet" /> Próximos 15 días
            </h3>
            {laterItems.length === 0 ? (
              <EmptyState
                icon={<CalendarDays size={20} />}
                title="Sin eventos próximos"
                text={isAdmin ? 'Agenda una reunión o capacitación: el equipo recibe el aviso al instante.' : 'Cuando el admin agende una reunión o capacitación, aparecerá aquí.'}
                action={isAdmin ? { label: 'Nuevo evento', onClick: () => openNew() } : undefined}
              />
            ) : (
              <div className="space-y-2">
                {laterItems.map(it => <UpcomingRow key={it.kind === 'event' ? it.ev.id : it.d.id} item={it} onOpen={setViewing} />)}
              </div>
            )}
          </GlowCard>
        </div>
      </div>

      {viewing && (() => {
        const k = kindOf(viewing.color);
        const Icon = k.icon;
        const ms = eventMs(viewing);
        return (
          <Modal title={viewing.label} icon={<Icon size={18} className="text-accent" />} onClose={() => setViewing(null)}>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`text-xs px-2 py-0.5 rounded border ${k.chip}`}>{k.label}</span>
              <span className="text-muted">
                {new Date(viewing.year, viewing.month, viewing.day).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {viewing.time && <> · <span className="font-tech text-text">{viewing.time}</span></>}
              </span>
              {ms > Date.now() && <span className="text-xs text-amber">· {countdownLabel(ms)}</span>}
            </div>
            {viewing.note && <p className="text-sm text-text/90 whitespace-pre-wrap bg-surface-3 border border-line rounded-lg p-3">{viewing.note}</p>}
            <div className="flex flex-wrap gap-2 pt-1">
              {viewing.link && (
                <a href={viewing.link} target="_blank" rel="noreferrer" className="bg-accent text-on-accent rounded-md px-4 py-2 text-sm font-semibold hover:bg-accent-strong transition-colors flex items-center gap-2">
                  <ExternalLink size={14} /> Abrir enlace
                </a>
              )}
              {isAdmin && (
                <>
                  <button onClick={() => openEdit(viewing)} className="bg-surface-3 border border-line rounded-md px-4 py-2 text-sm hover:border-accent/40 transition-colors flex items-center gap-2"><Pencil size={14} /> Editar</button>
                  <button onClick={() => remove(viewing)} className="bg-surface-3 border border-line text-red-400 rounded-md px-4 py-2 text-sm hover:bg-red-400/10 transition-colors flex items-center gap-2"><Trash2 size={14} /> Eliminar</button>
                </>
              )}
            </div>
          </Modal>
        );
      })()}

      {draft && isAdmin && (
        <Modal title={draft.id ? 'Editar evento' : 'Nuevo evento'} icon={<CalendarDays size={18} className="text-accent" />} onClose={() => setDraft(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-muted space-y-1 sm:col-span-2">
              <span>Título</span>
              <input autoFocus value={draft.label} onChange={e => setDraft({ ...draft, label: e.target.value })} placeholder="Ej. Reunión semanal del equipo" className={inputCls} />
            </label>
            <label className="text-xs text-muted space-y-1">
              <span>Fecha</span>
              <input type="date" value={draft.date} onChange={e => setDraft({ ...draft, date: e.target.value })} className={inputCls} />
            </label>
            <label className="text-xs text-muted space-y-1">
              <span>Hora (opcional)</span>
              <input type="time" value={draft.time} onChange={e => setDraft({ ...draft, time: e.target.value })} className={inputCls} />
            </label>
            <div className="sm:col-span-2 space-y-1">
              <span className="text-xs text-muted">Tipo</span>
              <div className="flex flex-wrap gap-2">
                {Object.entries(KINDS).map(([key, k]) => {
                  const Icon = k.icon;
                  return (
                    <button key={key} type="button" onClick={() => setDraft({ ...draft, color: key })}
                      className={`text-xs px-3 py-1.5 rounded-md border flex items-center gap-1.5 transition-colors ${draft.color === key ? k.chip : 'bg-surface-3 border-line text-muted hover:text-text'}`}>
                      <Icon size={13} /> {k.label}
                    </button>
                  );
                })}
              </div>
            </div>
            <label className="text-xs text-muted space-y-1 sm:col-span-2">
              <span>Enlace de la reunión (Meet, Zoom, Classroom…) · opcional</span>
              <input value={draft.link} onChange={e => setDraft({ ...draft, link: e.target.value })} placeholder="https://" className={inputCls} />
            </label>
            <label className="text-xs text-muted space-y-1 sm:col-span-2">
              <span>Nota para el equipo · opcional</span>
              <textarea value={draft.note} onChange={e => setDraft({ ...draft, note: e.target.value })} rows={3} placeholder="Qué preparar, temas a tratar…" className={`${inputCls} resize-none`} />
            </label>
          </div>
          {draftError && <p className="text-xs text-red-400">{draftError}</p>}
          {!draft.id && <p className="text-[11px] text-muted-2">Al guardar, todo el equipo recibe un aviso en la campana (y por correo si lo tiene activado).</p>}
          <div className="flex justify-end gap-2">
            <button onClick={() => setDraft(null)} className="px-4 py-2 rounded-md text-sm text-muted hover:text-text">Cancelar</button>
            <button onClick={saveDraft} className="bg-accent text-on-accent rounded-md px-4 py-2 text-sm font-semibold hover:bg-accent-strong transition-colors">
              {draft.id ? 'Guardar cambios' : 'Crear evento'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function UpcomingRow({ item, onOpen, highlight }: { item: Upcoming; onOpen: (e: CalendarEvent) => void; highlight?: boolean }) {
  const dateLbl = new Date(item.ms).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  if (item.kind === 'delivery') {
    return (
      <div className="flex items-center gap-3 bg-surface-3 border border-dashed border-amber/30 rounded-lg p-3">
        <div className="w-9 h-9 rounded-lg bg-amber/10 text-amber flex items-center justify-center shrink-0"><Package size={16} /></div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">Entrega · {item.d.brand}</p>
          <p className="text-[11px] text-muted-2">{dateLbl}{item.d.time ? ` · ${item.d.time}` : ''} · {item.d.videos} video(s)</p>
        </div>
        <span className="text-[11px] text-amber shrink-0">{countdownLabel(item.ms)}</span>
      </div>
    );
  }
  const k = kindOf(item.ev.color);
  const Icon = k.icon;
  return (
    <button onClick={() => onOpen(item.ev)} className={`w-full text-left flex items-center gap-3 bg-surface-3 border rounded-lg p-3 hover:border-accent/40 hover:-translate-y-0.5 transition-all ${highlight ? 'border-accent/30' : 'border-line'}`}>
      <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${k.chip}`}><Icon size={16} /></div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate">{item.ev.label}</p>
        <p className="text-[11px] text-muted-2">{dateLbl}{item.ev.time ? ` · ${item.ev.time}` : ''} · {k.label}</p>
      </div>
      {item.ev.link ? <ExternalLink size={14} className="text-accent shrink-0" /> : <span className="text-[11px] text-muted-2 shrink-0">{countdownLabel(item.ms)}</span>}
    </button>
  );
}
