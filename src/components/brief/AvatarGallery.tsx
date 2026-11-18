import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Search, SlidersHorizontal, UserCircle2, X } from 'lucide-react';
import {
  AGE_RANGES, CATEGORIES, GALLERY_AVATARS, countryName, flag,
  type AvatarCategory, type AvatarGender, type GalleryAvatar,
} from '../../lib/avatarGallery';

type GenderFilter = 'todos' | AvatarGender;
type StyleFilter = 'todos' | AvatarCategory;

/** Lee los filtros de la dirección (para poder compartirlos) */
function readUrl() {
  const q = new URLSearchParams(window.location.search);
  const g = q.get('g');
  const e = q.get('e');
  const a = q.get('a');
  return {
    gender: (g === 'mujer' || g === 'hombre' ? g : 'todos') as GenderFilter,
    style: (CATEGORIES.some(c => c.key === e) ? e : 'todos') as StyleFilter,
    age: AGE_RANGES.some(r => r.key === a) ? (a as string) : 'todas',
    countries: (q.get('p') || '').split(',').filter(c => GALLERY_AVATARS.some(x => x.country === c)),
  };
}

const chip = (on: boolean) =>
  `px-3 h-8 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-accent ${
    on ? 'bg-accent text-on-accent shadow-[0_0_14px_rgba(53,214,228,0.25)]' : 'bg-surface-3 border border-line text-muted hover:text-text hover:border-accent/40'}`;

function Card({ a, selected, dim, onOpen }: { a: GalleryAvatar; selected: boolean; dim: boolean; onOpen: () => void }) {
  const [loaded, setLoaded] = useState(false);
  const [src, setSrc] = useState(a.thumb);
  return (
    <button type="button" onClick={onOpen} aria-label={`Ver ${a.alt}`} aria-pressed={selected}
      className={`group relative aspect-[3/4] rounded-xl overflow-hidden bg-surface-3 outline-none transition-all duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-accent ${
        selected ? 'border-2 border-accent shadow-[0_0_22px_rgba(53,214,228,0.3)]' : 'border border-line hover:border-accent'
      } ${dim ? 'opacity-55 hover:opacity-100' : ''}`}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-surface-3" />}
      <img src={src} alt={a.alt} loading="lazy" decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => { if (src !== a.src) setSrc(a.src); else setLoaded(true); }}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`} />
      {selected && <CheckCircle2 size={24} className="absolute top-2 right-2 text-accent bg-surface rounded-full shadow-lg" />}
    </button>
  );
}

function Lightbox({ list, index, selectedId, onClose, onMove, onChoose }: {
  list: GalleryAvatar[]; index: number; selectedId?: string | null; onClose: () => void; onMove: (i: number) => void; onChoose: (a: GalleryAvatar) => void;
}) {
  const a = list[index];
  const go = useCallback((d: number) => onMove((index + d + list.length) % list.length), [index, list.length, onMove]);

  useEffect(() => {
    // En captura para que Escape cierre solo la imagen grande y no toda la galería
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [go, onClose]);

  // Precarga la siguiente y la anterior para que el cambio sea instantáneo
  useEffect(() => {
    [list[(index + 1) % list.length], list[(index - 1 + list.length) % list.length]].forEach(n => { if (n) new Image().src = n.src; });
  }, [index, list]);

  if (!a) return null;
  const chosen = selectedId === a.id;
  return (
    <div className="fixed inset-0 z-[90] bg-black/88 backdrop-blur-sm flex flex-col items-center justify-center p-3 sm:p-6 animate-fadeIn" onClick={onClose} role="dialog" aria-modal="true" aria-label={a.alt}>
      <button type="button" onClick={onClose} aria-label="Cerrar" className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"><X size={18} /></button>
      <div className="relative flex items-center gap-2 sm:gap-5 max-w-full" onClick={e => e.stopPropagation()}>
        <button type="button" onClick={() => go(-1)} aria-label="Avatar anterior" className="w-11 h-11 shrink-0 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"><ChevronLeft size={22} /></button>
        <img key={a.id} src={a.src} alt={a.alt} className="max-h-[76vh] max-w-[calc(100vw-7.5rem)] w-auto rounded-xl shadow-2xl animate-fadeIn select-none" draggable={false} />
        <button type="button" onClick={() => go(1)} aria-label="Avatar siguiente" className="w-11 h-11 shrink-0 rounded-full bg-white/10 hover:bg-white/25 text-white flex items-center justify-center transition-colors"><ChevronRight size={22} /></button>
      </div>
      <div className="mt-4 flex items-center gap-4" onClick={e => e.stopPropagation()}>
        <span className="text-xs font-tech text-white/60">{index + 1} / {list.length}</span>
        <button type="button" onClick={() => onChoose(a)} autoFocus
          className="px-6 py-3 rounded-xl bg-accent text-on-accent text-sm font-semibold hover:bg-accent-strong transition-colors flex items-center gap-2 shadow-[0_0_24px_rgba(53,214,228,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-white">
          <CheckCircle2 size={16} /> {chosen ? 'Avatar elegido' : 'Elegir este avatar'}
        </button>
      </div>
    </div>
  );
}

/** Galería de avatares de SENDA: filtros combinables, cuadrícula y vista grande. */
export function AvatarGallery({ selectedId, onSelect, readOnly }: { selectedId?: string | null; onSelect: (a: GalleryAvatar) => void; readOnly?: boolean }) {
  const initial = useMemo(readUrl, []);
  const [gender, setGender] = useState<GenderFilter>(initial.gender);
  const [style, setStyle] = useState<StyleFilter>(initial.style);
  const [age, setAge] = useState<string>(initial.age);
  const [countries, setCountries] = useState<string[]>(initial.countries);
  const [open, setOpen] = useState<number | null>(null);
  const [countryOpen, setCountryOpen] = useState(false);
  const [countryQ, setCountryQ] = useState('');
  const popRef = useRef<HTMLDivElement>(null);

  const active = gender !== 'todos' || style !== 'todos' || age !== 'todas' || countries.length > 0;
  const clear = () => { setGender('todos'); setStyle('todos'); setAge('todas'); setCountries([]); };

  // Los filtros viajan en la dirección para poder compartirlos; al cerrar la galería se limpian
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    ['g', 'e', 'a', 'p'].forEach(k => q.delete(k));
    if (gender !== 'todos') q.set('g', gender);
    if (style !== 'todos') q.set('e', style);
    if (age !== 'todas') q.set('a', age);
    if (countries.length) q.set('p', countries.join(','));
    const qs = q.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  }, [gender, style, age, countries]);
  useEffect(() => () => {
    const q = new URLSearchParams(window.location.search);
    ['g', 'e', 'a', 'p'].forEach(k => q.delete(k));
    const qs = q.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}${window.location.hash}`);
  }, []);

  useEffect(() => {
    if (!countryOpen) return;
    const onDown = (e: MouseEvent) => { if (popRef.current && !popRef.current.contains(e.target as Node)) setCountryOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopImmediatePropagation(); setCountryOpen(false); } };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey, true); };
  }, [countryOpen]);

  const list = useMemo(() => {
    const r = AGE_RANGES.find(x => x.key === age);
    return GALLERY_AVATARS.filter(a =>
      (gender === 'todos' || a.gender === gender)
      && (style === 'todos' || a.category === style)
      && (!r || (a.age >= r.min && a.age <= r.max))
      && (countries.length === 0 || countries.includes(a.country)));
  }, [gender, style, age, countries]);

  const countryOptions = useMemo(() => {
    const counts: Record<string, number> = {};
    GALLERY_AVATARS.forEach(a => { counts[a.country] = (counts[a.country] || 0) + 1; });
    return Object.keys(counts).sort((a, b) => countryName(a).localeCompare(countryName(b))).map(code => ({ code, n: counts[code] }));
  }, []);
  const shownCountries = countryOptions.filter(c => countryName(c.code).toLowerCase().includes(countryQ.trim().toLowerCase()));
  const toggleCountry = (code: string) => setCountries(c => (c.includes(code) ? c.filter(x => x !== code) : [...c, code]));

  const hasSel = Boolean(selectedId && GALLERY_AVATARS.some(a => a.id === selectedId));

  if (GALLERY_AVATARS.length === 0) {
    return (
      <div className="text-center py-14">
        <UserCircle2 size={36} className="text-muted-2 mx-auto mb-3" />
        <p className="font-display font-semibold">La galería se está preparando</p>
        <p className="text-xs text-muted mt-1">Mientras tanto describe el avatar que quieres abajo.</p>
      </div>
    );
  }

  return (
    <div>
      {/* Filtros (se quedan fijos al hacer scroll) */}
      <div className="sticky -top-5 z-20 -mx-5 -mt-5 px-5 pt-4 pb-3 mb-4 bg-surface-2/95 backdrop-blur border-b border-line space-y-2.5">
        <div className="flex items-center gap-x-5 gap-y-2 overflow-x-auto md:overflow-visible md:flex-wrap pb-1 md:pb-0">
          <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label="Género">
            {([['todos', 'Todos'], ['mujer', 'Mujeres'], ['hombre', 'Hombres']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setGender(k)} aria-pressed={gender === k} className={chip(gender === k)}>{l}</button>
            ))}
          </div>
          <span className="hidden md:block w-px h-5 bg-line shrink-0" />
          <div className="flex items-center gap-1.5 shrink-0" role="group" aria-label="Estilo">
            <button type="button" onClick={() => setStyle('todos')} aria-pressed={style === 'todos'} className={chip(style === 'todos')}>Todos</button>
            {CATEGORIES.map(c => (
              <div key={c.key} className="relative group shrink-0">
                <button type="button" onClick={() => setStyle(c.key)} aria-pressed={style === c.key} title={c.description} className={chip(style === c.key)}>{c.label}</button>
                <div role="tooltip" className="hidden md:block pointer-events-none absolute left-0 top-full mt-2 z-30 w-56 rounded-lg border border-line bg-surface-3 px-3 py-2 text-[11px] leading-snug text-muted shadow-xl opacity-0 translate-y-0.5 group-hover:opacity-100 group-hover:translate-y-0 group-focus-within:opacity-100 transition-all duration-150">
                  <b className="text-text block mb-0.5">{c.label}</b>{c.description}
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-x-5 gap-y-2 flex-wrap">
          <div className="flex items-center gap-1.5 overflow-x-auto max-w-full" role="group" aria-label="Edad">
            <button type="button" onClick={() => setAge('todas')} aria-pressed={age === 'todas'} className={chip(age === 'todas')}>Todas</button>
            {AGE_RANGES.map(r => <button key={r.key} type="button" onClick={() => setAge(r.key)} aria-pressed={age === r.key} className={chip(age === r.key)}>{r.label}</button>)}
          </div>

          <div className="relative" ref={popRef}>
            <button type="button" onClick={() => setCountryOpen(o => !o)} aria-expanded={countryOpen} aria-haspopup="listbox"
              className={`${chip(countries.length > 0)} flex items-center gap-1.5`}>
              <SlidersHorizontal size={12} /> País{countries.length ? ` (${countries.length})` : ''} <ChevronDown size={12} className={`transition-transform ${countryOpen ? 'rotate-180' : ''}`} />
            </button>
            {countryOpen && (
              <div className="absolute left-0 top-full mt-2 z-30 w-64 rounded-xl border border-line bg-surface-2 shadow-2xl animate-fadeIn">
                <div className="p-2 border-b border-line relative">
                  <Search size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-2" />
                  <input autoFocus value={countryQ} onChange={e => setCountryQ(e.target.value)} placeholder="Buscar país…" aria-label="Buscar país"
                    className="w-full bg-surface-3 border border-line rounded-lg pl-8 pr-3 py-1.5 text-xs outline-none focus:border-accent placeholder:text-muted-2" />
                </div>
                <ul role="listbox" aria-multiselectable="true" className="max-h-60 overflow-y-auto p-1.5">
                  {shownCountries.map(c => {
                    const on = countries.includes(c.code);
                    return (
                      <li key={c.code} role="option" aria-selected={on}>
                        <button type="button" onClick={() => toggleCountry(c.code)}
                          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs text-left transition-colors ${on ? 'bg-accent-dim text-accent' : 'hover:bg-surface-3 text-text'}`}>
                          <span className="text-base leading-none">{flag(c.code)}</span>
                          <span className="flex-1">{countryName(c.code)}</span>
                          <span className="text-[10px] font-tech text-muted-2">{c.n}</span>
                          {on && <CheckCircle2 size={14} />}
                        </button>
                      </li>
                    );
                  })}
                  {shownCountries.length === 0 && <li className="px-3 py-4 text-xs text-muted-2 text-center">Sin resultados</li>}
                </ul>
                {countries.length > 0 && (
                  <button type="button" onClick={() => setCountries([])} className="w-full text-xs text-muted hover:text-accent py-2 border-t border-line">Quitar países</button>
                )}
              </div>
            )}
          </div>

          {countries.map(c => (
            <button key={c} type="button" onClick={() => toggleCountry(c)} aria-label={`Quitar ${countryName(c)}`}
              className="h-8 pl-2.5 pr-2 rounded-lg bg-accent-dim text-accent text-xs font-medium flex items-center gap-1.5 hover:bg-accent/20 transition-colors">
              <span className="text-sm leading-none">{flag(c)}</span>{countryName(c)} <X size={11} />
            </button>
          ))}

          <div className="ml-auto flex items-center gap-3">
            <span className="text-xs text-muted font-tech" aria-live="polite">{list.length} avatar{list.length === 1 ? '' : 'es'}</span>
            {active && (
              <button type="button" onClick={clear} className="text-xs text-accent hover:text-accent-strong font-medium animate-fadeIn">Limpiar filtros</button>
            )}
          </div>
        </div>
      </div>

      {/* Cuadrícula */}
      {list.length === 0 ? (
        <div className="text-center py-16 animate-fadeIn">
          <UserCircle2 size={34} className="text-muted-2 mx-auto mb-3" />
          <p className="font-display font-semibold">No hay avatares con estos filtros</p>
          <button type="button" onClick={clear} className="mt-4 px-4 py-2 rounded-xl bg-accent text-on-accent text-xs font-semibold hover:bg-accent-strong">Limpiar filtros</button>
        </div>
      ) : (
        <div key={`${gender}|${style}|${age}|${countries.join()}`} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-5 animate-fadeIn">
          {list.map((a, i) => <Card key={a.id} a={a} selected={a.id === selectedId} dim={hasSel && a.id !== selectedId} onOpen={() => setOpen(i)} />)}
        </div>
      )}

      {open !== null && (
        <Lightbox list={list} index={Math.min(open, list.length - 1)} selectedId={selectedId} onClose={() => setOpen(null)} onMove={setOpen}
          onChoose={a => { if (readOnly) { setOpen(null); return; } setOpen(null); onSelect(a); }} />
      )}
    </div>
  );
}
