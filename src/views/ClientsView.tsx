import { useState, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { uploadSharedFile } from '../lib/supabaseClient';
import { CardNodeDeco } from '../components/BrandBackground';
import { fmtMoneyClean } from '../lib/payrollPdf';
import {
  Briefcase, PlusCircle, Calendar, Clock, Layers, DollarSign,
  CheckCircle2, AlertTriangle, Upload, FileText, Loader2,
  ArrowRight, Sparkles, Scissors, Film, ShieldAlert, Eye, ChevronDown,
} from 'lucide-react';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDaysIso(baseIso: string, days: number): string {
  const d = new Date(`${baseIso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatHour(h: number): string {
  const clamped = Math.max(0, Math.min(23, Math.floor(h)));
  const mins = Math.round((h - Math.floor(h)) * 60);
  return `${String(clamped).padStart(2, '0')}:${mins >= 30 ? '30' : '00'}`;
}

export function ClientsView() {
  const {
    orders, brands, workers, financeSettings, capacityConfig,
    getWorkerCapacity, addOrder, setView,
  } = useStore();

  // --- Estado del Formulario de Inyección de Pedido de Cliente ---
  const [brandName, setBrandName] = useState('');
  const [videoCount, setVideoCount] = useState<number>(12);
  const [clipsPerVideo, setClipsPerVideo] = useState<number>(3);
  const [deliveryDate, setDeliveryDate] = useState<string>(() => todayIso());
  const [deliveryTime, setDeliveryTime] = useState<string>('18:00');
  const [complexity, setComplexity] = useState<'simple' | 'estandar' | 'alta'>('estandar');
  const [priority, setPriority] = useState<'normal' | 'prioritario' | 'urgente' | 'critico'>('normal');

  // Base comercial por video del proyecto (alimenta Finanzas y Nóminas)
  const [unitPriceClient, setUnitPriceClient] = useState<number>(() => financeSettings.clientPricePerVideo || 25);
  const [unitClipperPay, setUnitClipperPay] = useState<number>(() => financeSettings.defaultClipperCost || 3);
  const [unitEditorPay, setUnitEditorPay] = useState<number>(() => financeSettings.defaultEditorCost || 4);

  const [clientNotes, setClientNotes] = useState('');
  const [briefFile, setBriefFile] = useState<{ name: string; url: string } | null>(null);
  const [uploadingBrief, setUploadingBrief] = useState(false);
  const [splitIntoBatches, setSplitIntoBatches] = useState(true);
  const [createdToast, setCreatedToast] = useState<string | null>(null);
  const [expandedBrand, setExpandedBrand] = useState<string | null>(null);

  const briefInputRef = useRef<HTMLInputElement | null>(null);

  const clippers = useMemo(() => workers.filter(w => w.role === 'clipper'), [workers]);
  const editors = useMemo(() => workers.filter(w => w.role === 'editor'), [workers]);
  const allVideos = useMemo(() => brands.flatMap(b => b.videos), [brands]);

  // 1. CÁLCULO DE CAPACIDAD Y TANDAS EN VIVO PARA EL PEDIDO QUE SE ESTÁ CREANDO
  const capacityPreview = useMemo(() => {
    const safetyFactor = Math.max(0.5, (100 - capacityConfig.safetyMarginPct) / 100);
    const physicalClip = clippers.reduce((s, w) => s + getWorkerCapacity(w.id), 0);
    const physicalEdit = editors.reduce((s, w) => s + getWorkerCapacity(w.id), 0);
    const safeClip = Math.max(1, Math.floor(physicalClip * safetyFactor));
    const safeEdit = Math.max(1, Math.floor(physicalEdit * safetyFactor));
    const safeDailyLimit = Math.min(safeClip, safeEdit);
    const bottleneckStage = safeEdit <= safeClip ? 'Edición' : 'Clipping';

    const activeOrders = orders.filter(o => o.status !== 'finalizado');
    const committedByDate: Record<string, number> = {};
    for (const o of activeOrders) {
      const d = o.deliveryDate || todayIso();
      committedByDate[d] = (committedByDate[d] || 0) + Math.max(1, o.videoCount || 1);
    }

    const inProgressBoard = allVideos.filter(v => v.qc !== 'aprobado_cliente' && v.qc !== 'sin_iniciar').length;
    const targetDate = deliveryDate || todayIso();
    const committedOnTarget =
      (committedByDate[targetDate] || 0) + (targetDate === todayIso() ? inProgressBoard : 0);

    const complexityMultiplier = complexity === 'alta' ? 1.3 : complexity === 'simple' ? 0.85 : 1.0;
    const freeSafeOnTarget = Math.max(0, safeDailyLimit - committedOnTarget);
    const maxAcceptableOnTarget = Math.floor(freeSafeOnTarget / complexityMultiplier);
    const fitsInSingleDay = videoCount <= maxAcceptableOnTarget;

    const batches: { index: number; date: string; videos: number }[] = [];
    let remaining = Math.max(1, videoCount);
    let cursor = 0;

    while (remaining > 0 && cursor < 20) {
      const dStr = addDaysIso(targetDate, cursor);
      const already = (committedByDate[dStr] || 0) + (dStr === todayIso() ? inProgressBoard : 0);
      const freeRaw = Math.max(0, safeDailyLimit - already);
      const maxDay = Math.max(cursor === 0 ? 0 : 1, Math.floor(freeRaw / complexityMultiplier));

      if (maxDay > 0) {
        const alloc = Math.min(remaining, maxDay);
        batches.push({ index: batches.length + 1, date: dStr, videos: alloc });
        remaining -= alloc;
      }
      cursor++;
    }

    const finalDate = batches.length > 0 ? batches[batches.length - 1].date : targetDate;
    const workHours = Math.max(4, capacityConfig.workdayEndHour - capacityConfig.workdayStartHour);
    const prioSpeed = priority === 'critico' ? 0.65 : priority === 'urgente' ? 0.8 : priority === 'prioritario' ? 0.9 : 1.0;
    const lastBatch = batches[batches.length - 1];
    const ratio = lastBatch ? Math.min(1, lastBatch.videos / Math.max(1, safeDailyLimit)) : 0.5;
    const startH = capacityConfig.workdayStartHour + Math.max(1.5, ratio * (workHours - 2) * prioSpeed);
    const winStart = Math.min(capacityConfig.workdayEndHour - 2, Math.max(capacityConfig.workdayStartHour + 1, startH));
    const winEnd = Math.min(capacityConfig.workdayEndHour, winStart + 2);

    const etaText = `${finalDate === todayIso() ? 'Hoy' : finalDate} entre ${formatHour(winStart)} y ${formatHour(winEnd)}`;

    return {
      safeDailyLimit,
      bottleneckStage,
      committedOnTarget,
      freeSafeOnTarget,
      maxAcceptableOnTarget,
      fitsInSingleDay,
      batches,
      finalDate,
      etaText,
    };
  }, [
    clippers,
    editors,
    orders,
    allVideos,
    deliveryDate,
    videoCount,
    complexity,
    priority,
    capacityConfig,
    getWorkerCapacity,
  ]);

  // 2. PREVISUALIZACIÓN FINANCIERA DEL PEDIDO
  const financialPreview = useMemo(() => {
    const count = Math.max(1, videoCount || 1);
    const grossTotal = count * Math.max(0, unitPriceClient);
    const clipperTotal = count * Math.max(0, unitClipperPay);
    const editorTotal = count * Math.max(0, unitEditorPay);
    const payrollTotal = clipperTotal + editorTotal;
    const netMargin = grossTotal - payrollTotal;
    const marginPct = grossTotal > 0 ? Math.round((netMargin / grossTotal) * 100) : 0;

    return {
      grossTotal,
      clipperTotal,
      editorTotal,
      payrollTotal,
      netMargin,
      marginPct,
    };
  }, [videoCount, unitPriceClient, unitClipperPay, unitEditorPay]);

  // 3. DIRECTORIO DE CLIENTES / MARCAS ACTIVAS Y SUS MÉTRICAS
  const clientDirectory = useMemo(() => {
    const map = new Map<string, {
      brand: string;
      totalOrders: number;
      totalVideosOrdered: number;
      videosCompletedClient: number;
      videosApprovedSenda: number;
      grossBilled: number;
      creatorCost: number;
      netProfit: number;
      ordersList: typeof orders;
    }>();

    for (const o of orders) {
      const key = o.brand.trim();
      if (!key) continue;
      const existing = map.get(key) || {
        brand: key,
        totalOrders: 0,
        totalVideosOrdered: 0,
        videosCompletedClient: 0,
        videosApprovedSenda: 0,
        grossBilled: 0,
        creatorCost: 0,
        netProfit: 0,
        ordersList: [],
      };

      const count = Math.max(1, o.videoCount || 1);
      const uPrice = o.unitPriceClient ?? financeSettings.clientPricePerVideo;
      const uClip = o.unitClipperPay ?? financeSettings.defaultClipperCost;
      const uEdit = o.unitEditorPay ?? financeSettings.defaultEditorCost;

      const gross = count * uPrice;
      const cost = count * (uClip + uEdit);

      existing.totalOrders += 1;
      existing.totalVideosOrdered += count;
      existing.grossBilled += gross;
      existing.creatorCost += cost;
      existing.netProfit += gross - cost;
      existing.ordersList.push(o);

      // Si el pedido ya tiene un video en el tablero, verificamos su estado de aprobación
      const matchingBoardVideo = allVideos.find(v => v.id === o.boardVideoId || v.name.toLowerCase() === key.toLowerCase());
      if (matchingBoardVideo?.qc === 'aprobado_cliente' || o.status === 'aprobado_cliente' || o.status === 'finalizado') {
        existing.videosCompletedClient += count;
      } else if (matchingBoardVideo?.qc === 'aprobado_senda' || o.status === 'aprobado_senda') {
        existing.videosApprovedSenda += count;
      }

      map.set(key, existing);
    }

    return Array.from(map.values()).sort((a, b) => b.grossBilled - a.grossBilled);
  }, [orders, allVideos, financeSettings]);

  const handleUploadBrief = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingBrief(true);
    try {
      const url = await uploadSharedFile(f, 'client-briefs');
      setBriefFile({ name: f.name, url });
    } finally {
      setUploadingBrief(false);
    }
  };

  const handleInjectOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanBrand = brandName.trim();
    if (!cleanBrand || videoCount <= 0) return;

    if (!capacityPreview.fitsInSingleDay && splitIntoBatches && capacityPreview.batches.length > 1) {
      capacityPreview.batches.forEach(b => {
        addOrder({
          brand: `${cleanBrand} · Tanda ${b.index}/${capacityPreview.batches.length}`,
          videoCount: b.videos,
          deliveryDate: b.date,
          deliveryTime,
          status: 'sin_asignar',
          assignedWorkerIds: [],
          clipperId: null,
          editorId: null,
          unitPriceClient,
          unitClipperPay,
          unitEditorPay,
          clipsPerVideo,
          complexity,
          priority,
          briefFileName: briefFile?.name || null,
          briefFileUrl: briefFile?.url || null,
          clientNotes: clientNotes.trim() || `Tanda ${b.index}: ${b.videos} videos · ${capacityPreview.etaText}`,
        });
      });
      setCreatedToast(`Se inyectaron ${capacityPreview.batches.length} tandas de "${cleanBrand}" en Tareas y Finanzas.`);
    } else {
      addOrder({
        brand: cleanBrand,
        videoCount,
        deliveryDate,
        deliveryTime,
        status: 'sin_asignar',
        assignedWorkerIds: [],
        clipperId: null,
        editorId: null,
        unitPriceClient,
        unitClipperPay,
        unitEditorPay,
        clipsPerVideo,
        complexity,
        priority,
        briefFileName: briefFile?.name || null,
        briefFileUrl: briefFile?.url || null,
        clientNotes: clientNotes.trim() || `ETA: ${capacityPreview.etaText}`,
      });
      setCreatedToast(`Pedido de "${cleanBrand}" (${videoCount} videos) inyectado en Tareas, Finanzas y Capacidad.`);
    }

    setBrandName('');
    setClientNotes('');
    setBriefFile(null);
    setTimeout(() => setCreatedToast(null), 4000);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* CABECERA */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-accent-dim border border-accent/40 text-accent flex items-center justify-center shadow-[0_0_24px_-4px_rgba(53,214,228,0.4)]">
            <Briefcase size={22} />
          </div>
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold">Clientes y Pedidos</h2>
            <p className="text-xs text-muted">
              Centro de entrada comercial · Alimenta automáticamente Tareas, Finanzas, Nóminas y Alertas de Capacidad
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView('tareas')}
            className="bg-surface-2 hover:bg-surface-3 border border-line rounded-xl px-3.5 py-2 text-xs font-semibold text-muted hover:text-text flex items-center gap-1.5 transition-colors"
          >
            Ver Proyectos Disponibles <ArrowRight size={13} />
          </button>
          <button
            type="button"
            onClick={() => setView('finanzas')}
            className="bg-mint-dim hover:bg-mint/20 border border-mint/30 rounded-xl px-3.5 py-2 text-xs font-semibold text-mint flex items-center gap-1.5 transition-colors"
          >
            <DollarSign size={13} /> Ver Finanzas
          </button>
        </div>
      </div>

      {/* CONSOLA DE INYECCIÓN DE PEDIDO + VALIDACIÓN OPERATIVA Y FINANCIERA EN VIVO */}
      <form onSubmit={handleInjectOrder} className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Columna Izquierda (7 cols): Configuración Comercial y Operativa del Cliente */}
        <div className="lg:col-span-7 bg-surface-2 border border-line rounded-3xl p-6 space-y-5 relative overflow-hidden">
          <CardNodeDeco color="var(--accent)" />

          <div className="flex items-center justify-between relative z-10">
            <span className="font-tech text-xs uppercase tracking-wider text-accent font-semibold flex items-center gap-1.5">
              <PlusCircle size={14} /> Nuevo Pedido de Cliente
            </span>
            <span className="text-[11px] font-tech text-muted-2">Inyección directa</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 relative z-10">
            <div className="sm:col-span-6">
              <label className="text-xs text-muted block mb-1">Nombre del Cliente / Marca</label>
              <input
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="Ej. Nike, Gymshark, Ecommerce..."
                required
                className="w-full bg-surface-3 border border-line rounded-xl px-3.5 py-2 text-sm font-medium outline-none focus:border-accent"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="text-xs text-muted block mb-1">Cantidad videos</label>
              <input
                type="number"
                min={1}
                max={200}
                value={videoCount}
                onChange={e => setVideoCount(Math.max(1, Number(e.target.value) || 1))}
                className="w-full bg-surface-3 border border-line rounded-xl px-3 py-2 text-sm font-tech font-bold text-accent outline-none focus:border-accent"
              />
            </div>

            <div className="sm:col-span-3">
              <label className="text-xs text-muted block mb-1">Clips / video</label>
              <input
                type="number"
                min={1}
                max={25}
                value={clipsPerVideo}
                onChange={e => setClipsPerVideo(Math.max(1, Number(e.target.value) || 1))}
                className="w-full bg-surface-3 border border-line rounded-xl px-3 py-2 text-sm font-tech outline-none focus:border-accent"
              />
            </div>
          </div>

          {/* Base Comercial por Video (Conecta con Finanzas y Nóminas) */}
          <div className="bg-surface-3/80 border border-line rounded-2xl p-4 space-y-3 relative z-10">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-tech uppercase tracking-wider text-mint font-semibold flex items-center gap-1.5">
                <DollarSign size={13} /> Base Comercial por Video (Finanzas y Nóminas)
              </span>
              <span className="font-tech text-xs text-mint font-bold">
                Margen proyecto: {financialPreview.marginPct}%
              </span>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <label className="block">
                <span className="text-[11px] text-muted-2 block mb-1">Cobro Cliente / vid</span>
                <input
                  type="number"
                  min={1}
                  value={unitPriceClient}
                  onChange={e => setUnitPriceClient(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm font-tech text-text outline-none focus:border-mint"
                />
              </label>

              <label className="block">
                <span className="text-[11px] text-muted-2 block mb-1 flex items-center gap-1">
                  <Scissors size={10} className="text-accent" /> Pago Clipper / vid
                </span>
                <input
                  type="number"
                  min={0}
                  value={unitClipperPay}
                  onChange={e => setUnitClipperPay(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm font-tech text-accent outline-none focus:border-accent"
                />
              </label>

              <label className="block">
                <span className="text-[11px] text-muted-2 block mb-1 flex items-center gap-1">
                  <Film size={10} className="text-mint" /> Pago Editor / vid
                </span>
                <input
                  type="number"
                  min={0}
                  value={unitEditorPay}
                  onChange={e => setUnitEditorPay(Math.max(0, Number(e.target.value) || 0))}
                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm font-tech text-mint outline-none focus:border-mint"
                />
              </label>
            </div>
          </div>

          {/* Configuración de Entrega, Complejidad y Regla de Prioridad (Conecta con Protocolo de Alertas) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative z-10">
            <div className="bg-surface-3/80 border border-line rounded-2xl p-3.5 space-y-2">
              <span className="text-[11px] font-tech uppercase text-muted-2 flex items-center gap-1">
                <Calendar size={12} className="text-accent" /> Fecha y Hora Límite
              </span>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={deliveryDate}
                  onChange={e => setDeliveryDate(e.target.value)}
                  className="bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-xs font-tech outline-none focus:border-accent"
                />
                <input
                  type="time"
                  value={deliveryTime}
                  onChange={e => setDeliveryTime(e.target.value)}
                  className="bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-xs font-tech outline-none focus:border-accent"
                />
              </div>
            </div>

            <div className="bg-surface-3/80 border border-line rounded-2xl p-3.5 space-y-2">
              <span className="text-[11px] font-tech uppercase text-muted-2 flex items-center gap-1">
                <Layers size={12} className="text-mint" /> Complejidad Operativa
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {(['simple', 'estandar', 'alta'] as const).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setComplexity(c)}
                    className={`py-1.5 rounded-lg text-xs font-semibold capitalize border transition-all ${
                      complexity === c
                        ? 'bg-accent text-on-accent border-accent'
                        : 'bg-surface-2 text-muted border-line hover:text-text'
                    }`}
                  >
                    {c === 'alta' ? 'Compleja' : c}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Prioridad + Subida de Brief */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end relative z-10">
            <div className="sm:col-span-7">
              <span className="text-[11px] font-tech uppercase text-muted-2 block mb-1.5 flex items-center gap-1">
                <ShieldAlert size={12} className="text-amber" /> Regla de Prioridad (Protocolo de Alertas)
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {(['normal', 'prioritario', 'urgente', 'critico'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPriority(p)}
                    className={`py-2 rounded-xl text-[11px] font-bold capitalize border transition-all ${
                      priority === p
                        ? 'bg-amber text-on-accent border-amber'
                        : 'bg-surface-3 text-muted border-line hover:text-text'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div className="sm:col-span-5">
              <input
                ref={briefInputRef}
                type="file"
                accept=".pdf,.doc,.docx,image/*,*/*"
                className="hidden"
                onChange={e => void handleUploadBrief(e)}
              />
              <button
                type="button"
                onClick={() => briefInputRef.current?.click()}
                disabled={uploadingBrief}
                className={`w-full py-2 px-3 rounded-xl border text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                  briefFile
                    ? 'bg-accent-dim/60 border-accent text-accent'
                    : 'bg-surface-3 border-line border-dashed text-muted hover:text-text hover:border-accent/40'
                }`}
              >
                {uploadingBrief ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : briefFile ? (
                  <FileText size={14} />
                ) : (
                  <Upload size={14} />
                )}
                <span className="truncate">
                  {uploadingBrief ? 'Subiendo...' : briefFile ? briefFile.name : 'Adjuntar Brief / Guion'}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Columna Derecha (5 cols): Dictamen en Vivo (Finanzas + Capacidad + Botón de Inyección) */}
        <div className="lg:col-span-5 bg-surface-2 border border-mint/35 rounded-3xl p-6 flex flex-col justify-between space-y-5 relative overflow-hidden shadow-[0_0_45px_-18px_rgba(111,231,200,0.25)]">
          <CardNodeDeco color="var(--mint)" />

          <div className="space-y-4 relative z-10">
            <span className="font-tech text-xs uppercase tracking-wider text-mint font-semibold flex items-center gap-1.5">
              <Sparkles size={14} /> Impacto del Pedido en Vivo
            </span>

            {/* Resumen Financiero del Pedido */}
            <div className="grid grid-cols-3 gap-2.5">
              <div className="bg-surface-3/90 border border-line rounded-2xl p-3.5">
                <span className="text-[10px] font-tech uppercase text-amber block">Ingreso Diferido</span>
                <p className="font-display text-xl font-bold font-tech text-text mt-1">
                  {fmtMoneyClean(financialPreview.grossTotal)}
                </p>
                <span className="text-[10px] text-muted-2 font-tech">Facturación bruta</span>
              </div>

              <div className="bg-surface-3/90 border border-line rounded-2xl p-3.5">
                <span className="text-[10px] font-tech uppercase text-accent block">Nómina (C+E)</span>
                <p className="font-display text-xl font-bold font-tech text-accent mt-1">
                  {fmtMoneyClean(financialPreview.payrollTotal)}
                </p>
                <span className="text-[10px] text-muted-2 font-tech">
                  C:{fmtMoneyClean(financialPreview.clipperTotal)} E:{fmtMoneyClean(financialPreview.editorTotal)}
                </span>
              </div>

              <div className="bg-mint-dim/30 border border-mint/40 rounded-2xl p-3.5">
                <span className="text-[10px] font-tech uppercase text-mint font-bold block">Neto SENDA</span>
                <p className="font-display text-xl font-bold font-tech text-mint mt-1">
                  {fmtMoneyClean(financialPreview.netMargin)}
                </p>
                <span className="text-[10px] text-mint font-tech">Libre ({financialPreview.marginPct}%)</span>
              </div>
            </div>

            {/* Dictamen de Capacidad y Tandas */}
            <div className={`rounded-2xl p-4 border space-y-2 ${
              capacityPreview.fitsInSingleDay
                ? 'bg-mint-dim/25 border-mint/40'
                : 'bg-amber-dim/25 border-amber/40'
            }`}>
              <div className="flex items-center justify-between">
                <span className="font-tech text-xs uppercase font-bold flex items-center gap-1.5">
                  {capacityPreview.fitsInSingleDay ? (
                    <><CheckCircle2 size={15} className="text-mint" /> Cabe en la fecha solicitada</>
                  ) : (
                    <><AlertTriangle size={15} className="text-amber" /> Supera el cupo del día ({capacityPreview.maxAcceptableOnTarget} libres)</>
                  )}
                </span>
                <span className="font-tech text-[11px] text-accent">{capacityPreview.etaText}</span>
              </div>

              {!capacityPreview.fitsInSingleDay && capacityPreview.batches.length > 1 && (
                <div className="pt-2 border-t border-line/60 flex items-center justify-between gap-2">
                  <span className="text-xs text-muted">
                    Dividir automáticamente en <strong>{capacityPreview.batches.length} tandas seguras</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSplitIntoBatches(s => !s)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-tech font-bold border transition-colors ${
                      splitIntoBatches
                        ? 'bg-mint text-on-accent border-mint'
                        : 'bg-surface-2 text-muted border-line'
                    }`}
                  >
                    {splitIntoBatches ? 'Tandas Activas' : '1 Solo Lote'}
                  </button>
                </div>
              )}
            </div>

            {/* Vista rápida de tandas si aplica */}
            {capacityPreview.batches.length > 1 && splitIntoBatches && (
              <div className="flex flex-wrap gap-1.5">
                {capacityPreview.batches.map(b => (
                  <span
                    key={b.date}
                    className="text-[11px] font-tech px-2.5 py-1 rounded-lg bg-surface-3 border border-line text-muted"
                  >
                    Tanda {b.index} ({b.date}): <strong className="text-mint">{b.videos} vid</strong>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3 relative z-10">
            {createdToast && (
              <div className="bg-mint-dim border border-mint/40 text-mint rounded-xl px-3.5 py-2 text-xs font-semibold flex items-center gap-2">
                <CheckCircle2 size={14} /> {createdToast}
              </div>
            )}

            <button
              type="submit"
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-accent to-mint text-on-accent font-display text-sm font-bold hover:opacity-95 transition-all flex items-center justify-center gap-2 shadow-[0_10px_28px_-6px_rgba(53,214,228,0.55)]"
            >
              <PlusCircle size={17} />
              Inyectar Pedido al Sistema SENDA
            </button>
          </div>
        </div>
      </form>

      {/* DIRECTORIO DE MARCAS / CLIENTES Y ESTADO DE SUS PEDIDOS */}
      <div className="bg-surface-2 border border-line rounded-3xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display text-lg font-bold flex items-center gap-2">
              <Briefcase size={18} className="text-accent" /> Cartera de Clientes y Progreso de Entregas ({clientDirectory.length})
            </h3>
            <p className="text-xs text-muted">
              Haz clic en un cliente para desplegar todos sus lotes, tarifas comerciales y estado en Tareas
            </p>
          </div>
        </div>

        {clientDirectory.length === 0 ? (
          <p className="text-sm text-muted text-center py-8">Aún no hay pedidos de clientes registrados.</p>
        ) : (
          <div className="space-y-2.5">
            {clientDirectory.map(client => {
              const isOpen = expandedBrand === client.brand;
              const completionPct = Math.min(
                100,
                Math.round((client.videosCompletedClient / Math.max(1, client.totalVideosOrdered)) * 100)
              );

              return (
                <div
                  key={client.brand}
                  className={`bg-surface-3/85 border rounded-2xl transition-all overflow-hidden ${
                    isOpen ? 'border-accent/60 shadow-lg' : 'border-line hover:border-accent/30'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedBrand(prev => (prev === client.brand ? null : client.brand))}
                    className="w-full p-4 flex items-center justify-between gap-4 text-left flex-wrap"
                  >
                    <div className="flex items-center gap-3 min-w-[200px]">
                      <div className="w-10 h-10 rounded-xl bg-accent-dim text-accent font-display font-bold text-base flex items-center justify-center shrink-0">
                        {client.brand.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-display text-base font-bold">{client.brand}</p>
                        <p className="text-xs text-muted font-tech">
                          {client.totalOrders} lote(s) · {client.totalVideosOrdered} videos totales
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-6 flex-wrap">
                      <div className="text-right font-tech">
                        <span className="text-[10px] uppercase text-muted-2 block">Facturación Bruta</span>
                        <strong className="text-sm text-text">{fmtMoneyClean(client.grossBilled)}</strong>
                      </div>

                      <div className="text-right font-tech">
                        <span className="text-[10px] uppercase text-mint block">Margen Neto SENDA</span>
                        <strong className="text-sm text-mint">{fmtMoneyClean(client.netProfit)}</strong>
                      </div>

                      <div className="w-28 hidden sm:block">
                        <div className="flex justify-between text-[10px] font-tech text-muted-2 mb-1">
                          <span>Entregado</span>
                          <span className="text-mint">{completionPct}%</span>
                        </div>
                        <div className="h-2 bg-surface-2 rounded-full overflow-hidden border border-line">
                          <div className="h-full bg-mint rounded-full" style={{ width: `${completionPct}%` }} />
                        </div>
                      </div>

                      <ChevronDown
                        size={16}
                        className={`text-muted transition-transform ${isOpen ? 'rotate-180 text-accent' : ''}`}
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="px-4 pb-4 pt-2 border-t border-line/60 bg-surface-2/70 space-y-2 animate-fadeIn">
                      {client.ordersList.map(ord => (
                        <div
                          key={ord.id}
                          className="bg-surface-3 border border-line rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap text-xs"
                        >
                          <div className="flex items-center gap-2.5">
                            <span className="font-tech px-2 py-0.5 rounded bg-accent-dim text-accent font-bold">
                              {ord.videoCount} vid
                            </span>
                            <span className="font-medium">
                              Entrega: {ord.deliveryDate} {ord.deliveryTime}
                            </span>
                            {ord.complexity && (
                              <span className="font-tech text-[10px] uppercase px-2 py-0.5 rounded bg-surface-2 border border-line text-muted">
                                {ord.complexity === 'alta' ? 'Compleja' : ord.complexity}
                              </span>
                            )}
                            {ord.priority && ord.priority !== 'normal' && (
                              <span className="font-tech text-[10px] uppercase px-2 py-0.5 rounded bg-amber-dim text-amber">
                                {ord.priority}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 font-tech">
                            <span className="text-muted">
                              Tarifa: <strong className="text-text">{fmtMoneyClean(ord.unitPriceClient ?? financeSettings.clientPricePerVideo)}/vid</strong>
                            </span>
                            <button
                              type="button"
                              onClick={() => setView('tareas')}
                              className="text-accent hover:underline flex items-center gap-1"
                            >
                              <Eye size={12} /> Ver en Tareas
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
