import { useState, useMemo } from 'react';
import { useStore } from '../store';
import type { Order } from '../types';
import { CardNodeDeco } from '../components/BrandBackground';
import {
  Gauge, Scissors, Film, AlertTriangle, CheckCircle2, Clock,
  Sliders, Sparkles, Layers, ArrowRight, ArrowLeft, RefreshCw,
  ShieldAlert, TrendingUp, UserPlus, Eye, Zap, Calendar, PlusCircle, Activity,
} from 'lucide-react';

type EngineModule = 'evaluador' | 'simulador' | 'protocolo' | 'historico';
type AlertLevel = 'normal' | 'elevada' | 'cerca_limite' | 'comprometida' | 'sobrecapacidad';

const ALERT_META: Record<AlertLevel, { label: string; desc: string; badgeClass: string; dotClass: string; ringColor: string }> = {
  normal: {
    label: 'Normal · Margen suficiente',
    desc: 'Capacidad saludable para absorber nuevos pedidos sin fricción.',
    badgeClass: 'bg-mint-dim text-mint border-mint/30',
    dotClass: 'bg-mint',
    ringColor: 'var(--mint)',
  },
  elevada: {
    label: 'Capacidad elevada · Utilización creciente',
    desc: 'Demanda activa por encima del 58%. Monitorear equilibrio entre Clippers y Editores.',
    badgeClass: 'bg-accent-dim text-accent border-accent/30',
    dotClass: 'bg-accent',
    ringColor: 'var(--accent)',
  },
  cerca_limite: {
    label: 'Cerca del límite · Margen reducido',
    desc: 'Utilización superior al 78% de la capacidad comercial segura.',
    badgeClass: 'bg-amber-dim text-amber border-amber/30',
    dotClass: 'bg-amber',
    ringColor: 'var(--amber)',
  },
  comprometida: {
    label: 'Capacidad comprometida · Riesgo en promesas',
    desc: 'Aceptar pedidos grandes para hoy requiere dividir en tandas.',
    badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    dotClass: 'bg-orange-400',
    ringColor: '#fb923c',
  },
  sobrecapacidad: {
    label: 'Sobrecapacidad · Supera capacidad segura',
    desc: 'La demanda comprometida supera el límite seguro. Reprogramar en tandas o reasignar.',
    badgeClass: 'bg-red-500/15 text-red-400 border-red-500/30',
    dotClass: 'bg-red-500',
    ringColor: '#ef4444',
  },
};

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

export function CapacityView() {
  const {
    workers, orders, brands, capacityConfig, updateCapacityConfig,
    getWorkerCapacity, setWorkerCapacity, addOrder, assignOrderClipper, assignOrderEditor,
  } = useStore();

  const [clientMode, setClientMode] = useState(false);
  // null = Vista Principal (Radar + Las 4 tarjetas de acceso); si tiene valor, abre esa sección en página completa
  const [openModule, setOpenModule] = useState<EngineModule | null>(null);
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);

  // --- Estado del Punto 1: Evaluador de Pedidos / Cotizador de Capacidad y Tandas ---
  const [evalBrand, setEvalBrand] = useState('Nuevo Cliente');
  const [evalVideos, setEvalVideos] = useState<number>(30);
  const [evalClipsPerVideo, setEvalClipsPerVideo] = useState<number>(3);
  const [evalDate, setEvalDate] = useState<string>(() => todayIso());
  const [evalComplexity, setEvalComplexity] = useState<'simple' | 'estandar' | 'alta'>('estandar');
  const [evalPriority, setEvalPriority] = useState<'normal' | 'prioritario' | 'urgente' | 'critico'>('normal');
  const [orderCreatedToast, setOrderCreatedToast] = useState<string | null>(null);

  // --- Estado del Punto 2: Simulador de Escenarios ("¿Qué pasaría si...?") ---
  const [simExtraVideos, setSimExtraVideos] = useState<number>(50);
  const [simExtraClippers, setSimExtraClippers] = useState<number>(0);
  const [simExtraEditors, setSimExtraEditors] = useState<number>(0);
  const [simUnavailablePct, setSimUnavailablePct] = useState<number>(0);
  const [simEditorDemandBoostPct, setSimEditorDemandBoostPct] = useState<number>(0);

  // --- Estado del Punto 3: Reasignación en Protocolo ---
  const [reassignedToastId, setReassignedToastId] = useState<string | null>(null);

  const clippers = useMemo(() => workers.filter(w => w.role === 'clipper'), [workers]);
  const editors = useMemo(() => workers.filter(w => w.role === 'editor'), [workers]);
  const allVideos = useMemo(() => brands.flatMap(b => b.videos), [brands]);

  // 1. MOTOR CENTRAL DE CAPACIDAD (Calcula todo a partir de la capacidad individual de cada Clipper y Editor + Promedio automático)
  const engine = useMemo(() => {
    const safetyFactor = Math.max(0.5, (100 - capacityConfig.safetyMarginPct) / 100);

    // Suma de capacidades individuales configuradas por trabajador
    const physicalClippingDaily = clippers.reduce((sum, w) => sum + getWorkerCapacity(w.id), 0);
    const physicalEditingDaily = editors.reduce((sum, w) => sum + getWorkerCapacity(w.id), 0);

    // Promedio individual real de Clippers y Editores (para estimar contrataciones y simulaciones sin valor fijo inventado)
    const avgClipperDaily = clippers.length > 0 ? Math.round(physicalClippingDaily / clippers.length) : 10;
    const avgEditorDaily = editors.length > 0 ? Math.round(physicalEditingDaily / editors.length) : 10;

    // Calidad y retrabajo real
    const videosWithRework = allVideos.filter(
      v => v.qc === 'correcciones' || v.corrections.length > 0 || v.clips.some(c => c.status === 'rejected')
    ).length;
    const reworkRatePct = allVideos.length > 0 ? Math.round((videosWithRework / allVideos.length) * 100) : 0;

    // Capacidad comercial segura por etapa
    const safeClippingDaily = Math.max(1, Math.floor(physicalClippingDaily * safetyFactor));
    const safeEditingDaily = Math.max(1, Math.floor(physicalEditingDaily * safetyFactor));

    // Etapa cuello de botella
    const bottleneckStage: 'Clipping' | 'Edición' =
      safeEditingDaily <= safeClippingDaily ? 'Edición' : 'Clipping';
    const physicalBottleneckDaily = Math.min(physicalClippingDaily, physicalEditingDaily);
    const safeBottleneckDaily = Math.min(safeClippingDaily, safeEditingDaily);

    // Demanda comprometida por fecha
    const activeOrders = orders.filter(o => o.status !== 'finalizado');
    const committedByDate: Record<string, number> = {};
    for (const o of activeOrders) {
      const d = o.deliveryDate || todayIso();
      committedByDate[d] = (committedByDate[d] || 0) + Math.max(1, o.videoCount || 1);
    }

    const today = todayIso();
    const committedToday = committedByDate[today] || 0;
    const totalActiveCommitted = activeOrders.reduce((s, o) => s + Math.max(1, o.videoCount || 1), 0);

    const clippingUtilPct = safeClippingDaily > 0 ? Math.round((committedToday / safeClippingDaily) * 100) : 0;
    const editingUtilPct = safeEditingDaily > 0 ? Math.round((committedToday / safeEditingDaily) * 100) : 0;
    const overallUtilPct = safeBottleneckDaily > 0 ? Math.round((committedToday / safeBottleneckDaily) * 100) : 0;

    let alertLevel: AlertLevel = 'normal';
    if (overallUtilPct > 100) alertLevel = 'sobrecapacidad';
    else if (overallUtilPct >= 90) alertLevel = 'comprometida';
    else if (overallUtilPct >= 78) alertLevel = 'cerca_limite';
    else if (overallUtilPct >= 58) alertLevel = 'elevada';

    const remainingSafeToday = Math.max(0, safeBottleneckDaily - committedToday);

    return {
      physicalClippingDaily,
      physicalEditingDaily,
      avgClipperDaily,
      avgEditorDaily,
      safeClippingDaily,
      safeEditingDaily,
      bottleneckStage,
      physicalBottleneckDaily,
      safeBottleneckDaily,
      committedByDate,
      committedToday,
      totalActiveCommitted,
      clippingUtilPct,
      editingUtilPct,
      overallUtilPct,
      alertLevel,
      remainingSafeToday,
      reworkRatePct,
      videosWithRework,
      activeOrders,
    };
  }, [clippers, editors, allVideos, orders, capacityConfig.safetyMarginPct, getWorkerCapacity]);

  // 2. EVALUADOR DEL NUEVO PEDIDO
  const evaluation = useMemo(() => {
    const complexityMultiplier = evalComplexity === 'alta' ? 1.3 : evalComplexity === 'simple' ? 0.85 : 1.0;
    const effectiveVideosRequested = Math.ceil(evalVideos * complexityMultiplier);

    const committedOnTargetDate = engine.committedByDate[evalDate] || 0;
    const availableSafeOnTargetDate = Math.max(0, engine.safeBottleneckDaily - committedOnTargetDate);
    const maxImmediateAcceptable = Math.floor(availableSafeOnTargetDate / complexityMultiplier);

    const canAcceptFullOnDate = evalVideos <= maxImmediateAcceptable;

    const batches: { dayIndex: number; date: string; videos: number; committedBefore: number; capacityLeftAfter: number }[] = [];
    let remainingToSchedule = Math.max(1, evalVideos);
    let cursorDay = 0;

    while (remainingToSchedule > 0 && cursorDay < 14) {
      const dateStr = addDaysIso(evalDate, cursorDay);
      const alreadyCommitted = engine.committedByDate[dateStr] || 0;
      const freeSafeRaw = Math.max(0, engine.safeBottleneckDaily - alreadyCommitted);
      const maxVideosThisDay = Math.max(
        cursorDay === 0 ? 0 : 1,
        Math.floor(freeSafeRaw / complexityMultiplier)
      );

      if (maxVideosThisDay > 0) {
        const allocated = Math.min(remainingToSchedule, maxVideosThisDay);
        batches.push({
          dayIndex: batches.length + 1,
          date: dateStr,
          videos: allocated,
          committedBefore: alreadyCommitted,
          capacityLeftAfter: Math.max(0, engine.safeBottleneckDaily - (alreadyCommitted + Math.ceil(allocated * complexityMultiplier))),
        });
        remainingToSchedule -= allocated;
      }
      cursorDay++;
    }

    const finalCompletionDate = batches.length > 0 ? batches[batches.length - 1].date : evalDate;

    const workHoursPerDay = Math.max(4, capacityConfig.workdayEndHour - capacityConfig.workdayStartHour);
    const prioritySpeedFactor =
      evalPriority === 'critico' ? 0.65 : evalPriority === 'urgente' ? 0.8 : evalPriority === 'prioritario' ? 0.9 : 1.0;

    const lastBatch = batches[batches.length - 1];
    const loadRatioOnFinalDay = lastBatch
      ? Math.min(1, (lastBatch.committedBefore + lastBatch.videos) / Math.max(1, engine.safeBottleneckDaily))
      : 0.5;

    const rawStartHour =
      capacityConfig.workdayStartHour +
      Math.max(1.5, loadRatioOnFinalDay * (workHoursPerDay - 2) * prioritySpeedFactor);
    const windowStart = Math.min(capacityConfig.workdayEndHour - 2, Math.max(capacityConfig.workdayStartHour + 1, rawStartHour));
    const windowEnd = Math.min(capacityConfig.workdayEndHour, windowStart + 2);

    const dayWord =
      finalCompletionDate === todayIso()
        ? 'hoy'
        : finalCompletionDate === addDaysIso(todayIso(), 1)
        ? 'mañana'
        : `el ${finalCompletionDate}`;

    const etaWindowText = `Entrega estimada: ${dayWord} entre ${formatHour(windowStart)} y ${formatHour(windowEnd)}`;

    return {
      effectiveVideosRequested,
      committedOnTargetDate,
      availableSafeOnTargetDate,
      maxImmediateAcceptable,
      canAcceptFullOnDate,
      batches,
      finalCompletionDate,
      etaWindowText,
    };
  }, [evalVideos, evalDate, evalComplexity, evalPriority, engine, capacityConfig]);

  // 3. SIMULADOR DE ESCENARIOS (Usa el promedio real individual de Clippers y Editores)
  const simulation = useMemo(() => {
    const availFactor = Math.max(0.2, (100 - simUnavailablePct) / 100);
    const safetyFactor = Math.max(0.5, (100 - capacityConfig.safetyMarginPct) / 100);

    const simPhysicalClip = Math.floor(
      (engine.physicalClippingDaily + simExtraClippers * engine.avgClipperDaily) * availFactor
    );
    const simPhysicalEdit = Math.floor(
      (engine.physicalEditingDaily + simExtraEditors * engine.avgEditorDaily) * availFactor
    );

    const simSafeClip = Math.max(1, Math.floor(simPhysicalClip * safetyFactor));
    const simSafeEdit = Math.max(1, Math.floor(simPhysicalEdit * safetyFactor));

    const editorDemandFactor = 1 + simEditorDemandBoostPct / 100;
    const totalSimulatedDemand = Math.ceil((engine.committedToday + simExtraVideos) * editorDemandFactor);

    const simBottleneck: 'Clipping' | 'Edición' = simSafeEdit <= simSafeClip ? 'Edición' : 'Clipping';
    const simSafeLimit = Math.min(simSafeClip, simSafeEdit);
    const simFreeCapacity = Math.max(0, simSafeLimit - engine.committedToday);
    const simDeficit = Math.max(0, totalSimulatedDemand - simSafeLimit);
    const simUtilPct = Math.round((totalSimulatedDemand / Math.max(1, simSafeLimit)) * 100);
    const daysNeededForExtra = Math.max(1, Math.ceil(simExtraVideos / Math.max(1, simSafeLimit)));

    return {
      simPhysicalClip,
      simPhysicalEdit,
      simSafeClip,
      simSafeEdit,
      simBottleneck,
      simSafeLimit,
      simFreeCapacity,
      totalSimulatedDemand,
      simDeficit,
      simUtilPct,
      daysNeededForExtra,
    };
  }, [
    engine,
    simExtraVideos,
    simExtraClippers,
    simExtraEditors,
    simUnavailablePct,
    simEditorDemandBoostPct,
    capacityConfig.safetyMarginPct,
  ]);

  // 4. PROTOCOLO OPERATIVO Y DETECTOR DE PEDIDOS EN RIESGO
  const ordersProtocolList = useMemo(() => {
    const now = Date.now();
    return engine.activeOrders.map(o => {
      const targetTs = o.deliveryDate
        ? new Date(`${o.deliveryDate}T${o.deliveryTime || '18:00'}`).getTime()
        : now + 24 * 3600 * 1000;
      const hoursLeft = (targetTs - now) / (1000 * 3600);
      const ageHours = (now - new Date(o.createdAt).getTime()) / (1000 * 3600);

      let protocolState: 'normal' | 'prioritario' | 'urgente' | 'critico' = o.priority || 'normal';
      let reason = 'Dentro de los tiempos operativos esperados';

      if (hoursLeft <= 1.5 || (hoursLeft <= capacityConfig.urgentThresholdHours && (!o.clipperId || !o.editorId))) {
        protocolState = 'critico';
        reason = 'Riesgo real de incumplimiento · Requiere intervención o reasignación inmediata';
      } else if (hoursLeft <= capacityConfig.urgentThresholdHours) {
        protocolState = 'urgente';
        reason = `ETA a menos de ${capacityConfig.urgentThresholdHours}h del límite · Redistribuir recursos`;
      } else if (ageHours >= capacityConfig.maxStalledHours && (!o.clipperId || !o.editorId)) {
        protocolState = 'prioritario';
        reason = `Sin asignación completa tras ${Math.round(ageHours)}h (umbral: ${capacityConfig.maxStalledHours}h)`;
      }

      return {
        order: o,
        hoursLeft: Math.round(hoursLeft * 10) / 10,
        protocolState,
        reason,
      };
    });
  }, [engine.activeOrders, capacityConfig]);

  const bestAvailableClipper = useMemo(() => {
    return [...clippers].sort((a, b) => a.pointsToday - b.pointsToday)[0] || null;
  }, [clippers]);

  const bestAvailableEditor = useMemo(() => {
    return [...editors].sort((a, b) => a.pointsToday - b.pointsToday)[0] || null;
  }, [editors]);

  const handleSmartReassign = async (order: Order) => {
    if (bestAvailableClipper && !order.clipperId) {
      await assignOrderClipper(order.id, bestAvailableClipper.id);
    }
    if (bestAvailableEditor) {
      await assignOrderEditor(order.id, bestAvailableEditor.id);
    }
    setReassignedToastId(order.id);
    setTimeout(() => setReassignedToastId(prev => (prev === order.id ? null : prev)), 3000);
  };

  const handleCreateOrderFromEvaluator = () => {
    if (!evalBrand.trim() || evalVideos <= 0) return;

    if (evaluation.canAcceptFullOnDate || evaluation.batches.length <= 1) {
      addOrder({
        brand: evalBrand.trim(),
        videoCount: evalVideos,
        deliveryDate: evalDate,
        deliveryTime: '18:00',
        status: 'sin_asignar',
        assignedWorkerIds: [],
        clipperId: null,
        editorId: null,
        priority: evalPriority,
        complexity: evalComplexity,
        clientNotes: `${evaluation.etaWindowText} · Complejidad: ${evalComplexity} (${evalClipsPerVideo} clips/video)`,
      });
      setOrderCreatedToast(`Pedido de ${evalVideos} videos para "${evalBrand}" enviado a Proyectos disponibles.`);
    } else {
      evaluation.batches.forEach(b => {
        addOrder({
          brand: `${evalBrand.trim()} (Tanda ${b.dayIndex}/${evaluation.batches.length})`,
          videoCount: b.videos,
          deliveryDate: b.date,
          deliveryTime: '18:00',
          status: 'sin_asignar',
          assignedWorkerIds: [],
          clipperId: null,
          editorId: null,
          priority: evalPriority,
          complexity: evalComplexity,
          clientNotes: `Entrega parcial Tanda ${b.dayIndex}: ${b.videos} videos · ${evaluation.etaWindowText}`,
        });
      });
      setOrderCreatedToast(`Se crearon ${evaluation.batches.length} tandas para "${evalBrand}" en Proyectos disponibles respetando la capacidad segura.`);
    }
    setTimeout(() => setOrderCreatedToast(null), 4500);
  };

  const alertMeta = ALERT_META[engine.alertLevel];
  const radialRadius = 38;
  const radialCircumference = 2 * Math.PI * radialRadius;
  const radialOffset = radialCircumference - (Math.min(100, engine.overallUtilPct) / 100) * radialCircumference;

  const MODULE_CARDS: {
    key: EngineModule;
    num: string;
    title: string;
    subtitle: string;
    metricLabel: string;
    metricValue: string;
    accentColor: 'accent' | 'mint' | 'amber' | 'violet';
    icon: typeof Zap;
  }[] = [
    {
      key: 'evaluador',
      num: '01',
      title: 'Evaluador de Pedidos, Tandas y ETA',
      subtitle: 'Calcula si un pedido cabe en la fecha solicitada, genera entregas parciales por tandas y ventana ETA.',
      metricLabel: 'Capacidad libre hoy',
      metricValue: `${engine.remainingSafeToday} vid disponibles`,
      accentColor: 'accent',
      icon: Zap,
    },
    {
      key: 'simulador',
      num: '02',
      title: 'Simulador («¿Qué pasaría si...?»)',
      subtitle: 'Prueba picos de +videos, nuevas contrataciones o ausentismo sin alterar tus pedidos reales.',
      metricLabel: 'Promedio por integrante',
      metricValue: `${engine.avgClipperDaily}C · ${engine.avgEditorDaily}E vid/día`,
      accentColor: 'mint',
      icon: Sparkles,
    },
    {
      key: 'protocolo',
      num: '03',
      title: 'Protocolo Operativo y Reasignación',
      subtitle: 'Monitorea pedidos Prioritarios, Urgentes o Críticos y reasigna en 1 clic al recurso con menor carga.',
      metricLabel: 'Pedidos con alerta activa',
      metricValue: `${ordersProtocolList.filter(x => x.protocolState !== 'normal').length} en atención`,
      accentColor: 'amber',
      icon: ShieldAlert,
    },
    {
      key: 'historico',
      num: '04',
      title: 'Histórico, Retrabajo y Contratación',
      subtitle: 'Mide el impacto de correcciones en la capacidad efectiva y muestra evidencia matemática para contratar.',
      metricLabel: 'Cuello de botella actual',
      metricValue: `${engine.bottleneckStage} (${engine.safeBottleneckDaily} vid/día)`,
      accentColor: 'violet',
      icon: TrendingUp,
    },
  ];

  // ============================================================================
  // SI EL USUARIO ESTÁ EN MODO CLIENTE O ABRIÓ UNO DE LOS 4 PUNTOS A PANTALLA COMPLETA
  // ============================================================================
  if (openModule !== null || clientMode) {
    const currentModule = clientMode ? 'evaluador' : openModule!;
    const currentMeta = MODULE_CARDS.find(m => m.key === currentModule)!;

    return (
      <div className="p-6 max-w-6xl mx-auto space-y-5 animate-fadeIn">
        {/* Barra superior de navegación de la página dedicada */}
        <div className="bg-surface-2 border border-line rounded-2xl p-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            {!clientMode && (
              <button
                type="button"
                onClick={() => setOpenModule(null)}
                className="flex items-center gap-2 bg-surface-3 hover:bg-accent-dim text-muted hover:text-accent border border-line hover:border-accent/40 rounded-xl px-3.5 py-2 text-xs font-semibold transition-all"
              >
                <ArrowLeft size={15} /> Volver al Dashboard
              </button>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-tech text-xs px-2 py-0.5 rounded bg-accent-dim text-accent border border-accent/30">
                  MÓDULO {currentMeta.num}
                </span>
                <h2 className="font-display text-lg sm:text-xl font-bold">
                  {clientMode ? 'Calculadora Comercial de Entrega y Capacidad' : currentMeta.title}
                </h2>
              </div>
              <p className="text-xs text-muted mt-0.5">{currentMeta.subtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {!clientMode && (
              <div className="hidden md:flex items-center gap-1 bg-surface-3 border border-line rounded-xl p-1">
                {MODULE_CARDS.map(m => (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => setOpenModule(m.key)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      openModule === m.key ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'
                    }`}
                  >
                    {m.num}. {m.key === 'evaluador' ? 'Evaluador' : m.key === 'simulador' ? 'Simulador' : m.key === 'protocolo' ? 'Protocolo' : 'Histórico'}
                  </button>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (clientMode) {
                  setClientMode(false);
                } else {
                  setClientMode(true);
                  setOpenModule('evaluador');
                }
              }}
              className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1.5 ${
                clientMode
                  ? 'bg-mint text-on-accent border-mint'
                  : 'bg-surface-3 text-muted hover:text-text border-line'
              }`}
            >
              <Eye size={13} /> {clientMode ? 'Salir de Vista Cliente' : 'Vista Cliente'}
            </button>
          </div>
        </div>

        {/* Mini resumen contextual de capacidad siempre visible arriba de la página abierta */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface-2 border border-line rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-tech uppercase text-muted-2 block">Capacidad Segura</span>
              <p className="font-display text-lg font-bold font-tech text-accent">{engine.safeBottleneckDaily} vid/día</p>
            </div>
            <Gauge size={18} className="text-accent opacity-70" />
          </div>
          <div className="bg-surface-2 border border-line rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-tech uppercase text-muted-2 block">Comprometidos Hoy</span>
              <p className="font-display text-lg font-bold font-tech text-amber">{engine.committedToday} videos</p>
            </div>
            <Clock size={18} className="text-amber opacity-70" />
          </div>
          <div className="bg-surface-2 border border-line rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-tech uppercase text-muted-2 block">Disponible Hoy</span>
              <p className="font-display text-lg font-bold font-tech text-mint">{engine.remainingSafeToday} videos</p>
            </div>
            <CheckCircle2 size={18} className="text-mint opacity-70" />
          </div>
          <div className="bg-surface-2 border border-line rounded-xl px-4 py-3 flex items-center justify-between">
            <div>
              <span className="text-[10px] font-tech uppercase text-muted-2 block">Cuello de Botella</span>
              <p className="font-display text-lg font-bold font-tech text-text">{engine.bottleneckStage}</p>
            </div>
            <Activity size={18} className="text-violet opacity-70" />
          </div>
        </div>

        {/* CONTENIDO COMPLETO DEL MÓDULO 01: EVALUADOR DE PEDIDOS, TANDAS Y ETA */}
        {currentModule === 'evaluador' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-5 bg-surface-2 border border-line rounded-2xl p-5 space-y-4">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <Layers size={17} className="text-accent" /> Parámetros del Pedido a Evaluar
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted block mb-1">Cliente / Marca</label>
                  <input
                    value={evalBrand}
                    onChange={e => setEvalBrand(e.target.value)}
                    placeholder="Nombre de la marca"
                    className="w-full bg-surface-3 border border-line rounded-lg px-3 py-2 text-sm outline-none focus:border-accent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted block mb-1">Cantidad de videos</label>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={evalVideos}
                      onChange={e => setEvalVideos(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full bg-surface-3 border border-line rounded-lg px-3 py-2 text-sm font-tech outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Clips por video</label>
                    <input
                      type="number"
                      min={1}
                      max={20}
                      value={evalClipsPerVideo}
                      onChange={e => setEvalClipsPerVideo(Math.max(1, Number(e.target.value) || 1))}
                      className="w-full bg-surface-3 border border-line rounded-lg px-3 py-2 text-sm font-tech outline-none focus:border-accent"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted block mb-1">Fecha solicitada</label>
                    <input
                      type="date"
                      value={evalDate}
                      onChange={e => setEvalDate(e.target.value)}
                      className="w-full bg-surface-3 border border-line rounded-lg px-3 py-2 text-xs font-tech outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted block mb-1">Complejidad</label>
                    <select
                      value={evalComplexity}
                      onChange={e => setEvalComplexity(e.target.value as 'simple' | 'estandar' | 'alta')}
                      className="w-full bg-surface-3 border border-line rounded-lg px-3 py-2 text-xs outline-none focus:border-accent"
                    >
                      <option value="simple">Simple (-15% carga)</option>
                      <option value="estandar">Estándar (1x)</option>
                      <option value="alta">Alta (+30% carga)</option>
                    </select>
                  </div>
                </div>

                {!clientMode && (
                  <div>
                    <label className="text-xs text-muted block mb-1">Nivel de Prioridad Operativa</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {(['normal', 'prioritario', 'urgente', 'critico'] as const).map(p => (
                        <button
                          key={p}
                          type="button"
                          onClick={() => setEvalPriority(p)}
                          className={`py-1.5 rounded-lg text-[11px] font-semibold capitalize border transition-colors ${
                            evalPriority === p
                              ? 'bg-accent text-on-accent border-accent'
                              : 'bg-surface-3 text-muted border-line hover:text-text'
                          }`}
                        >
                          {p}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="lg:col-span-7 bg-surface-2 border border-line rounded-2xl p-5 sm:p-6 space-y-5">
              <div className={`rounded-xl p-4 border flex items-start justify-between gap-4 flex-wrap ${
                evaluation.canAcceptFullOnDate
                  ? 'bg-mint-dim/40 border-mint/40'
                  : 'bg-amber-dim/40 border-amber/40'
              }`}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {evaluation.canAcceptFullOnDate ? (
                      <CheckCircle2 size={18} className="text-mint shrink-0" />
                    ) : (
                      <AlertTriangle size={18} className="text-amber shrink-0" />
                    )}
                    <h4 className="font-display text-base font-bold">
                      {evaluation.canAcceptFullOnDate
                        ? `Viable entregar los ${evalVideos} videos en una sola tanda el ${evalDate}`
                        : `No comprometer los ${evalVideos} videos para el ${evalDate} · Máximo inmediato: ${evaluation.maxImmediateAcceptable} videos`}
                    </h4>
                  </div>
                  <p className="text-xs text-muted">
                    Capacidad segura ({engine.bottleneckStage}): <strong className="font-tech text-text">{engine.safeBottleneckDaily} vid/día</strong> · Ya comprometidos el {evalDate}: <strong className="font-tech text-text">{evaluation.committedOnTargetDate} vid</strong> · Restante libre: <strong className="font-tech text-mint">{evaluation.availableSafeOnTargetDate} vid</strong>.
                  </p>
                </div>

                <span className="font-tech text-xs px-3 py-1.5 rounded-lg bg-surface-2 border border-line text-accent font-semibold shrink-0">
                  {evaluation.etaWindowText}
                </span>
              </div>

              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider font-tech text-muted flex items-center gap-1.5">
                    <Calendar size={13} className="text-accent" />
                    {evaluation.batches.length > 1
                      ? `Propuesta de Entrega por Tandas (${evaluation.batches.length} días)`
                      : 'Entrega en Tanda Única'}
                  </p>
                  <span className="text-xs font-tech text-mint">
                    Finalización total: {evaluation.finalCompletionDate}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {evaluation.batches.map(b => (
                    <div
                      key={b.date}
                      className="bg-surface-3 border border-line rounded-xl p-3.5 flex items-center justify-between gap-3"
                    >
                      <div>
                        <span className="text-[10px] font-tech uppercase text-accent block">
                          Tanda {b.dayIndex} · {b.date === todayIso() ? 'Hoy' : b.date}
                        </span>
                        <p className="font-display text-lg font-bold text-text mt-0.5">
                          {b.videos} videos
                        </p>
                      </div>
                      <div className="text-right font-tech text-[11px] text-muted-2">
                        <span className="block">Pre-comprometido: {b.committedBefore}</span>
                        <span className="text-mint">Margen libre post: {b.capacityLeftAfter}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {orderCreatedToast && (
                <div className="bg-mint-dim border border-mint/30 text-mint rounded-xl px-4 py-2.5 text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 size={15} /> {orderCreatedToast}
                </div>
              )}

              {!clientMode && (
                <div className="pt-2 border-t border-line flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-[11px] text-muted-2">
                    Regla comercial: nunca prometer una fecha que contradiga la capacidad segura calculada.
                  </p>
                  <button
                    type="button"
                    onClick={handleCreateOrderFromEvaluator}
                    className="flex items-center gap-2 bg-accent text-on-accent rounded-xl px-4 py-2.5 text-xs font-semibold hover:bg-accent-strong transition-colors"
                  >
                    <PlusCircle size={15} />
                    {evaluation.batches.length > 1
                      ? `Registrar ${evaluation.batches.length} tandas en Proyectos disponibles`
                      : 'Registrar pedido en Proyectos disponibles'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* CONTENIDO COMPLETO DEL MÓDULO 02: SIMULADOR DE ESCENARIOS */}
        {currentModule === 'simulador' && !clientMode && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-6 bg-surface-2 border border-line rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-semibold flex items-center gap-2">
                  <Sparkles size={17} className="text-accent" /> Variables Hipotéticas (Sin alterar pedidos reales)
                </h3>
                <p className="text-xs text-muted mt-0.5">
                  Cada nuevo integrante se calcula automáticamente con el promedio individual actual de tu equipo ({engine.avgClipperDaily} vid/día por Clipper · {engine.avgEditorDaily} vid/día por Editor).
                </p>
              </div>

              <div className="space-y-3.5">
                <div className="bg-surface-3 border border-line rounded-xl p-3.5">
                  <div className="flex justify-between text-xs mb-1.5">
                    <span>¿Qué pasa si entran videos adicionales hoy?</span>
                    <span className="font-tech font-bold text-accent">+{simExtraVideos} videos</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={200}
                    step={5}
                    value={simExtraVideos}
                    onChange={e => setSimExtraVideos(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-3 border border-line rounded-xl p-3.5">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span>Agregar Clippers (~{engine.avgClipperDaily} v/d)</span>
                      <span className="font-tech font-bold text-accent">+{simExtraClippers}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      value={simExtraClippers}
                      onChange={e => setSimExtraClippers(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </div>

                  <div className="bg-surface-3 border border-line rounded-xl p-3.5">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span>Agregar Editores (~{engine.avgEditorDaily} v/d)</span>
                      <span className="font-tech font-bold text-mint">+{simExtraEditors}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      value={simExtraEditors}
                      onChange={e => setSimExtraEditors(Number(e.target.value))}
                      className="w-full accent-mint"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-surface-3 border border-line rounded-xl p-3.5">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span>Recursos no disponibles (%)</span>
                      <span className="font-tech font-bold text-amber">{simUnavailablePct}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={5}
                      value={simUnavailablePct}
                      onChange={e => setSimUnavailablePct(Number(e.target.value))}
                      className="w-full accent-amber"
                    />
                  </div>

                  <div className="bg-surface-3 border border-line rounded-xl p-3.5">
                    <div className="flex justify-between text-xs mb-1.5">
                      <span>Aumento carga edición (%)</span>
                      <span className="font-tech font-bold text-violet">+{simEditorDemandBoostPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      step={5}
                      value={simEditorDemandBoostPct}
                      onChange={e => setSimEditorDemandBoostPct(Number(e.target.value))}
                      className="w-full accent-accent"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 bg-surface-2 border border-line rounded-2xl p-5 space-y-4">
              <h3 className="font-display text-base font-semibold">Impacto del Escenario Simulado</h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-3 border border-line rounded-xl p-3.5">
                  <span className="text-[10px] font-tech uppercase text-muted-2 block">Nueva Capacidad Segura</span>
                  <p className="font-display text-2xl font-bold font-tech text-mint mt-1">
                    {simulation.simSafeLimit} vid/día
                  </p>
                  <p className="text-[11px] text-muted-2 mt-0.5">
                    Clip: {simulation.simSafeClip} · Edic: {simulation.simSafeEdit}
                  </p>
                </div>

                <div className="bg-surface-3 border border-line rounded-xl p-3.5">
                  <span className="text-[10px] font-tech uppercase text-muted-2 block">Nuevo Cuello de Botella</span>
                  <p className="font-display text-2xl font-bold font-tech text-accent mt-1">
                    {simulation.simBottleneck}
                  </p>
                  <p className="text-[11px] text-muted-2 mt-0.5">
                    Utilización simulada: {simulation.simUtilPct}%
                  </p>
                </div>

                <div className="bg-surface-3 border border-line rounded-xl p-3.5">
                  <span className="text-[10px] font-tech uppercase text-muted-2 block">Demanda Total vs Segura</span>
                  <p className={`font-display text-2xl font-bold font-tech mt-1 ${
                    simulation.simDeficit > 0 ? 'text-red-400' : 'text-mint'
                  }`}>
                    {simulation.totalSimulatedDemand} / {simulation.simSafeLimit}
                  </p>
                  <p className="text-[11px] text-muted-2 mt-0.5">
                    {simulation.simDeficit > 0 ? `Déficit de ${simulation.simDeficit} videos` : 'Sin déficit operativo'}
                  </p>
                </div>

                <div className="bg-surface-3 border border-line rounded-xl p-3.5">
                  <span className="text-[10px] font-tech uppercase text-muted-2 block">ETA para absorber los +{simExtraVideos} vid</span>
                  <p className="font-display text-2xl font-bold font-tech text-amber mt-1">
                    {simulation.daysNeededForExtra} día(s)
                  </p>
                  <p className="text-[11px] text-muted-2 mt-0.5">
                    Máx. aceptable hoy: {simulation.simFreeCapacity} vid
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CONTENIDO COMPLETO DEL MÓDULO 03: PROTOCOLO OPERATIVO Y REASIGNACIÓN */}
        {currentModule === 'protocolo' && !clientMode && (
          <div className="space-y-4">
            <div className="bg-surface-2 border border-line rounded-2xl p-5 space-y-4">
              <div>
                <h3 className="font-display text-base font-semibold flex items-center gap-2">
                  <ShieldAlert size={17} className="text-amber" /> Umbrales del Protocolo Operativo
                </h3>
                <p className="text-xs text-muted">
                  Define cuándo un pedido escala a Prioritario, Urgente o Crítico y habilita reasignación.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="bg-surface-3 border border-line rounded-xl p-3 block">
                  <span className="text-[11px] text-muted-2 block mb-1">Tiempo máx. sin respuesta (minutos)</span>
                  <input
                    type="number"
                    min={5}
                    value={capacityConfig.maxNoResponseMinutes}
                    onChange={e => updateCapacityConfig({ maxNoResponseMinutes: Math.max(5, Number(e.target.value) || 45) })}
                    className="w-full bg-surface-2 border border-line rounded-md px-2.5 py-1.5 text-sm font-tech outline-none focus:border-accent"
                  />
                </label>
                <label className="bg-surface-3 border border-line rounded-xl p-3 block">
                  <span className="text-[11px] text-muted-2 block mb-1">Tiempo máx. sin movimiento (horas)</span>
                  <input
                    type="number"
                    min={1}
                    value={capacityConfig.maxStalledHours}
                    onChange={e => updateCapacityConfig({ maxStalledHours: Math.max(1, Number(e.target.value) || 3) })}
                    className="w-full bg-surface-2 border border-line rounded-md px-2.5 py-1.5 text-sm font-tech outline-none focus:border-accent"
                  />
                </label>
                <label className="bg-surface-3 border border-line rounded-xl p-3 block">
                  <span className="text-[11px] text-muted-2 block mb-1">Umbral ETA para Urgente/Crítico (horas)</span>
                  <input
                    type="number"
                    min={1}
                    value={capacityConfig.urgentThresholdHours}
                    onChange={e => updateCapacityConfig({ urgentThresholdHours: Math.max(1, Number(e.target.value) || 4) })}
                    className="w-full bg-surface-2 border border-line rounded-md px-2.5 py-1.5 text-sm font-tech outline-none focus:border-accent"
                  />
                </label>
              </div>
            </div>

            <div className="bg-surface-2 border border-line rounded-2xl p-5 space-y-3">
              <h3 className="font-display text-base font-semibold">Estado de Protocolo por Pedido y Reasignación</h3>

              <div className="space-y-2">
                {ordersProtocolList.map(({ order, hoursLeft, protocolState, reason }) => {
                  const badgeStyles = {
                    normal: 'bg-mint-dim text-mint border-mint/30',
                    prioritario: 'bg-accent-dim text-accent border-accent/30',
                    urgente: 'bg-amber-dim text-amber border-amber/30',
                    critico: 'bg-red-500/15 text-red-400 border-red-500/30',
                  }[protocolState];

                  return (
                    <div
                      key={order.id}
                      className="bg-surface-3 border border-line rounded-xl p-3.5 flex items-center justify-between gap-3 flex-wrap"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={`text-[10px] font-tech uppercase px-2 py-0.5 rounded-full border font-semibold ${badgeStyles}`}>
                            {protocolState}
                          </span>
                          <p className="text-sm font-semibold">{order.brand} · {order.videoCount} videos</p>
                          <span className="text-xs text-muted-2 font-tech">
                            Entrega: {order.deliveryDate} {order.deliveryTime} ({hoursLeft > 0 ? `${hoursLeft}h restantes` : 'Vencido'})
                          </span>
                        </div>
                        <p className="text-xs text-muted mt-1">{reason}</p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {reassignedToastId === order.id ? (
                          <span className="text-xs text-mint flex items-center gap-1 font-medium">
                            <CheckCircle2 size={14} /> Reasignado y ETA recalculada
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleSmartReassign(order)}
                            className="flex items-center gap-1.5 bg-surface-2 hover:bg-accent-dim text-accent border border-accent/30 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                          >
                            <RefreshCw size={13} /> Reasignar a recurso libre ({bestAvailableEditor?.name || bestAvailableClipper?.name || 'Auto'})
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* CONTENIDO COMPLETO DEL MÓDULO 04: HISTÓRICO, RETRABAJO Y CONTRATACIÓN */}
        {currentModule === 'historico' && !clientMode && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            <div className="lg:col-span-6 bg-surface-2 border border-line rounded-2xl p-5 space-y-4">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <Clock size={17} className="text-accent" /> Histórico Operativo y Efecto del Retrabajo
              </h3>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-3 border border-line rounded-xl p-3.5">
                  <span className="text-[10px] font-tech uppercase text-muted-2 block">Tasa de Retrabajo / QC</span>
                  <p className="font-display text-2xl font-bold font-tech text-amber mt-1">
                    {engine.reworkRatePct}%
                  </p>
                  <p className="text-[11px] text-muted-2 mt-0.5">
                    {engine.videosWithRework} de {allVideos.length} videos con correcciones
                  </p>
                </div>

                <div className="bg-surface-3 border border-line rounded-xl p-3.5">
                  <span className="text-[10px] font-tech uppercase text-muted-2 block">Capacidad Real Efectiva</span>
                  <p className="font-display text-2xl font-bold font-tech text-mint mt-1">
                    {Math.max(1, Math.floor(engine.safeBottleneckDaily * (1 - engine.reworkRatePct / 200)))} vid/día
                  </p>
                  <p className="text-[11px] text-muted-2 mt-0.5">
                    Descontando fricción de revisiones
                  </p>
                </div>
              </div>

              <div className="bg-surface-3 border border-line rounded-xl p-4 space-y-2 text-xs">
                <p className="font-semibold text-text">Comparativa Capacidad Física vs. Segura vs. Demanda Activa</p>
                <div className="flex justify-between text-muted">
                  <span>Capacidad Física Total ({engine.bottleneckStage}):</span>
                  <span className="font-tech text-text">{engine.physicalBottleneckDaily} vid/día</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Capacidad Comercial Segura ({100 - capacityConfig.safetyMarginPct}%):</span>
                  <span className="font-tech text-accent">{engine.safeBottleneckDaily} vid/día</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span>Volumen total en cola actual:</span>
                  <span className="font-tech text-amber">{engine.totalActiveCommitted} videos</span>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6 bg-surface-2 border border-line rounded-2xl p-5 space-y-4">
              <h3 className="font-display text-base font-semibold flex items-center gap-2">
                <UserPlus size={17} className="text-mint" /> Evidencia para Contratación (Basada en Promedio Individual)
              </h3>

              <div className="bg-surface-3 border border-mint/30 rounded-xl p-4 space-y-2">
                <span className="text-[10px] font-tech uppercase text-mint block">
                  Recomendación del Motor según Cuello de Botella ({engine.bottleneckStage})
                </span>
                <p className="text-sm font-semibold">
                  {engine.bottleneckStage === 'Edición'
                    ? `El límite operativo está en Edición (${engine.safeEditingDaily} vid/día seguros frente a ${engine.safeClippingDaily} en Clipping).`
                    : `El límite operativo está en Clipping (${engine.safeClippingDaily} vid/día seguros frente a ${engine.safeEditingDaily} en Edición).`}
                </p>
                <p className="text-xs text-muted">
                  Según el promedio individual actual de tu equipo (<strong className="text-text font-tech">{engine.bottleneckStage === 'Edición' ? engine.avgEditorDaily : engine.avgClipperDaily} vid/día</strong>), contratar <strong className="text-text">+1 {engine.bottleneckStage === 'Edición' ? 'Editor(a)' : 'Clipper'}</strong> aportaría <strong className="text-mint font-tech">+{Math.floor((engine.bottleneckStage === 'Edición' ? engine.avgEditorDaily : engine.avgClipperDaily) * ((100 - capacityConfig.safetyMarginPct) / 100))} videos comerciales/día</strong> (+{Math.floor((engine.bottleneckStage === 'Edición' ? engine.avgEditorDaily : engine.avgClipperDaily) * ((100 - capacityConfig.safetyMarginPct) / 100)) * 26} videos/mes).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-surface-3 border border-line rounded-xl p-3">
                  <span className="text-muted-2 block">Promedio actual Clipper</span>
                  <p className="font-display text-lg font-bold font-tech text-accent mt-0.5">
                    ~{engine.avgClipperDaily} vid/día
                  </p>
                </div>
                <div className="bg-surface-3 border border-line rounded-xl p-3">
                  <span className="text-muted-2 block">Promedio actual Editor(a)</span>
                  <p className="font-display text-lg font-bold font-tech text-mint mt-0.5">
                    ~{engine.avgEditorDaily} vid/día
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============================================================================
  // VISTA PRINCIPAL DEL DASHBOARD DE CAPACIDAD (RADAR ESTÉTICO + 4 TARJETAS QUE ABREN PÁGINA COMPLETA)
  // ============================================================================
  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Cabecera Principal */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-dim border border-accent/30 text-accent flex items-center justify-center shadow-[0_0_20px_-4px_rgba(53,214,228,0.4)]">
            <Gauge size={22} />
          </div>
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold">Motor de Capacidad y Operación</h2>
            <p className="text-xs text-muted">
              Dashboard central en tiempo real · Selecciona cualquiera de los 4 módulos abajo para abrir su consola completa
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowConfigDrawer(s => !s)}
            className={`flex items-center gap-1.5 border rounded-xl px-3.5 py-2 text-xs font-semibold transition-all ${
              showConfigDrawer
                ? 'bg-accent text-on-accent border-accent'
                : 'bg-surface-2 hover:bg-surface-3 border-line text-muted hover:text-text'
            }`}
          >
            <Sliders size={14} /> Margen ({capacityConfig.safetyMarginPct}%), Horario y Capacidad Individual
          </button>

          <button
            type="button"
            onClick={() => { setClientMode(true); setOpenModule('evaluador'); }}
            className="flex items-center gap-1.5 bg-mint-dim hover:bg-mint/20 text-mint border border-mint/30 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors"
          >
            <Eye size={14} /> Interfaz Cliente
          </button>
        </div>
      </div>

      {/* Configurador desplegable: Margen + Horario + Capacidad Individual por persona (Sin bases globales inventadas) */}
      {showConfigDrawer && (
        <div className="bg-surface-2 border border-accent/40 rounded-2xl p-5 space-y-5 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display text-sm font-semibold flex items-center gap-2">
                <Sliders size={15} className="text-accent" /> Configuración Operativa e Individual
              </h3>
              <p className="text-xs text-muted mt-0.5">
                La capacidad se define individualmente por cada Clipper y Editor. El sistema calcula el promedio automáticamente (~{engine.avgClipperDaily} vid/día por Clipper · ~{engine.avgEditorDaily} vid/día por Editor).
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowConfigDrawer(false)}
              className="text-xs text-muted hover:text-text px-2.5 py-1 rounded-lg bg-surface-3 border border-line"
            >
              Cerrar
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="bg-surface-3 border border-line rounded-xl p-3.5 block">
              <span className="text-xs text-muted block mb-1">Margen de seguridad comercial (%)</span>
              <input
                type="number"
                min={0}
                max={50}
                value={capacityConfig.safetyMarginPct}
                onChange={e => updateCapacityConfig({ safetyMarginPct: Math.min(50, Math.max(0, Number(e.target.value) || 0)) })}
                className="w-full bg-surface-2 border border-line rounded-md px-3 py-1.5 text-sm font-tech outline-none focus:border-accent"
              />
            </label>

            <label className="bg-surface-3 border border-line rounded-xl p-3.5 block">
              <span className="text-xs text-muted block mb-1">Horario operativo diario (Hora inicio — Hora fin)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={22}
                  value={capacityConfig.workdayStartHour}
                  onChange={e => updateCapacityConfig({ workdayStartHour: Number(e.target.value) || 8 })}
                  className="w-full bg-surface-2 border border-line rounded-md px-3 py-1.5 text-sm font-tech outline-none focus:border-accent"
                />
                <span className="text-muted-2 font-tech">a</span>
                <input
                  type="number"
                  min={1}
                  max={24}
                  value={capacityConfig.workdayEndHour}
                  onChange={e => updateCapacityConfig({ workdayEndHour: Number(e.target.value) || 20 })}
                  className="w-full bg-surface-2 border border-line rounded-md px-3 py-1.5 text-sm font-tech outline-none focus:border-accent"
                />
              </div>
            </label>
          </div>

          {/* Capacidades individuales separadas por Clippers y Editores */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-surface-3/60 border border-line rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-accent flex items-center gap-1.5">
                  <Scissors size={13} /> Capacidad individual Clippers (videos/día)
                </span>
                <span className="font-tech text-[11px] text-muted-2">
                  Promedio: {engine.avgClipperDaily} vid/día
                </span>
              </div>
              <div className="space-y-1.5">
                {clippers.map(w => (
                  <div key={w.id} className="bg-surface-2 border border-line rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{w.name}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        value={getWorkerCapacity(w.id)}
                        onChange={e => setWorkerCapacity(w.id, Number(e.target.value) || 1)}
                        className="w-16 bg-surface-3 border border-line rounded-md px-2 py-1 text-xs font-tech text-center outline-none focus:border-accent"
                      />
                      <span className="text-[10px] font-tech text-muted-2">vid/día</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-surface-3/60 border border-line rounded-xl p-3.5 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-mint flex items-center gap-1.5">
                  <Film size={13} /> Capacidad individual Editores (videos/día)
                </span>
                <span className="font-tech text-[11px] text-muted-2">
                  Promedio: {engine.avgEditorDaily} vid/día
                </span>
              </div>
              <div className="space-y-1.5">
                {editors.map(w => (
                  <div key={w.id} className="bg-surface-2 border border-line rounded-lg px-3 py-2 flex items-center justify-between gap-2">
                    <span className="text-xs font-medium truncate">{w.name}</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        value={getWorkerCapacity(w.id)}
                        onChange={e => setWorkerCapacity(w.id, Number(e.target.value) || 1)}
                        className="w-16 bg-surface-3 border border-line rounded-md px-2 py-1 text-xs font-tech text-center outline-none focus:border-mint"
                      />
                      <span className="text-[10px] font-tech text-muted-2">vid/día</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          HERO DASHBOARD CENTRAL DE CAPACIDAD (DISEÑO ELEVADO CON CIRCUITO Y MEDIDOR RADIAL)
         ===================================================================== */}
      <div className="relative bg-surface-2 border border-accent/35 rounded-2xl p-6 sm:p-7 overflow-hidden shadow-[0_0_50px_-16px_rgba(53,214,228,0.28)]">
        {/* Halos y circuito animado de marca SENDA */}
        <div
          className="absolute -left-16 -top-16 w-80 h-80 rounded-full pointer-events-none blur-3xl opacity-20 animate-pulse"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
        />
        <div
          className="absolute right-6 -bottom-20 w-80 h-80 rounded-full pointer-events-none blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, var(--mint), transparent 70%)' }}
        />

        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-35"
          viewBox="0 0 920 300"
          fill="none"
          preserveAspectRatio="xMaxYMid slice"
        >
          <path
            d="M 420 265 L 540 265 L 595 200 L 725 200 L 780 130 L 885 130"
            stroke="var(--accent)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 6"
          >
            <animate attributeName="stroke-dashoffset" values="24;0" dur="3.2s" repeatCount="indefinite" />
          </path>
          <path
            d="M 520 35 L 635 35 L 680 85 L 820 85"
            stroke="var(--mint)"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="595" cy="200" r="4" fill="var(--accent)" />
          <circle cx="725" cy="200" r="4.5" fill="none" stroke="var(--mint)" strokeWidth="2" />
          <circle cx="680" cy="85" r="4" fill="var(--mint)" />
          <circle cx="780" cy="130" r="5" fill="var(--accent)" />
        </svg>

        <div className="relative z-10 space-y-6">
          {/* Fila superior: Estado de alerta + Medidor radial + Cuello de botella */}
          <div className="flex items-center justify-between gap-6 flex-wrap">
            <div className="flex items-center gap-5">
              {/* Gauge Radial SVG */}
              <div className="relative w-24 h-24 flex items-center justify-center shrink-0">
                <svg className="w-24 h-24 -rotate-90" viewBox="0 0 92 92">
                  <circle
                    cx="46"
                    cy="46"
                    r={radialRadius}
                    stroke="var(--surface-3)"
                    strokeWidth="7"
                    fill="none"
                  />
                  <circle
                    cx="46"
                    cy="46"
                    r={radialRadius}
                    stroke={alertMeta.ringColor}
                    strokeWidth="7"
                    strokeLinecap="round"
                    fill="none"
                    strokeDasharray={radialCircumference}
                    strokeDashoffset={radialOffset}
                    className="transition-all duration-700 ease-out"
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="font-display text-lg font-bold font-tech">{engine.overallUtilPct}%</span>
                  <span className="text-[9px] uppercase font-tech text-muted-2">Uso hoy</span>
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-semibold ${alertMeta.badgeClass}`}>
                    <span className={`w-2 h-2 rounded-full ${alertMeta.dotClass} animate-pulse`} />
                    {alertMeta.label}
                  </span>
                  <span className="font-tech text-xs px-2.5 py-1 rounded-full bg-surface-3 border border-line text-muted">
                    Cuello de botella: <strong className="text-accent">{engine.bottleneckStage}</strong> ({engine.safeBottleneckDaily} vid/día seguros)
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-muted">{alertMeta.desc}</p>
              </div>
            </div>

            <div className="bg-surface/80 backdrop-blur-md border border-mint/30 rounded-2xl px-5 py-3.5 text-right">
              <span className="text-[10px] font-tech uppercase tracking-wider text-mint block">
                Máximo Adicional Aceptable Hoy
              </span>
              <p className="font-display text-3xl sm:text-4xl font-bold font-tech text-mint mt-0.5">
                {engine.remainingSafeToday} <span className="text-sm font-normal text-muted">videos</span>
              </p>
              <span className="text-[11px] text-muted-2 font-tech">Sin comprometer entregas activas</span>
            </div>
          </div>

          {/* 5 Tarjetas de Indicadores Principales (Con toda la información original intacta y mejor jerarquía) */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-surface/85 backdrop-blur-sm border border-line rounded-xl p-4">
              <span className="text-[10px] uppercase font-tech text-muted-2 block">Capacidad Física</span>
              <p className="font-display text-2xl font-bold font-tech mt-1">
                {engine.physicalBottleneckDaily} <span className="text-xs font-normal text-muted">vid/día</span>
              </p>
              <p className="text-[11px] text-muted-2 mt-1 font-tech">
                Clip: {engine.physicalClippingDaily} · Edic: {engine.physicalEditingDaily}
              </p>
            </div>

            <div className="bg-surface/85 backdrop-blur-sm border border-accent/35 rounded-xl p-4">
              <span className="text-[10px] uppercase font-tech text-accent block">
                Capacidad Segura ({100 - capacityConfig.safetyMarginPct}%)
              </span>
              <p className="font-display text-2xl font-bold font-tech text-accent mt-1">
                {engine.safeBottleneckDaily} <span className="text-xs font-normal text-muted">vid/día</span>
              </p>
              <p className="text-[11px] text-muted-2 mt-1 font-tech">
                Clip: {engine.safeClippingDaily} · Edic: {engine.safeEditingDaily}
              </p>
            </div>

            <div className="bg-surface/85 backdrop-blur-sm border border-line rounded-xl p-4">
              <span className="text-[10px] uppercase font-tech text-amber block">Comprometidos Hoy</span>
              <p className="font-display text-2xl font-bold font-tech text-amber mt-1">
                {engine.committedToday} <span className="text-xs font-normal text-muted">videos</span>
              </p>
              <p className="text-[11px] text-muted-2 mt-1 font-tech">
                En cola total: {engine.totalActiveCommitted} vid
              </p>
            </div>

            <div className="bg-surface/85 backdrop-blur-sm border border-mint/35 rounded-xl p-4">
              <span className="text-[10px] uppercase font-tech text-mint block">Promedio Individual</span>
              <p className="font-display text-2xl font-bold font-tech text-mint mt-1">
                {engine.avgClipperDaily}C / {engine.avgEditorDaily}E
              </p>
              <p className="text-[11px] text-muted-2 mt-1 font-tech">
                Videos/día por persona
              </p>
            </div>

            <div className="bg-surface/85 backdrop-blur-sm border border-line rounded-xl p-4 col-span-2 md:col-span-1">
              <span className="text-[10px] uppercase font-tech text-violet block">Recursos Activos</span>
              <p className="font-display text-2xl font-bold font-tech mt-1">
                {clippers.length}C / {editors.length}E
              </p>
              <p className="text-[11px] text-muted-2 mt-1 font-tech">
                {workers.filter(w => w.online).length} en línea ahora
              </p>
            </div>
          </div>

          {/* Termómetros visuales de etapa (Clipping vs Edición) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-line/70">
            <div className="bg-surface-3/70 border border-line rounded-xl p-3.5">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Scissors size={13} className="text-accent" /> Etapa Clipping ({clippers.length} clippers · prom. {engine.avgClipperDaily} vid/día)
                </span>
                <span className="font-tech text-accent font-semibold">
                  {engine.committedToday} / {engine.safeClippingDaily} vid ({engine.clippingUtilPct}%)
                </span>
              </div>
              <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden border border-line">
                <div
                  className="h-full bg-accent transition-all duration-500 rounded-full"
                  style={{ width: `${Math.min(100, engine.clippingUtilPct)}%` }}
                />
              </div>
            </div>

            <div className="bg-surface-3/70 border border-line rounded-xl p-3.5">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="flex items-center gap-1.5 font-semibold">
                  <Film size={13} className="text-mint" /> Etapa Edición ({editors.length} editores · prom. {engine.avgEditorDaily} vid/día)
                </span>
                <span className="font-tech text-mint font-semibold">
                  {engine.committedToday} / {engine.safeEditingDaily} vid ({engine.editingUtilPct}%)
                </span>
              </div>
              <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden border border-line">
                <div
                  className="h-full bg-mint transition-all duration-500 rounded-full"
                  style={{ width: `${Math.min(100, engine.editingUtilPct)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          GRILLA DE LOS 4 PUNTOS (AL HACER CLIC EN UNO, ABRE SU PÁGINA COMPLETA)
         ===================================================================== */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-display text-base font-semibold text-muted">
            Módulos Operativos (Haz clic en cualquiera para abrir su pantalla completa)
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {MODULE_CARDS.map(card => {
            const Icon = card.icon;
            const colorStyles = {
              accent: {
                badge: 'bg-accent-dim text-accent border-accent/30',
                hover: 'hover:border-accent/60',
                node: 'var(--accent)',
              },
              mint: {
                badge: 'bg-mint-dim text-mint border-mint/30',
                hover: 'hover:border-mint/60',
                node: 'var(--mint)',
              },
              amber: {
                badge: 'bg-amber-dim text-amber border-amber/30',
                hover: 'hover:border-amber/60',
                node: 'var(--amber)',
              },
              violet: {
                badge: 'bg-violet-dim text-violet border-violet/30',
                hover: 'hover:border-violet/60',
                node: 'var(--violet)',
              },
            }[card.accentColor];

            return (
              <button
                key={card.key}
                type="button"
                onClick={() => setOpenModule(card.key)}
                className={`group relative text-left bg-surface-2 border border-line ${colorStyles.hover} rounded-2xl p-5 sm:p-6 transition-all duration-200 hover:-translate-y-0.5 hover:bg-surface-3/50 overflow-hidden flex flex-col justify-between min-h-[176px]`}
              >
                <CardNodeDeco color={colorStyles.node} />

                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-11 h-11 rounded-xl border flex items-center justify-center ${colorStyles.badge}`}>
                      <Icon size={20} />
                    </div>
                    <span className="font-tech text-xs px-2.5 py-0.5 rounded-full bg-surface-3 border border-line text-muted-2">
                      PUNTO {card.num}
                    </span>
                  </div>

                  <h4 className="font-display text-lg font-bold group-hover:text-accent transition-colors">
                    {card.title}
                  </h4>
                  <p className="text-xs text-muted mt-1 leading-relaxed pr-4">
                    {card.subtitle}
                  </p>
                </div>

                <div className="mt-5 pt-3.5 border-t border-line/70 flex items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="text-muted-2">{card.metricLabel}: </span>
                    <strong className="font-tech text-text">{card.metricValue}</strong>
                  </div>

                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent group-hover:translate-x-1 transition-transform">
                    Abrir módulo <ArrowRight size={14} />
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
