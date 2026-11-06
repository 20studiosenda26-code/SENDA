import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import type { CapacityProtocolConfig, FinanceSettings } from '../types';
import {
  isSupabaseConfigured,
  getGoogleDriveBridgeUrl,
  getGoogleDriveFolderUrl,
  setGoogleDriveBridgeUrl,
  setGoogleDriveFolderUrl,
} from '../lib/supabaseClient';
import { fmtMoney } from '../lib/economics';
import {
  Settings, DollarSign, Gauge, HardDrive, Palette, Check, RotateCcw, Save,
  Cloud, CloudOff, Moon, Sun, Scissors, Film, Info, ExternalLink,
} from 'lucide-react';

type Tab = 'finanzas' | 'capacidad' | 'drive' | 'apariencia';

const TABS: { key: Tab; label: string; icon: typeof Settings }[] = [
  { key: 'finanzas', label: 'Precios y pagos', icon: DollarSign },
  { key: 'capacidad', label: 'Capacidad', icon: Gauge },
  { key: 'drive', label: 'Google Drive', icon: HardDrive },
  { key: 'apariencia', label: 'Apariencia', icon: Palette },
];

function NumberField({
  label, hint, value, onChange, min = 0, max, step = 1, prefix, suffix,
}: {
  label: string; hint?: string; value: number; onChange: (n: number) => void;
  min?: number; max?: number; step?: number; prefix?: string; suffix?: string;
}) {
  const [raw, setRaw] = useState(String(value));
  useEffect(() => { setRaw(String(value)); }, [value]);
  return (
    <label className="block bg-surface-3 border border-line rounded-xl p-3.5 hover:border-accent/30 transition-colors">
      <span className="text-xs font-medium text-muted block mb-1.5">{label}</span>
      <div className="flex items-center gap-2 bg-surface-2 border border-line rounded-lg px-3 focus-within:border-accent transition-colors">
        {prefix && <span className="text-sm text-muted-2 font-tech">{prefix}</span>}
        <input
          type="number"
          inputMode="decimal"
          min={min}
          max={max}
          step={step}
          value={raw}
          onChange={e => {
            setRaw(e.target.value);
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n)) onChange(n);
          }}
          onBlur={() => setRaw(String(value))}
          className="w-full bg-transparent py-2 text-sm font-tech outline-none"
        />
        {suffix && <span className="text-xs text-muted-2 whitespace-nowrap">{suffix}</span>}
      </div>
      {hint && <span className="text-[11px] text-muted-2 block mt-1.5 leading-snug">{hint}</span>}
    </label>
  );
}

export function SettingsPanel() {
  const {
    financeSettings, updateFinanceSettings, capacityConfig, updateCapacityConfig,
    theme, toggleTheme, workers, getWorkerCapacity,
  } = useStore();

  const [tab, setTab] = useState<Tab>('finanzas');
  const [fin, setFin] = useState<FinanceSettings>(financeSettings);
  const [cap, setCap] = useState<CapacityProtocolConfig>(capacityConfig);
  const [folderUrl, setFolderUrl] = useState(() => getGoogleDriveFolderUrl());
  const [bridgeUrl, setBridgeUrl] = useState(() => getGoogleDriveBridgeUrl());
  const [savedTab, setSavedTab] = useState<Tab | null>(null);

  // Si otro admin cambia los ajustes en vivo, refrescamos el borrador (solo si no hay cambios locales)
  const finDirty = JSON.stringify(fin) !== JSON.stringify(financeSettings);
  const capDirty = JSON.stringify(cap) !== JSON.stringify(capacityConfig);
  const driveDirty = folderUrl.trim() !== getGoogleDriveFolderUrl() || bridgeUrl.trim() !== getGoogleDriveBridgeUrl();
  // Tras guardar, adoptamos los valores normalizados por el store (p. ej. límites de horario)
  const syncAfterSave = useRef(false);
  useEffect(() => {
    if (!finDirty || syncAfterSave.current) setFin(financeSettings);
  }, [financeSettings]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!capDirty || syncAfterSave.current) setCap(capacityConfig);
    syncAfterSave.current = false;
  }, [capacityConfig]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirtyByTab: Record<Tab, boolean> = { finanzas: finDirty, capacidad: capDirty, drive: driveDirty, apariencia: false };

  const margin = fin.clientPricePerVideo - fin.defaultClipperCost - fin.defaultEditorCost;
  const marginPct = fin.clientPricePerVideo > 0 ? Math.round((margin / fin.clientPricePerVideo) * 100) : 0;

  const teamCapacity = useMemo(() => {
    const clip = workers.filter(w => w.role === 'clipper').reduce((s, w) => s + getWorkerCapacity(w.id), 0);
    const edit = workers.filter(w => w.role === 'editor').reduce((s, w) => s + getWorkerCapacity(w.id), 0);
    const factor = Math.max(0.5, (100 - cap.safetyMarginPct) / 100);
    return { safe: Math.floor(Math.min(clip, edit) * factor), clip, edit };
  }, [workers, getWorkerCapacity, cap.safetyMarginPct]);

  const flashSaved = (t: Tab) => {
    setSavedTab(t);
    setTimeout(() => setSavedTab(prev => (prev === t ? null : prev)), 2200);
  };

  const save = () => {
    syncAfterSave.current = true;
    if (tab === 'finanzas') updateFinanceSettings(fin);
    if (tab === 'capacidad') updateCapacityConfig(cap);
    if (tab === 'drive') {
      setGoogleDriveFolderUrl(folderUrl);
      setGoogleDriveBridgeUrl(bridgeUrl);
      setFolderUrl(folderUrl.trim());
      setBridgeUrl(bridgeUrl.trim());
    }
    flashSaved(tab);
  };

  const discard = () => {
    if (tab === 'finanzas') setFin(financeSettings);
    if (tab === 'capacidad') setCap(capacityConfig);
    if (tab === 'drive') { setFolderUrl(getGoogleDriveFolderUrl()); setBridgeUrl(getGoogleDriveBridgeUrl()); }
  };

  const isDirty = dirtyByTab[tab];
  const marginInvalid = tab === 'finanzas' && margin < 0;

  return (
    <section className="bg-surface-2 border border-line rounded-xl overflow-hidden">
      <div className="p-4 sm:p-5 border-b border-line flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-dim border border-accent/30 text-accent flex items-center justify-center">
            <Settings size={20} />
          </div>
          <div>
            <h3 className="font-display text-lg font-semibold">Ajustes de la plataforma</h3>
            <p className="text-xs text-muted">Valores base que usan Clientes, Finanzas, Nóminas y Capacidad.</p>
          </div>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border ${
            isSupabaseConfigured ? 'bg-mint-dim text-mint border-mint/30' : 'bg-amber-dim text-amber border-amber/30'
          }`}
          title={isSupabaseConfigured ? 'Los ajustes se sincronizan con todo el equipo' : 'Sin Supabase: los ajustes solo se guardan en este navegador'}
        >
          {isSupabaseConfigured ? <Cloud size={12} /> : <CloudOff size={12} />}
          {isSupabaseConfigured ? 'Sincronizado con el equipo' : 'Solo en este navegador'}
        </span>
      </div>

      <div className="px-4 sm:px-5 pt-3 flex gap-1.5 flex-wrap">
        {TABS.map(t => {
          const Icon = t.icon;
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`relative flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                active ? 'bg-accent text-on-accent' : 'bg-surface-3 text-muted hover:text-text border border-line'
              }`}
            >
              <Icon size={14} /> {t.label}
              {dirtyByTab[t.key] && !active && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber" title="Cambios sin guardar" />}
            </button>
          );
        })}
      </div>

      <div className="p-4 sm:p-5 space-y-4 animate-fadeIn" key={tab}>
        {tab === 'finanzas' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <NumberField label="Precio al cliente por video" prefix="$" min={1} value={fin.clientPricePerVideo}
                onChange={n => setFin(f => ({ ...f, clientPricePerVideo: n }))}
                hint="Se precarga al crear un pedido nuevo." />
              <NumberField label="Pago al Clipper por video" prefix="$" value={fin.defaultClipperCost}
                onChange={n => setFin(f => ({ ...f, defaultClipperCost: n }))}
                hint="Se usa si el pedido no define su propio pago." />
              <NumberField label="Pago al Editor por video" prefix="$" value={fin.defaultEditorCost}
                onChange={n => setFin(f => ({ ...f, defaultEditorCost: n }))}
                hint="Se usa si el pedido no define su propio pago." />
            </div>
            <div className={`flex items-center justify-between gap-3 flex-wrap rounded-xl px-4 py-3 border ${marginInvalid ? 'bg-red-500/10 border-red-500/30' : 'bg-surface-3 border-line'}`}>
              <div className="flex items-center gap-2 text-xs text-muted">
                <Info size={14} className={marginInvalid ? 'text-red-400' : 'text-accent'} />
                {marginInvalid ? 'Los pagos superan el precio al cliente: cada video daría pérdida.' : 'Margen bruto por video con estos valores'}
              </div>
              <p className={`font-display text-lg font-bold ${marginInvalid ? 'text-red-400' : 'text-mint'}`}>
                {fmtMoney(margin)} <span className="text-xs font-tech text-muted-2">({marginPct}%)</span>
              </p>
            </div>
            <p className="text-[11px] text-muted-2">Los pedidos que ya tienen precios propios no cambian. Los videos sin precio propio se recalculan al instante en Finanzas y Nóminas.</p>
          </>
        )}

        {tab === 'capacidad' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <NumberField label="Margen de seguridad" suffix="%" min={0} max={50} value={cap.safetyMarginPct}
                onChange={n => setCap(c => ({ ...c, safetyMarginPct: n }))} hint="Reserva para imprevistos y correcciones." />
              <NumberField label="Capacidad base Clipper" suffix="videos/día" min={1} value={cap.defaultClipperDailyVideos}
                onChange={n => setCap(c => ({ ...c, defaultClipperDailyVideos: n }))} hint="Para clippers sin capacidad individual." />
              <NumberField label="Capacidad base Editor" suffix="videos/día" min={1} value={cap.defaultEditorDailyVideos}
                onChange={n => setCap(c => ({ ...c, defaultEditorDailyVideos: n }))} hint="Para editores sin capacidad individual." />
              <NumberField label="Alerta de urgencia" suffix="horas" min={1} max={72} value={cap.urgentThresholdHours}
                onChange={n => setCap(c => ({ ...c, urgentThresholdHours: n }))} hint="Horas antes de la entrega para marcar urgente." />
              <NumberField label="Inicio de jornada" suffix="h" min={0} max={22} value={cap.workdayStartHour}
                onChange={n => setCap(c => ({ ...c, workdayStartHour: n }))} />
              <NumberField label="Fin de jornada" suffix="h" min={1} max={24} value={cap.workdayEndHour}
                onChange={n => setCap(c => ({ ...c, workdayEndHour: n }))} />
              <NumberField label="Sin respuesta máx." suffix="min" min={5} value={cap.maxNoResponseMinutes}
                onChange={n => setCap(c => ({ ...c, maxNoResponseMinutes: n }))} />
              <NumberField label="Tarea estancada máx." suffix="horas" min={1} value={cap.maxStalledHours}
                onChange={n => setCap(c => ({ ...c, maxStalledHours: n }))} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-surface-3 border border-line rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wider font-tech text-muted-2 flex items-center gap-1"><Scissors size={11} /> Clipping físico</p>
                <p className="font-display text-xl font-bold text-accent">{teamCapacity.clip}<span className="text-xs text-muted-2 font-tech"> /día</span></p>
              </div>
              <div className="bg-surface-3 border border-line rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wider font-tech text-muted-2 flex items-center gap-1"><Film size={11} /> Edición física</p>
                <p className="font-display text-xl font-bold text-mint">{teamCapacity.edit}<span className="text-xs text-muted-2 font-tech"> /día</span></p>
              </div>
              <div className="bg-surface-3 border border-accent/30 rounded-xl p-3">
                <p className="text-[10px] uppercase tracking-wider font-tech text-muted-2 flex items-center gap-1"><Gauge size={11} /> Capacidad segura</p>
                <p className="font-display text-xl font-bold">{teamCapacity.safe}<span className="text-xs text-muted-2 font-tech"> videos/día</span></p>
              </div>
            </div>
            <p className="text-[11px] text-muted-2">La capacidad individual de cada creador se ajusta en Capacidad → Ajustes del motor, o al asignar pedidos en Tareas.</p>
          </>
        )}

        {tab === 'drive' && (
          <div className="space-y-3">
            <label className="block bg-surface-3 border border-line rounded-xl p-3.5">
              <span className="text-xs font-medium text-muted block mb-1.5">Carpeta compartida de Google Drive (videos finales)</span>
              <div className="flex items-center gap-2">
                <input
                  value={folderUrl}
                  onChange={e => setFolderUrl(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/..."
                  className="flex-1 bg-surface-2 border border-line rounded-lg px-3 py-2 text-xs outline-none focus:border-accent placeholder:text-muted-2"
                />
                {folderUrl.trim() && (
                  <a href={folderUrl.trim()} target="_blank" rel="noreferrer" title="Abrir carpeta"
                    className="w-9 h-9 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-muted hover:text-accent hover:border-accent/50 transition-colors">
                    <ExternalLink size={14} />
                  </a>
                )}
              </div>
              <span className="text-[11px] text-muted-2 block mt-1.5">Los editores verán el botón “Abrir Drive” en cada video.</span>
            </label>
            <label className="block bg-surface-3 border border-line rounded-xl p-3.5">
              <span className="text-xs font-medium text-muted block mb-1.5">Puente de subida directa (Google Apps Script)</span>
              <input
                value={bridgeUrl}
                onChange={e => setBridgeUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full bg-surface-2 border border-line rounded-lg px-3 py-2 text-xs outline-none focus:border-accent placeholder:text-muted-2"
              />
              <span className="text-[11px] text-muted-2 block mt-1.5">Opcional. Con el puente activo, los videos finales pesados suben directo a Drive sin pegar enlaces. Las instrucciones están en “Configurar Drive” dentro de cualquier video.</span>
            </label>
            <div className="flex gap-2 flex-wrap">
              <span className={`text-[11px] px-2.5 py-1 rounded-full ${getGoogleDriveFolderUrl() ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted-2'}`}>
                Carpeta: {getGoogleDriveFolderUrl() ? 'vinculada' : 'sin vincular'}
              </span>
              <span className={`text-[11px] px-2.5 py-1 rounded-full ${getGoogleDriveBridgeUrl() ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted-2'}`}>
                Puente: {getGoogleDriveBridgeUrl() ? 'activo' : 'inactivo'}
              </span>
            </div>
          </div>
        )}

        {tab === 'apariencia' && (
          <div className="grid grid-cols-2 gap-3 max-w-md">
            {(['dark', 'light'] as const).map(mode => {
              const active = theme === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => { if (!active) toggleTheme(); }}
                  className={`text-left rounded-xl border p-3 transition-all ${active ? 'border-accent ring-1 ring-accent/30 bg-accent/5' : 'border-line bg-surface-3 hover:border-accent/40'}`}
                >
                  <div className={`h-16 rounded-lg mb-2.5 border border-line flex items-end gap-1.5 p-2 ${mode === 'dark' ? 'bg-[#131519]' : 'bg-white'}`}>
                    <span className={`h-7 flex-1 rounded ${mode === 'dark' ? 'bg-[#22262D]' : 'bg-[#E4EBEC]'}`} />
                    <span className={`h-10 flex-1 rounded ${mode === 'dark' ? 'bg-[#35D6E4]' : 'bg-[#0EA6B8]'}`} />
                    <span className={`h-5 flex-1 rounded ${mode === 'dark' ? 'bg-[#6FE7C8]' : 'bg-[#DCF5EC]'}`} />
                  </div>
                  <p className="text-sm font-semibold flex items-center gap-1.5">
                    {mode === 'dark' ? <Moon size={14} /> : <Sun size={14} />} {mode === 'dark' ? 'Oscuro' : 'Claro'}
                    {active && <Check size={14} className="text-accent ml-auto" />}
                  </p>
                </button>
              );
            })}
            <p className="col-span-2 text-[11px] text-muted-2">Se recuerda en este dispositivo.</p>
          </div>
        )}
      </div>

      {tab !== 'apariencia' && (
        <div className="px-4 sm:px-5 py-3 border-t border-line bg-surface-3/40 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-xs text-muted-2">
            {savedTab === tab ? (
              <span className="text-mint inline-flex items-center gap-1.5 animate-fadeIn"><Check size={14} /> Cambios guardados</span>
            ) : isDirty ? (
              <span className="text-amber">Tienes cambios sin guardar</span>
            ) : (
              'Todo al día'
            )}
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={discard}
              disabled={!isDirty}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-surface-3 border border-line text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <RotateCcw size={13} /> Descartar
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!isDirty}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-accent text-on-accent hover:bg-accent-strong disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              <Save size={13} /> Guardar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
