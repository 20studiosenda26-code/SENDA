import { useStore } from '../store';
import { CALENDAR_EVENTS } from '../data';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export function CalendarView() {
  const { brands } = useStore();
  const [month, setMonth] = useState(8); // September (0-indexed)
  const [year] = useState(2026);

  const firstDay = new Date(year, month, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const allEvents = [...CALENDAR_EVENTS];
  brands.forEach(b => b.videos.forEach(v => {
    const d = parseInt(v.date.slice(8));
    if (d <= daysInMonth && !allEvents.some(e => e.day === d && e.label === v.name)) {
      allEvents.push({ day: d, label: v.name, color: 'accent' });
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
    <div className="p-6 max-w-5xl mx-auto">
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
                  {events.map((e, j) => (
                    <div key={j} className={`text-xs px-1.5 py-0.5 rounded border truncate ${colorMap[e.color] || colorMap.accent}`}>
                      {e.label}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
