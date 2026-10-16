import { useState, useMemo } from 'react';
import { useStore } from '../store';
import type { Order } from '../types';
import { CardNodeDeco } from '../components/BrandBackground';
import {
  Gauge, Scissors, Film, AlertTriangle, CheckCircle2, Clock,
  Sliders, Sparkles, RefreshCw, ShieldAlert, TrendingUp,
  UserPlus, Zap, Calendar, LayoutGrid, X, Users, Layers,
} from 'lucide-react';

type ActiveScreen = 'dashboard' | '1' | '2' | '3' | '4';
type AlertLevel = 'normal' | 'elevada' | 'cerca_limite' | 'comprometida' | 'sobrecapacidad';

const ALERT_META: Record<AlertLevel, { label: string; badgeClass: string; dotClass: string; ringColor: string }> = {
  normal: {
    label: 'Operación Normal',
    badgeClass: 'bg-mint-dim text-mint border-mint/30',
    dotClass: 'bg-mint',
    ringColor: 'var(--mint)',
  },
  elevada: {
    label: 'Carga Elevada',
    badgeClass: 'bg-accent-dim text-accent border-accent/30',
    dotClass: 'bg-accent',
    ringColor: 'var(--accent)',
  },
  cerca_limite: {
    label: 'Cerca del Límite',
    badgeClass: 'bg-amber-dim text-amber border-amber/30',
    dotClass: 'bg-amber',
    ringColor: 'var(--amber)',
  },
  comprometida: {
    label: 'Capacidad Comprometida',
    badgeClass: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
    dotClass: 'bg-orange-400',
    ringColor: '#fb923c',
  },
  sobrecapacidad: {
    label: 'Sobrecapacidad',
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
    getWorkerCapacity, setWorkerCapacity, assignOrderClipper, assignOrderEditor,
  } = useStore();

  const [screen, setScreen] = useState<ActiveScreen>('dashboard');
  const [showConfigModal, setShowConfigModal] = useState(false);

  // --- Estado Punto 1 (Cotizador y Tandas: solo volumen 1..200 y complejidad) ---
  const [evalVideos, setEvalVideos] = useState<number>(30);
  const [evalComplexity, setEvalComplexity] = useState<'simple' | 'estandar' | 'alta'>('estandar');

  // --- Estado Punto 2 (Simulador) ---
  const [simExtraVideos, setSimExtraVideos] = useState<number>(40);
  const [simExtraClippers, setSimExtraClippers] = useState<number>(0);
  const [simExtraEditors, setSimExtraEditors] = useState<number>(0);
  const [simUnavailablePct, setSimUnavailablePct] = useState<number>(0);
  const [simEditorDemandBoostPct, setSimEditorDemandBoostPct] = useState<number>(0);

  // --- Estado Punto 3 (Protocolo y Asignación Inteligente) ---
  const [protocolRoleFilter, setProtocolRoleFilter] = useState<'todos' | 'clipper' | 'editor'>('todos');
  const [selectedClipperByOrder, setSelectedClipperByOrder] = useState<Record<string, string>>({});
  const [selectedEditorByOrder, setSelectedEditorByOrder] = useState<Record<string, string>>({});
  const [reassignedToastId, setReassignedToastId] = useState<string | null>(null);

  const clippers = useMemo(() => workers.filter(w => w.role === 'clipper'), [workers]);
  const editors = useMemo(() => workers.filter(w => w.role === 'editor'), [workers]);
  const allVideos = useMemo(() => brands.flatMap(b => b.videos), [brands]);

  // MOTOR DE CÁLCULO EN VIVO
  const engine = useMemo(() => {
    const safetyFactor = Math.max(0.5, (100 - capacityConfig.safetyMarginPct) / 100);

    const physicalClippingDaily = clippers.reduce((sum, w) => sum + getWorkerCapacity(w.id), 0);
    const physicalEditingDaily = editors.reduce((sum, w) => sum + getWorkerCapacity(w.id), 0);

    const avgClipperDaily = clippers.length > 0 ? Math.round(physicalClippingDaily / clippers.length) : 10;
    const avgEditorDaily = editors.length > 0 ? Math.round(physicalEditingDaily / editors.length) : 10;

    const safeClippingDaily = Math.max(1, Math.floor(physicalClippingDaily * safetyFactor));
    const safeEditingDaily = Math.max(1, Math.floor(physicalEditingDaily * safetyFactor));

    const bottleneckStage: 'Clipping' | 'Edición' =
      safeEditingDaily <= safeClippingDaily ? 'Edición' : 'Clipping';
    const physicalBottleneckDaily = Math.min(physicalClippingDaily, physicalEditingDaily);
    const safeBottleneckDaily = Math.min(safeClippingDaily, safeEditingDaily);

    const activeOrders = orders.filter(o => o.status !== 'finalizado');
    const committedByDate: Record<string, number> = {};
    for (const o of activeOrders) {
      const d = o.deliveryDate || todayIso();
      committedByDate[d] = (committedByDate[d] || 0) + Math.max(1, o.videoCount || 1);
    }

    const today = todayIso();
    const inProgressBoardVideos = allVideos.filter(v => v.qc !== 'aprobado_cliente' && v.qc !== 'sin_iniciar').length;
    const committedToday = (committedByDate[today] || 0) + inProgressBoardVideos;
    const totalActiveCommitted = activeOrders.reduce((s, o) => s + Math.max(1, o.videoCount || 1), 0) + inProgressBoardVideos;

    const clippingUtilPct = safeClippingDaily > 0 ? Math.round((committedToday / safeClippingDaily) * 100) : 0;
    const editingUtilPct = safeEditingDaily > 0 ? Math.round((committedToday / safeEditingDaily) * 100) : 0;
    const overallUtilPct = safeBottleneckDaily > 0 ? Math.round((committedToday / safeBottleneckDaily) * 100) : 0;

    let alertLevel: AlertLevel = 'normal';
    if (overallUtilPct > 100) alertLevel = 'sobrecapacidad';
    else if (overallUtilPct >= 90) alertLevel = 'comprometida';
    else if (overallUtilPct >= 78) alertLevel = 'cerca_limite';
    else if (overallUtilPct >= 58) alertLevel = 'elevada';

    const remainingSafeToday = Math.max(0, safeBottleneckDaily - committedToday);

    const videosWithRework = allVideos.filter(
      v => v.qc === 'correcciones' || v.corrections.length > 0 || v.clips.some(c => c.status === 'rejected')
    ).length;
    const reworkRatePct = allVideos.length > 0 ? Math.round((videosWithRework / allVideos.length) * 100) : 0;
    const effectiveRealCapacity = Math.max(1, Math.floor(safeBottleneckDaily * (1 - reworkRatePct / 200)));

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
      effectiveRealCapacity,
      activeOrders,
    };
  }, [clippers, editors, allVideos, orders, capacityConfig.safetyMarginPct, getWorkerCapacity]);

  // COTIZADOR Y TANDAS (PUNTO 1: Evalúa desde hoy según volumen 1..200 y complejidad)
  const evaluation = useMemo(() => {
    const baseDate = todayIso();
    const complexityMultiplier = evalComplexity === 'alta' ? 1.3 : evalComplexity === 'simple' ? 0.85 : 1.0;
    const committedOnTargetDate = engine.committedToday;
    const availableSafeOnTargetDate = Math.max(0, engine.safeBottleneckDaily - committedOnTargetDate);
    const maxImmediateAcceptable = Math.floor(availableSafeOnTargetDate / complexityMultiplier);
    const canAcceptFullOnDate = evalVideos <= maxImmediateAcceptable;

    const batches: { dayIndex: number; date: string; videos: number; capacityLeftAfter: number }[] = [];
    let remainingToSchedule = Math.max(1, evalVideos);
    let cursorDay = 0;

    while (remainingToSchedule > 0 && cursorDay < 20) {
      const dateStr = addDaysIso(baseDate, cursorDay);
      const alreadyCommitted =
        cursorDay === 0 ? engine.committedToday : (engine.committedByDate[dateStr] || 0);
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
          capacityLeftAfter: Math.max(0, engine.safeBottleneckDaily - (alreadyCommitted + Math.ceil(allocated * complexityMultiplier))),
        });
        remainingToSchedule -= allocated;
      }
      cursorDay++;
    }

    const finalCompletionDate = batches.length > 0 ? batches[batches.length - 1].date : baseDate;
    const workHoursPerDay = Math.max(4, capacityConfig.workdayEndHour - capacityConfig.workdayStartHour);
    const lastBatch = batches[batches.length - 1];
    const loadRatio = lastBatch ? Math.min(1, lastBatch.videos / Math.max(1, engine.safeBottleneckDaily)) : 0.5;
    const rawStartHour = capacityConfig.workdayStartHour + Math.max(1.5, loadRatio * (workHoursPerDay - 2));
    const windowStart = Math.min(capacityConfig.workdayEndHour - 2, Math.max(capacityConfig.workdayStartHour + 1, rawStartHour));
    const windowEnd = Math.min(capacityConfig.workdayEndHour, windowStart + 2);

    const dayWord =
      finalCompletionDate === baseDate
        ? 'Hoy'
        : finalCompletionDate === addDaysIso(baseDate, 1)
        ? 'Mañana'
        : finalCompletionDate;

    const etaWindowText = `${dayWord} · ${formatHour(windowStart)} a ${formatHour(windowEnd)}`;

    return {
      committedOnTargetDate,
      availableSafeOnTargetDate,
      maxImmediateAcceptable,
      canAcceptFullOnDate,
      batches,
      finalCompletionDate,
      etaWindowText,
    };
  }, [evalVideos, evalComplexity, engine, capacityConfig]);

  // SIMULADOR (PUNTO 2)
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

  // CARGA DIARIA DETALLADA POR CADA CLIPPER Y EDITOR (Volumen hoy + Complejidad de sus videos)
  const workersWorkloadToday = useMemo(() => {
    return workers.map(w => {
      const cap = getWorkerCapacity(w.id);

      // Pedidos asignados a este trabajador
      const myOrders = engine.activeOrders.filter(o =>
        w.role === 'clipper'
          ? o.clipperId === w.id || o.assignedWorkerIds.includes(w.id)
          : o.editorId === w.id || o.assignedWorkerIds.includes(w.id)
      );

      // Videos activos en el tablero de marcas para este trabajador
      const myActiveBoardVideos = allVideos.filter(v =>
        (w.role === 'clipper' ? v.clipperId === w.id : v.editorId === w.id) &&
        v.qc !== 'aprobado_cliente' &&
        v.qc !== 'sin_iniciar'
      );

      let simpleVideos = 0;
      let estandarVideos = 0;
      let altaVideos = 0;

      for (const o of myOrders) {
        const count = Math.max(1, o.videoCount || 1);
        const comp = o.complexity || (count >= 12 ? 'alta' : count <= 4 ? 'simple' : 'estandar');
        if (comp === 'simple') simpleVideos += count;
        else if (comp === 'alta') altaVideos += count;
        else estandarVideos += count;
      }

      // Si tiene videos en el tablero que no venían de un order con complejidad, se suman según su duración/correcciones
      for (const v of myActiveBoardVideos) {
        const alreadyInOrders = myOrders.some(o => o.boardVideoId === v.id);
        if (alreadyInOrders) continue;
        if (v.corrections.length > 0 || v.durationSeconds > 60) altaVideos += 1;
        else if (v.durationSeconds > 0 && v.durationSeconds <= 20) simpleVideos += 1;
        else estandarVideos += 1;
      }

      const totalVideosToday = simpleVideos + estandarVideos + altaVideos;
      const freeCapacity = Math.max(0, cap - totalVideosToday);
      const utilPct = Math.min(100, Math.round((totalVideosToday / Math.max(1, cap)) * 100));

      return {
        worker: w,
        capacity: cap,
        totalVideosToday,
        freeCapacity,
        utilPct,
        simpleVideos,
        estandarVideos,
        altaVideos,
        activeBrands: Array.from(new Set([
          ...myOrders.map(o => o.brand),
          ...myActiveBoardVideos.map(v => v.name),
        ])),
      };
    });
  }, [workers, engine.activeOrders, allVideos, getWorkerCapacity]);

  // COLA DE PEDIDOS EN PROTOCOLO (Solo pedidos con configuración de alerta / riesgo según su complejidad y entrega)
  const protocolAlertOrders = useMemo(() => {
    const now = Date.now();
    return engine.activeOrders
      .map(o => {
        const targetTs = o.deliveryDate
          ? new Date(`${o.deliveryDate}T${o.deliveryTime || '18:00'}`).getTime()
          : now + 24 * 3600 * 1000;
        const hoursLeft = (targetTs - now) / (1000 * 3600);
        const count = Math.max(1, o.videoCount || 1);
        const complexity: 'simple' | 'estandar' | 'alta' =
          o.complexity || (count >= 12 ? 'alta' : count <= 4 ? 'simple' : 'estandar');

        // Umbral automático determinado por la complejidad y volumen del pedido
        const requiredLeadHours =
          (complexity === 'alta' ? 8 : complexity === 'estandar' ? 5 : 3) + Math.ceil(count * 0.4);

        let level: 'normal' | 'prioritario' | 'urgente' | 'critico' = o.priority || 'normal';

        if (hoursLeft <= 2 || (hoursLeft <= requiredLeadHours * 0.6 && (!o.clipperId || !o.editorId))) {
          level = 'critico';
        } else if (hoursLeft <= requiredLeadHours) {
          level = 'urgente';
        } else if (!o.clipperId || !o.editorId || complexity === 'alta') {
          level = 'prioritario';
        }

        const currentClipper = workers.find(w => w.id === o.clipperId) || null;
        const currentEditor = workers.find(w => w.id === o.editorId) || null;

        return {
          order: o,
          hoursLeft: Math.round(hoursLeft * 10) / 10,
          complexity,
          level,
          currentClipper,
          currentEditor,
        };
      })
      .filter(item => item.level !== 'normal')
      .sort((a, b) => {
        const rank = { critico: 0, urgente: 1, prioritario: 2, normal: 3 };
        return rank[a.level] - rank[b.level] || a.hoursLeft - b.hoursLeft;
      });
  }, [engine.activeOrders, workers]);

  const handleAssignFromProtocol = async (order: Order) => {
    const chosenClipperId = selectedClipperByOrder[order.id] ?? order.clipperId ?? '';
    const chosenEditorId = selectedEditorByOrder[order.id] ?? order.editorId ?? '';

    if (chosenClipperId && chosenClipperId !== order.clipperId) {
      await assignOrderClipper(order.id, chosenClipperId);
    }
    if (chosenEditorId && chosenEditorId !== order.editorId) {
      await assignOrderEditor(order.id, chosenEditorId);
    }
    setReassignedToastId(order.id);
    setTimeout(() => setReassignedToastId(prev => (prev === order.id ? null : prev)), 2500);
  };

  const alertMeta = ALERT_META[engine.alertLevel];

  const DOCK_ITEMS: { id: ActiveScreen; badge: string; title: string; icon: typeof Gauge }[] = [
    { id: 'dashboard', badge: '0', title: 'Dashboard Central', icon: LayoutGrid },
    { id: '1', badge: '1', title: 'Cotizador y Tandas', icon: Zap },
    { id: '2', badge: '2', title: 'Simulador', icon: Sparkles },
    { id: '3', badge: '3', title: 'Protocolo y Alertas', icon: ShieldAlert },
    { id: '4', badge: '4', title: 'Rendimiento y Equipo', icon: TrendingUp },
  ];

  const bigRadius = 62;
  const bigCircumference = 2 * Math.PI * bigRadius;
  const bigOffset = bigCircumference - (Math.min(100, engine.overallUtilPct) / 100) * bigCircumference;

  const filteredWorkloads = useMemo(() => {
    if (protocolRoleFilter === 'clipper') return workersWorkloadToday.filter(w => w.worker.role === 'clipper');
    if (protocolRoleFilter === 'editor') return workersWorkloadToday.filter(w => w.worker.role === 'editor');
    return workersWorkloadToday;
  }, [workersWorkloadToday, protocolRoleFilter]);

  return (
    <div className="p-6 max-w-6xl mx-auto min-h-[calc(100vh-4.5rem)] flex flex-col justify-between gap-6">
      {/* =====================================================================
          BARRA SUPERIOR MINIMALISTA: Título + Dock Sutil de Iconos (0, 1, 2, 3, 4) + Ajustes
         ===================================================================== */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-dim border border-accent/30 text-accent flex items-center justify-center shadow-[0_0_20px_-4px_rgba(53,214,228,0.4)]">
            <Gauge size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display text-xl sm:text-2xl font-bold">
                {screen === 'dashboard'
                  ? 'Capacidad Operativa'
                  : DOCK_ITEMS.find(d => d.id === screen)?.title}
              </h2>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[11px] font-semibold ${alertMeta.badgeClass}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${alertMeta.dotClass} animate-pulse`} />
                {alertMeta.label}
              </span>
            </div>
          </div>
        </div>

        {/* DOCK SUTIL DE ICONOS (Sin botón Modo Cliente) */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-surface-2 border border-line rounded-2xl p-1.5 shadow-lg">
            {DOCK_ITEMS.map(item => {
              const Icon = item.icon;
              const isActive = screen === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setScreen(item.id)}
                  title={item.title}
                  className={`group relative w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                    isActive
                      ? 'bg-accent text-on-accent shadow-[0_0_18px_-3px_rgba(53,214,228,0.65)] scale-105'
                      : 'bg-surface-3/60 text-muted hover:text-text hover:bg-surface-3'
                  }`}
                >
                  <Icon size={18} strokeWidth={isActive ? 2.4 : 2} />
                  {item.id !== 'dashboard' && (
                    <span
                      className={`absolute -top-1 -right-1 w-4 h-4 rounded-full font-tech text-[9px] font-bold flex items-center justify-center border ${
                        isActive
                          ? 'bg-ink text-accent border-accent'
                          : 'bg-surface-2 text-muted-2 border-line group-hover:text-text'
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setShowConfigModal(true)}
            title="Capacidad individual y margen"
            className="w-10 h-10 rounded-xl bg-surface-2 hover:bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-accent transition-colors"
          >
            <Sliders size={17} />
          </button>
        </div>
      </div>

      {/* =====================================================================
          PANTALLA 0: DASHBOARD PRINCIPAL
         ===================================================================== */}
      {screen === 'dashboard' && (
        <div className="flex-1 flex flex-col justify-between gap-5 animate-fadeIn">
          <div className="relative flex-1 bg-surface-2 border border-accent/35 rounded-3xl p-6 sm:p-8 overflow-hidden flex flex-col justify-between shadow-[0_0_60px_-18px_rgba(53,214,228,0.28)]">
            <div
              className="absolute -left-20 -top-20 w-96 h-96 rounded-full pointer-events-none blur-3xl opacity-20 animate-pulse"
              style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
            />
            <div
              className="absolute right-0 -bottom-24 w-96 h-96 rounded-full pointer-events-none blur-3xl opacity-20"
              style={{ background: 'radial-gradient(circle, var(--mint), transparent 70%)' }}
            />

            <svg
              className="absolute inset-0 w-full h-full pointer-events-none opacity-35"
              viewBox="0 0 1000 420"
              fill="none"
              preserveAspectRatio="xMidYMid slice"
            >
              <path
                d="M 80 360 L 260 360 L 330 280 L 520 280 L 600 180 L 920 180"
                stroke="var(--accent)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray="8 8"
              >
                <animate attributeName="stroke-dashoffset" values="32;0" dur="3s" repeatCount="indefinite" />
              </path>
              <path
                d="M 480 60 L 640 60 L 710 130 L 920 130"
                stroke="var(--mint)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeDasharray="6 6"
              >
                <animate attributeName="stroke-dashoffset" values="0;24" dur="3.5s" repeatCount="indefinite" />
              </path>
              <circle cx="330" cy="280" r="4.5" fill="var(--accent)" />
              <circle cx="600" cy="180" r="5" fill="var(--mint)" />
              <circle cx="710" cy="130" r="4" fill="var(--accent)" />
            </svg>

            <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center my-auto">
              <div className="lg:col-span-4 flex flex-col items-center justify-center text-center">
                <div className="relative w-44 h-44 flex items-center justify-center">
                  <svg className="w-44 h-44 -rotate-90" viewBox="0 0 148 148">
                    <circle
                      cx="74"
                      cy="74"
                      r={bigRadius}
                      stroke="var(--surface-3)"
                      strokeWidth="10"
                      fill="none"
                    />
                    <circle
                      cx="74"
                      cy="74"
                      r={bigRadius}
                      stroke={alertMeta.ringColor}
                      strokeWidth="10"
                      strokeLinecap="round"
                      fill="none"
                      strokeDasharray={bigCircumference}
                      strokeDashoffset={bigOffset}
                      className="transition-all duration-700 ease-out"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[10px] font-tech uppercase tracking-widest text-muted-2">Ocupación</span>
                    <span className="font-display text-4xl font-bold font-tech mt-0.5">{engine.overallUtilPct}%</span>
                    <span className="text-[11px] font-tech text-accent mt-1">
                      Límite: {engine.bottleneckStage}
                    </span>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-8 space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-stretch">
                  <div className="bg-surface/90 backdrop-blur-md border border-accent/35 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden">
                    <CardNodeDeco color="var(--accent)" />
                    <span className="text-[11px] font-tech uppercase text-accent">1. Capacidad Segura</span>
                    <div className="my-2">
                      <p className="font-display text-4xl font-bold font-tech text-text">
                        {engine.safeBottleneckDaily}
                      </p>
                      <span className="text-xs text-muted">videos / día</span>
                    </div>
                    <div className="text-[11px] font-tech text-muted-2 pt-2 border-t border-line/60 flex justify-between">
                      <span>Física: {engine.physicalBottleneckDaily}</span>
                      <span>−{capacityConfig.safetyMarginPct}% margen</span>
                    </div>
                  </div>

                  <div className="bg-surface/90 backdrop-blur-md border border-amber/35 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden">
                    <CardNodeDeco color="var(--amber)" />
                    <span className="text-[11px] font-tech uppercase text-amber">2. En Cola / Comprometidos</span>
                    <div className="my-2">
                      <p className="font-display text-4xl font-bold font-tech text-amber">
                        {engine.committedToday}
                      </p>
                      <span className="text-xs text-muted">videos activos hoy</span>
                    </div>
                    <div className="text-[11px] font-tech text-muted-2 pt-2 border-t border-line/60 flex justify-between">
                      <span>Pedidos: {engine.activeOrders.length}</span>
                      <span>Total cola: {engine.totalActiveCommitted}</span>
                    </div>
                  </div>

                  <div className="bg-mint-dim/30 backdrop-blur-md border-2 border-mint/60 rounded-2xl p-5 flex flex-col justify-between relative overflow-hidden shadow-[0_0_30px_-8px_rgba(111,231,200,0.35)]">
                    <CardNodeDeco color="var(--mint)" />
                    <span className="text-[11px] font-tech uppercase text-mint font-semibold">3. Aceptable Hoy</span>
                    <div className="my-2">
                      <p className="font-display text-5xl font-bold font-tech text-mint">
                        +{engine.remainingSafeToday}
                      </p>
                      <span className="text-xs text-mint/80">videos inmediatos</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setScreen('1')}
                      className="text-[11px] font-semibold text-on-accent bg-mint rounded-lg py-1.5 px-3 text-center hover:opacity-90 transition-opacity"
                    >
                      Ir al Cotizador →
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-surface/80 border border-line rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold flex items-center gap-1.5">
                        <Scissors size={14} className="text-accent" /> Clippers ({clippers.length})
                      </span>
                      <span className="font-tech text-accent">
                        {engine.safeClippingDaily} seg / {engine.physicalClippingDaily} fís (prom. {engine.avgClipperDaily}/p)
                      </span>
                    </div>
                    <div className="h-2.5 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-accent rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, engine.clippingUtilPct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="bg-surface/80 border border-line rounded-2xl p-4 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold flex items-center gap-1.5">
                        <Film size={14} className="text-mint" /> Editores ({editors.length})
                      </span>
                      <span className="font-tech text-mint">
                        {engine.safeEditingDaily} seg / {engine.physicalEditingDaily} fís (prom. {engine.avgEditorDaily}/p)
                      </span>
                    </div>
                    <div className="h-2.5 bg-surface-3 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-mint rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, engine.editingUtilPct)}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PANTALLA 1: COTIZADOR Y TANDAS (SIMPLIFICADO: VOLUMEN 1..200 + COMPLEJIDAD)
         ===================================================================== */}
      {screen === '1' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch animate-fadeIn">
          {/* Panel izquierdo: Solo Volumen (1..200) y Complejidad */}
          <div className="lg:col-span-5 bg-surface-2 border border-line rounded-3xl p-6 flex flex-col justify-between space-y-6">
            <div className="flex items-center justify-between">
              <span className="font-tech text-xs uppercase tracking-wider text-accent flex items-center gap-1.5">
                <Zap size={14} /> Parámetros de Cotización
              </span>
              <span className="font-tech text-xs text-muted-2">Máx. 200 videos</span>
            </div>

            {/* Slider grande de 1 a 200 videos */}
            <div className="bg-surface-3 border border-line rounded-2xl p-5 space-y-4 my-auto">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-muted">Volumen a cotizar</span>
                <span className="font-display text-5xl font-bold font-tech text-accent">
                  {evalVideos} <span className="text-xs font-normal text-muted">videos</span>
                </span>
              </div>

              <input
                type="range"
                min={1}
                max={200}
                value={evalVideos}
                onChange={e => setEvalVideos(Number(e.target.value))}
                className="w-full accent-accent"
              />

              <div className="flex justify-between text-[10px] font-tech text-muted-2">
                <span>1</span>
                <span>50</span>
                <span>100</span>
                <span>150</span>
                <span>200</span>
              </div>
            </div>

            {/* Selector de Complejidad */}
            <div className="space-y-2">
              <span className="text-xs text-muted block">Complejidad del proyecto</span>
              <div className="grid grid-cols-3 gap-2.5">
                {(['simple', 'estandar', 'alta'] as const).map(c => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setEvalComplexity(c)}
                    className={`py-3 rounded-xl text-xs font-semibold capitalize border transition-all ${
                      evalComplexity === c
                        ? 'bg-accent text-on-accent border-accent shadow-[0_0_16px_-4px_rgba(53,214,228,0.5)]'
                        : 'bg-surface-3 text-muted border-line hover:text-text'
                    }`}
                  >
                    {c === 'simple' ? 'Simple' : c === 'estandar' ? 'Estándar' : 'Compleja'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Panel derecho: Resultado Visual de la Cotización y Tandas */}
          <div className="lg:col-span-7 bg-surface-2 border border-line rounded-3xl p-6 flex flex-col justify-between space-y-6 relative overflow-hidden">
            <CardNodeDeco color={evaluation.canAcceptFullOnDate ? 'var(--mint)' : 'var(--amber)'} />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className={`rounded-2xl p-5 border flex flex-col justify-between ${
                evaluation.canAcceptFullOnDate
                  ? 'bg-mint-dim/30 border-mint/40'
                  : 'bg-amber-dim/30 border-amber/40'
              }`}>
                <div className="flex items-center gap-2">
                  {evaluation.canAcceptFullOnDate ? (
                    <CheckCircle2 size={20} className="text-mint" />
                  ) : (
                    <AlertTriangle size={20} className="text-amber" />
                  )}
                  <span className="font-tech text-xs uppercase font-bold">
                    {evaluation.canAcceptFullOnDate ? 'Entrega en 1 Día' : 'Entrega por Tandas'}
                  </span>
                </div>
                <p className="font-display text-3xl font-bold mt-3">
                  {evaluation.canAcceptFullOnDate
                    ? `${evalVideos} vid hoy`
                    : `Máx. hoy: ${evaluation.maxImmediateAcceptable} vid`}
                </p>
                <span className="text-xs text-muted mt-1 font-tech">
                  Capacidad libre hoy: {evaluation.availableSafeOnTargetDate} de {engine.safeBottleneckDaily} vid
                </span>
              </div>

              <div className="bg-surface-3 border border-accent/30 rounded-2xl p-5 flex flex-col justify-between">
                <span className="font-tech text-xs uppercase text-accent flex items-center gap-1.5">
                  <Clock size={14} /> Ventana Estimada (ETA)
                </span>
                <p className="font-display text-2xl font-bold font-tech text-text mt-3">
                  {evaluation.etaWindowText}
                </p>
                <span className="text-xs text-muted mt-1 font-tech">
                  Finalización total: {evaluation.finalCompletionDate}
                </span>
              </div>
            </div>

            <div className="flex-1 flex flex-col justify-center space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase font-tech text-muted flex items-center gap-1.5">
                  <Calendar size={14} className="text-accent" /> Distribución por Tandas ({evaluation.batches.length})
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-h-64 overflow-y-auto pr-1">
                {evaluation.batches.map(b => {
                  const pctOfOrder = Math.round((b.videos / Math.max(1, evalVideos)) * 100);
                  return (
                    <div
                      key={b.date}
                      className="bg-surface-3 border border-line rounded-2xl p-4 space-y-2.5 relative overflow-hidden"
                    >
                      <div className="flex items-center justify-between text-[11px] font-tech">
                        <span className="px-2 py-0.5 rounded bg-accent-dim text-accent font-bold">
                          TANDA {b.dayIndex}
                        </span>
                        <span className="text-muted-2">{b.date === todayIso() ? 'Hoy' : b.date}</span>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <p className="font-display text-2xl font-bold font-tech text-text">
                          {b.videos} <span className="text-xs font-normal text-muted">videos</span>
                        </p>
                        <span className="font-tech text-xs text-mint">{pctOfOrder}%</span>
                      </div>

                      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full bg-mint rounded-full" style={{ width: `${pctOfOrder}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PANTALLA 2: SIMULADOR INTERACTIVO («¿QUÉ PASARÍA SI...?»)
         ===================================================================== */}
      {screen === '2' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch animate-fadeIn">
          <div className="lg:col-span-6 bg-surface-2 border border-line rounded-3xl p-6 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <span className="font-tech text-xs uppercase tracking-wider text-mint flex items-center gap-1.5">
                <Sparkles size={14} /> Laboratorio de Escenarios
              </span>
              <button
                type="button"
                onClick={() => {
                  setSimExtraVideos(0);
                  setSimExtraClippers(0);
                  setSimExtraEditors(0);
                  setSimUnavailablePct(0);
                  setSimEditorDemandBoostPct(0);
                }}
                className="text-xs text-muted hover:text-accent font-tech"
              >
                Reiniciar
              </button>
            </div>

            <div className="space-y-4 my-auto">
              <div className="bg-surface-3 border border-line rounded-2xl p-4">
                <div className="flex justify-between items-baseline mb-2">
                  <span className="text-xs font-medium">Entrada de videos extra</span>
                  <span className="font-display text-2xl font-bold font-tech text-accent">+{simExtraVideos} vid</span>
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
                <div className="bg-surface-3 border border-line rounded-2xl p-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-medium">+ Clippers</span>
                    <span className="font-display text-xl font-bold font-tech text-accent">+{simExtraClippers}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={simExtraClippers}
                    onChange={e => setSimExtraClippers(Number(e.target.value))}
                    className="w-full accent-accent"
                  />
                  <span className="text-[10px] font-tech text-muted-2 block mt-1">
                    +{simExtraClippers * engine.avgClipperDaily} vid/día fís.
                  </span>
                </div>

                <div className="bg-surface-3 border border-line rounded-2xl p-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-medium">+ Editores</span>
                    <span className="font-display text-xl font-bold font-tech text-mint">+{simExtraEditors}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    value={simExtraEditors}
                    onChange={e => setSimExtraEditors(Number(e.target.value))}
                    className="w-full accent-mint"
                  />
                  <span className="text-[10px] font-tech text-muted-2 block mt-1">
                    +{simExtraEditors * engine.avgEditorDaily} vid/día fís.
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-surface-3 border border-line rounded-2xl p-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-medium">Baja de personal</span>
                    <span className="font-display text-xl font-bold font-tech text-amber">{simUnavailablePct}%</span>
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

                <div className="bg-surface-3 border border-line rounded-2xl p-4">
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-xs font-medium">Complejidad edición</span>
                    <span className="font-display text-xl font-bold font-tech text-violet">+{simEditorDemandBoostPct}%</span>
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

          <div className="lg:col-span-6 bg-surface-2 border border-line rounded-3xl p-6 flex flex-col justify-between space-y-5 relative overflow-hidden">
            <CardNodeDeco color={simulation.simDeficit > 0 ? 'var(--amber)' : 'var(--mint)'} />

            <div className="grid grid-cols-2 gap-4 my-auto">
              <div className="bg-surface-3 border border-line rounded-2xl p-5">
                <span className="text-[10px] font-tech uppercase text-muted-2 block">Capacidad Segura Simulada</span>
                <p className="font-display text-4xl font-bold font-tech text-mint mt-2">
                  {simulation.simSafeLimit}
                </p>
                <span className="text-xs text-muted font-tech mt-1 block">
                  Clip: {simulation.simSafeClip} · Edic: {simulation.simSafeEdit}
                </span>
              </div>

              <div className="bg-surface-3 border border-line rounded-2xl p-5">
                <span className="text-[10px] font-tech uppercase text-muted-2 block">Nuevo Cuello de Botella</span>
                <p className="font-display text-4xl font-bold font-tech text-accent mt-2">
                  {simulation.simBottleneck}
                </p>
                <span className="text-xs text-muted font-tech mt-1 block">
                  Ocupación: {simulation.simUtilPct}%
                </span>
              </div>

              <div className={`rounded-2xl p-5 border ${
                simulation.simDeficit > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-mint-dim/30 border-mint/30'
              }`}>
                <span className="text-[10px] font-tech uppercase text-muted-2 block">Balance de Demanda</span>
                <p className={`font-display text-3xl font-bold font-tech mt-2 ${
                  simulation.simDeficit > 0 ? 'text-red-400' : 'text-mint'
                }`}>
                  {simulation.simDeficit > 0 ? `-${simulation.simDeficit} vid` : `+${simulation.simFreeCapacity} libres`}
                </p>
                <span className="text-xs text-muted font-tech mt-1 block">
                  Demanda: {simulation.totalSimulatedDemand} vid
                </span>
              </div>

              <div className="bg-surface-3 border border-line rounded-2xl p-5">
                <span className="text-[10px] font-tech uppercase text-muted-2 block">Tiempo de Absorción</span>
                <p className="font-display text-3xl font-bold font-tech text-amber mt-2">
                  {simulation.daysNeededForExtra} día(s)
                </p>
                <span className="text-xs text-muted font-tech mt-1 block">
                  En tandas seguras
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          PANTALLA 3: PROTOCOLO Y ALERTAS (RADAR DE CARGA INDIVIDUAL HOY + ASIGNACIÓN INTELIGENTE)
         ===================================================================== */}
      {screen === '3' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch animate-fadeIn">
          {/* Columna Izquierda (6 cols): Estado de Carga Hoy de TODOS los Clippers y Editores + Complejidad */}
          <div className="lg:col-span-6 bg-surface-2 border border-line rounded-3xl p-6 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div>
                <span className="font-tech text-xs uppercase tracking-wider text-accent flex items-center gap-1.5">
                  <Users size={14} /> Carga de Trabajo Hoy por Creador
                </span>
                <p className="text-xs text-muted mt-0.5">
                  Volumen asignado hoy y complejidad de sus videos activos
                </p>
              </div>

              <div className="flex items-center gap-1 bg-surface-3 border border-line rounded-xl p-1">
                {(['todos', 'clipper', 'editor'] as const).map(r => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setProtocolRoleFilter(r)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all ${
                      protocolRoleFilter === r ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'
                    }`}
                  >
                    {r === 'todos' ? 'Todos' : r === 'clipper' ? 'Clippers' : 'Editores'}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2.5 max-h-[450px] overflow-y-auto pr-1 my-auto">
              {filteredWorkloads.map(item => {
                const isClipper = item.worker.role === 'clipper';
                const barColor =
                  item.utilPct >= 90 ? 'bg-red-500' : item.utilPct >= 70 ? 'bg-amber' : isClipper ? 'bg-accent' : 'bg-mint';

                return (
                  <div
                    key={item.worker.id}
                    className="bg-surface-3 border border-line rounded-2xl p-4 space-y-2.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${item.worker.online ? 'bg-mint' : 'bg-muted-2'}`} />
                        <p className="text-sm font-bold truncate">{item.worker.name}</p>
                        <span className={`text-[10px] font-tech px-2 py-0.5 rounded-md ${
                          isClipper ? 'bg-accent-dim text-accent' : 'bg-mint-dim text-mint'
                        }`}>
                          {isClipper ? 'Clipper' : 'Editor(a)'}
                        </span>
                      </div>

                      <div className="text-right font-tech text-xs shrink-0">
                        <strong className="text-text text-sm">{item.totalVideosToday}</strong>
                        <span className="text-muted-2"> / {item.capacity} vid hoy</span>
                        <span className="ml-2 text-[11px] text-mint">({item.freeCapacity} libres)</span>
                      </div>
                    </div>

                    {/* Barra de saturación del día */}
                    <div className="h-2 bg-surface-2 rounded-full overflow-hidden border border-line">
                      <div className={`h-full ${barColor} rounded-full transition-all duration-500`} style={{ width: `${item.utilPct}%` }} />
                    </div>

                    {/* Desglose de complejidad de los videos que tiene hoy */}
                    <div className="flex items-center justify-between gap-2 flex-wrap pt-0.5 text-[11px] font-tech">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="px-2 py-0.5 rounded bg-surface-2 border border-line text-muted">
                          Simple: <strong className="text-mint">{item.simpleVideos}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface-2 border border-line text-muted">
                          Estándar: <strong className="text-accent">{item.estandarVideos}</strong>
                        </span>
                        <span className="px-2 py-0.5 rounded bg-surface-2 border border-line text-muted">
                          Compleja: <strong className="text-amber">{item.altaVideos}</strong>
                        </span>
                      </div>

                      {item.activeBrands.length > 0 && (
                        <span className="text-muted-2 truncate max-w-[170px]">
                          {item.activeBrands.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Columna Derecha (6 cols): Cola de Pedidos con Alerta Activa y Asignación Inteligente */}
          <div className="lg:col-span-6 bg-surface-2 border border-line rounded-3xl p-6 flex flex-col justify-between space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-tech text-xs uppercase tracking-wider text-amber flex items-center gap-1.5">
                  <ShieldAlert size={14} /> Pedidos con Alerta Activa ({protocolAlertOrders.length})
                </span>
                <p className="text-xs text-muted mt-0.5">
                  Clasificados automáticamente según su configuración de entrega y complejidad
                </p>
              </div>
            </div>

            {protocolAlertOrders.length === 0 ? (
              <div className="my-auto text-center py-12 bg-surface-3/40 border border-dashed border-line rounded-2xl">
                <CheckCircle2 size={28} className="text-mint mx-auto mb-2" />
                <p className="text-sm font-semibold">Sin pedidos en riesgo ni alertas activas</p>
                <p className="text-xs text-muted mt-1">Todos los pedidos cumplen con su configuración de entrega.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[450px] overflow-y-auto pr-1 my-auto">
                {protocolAlertOrders.map(({ order, hoursLeft, complexity, level, currentClipper, currentEditor }) => {
                  const badgeStyles = {
                    prioritario: 'bg-accent-dim text-accent border-accent/30',
                    urgente: 'bg-amber-dim text-amber border-amber/30',
                    critico: 'bg-red-500/15 text-red-400 border-red-500/30',
                    normal: 'bg-mint-dim text-mint border-mint/30',
                  }[level];

                  const complexityBadge = {
                    simple: 'text-mint border-mint/30 bg-mint-dim/40',
                    estandar: 'text-accent border-accent/30 bg-accent-dim/40',
                    alta: 'text-amber border-amber/30 bg-amber-dim/40',
                  }[complexity];

                  const selectedClipperId = selectedClipperByOrder[order.id] ?? order.clipperId ?? '';
                  const selectedEditorId = selectedEditorByOrder[order.id] ?? order.editorId ?? '';

                  return (
                    <div
                      key={order.id}
                      className="bg-surface-3 border border-line rounded-2xl p-4 space-y-3"
                    >
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-[10px] font-tech uppercase px-2.5 py-0.5 rounded-full border font-bold ${badgeStyles}`}>
                              {level}
                            </span>
                            <span className={`text-[10px] font-tech uppercase px-2 py-0.5 rounded-md border ${complexityBadge}`}>
                              Complejidad {complexity === 'alta' ? 'Compleja' : complexity}
                            </span>
                            <span className="font-tech text-xs text-muted-2">
                              {hoursLeft > 0 ? `${hoursLeft}h para entrega` : 'Plazo vencido'}
                            </span>
                          </div>
                          <p className="text-sm font-bold mt-1.5">
                            {order.brand} · <span className="text-accent font-tech">{order.videoCount} videos</span>
                          </p>
                        </div>

                        <span className="font-tech text-[11px] text-muted-2">
                          {order.deliveryDate} {order.deliveryTime}
                        </span>
                      </div>

                      {/* Selectores para elegir a qué Clipper y Editor asignar según su carga de hoy */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                        <div>
                          <label className="text-[10px] font-tech uppercase text-muted-2 block mb-1">
                            Clipper ({currentClipper ? `Actual: ${currentClipper.name}` : 'Sin asignar'})
                          </label>
                          <select
                            value={selectedClipperId}
                            onChange={e =>
                              setSelectedClipperByOrder(prev => ({ ...prev, [order.id]: e.target.value }))
                            }
                            className="w-full bg-surface-2 border border-line rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-accent"
                          >
                            <option value="">Seleccionar Clipper...</option>
                            {workersWorkloadToday
                              .filter(x => x.worker.role === 'clipper')
                              .map(x => (
                                <option key={x.worker.id} value={x.worker.id}>
                                  {x.worker.name} ({x.totalVideosToday}/{x.capacity} vid hoy · {x.freeCapacity} libres)
                                </option>
                              ))}
                          </select>
                        </div>

                        <div>
                          <label className="text-[10px] font-tech uppercase text-muted-2 block mb-1">
                            Editor(a) ({currentEditor ? `Actual: ${currentEditor.name}` : 'Sin asignar'})
                          </label>
                          <select
                            value={selectedEditorId}
                            onChange={e =>
                              setSelectedEditorByOrder(prev => ({ ...prev, [order.id]: e.target.value }))
                            }
                            className="w-full bg-surface-2 border border-line rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-mint"
                          >
                            <option value="">Seleccionar Editor(a)...</option>
                            {workersWorkloadToday
                              .filter(x => x.worker.role === 'editor')
                              .map(x => (
                                <option key={x.worker.id} value={x.worker.id}>
                                  {x.worker.name} ({x.totalVideosToday}/{x.capacity} vid hoy · {x.freeCapacity} libres)
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      <div className="flex items-center justify-end pt-1">
                        {reassignedToastId === order.id ? (
                          <span className="text-xs text-mint font-semibold flex items-center gap-1">
                            <CheckCircle2 size={14} /> Asignación actualizada
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleAssignFromProtocol(order)}
                            className="flex items-center gap-1.5 bg-accent text-on-accent rounded-xl px-3.5 py-1.5 text-xs font-semibold hover:bg-accent-strong transition-colors"
                          >
                            <RefreshCw size={12} /> Aplicar Asignación Inteligente
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          PANTALLA 4: RENDIMIENTO REAL, RETRABAJO Y CONTRATACIÓN
         ===================================================================== */}
      {screen === '4' && (
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch animate-fadeIn">
          <div className="lg:col-span-5 bg-surface-2 border border-line rounded-3xl p-6 flex flex-col justify-between space-y-5">
            <span className="font-tech text-xs uppercase tracking-wider text-accent flex items-center gap-1.5">
              <Clock size={14} /> Calidad vs. Velocidad Real
            </span>

            <div className="grid grid-cols-2 gap-4 my-auto">
              <div className="bg-surface-3 border border-line rounded-2xl p-5">
                <span className="text-[10px] font-tech uppercase text-muted-2 block">Fricción Retrabajo</span>
                <p className="font-display text-4xl font-bold font-tech text-amber mt-2">
                  {engine.reworkRatePct}%
                </p>
                <span className="text-xs text-muted font-tech mt-1 block">
                  {engine.videosWithRework} con correcciones
                </span>
              </div>

              <div className="bg-surface-3 border border-mint/30 rounded-2xl p-5">
                <span className="text-[10px] font-tech uppercase text-mint block">Capacidad Efectiva</span>
                <p className="font-display text-4xl font-bold font-tech text-mint mt-2">
                  {engine.effectiveRealCapacity}
                </p>
                <span className="text-xs text-muted font-tech mt-1 block">
                  videos netos / día
                </span>
              </div>
            </div>

            <div className="bg-surface-3 border border-line rounded-2xl p-4 flex items-center justify-between text-xs font-tech">
              <span className="text-muted">Teórica Física: {engine.physicalBottleneckDaily} v/d</span>
              <span className="text-accent">Segura: {engine.safeBottleneckDaily} v/d</span>
              <span className="text-mint">Real: {engine.effectiveRealCapacity} v/d</span>
            </div>
          </div>

          <div className="lg:col-span-7 bg-surface-2 border border-line rounded-3xl p-6 flex flex-col justify-between space-y-5 relative overflow-hidden">
            <CardNodeDeco color="var(--mint)" />

            <span className="font-tech text-xs uppercase tracking-wider text-mint flex items-center gap-1.5">
              <UserPlus size={14} /> Señal de Contratación Basada en Promedios Reales
            </span>

            <div className="bg-surface-3 border border-mint/35 rounded-2xl p-5 space-y-3 my-auto">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-xs font-tech uppercase text-mint">
                  Etapa Limitante Actual: {engine.bottleneckStage}
                </span>
                <span className="font-tech text-xs px-2.5 py-0.5 rounded-full bg-mint-dim text-mint">
                  Promedio {engine.bottleneckStage}: {engine.bottleneckStage === 'Edición' ? engine.avgEditorDaily : engine.avgClipperDaily} vid/día
                </span>
              </div>

              <p className="font-display text-2xl sm:text-3xl font-bold text-text">
                +1 {engine.bottleneckStage === 'Edición' ? 'Editor(a)' : 'Clipper'} = +{Math.floor((engine.bottleneckStage === 'Edición' ? engine.avgEditorDaily : engine.avgClipperDaily) * ((100 - capacityConfig.safetyMarginPct) / 100))} videos seguros / día
              </p>

              <p className="text-xs text-muted font-tech">
                Expansión mensual: +{Math.floor((engine.bottleneckStage === 'Edición' ? engine.avgEditorDaily : engine.avgClipperDaily) * ((100 - capacityConfig.safetyMarginPct) / 100)) * 26} videos comerciales al mes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-surface-3 border border-line rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-muted-2 block">Promedio Clipper</span>
                  <p className="font-display text-xl font-bold font-tech text-accent">{engine.avgClipperDaily} vid/día</p>
                </div>
                <Scissors size={20} className="text-accent opacity-60" />
              </div>

              <div className="bg-surface-3 border border-line rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[11px] text-muted-2 block">Promedio Editor(a)</span>
                  <p className="font-display text-xl font-bold font-tech text-mint">{engine.avgEditorDaily} vid/día</p>
                </div>
                <Film size={20} className="text-mint opacity-60" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          MODAL DE CAPACIDAD INDIVIDUAL POR CREADOR Y MARGEN DE SEGURIDAD
         ===================================================================== */}
      {showConfigModal && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowConfigModal(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-surface-2 border border-line rounded-3xl max-w-2xl w-full p-6 space-y-5 animate-fadeIn"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-bold flex items-center gap-2">
                <Sliders size={18} className="text-accent" /> Capacidad Individual y Margen Operativo
              </h3>
              <button
                type="button"
                onClick={() => setShowConfigModal(false)}
                className="w-8 h-8 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text"
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="bg-surface-3 border border-line rounded-xl p-3.5 block">
                <span className="text-xs text-muted block mb-1">Margen de seguridad (%)</span>
                <input
                  type="number"
                  min={0}
                  max={50}
                  value={capacityConfig.safetyMarginPct}
                  onChange={e => updateCapacityConfig({ safetyMarginPct: Math.min(50, Math.max(0, Number(e.target.value) || 0)) })}
                  className="w-full bg-surface-2 border border-line rounded-lg px-3 py-1.5 text-sm font-tech outline-none focus:border-accent"
                />
              </label>

              <label className="bg-surface-3 border border-line rounded-xl p-3.5 block">
                <span className="text-xs text-muted block mb-1">Horario (Inicio — Fin h)</span>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    max={22}
                    value={capacityConfig.workdayStartHour}
                    onChange={e => updateCapacityConfig({ workdayStartHour: Number(e.target.value) || 8 })}
                    className="w-full bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-sm font-tech outline-none focus:border-accent"
                  />
                  <span className="text-muted-2">-</span>
                  <input
                    type="number"
                    min={1}
                    max={24}
                    value={capacityConfig.workdayEndHour}
                    onChange={e => updateCapacityConfig({ workdayEndHour: Number(e.target.value) || 20 })}
                    className="w-full bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-sm font-tech outline-none focus:border-accent"
                  />
                </div>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-h-72 overflow-y-auto pr-1">
              <div className="space-y-2">
                <span className="text-xs font-semibold text-accent flex items-center justify-between">
                  <span>Clippers</span>
                  <span className="font-tech">Prom: {engine.avgClipperDaily} v/d</span>
                </span>
                {clippers.map(w => (
                  <div key={w.id} className="bg-surface-3 border border-line rounded-xl px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium truncate">{w.name}</span>
                    <input
                      type="number"
                      min={1}
                      value={getWorkerCapacity(w.id)}
                      onChange={e => setWorkerCapacity(w.id, Number(e.target.value) || 1)}
                      className="w-16 bg-surface-2 border border-line rounded-md px-2 py-1 text-xs font-tech text-center outline-none focus:border-accent"
                    />
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <span className="text-xs font-semibold text-mint flex items-center justify-between">
                  <span>Editores</span>
                  <span className="font-tech">Prom: {engine.avgEditorDaily} v/d</span>
                </span>
                {editors.map(w => (
                  <div key={w.id} className="bg-surface-3 border border-line rounded-xl px-3 py-2 flex items-center justify-between">
                    <span className="text-xs font-medium truncate">{w.name}</span>
                    <input
                      type="number"
                      min={1}
                      value={getWorkerCapacity(w.id)}
                      onChange={e => setWorkerCapacity(w.id, Number(e.target.value) || 1)}
                      className="w-16 bg-surface-2 border border-line rounded-md px-2 py-1 text-xs font-tech text-center outline-none focus:border-mint"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
