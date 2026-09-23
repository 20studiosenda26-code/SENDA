import { useStore } from '../store';
import { ChevronLeft, ChevronRight, Plus, X, ExternalLink } from 'lucide-react';
import { useState } from 'react';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function CalendarView() {
  const { brands, role, calendarEvents, addCalendarEvent } = useStore();
  const [month, setMonth] = useState(8); // September (0-indexed)
  const [year] = useState(2026);
  const [showForm, setShowForm] = useState(false);
  const [fDay, setFDay] = useState('');
  const [fLabel, setFLabel] = useState('');
  const [fLink, setFLink] = useState('');
  const [fNote, setFNote] = useState('');
  const [fColor, setFColor] = useState('accent');

  const isAdmin = role === 'admin';

  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const allEvents = [...calendarEvents];
  brands.forEach(b => b.videos.forEach(v => {
    const d = parseInt(v.date.slice(8));
    if (d <= daysInMonth && !allEvents.some(e => e.day === d && e.label === v.name)) {
      allEvents.push({ id: `auto-${v.id}`, day: d, label: v.name, color: 'accent' });
    }
  }));

  const colorMap: Record<string, string> = {
    accent: 'bg-accent/20 text-accent border-accent/30',
    mint: 'bg-mint/20 text-mint border-mint/30',
    amber: 'bg-amber/20 text-amber border-amber/30',
    violet: 'bg-violet/20 text-violet border-violet/30',
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-4">
      {isAdmin && (
        <div className="bg-surface-2 border border-line rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold">Administrar calendario</p>
              <p className="text-xs text-muted mt-0.5">Solo el admin puede agregar, modificar y dejar mensajes o enlaces (ej. reuniones de Zoom).</p>
            </div>
            <button onClick={() => setShowForm(s => !s)} className="text-sm text-accent hover:text-accent-strong flex items-center gap-1 shrink-0">
              {showForm ? <X size={14} /> : <Plus size={14} />} {showForm ? 'Cerrar' : 'Agregar evento'}
            </button>
          </div>
          {showForm && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input value={fDay} onChange={e => setFDay(e.target.value)} type="number" min={1} max={31} placeholder="Día del mes" className="bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent" />
              <select value={fColor} onChange={e => setFColor(e.target.value)} className="bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent">
                <option value="accent">Accent</option>
                <option value="mint">Mint</option>
                <option value="amber">Amber</option>
                <option value="violet">Violeta</option>
              </select>
              <input value={fLabel} onChange={e => setFLabel(e.target.value)} placeholder="Título del evento" className="bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent sm:col-span-2" />
              <input value={fLink} onChange={e => setFLink(e.target.value)} placeholder="Enlace (ej. Zoom) - opcional" className="bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent sm:col-span-2" />
              <input value={fNote} onChange={e => setFNote(e.target.value)} placeholder="Mensaje / nota - opcional" className="bg-surface-3 border border-line rounded-md px-3 py-2 text-sm outline-none focus:border-accent sm:col-span-2" />
              <button
                onClick={() => {
                  const day = parseInt(fDay);
                  if (day && fLabel) {
                    addCalendarEvent({ day, label: fLabel, color: fColor, link: fLink || undefined, note: fNote || undefined });
                    setFDay(''); setFLabel(''); setFLink(''); setFNote(''); setShowForm(false);
                  }
                }}
                className="sm:col-span-2 bg-accent text-on-accent rounded-md py-2 text-sm font-medium hover:bg-accent-strong transition-colors"
              >
                Guardar evento
              </button>
            </div>
          )}
        </div>
      )}

      <div className="flex flex-wrap gap-2 text-xs">
        <span className="text-muted-2">Ejemplos:</span>
        <span className="px-2 py-1 rounded border bg-mint/20 text-mint border-mint/30">Día de pago</span>
        <span className="px-2 py-1 rounded border bg-violet/20 text-violet border-violet/30">Descanso semanal (clipper / editor)</span>
        <span className="px-2 py-1 rounded border bg-amber/20 text-amber border-amber/30 flex items-center gap-1">Reunión cliente (Zoom) <ExternalLink size={11} /></span>
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-xl font-semibold">{MONTHS[month]} {year}</h2>
          <div className="flex gap-1">
            <button onClick={() => setMonth(m => Math.max(0, m - 1))} className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text transition-colors">
              <ChevronLeft size={18} />
            </button>
            <button onClick={() => setMonth(m => Math.min(11, m + 1))} className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {DAYS.map(d => <div key={d} className="text-center text-xs text-muted-2 font-medium py-2">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            const events = day ? allEvents.filter(e => e.day === day) : [];
            const isToday = day === 22 && month === 8;
            return (
              <div key={i} className={`min-h-[80px] p-1.5 rounded-lg border ${day ? 'bg-surface-3 border-line' : 'border-transparent'} ${isToday ? 'ring-1 ring-accent' : ''}`}>
                {day && <span className={`text-xs ${isToday ? 'text-accent font-bold' : 'text-muted'}`}>{day}</span>}
                <div className="mt-1 space-y-1">
                  {events.map(e => {
                    const content = (
                      <div className={`text-xs px-1.5 py-0.5 rounded border truncate flex items-center gap-1 ${colorMap[e.color] || colorMap.accent} ${e.link ? 'cursor-pointer hover:opacity-80' : ''}`} title={e.note || e.label}>
                        {e.link && <ExternalLink size={9} className="shrink-0" />}
                        <span className="truncate">{e.label}</span>
                      </div>
                    );
                    return e.link ? (
                      <a key={e.id} href={e.link} target="_blank" rel="noreferrer">{content}</a>
                    ) : (
                      <div key={e.id}>{content}</div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
