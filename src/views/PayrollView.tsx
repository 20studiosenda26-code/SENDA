import { useState, useMemo, useRef } from 'react';
import { useStore } from '../store';
import { uploadSharedFile } from '../lib/supabaseClient';
import type { Worker, Order } from '../types';
import { CardNodeDeco } from '../components/BrandBackground';
import {
  Wallet, Scissors, Film, Upload, CheckCircle2, Clock, Landmark,
  Copy, Check, Eye, RotateCcw, Calendar, ChevronLeft, ChevronRight,
  Loader2, FileText, Sparkles, SlidersHorizontal, Download,
} from 'lucide-react';

const CURRENCY_SIGN = String.fromCharCode(36);

function fmtMoney(n: number): string {
  const clean = Math.round(Number(n) || 0);
  return CURRENCY_SIGN + clean.toLocaleString('es-CO');
}

function isImageFile(name?: string | null) {
  if (!name) return false;
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}

/** Calcula el sábado y domingo del corte semanal correspondiente (offsetWeeks: 0 = esta semana, -1 = anterior, etc.) */
function getWeekendCycle(offsetWeeks: number) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = Domingo, 6 = Sábado
  const diffToSaturday = dayOfWeek === 0 ? -1 : 6 - dayOfWeek;

  const saturday = new Date(now);
  saturday.setHours(0, 0, 0, 0);
  saturday.setDate(now.getDate() + diffToSaturday + offsetWeeks * 7);

  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);

  const satIso = saturday.toISOString().slice(0, 10);
  const sunIso = sunday.toISOString().slice(0, 10);
  const weekKey = `wk-${satIso}`;

  const satLabel = saturday.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  const sunLabel = sunday.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  const weekendLabel = `Sáb ${satLabel} · Dom ${sunLabel}`;

  const isWeekendToday = offsetWeeks === 0 && (dayOfWeek === 6 || dayOfWeek === 0);
  const daysUntilSaturday = offsetWeeks === 0 ? Math.max(0, diffToSaturday) : 0;

  return {
    weekKey,
    weekendLabel,
    satIso,
    sunIso,
    isWeekendToday,
    daysUntilSaturday,
  };
}

export function PayrollView() {
  const {
    workers, brands, orders, financeSettings,
    payrollPayments, payrollAdjustments, setWorkerPayrollAdjustment,
    recordPayrollPayment, revertPayrollPayment,
  } = useStore();

  const [roleTab, setRoleTab] = useState<'clipper' | 'editor'>('clipper');
  const [statusFilter, setStatusFilter] = useState<'todos' | 'por_pagar' | 'pagados'>('todos');
  const [weekOffset, setWeekOffset] = useState<number>(0);

  // Estado por trabajador para comprobante antes de confirmar pago
  const [draftReceipts, setDraftReceipts] = useState<Record<string, { fileName: string; fileUrl: string }>>({});
  const [uploadingWorkerId, setUploadingWorkerId] = useState<string | null>(null);
  const [editingAmountWorkerId, setEditingAmountWorkerId] = useState<string | null>(null);
  const [customAmountInput, setCustomAmountInput] = useState<string>('');
  const [copiedBankId, setCopiedBankId] = useState<string | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<{ name: string; url: string; workerName: string } | null>(null);
  const [justPaidId, setJustPaidId] = useState<string | null>(null);

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const cycle = useMemo(() => getWeekendCycle(weekOffset), [weekOffset]);

  // Calcula lo acumulado por cada Clipper y Editor a partir de videos aprobados (50% Senda / 100% Cliente) + ajustes manuales
  const workerPayrollRows = useMemo(() => {
    const defClipper = financeSettings.defaultClipperCost;
    const defEditor = financeSettings.defaultEditorCost;

    const linkedOrderByVideoId = new Map<string, Order>();
    const linkedOrderByBrand = new Map<string, Order>();
    for (const o of orders) {
      if (o.boardVideoId) linkedOrderByVideoId.set(o.boardVideoId, o);
      linkedOrderByBrand.set(o.brand.trim().toLowerCase(), o);
    }

    const allVideos = brands.flatMap(b => b.videos.map(v => ({ ...v, brandName: b.name })));

    return workers.map(w => {
      let accruedFromTasks = 0;
      const completedTasks: { id: string; name: string; videos: number; stage: '50%' | '100%'; amount: number }[] = [];

      for (const v of allVideos) {
        const isMyTask = w.role === 'clipper' ? v.clipperId === w.id : v.editorId === w.id;
        if (!isMyTask) continue;

        const linked = linkedOrderByVideoId.get(v.id) || linkedOrderByBrand.get(v.brandName.trim().toLowerCase());
        const count = linked ? Math.max(1, linked.videoCount || 1) : 1;
        const unitRate = w.role === 'clipper'
          ? (v.tierSnapshot ? v.tierSnapshot.clipperPay : defClipper)
          : (v.tierSnapshot ? v.tierSnapshot.editorPay : defEditor);

        if (v.qc === 'aprobado_cliente' || v.paid100) {
          const amt = count * unitRate;
          accruedFromTasks += amt;
          completedTasks.push({ id: v.id, name: v.name, videos: count, stage: '100%', amount: amt });
        } else if (v.qc === 'aprobado_senda' || v.qc === 'aprobado' || v.paid50) {
          const amt = Math.round(count * unitRate * 0.5);
          accruedFromTasks += amt;
          completedTasks.push({ id: v.id, name: v.name, videos: count, stage: '50%', amount: amt });
        }
      }

      const manualOverride = payrollAdjustments[w.id];
      const grossForCycle = manualOverride !== undefined ? manualOverride : accruedFromTasks;

      // Pagos ya realizados a este trabajador en el corte semanal activo
      const paymentsThisCycle = payrollPayments.filter(
        p => p.workerId === w.id && p.weekKey === cycle.weekKey
      );
      const paidAmount = paymentsThisCycle.reduce((s, p) => s + p.amount, 0);
      const latestPayment = paymentsThisCycle[0] || null;

      // Lo que resta por pagar (se descuenta automáticamente cuando se marca como pagado)
      const pendingAmount = Math.max(0, grossForCycle - paidAmount);
      const isPaid = grossForCycle > 0 && pendingAmount === 0 && paymentsThisCycle.length > 0;

      return {
        worker: w,
        accruedFromTasks,
        grossForCycle,
        paidAmount,
        pendingAmount,
        isPaid,
        latestPayment,
        completedTasks,
      };
    });
  }, [workers, brands, orders, financeSettings, payrollAdjustments, payrollPayments, cycle.weekKey]);

  const clippersRows = useMemo(() => workerPayrollRows.filter(r => r.worker.role === 'clipper'), [workerPayrollRows]);
  const editorsRows = useMemo(() => workerPayrollRows.filter(r => r.worker.role === 'editor'), [workerPayrollRows]);

  const totals = useMemo(() => {
    const totalPendingAll = workerPayrollRows.reduce((s, r) => s + r.pendingAmount, 0);
    const totalPaidAll = workerPayrollRows.reduce((s, r) => s + r.paidAmount, 0);
    const totalCycleAll = totalPendingAll + totalPaidAll;

    const pendingClippers = clippersRows.reduce((s, r) => s + r.pendingAmount, 0);
    const paidClippers = clippersRows.reduce((s, r) => s + r.paidAmount, 0);

    const pendingEditors = editorsRows.reduce((s, r) => s + r.pendingAmount, 0);
    const paidEditors = editorsRows.reduce((s, r) => s + r.paidAmount, 0);

    const pendingWorkersCount = workerPayrollRows.filter(r => r.pendingAmount > 0).length;
    const paidWorkersCount = workerPayrollRows.filter(r => r.isPaid).length;
    const progressPct = totalCycleAll > 0 ? Math.min(100, Math.round((totalPaidAll / totalCycleAll) * 100)) : 0;

    return {
      totalPendingAll,
      totalPaidAll,
      totalCycleAll,
      pendingClippers,
      paidClippers,
      pendingEditors,
      paidEditors,
      pendingWorkersCount,
      paidWorkersCount,
      progressPct,
    };
  }, [workerPayrollRows, clippersRows, editorsRows]);

  const visibleRows = useMemo(() => {
    const base = roleTab === 'clipper' ? clippersRows : editorsRows;
    if (statusFilter === 'por_pagar') return base.filter(r => r.pendingAmount > 0 || !r.isPaid);
    if (statusFilter === 'pagados') return base.filter(r => r.isPaid);
    return base;
  }, [roleTab, clippersRows, editorsRows, statusFilter]);

  const handleUploadReceipt = async (workerId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadingWorkerId(workerId);
    try {
      const url = await uploadSharedFile(f, `payroll-receipts/${cycle.weekKey}/${workerId}`);
      setDraftReceipts(prev => ({
        ...prev,
        [workerId]: { fileName: f.name, fileUrl: url },
      }));
    } finally {
      setUploadingWorkerId(null);
    }
  };

  const handleMarkAsPaid = (row: (typeof workerPayrollRows)[number]) => {
    const amountToPay = row.pendingAmount > 0 ? row.pendingAmount : row.grossForCycle;
    if (amountToPay <= 0) return;
    const draft = draftReceipts[row.worker.id];

    recordPayrollPayment({
      workerId: row.worker.id,
      workerName: row.worker.name,
      role: row.worker.role,
      amount: amountToPay,
      weekKey: cycle.weekKey,
      weekendLabel: cycle.weekendLabel,
      receiptFileName: draft?.fileName || null,
      receiptFileUrl: draft?.fileUrl || null,
    });

    setJustPaidId(row.worker.id);
    setTimeout(() => setJustPaidId(prev => (prev === row.worker.id ? null : prev)), 2600);
  };

  const copyBank = (workerId: string, bankInfo?: string) => {
    if (!bankInfo) return;
    void navigator.clipboard?.writeText(bankInfo);
    setCopiedBankId(workerId);
    setTimeout(() => setCopiedBankId(prev => (prev === workerId ? null : prev)), 1800);
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* Cabecera + Selector de Fin de Semana (Sábado / Domingo) */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-accent-dim border border-accent/30 text-accent flex items-center justify-center shadow-[0_0_20px_-4px_rgba(53,214,228,0.38)]">
            <Wallet size={22} />
          </div>
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold">Nóminas</h2>
            <p className="text-xs text-muted">Dispersión de fin de semana (Sábado / Domingo) con comprobante de transferencia</p>
          </div>
        </div>

        {/* Selector de corte de fin de semana */}
        <div className="flex items-center gap-2 bg-surface-2 border border-line rounded-xl p-1.5">
          <button
            type="button"
            onClick={() => setWeekOffset(w => w - 1)}
            className="w-8 h-8 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text hover:border-accent/40 transition-colors"
            title="Semana anterior"
          >
            <ChevronLeft size={16} />
          </button>
          <div className="px-3 text-center">
            <p className="text-[10px] uppercase tracking-wider font-tech text-accent flex items-center justify-center gap-1">
              <Calendar size={11} /> Corte Fin de Semana
            </p>
            <p className="text-xs font-semibold">{cycle.weekendLabel}</p>
          </div>
          <button
            type="button"
            onClick={() => setWeekOffset(w => w + 1)}
            className="w-8 h-8 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text hover:border-accent/40 transition-colors"
            title="Semana siguiente"
          >
            <ChevronRight size={16} />
          </button>
          {weekOffset !== 0 && (
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-accent-dim text-accent border border-accent/30 hover:bg-accent/20 transition-colors"
            >
              Actual
            </button>
          )}
        </div>
      </div>

      {/* HERO ANIMADO: Total Pagos por Hacer (se va restando en vivo cada vez que pagas a alguien) */}
      <div className="relative bg-surface-2 border border-accent/40 rounded-2xl p-6 sm:p-7 overflow-hidden shadow-[0_0_50px_-14px_rgba(53,214,228,0.28)]">
        <div
          className="absolute -left-16 -top-16 w-80 h-80 rounded-full pointer-events-none blur-3xl opacity-25 animate-pulse"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
        />
        <div
          className="absolute right-8 -bottom-20 w-80 h-80 rounded-full pointer-events-none blur-3xl opacity-25"
          style={{ background: 'radial-gradient(circle, var(--mint), transparent 70%)' }}
        />

        {/* Circuito animado de dispersión de nómina */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
          viewBox="0 0 900 250"
          fill="none"
          preserveAspectRatio="xMaxYMid slice"
        >
          <defs>
            <linearGradient id="payrollGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--amber)" stopOpacity="0" />
              <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.65" />
              <stop offset="100%" stopColor="var(--mint)" stopOpacity="0.95" />
            </linearGradient>
            <filter id="payrollGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.2" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <path
            d="M 320 210 L 455 210 L 505 150 L 635 150 L 685 95 L 805 95"
            stroke="url(#payrollGrad1)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 420 40 L 535 40 L 580 90 L 700 90"
            stroke="var(--accent)"
            strokeOpacity="0.45"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <circle r="4" fill="var(--accent)" filter="url(#payrollGlow)">
            <animateMotion dur="3.8s" repeatCount="indefinite" path="M 320 210 L 455 210 L 505 150 L 635 150 L 685 95 L 805 95" />
          </circle>
          <circle r="3.5" fill="var(--mint)" filter="url(#payrollGlow)">
            <animateMotion dur="4.6s" repeatCount="indefinite" path="M 420 40 L 535 40 L 580 90 L 700 90" />
          </circle>

          <circle cx="455" cy="210" r="4" fill="#E7ECEF" fillOpacity="0.7" />
          <circle cx="505" cy="150" r="5" fill="none" stroke="var(--accent)" strokeWidth="2" />
          <circle cx="635" cy="150" r="4" fill="var(--mint)" />
          <circle cx="580" cy="90" r="4" fill="var(--accent)" />

          <g transform="translate(805, 95)">
            <circle r="15" fill="none" stroke="var(--accent)" strokeWidth="1.2" strokeDasharray="5 5" opacity="0.7">
              <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="9s" repeatCount="indefinite" />
            </circle>
            <circle r="8" fill="var(--mint)" opacity="0.25">
              <animate attributeName="r" values="6;12;6" dur="2.2s" repeatCount="indefinite" />
            </circle>
            <circle r="4.5" fill="var(--mint)" />
          </g>
        </svg>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Cifra principal que se va restando */}
          <div className="lg:col-span-7 space-y-3.5">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-dim border border-amber/30 text-amber text-xs font-semibold tracking-wide">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-amber" />
                </span>
                TOTAL PAGOS POR HACER
              </span>

              <span className="font-tech text-xs px-2.5 py-1 rounded-full bg-surface-3 border border-line text-muted">
                {cycle.isWeekendToday
                  ? 'Hoy es fin de semana de pago'
                  : cycle.daysUntilSaturday > 0
                  ? `Próximo corte en ${cycle.daysUntilSaturday} día(s)`
                  : cycle.weekendLabel}
              </span>
            </div>

            <div className="flex items-baseline gap-4 flex-wrap">
              <p className="font-display text-5xl sm:text-6xl font-bold tracking-tight text-text transition-all duration-500">
                {fmtMoney(totals.totalPendingAll)}
              </p>
              {totals.totalPendingAll === 0 && totals.totalPaidAll > 0 ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-mint bg-mint-dim border border-mint/30 px-3 py-1 rounded-full">
                  <CheckCircle2 size={14} /> Nómina 100% liquidada
                </span>
              ) : (
                <span className="text-xs text-muted font-tech">
                  {totals.pendingWorkersCount} pendiente(s) · {totals.paidWorkersCount} pagado(s)
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <div className="bg-surface-3/90 border border-line rounded-lg px-3 py-1.5 text-xs flex items-center gap-2">
                <span className="text-muted-2">Total corte:</span>
                <span className="font-tech font-semibold text-text">{fmtMoney(totals.totalCycleAll)}</span>
              </div>
              <span className="text-muted-2 font-tech text-xs">−</span>
              <div className="bg-mint-dim/70 border border-mint/30 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2">
                <span className="text-mint">Ya pagado (restado):</span>
                <span className="font-tech font-bold text-mint">{fmtMoney(totals.totalPaidAll)}</span>
              </div>
              <span className="text-muted-2 font-tech text-xs">=</span>
              <div className="bg-amber-dim/60 border border-amber/30 rounded-lg px-3 py-1.5 text-xs flex items-center gap-2">
                <span className="text-amber">Restante:</span>
                <span className="font-tech font-bold text-amber">{fmtMoney(totals.totalPendingAll)}</span>
              </div>
            </div>
          </div>

          {/* Tarjeta derecha: Desglose Clippers vs Editores */}
          <div className="lg:col-span-5 bg-surface/85 backdrop-blur-md border border-line rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted">Progreso de liquidación</span>
              <span className="font-tech text-mint font-bold">{totals.progressPct}% pagado</span>
            </div>

            <div className="h-2 bg-surface-3 rounded-full overflow-hidden border border-line">
              <div
                className="h-full bg-gradient-to-r from-accent to-mint transition-all duration-500 rounded-full"
                style={{ width: `${totals.progressPct}%` }}
              />
            </div>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setRoleTab('clipper')}
                className={`text-left rounded-xl p-3 border transition-all ${
                  roleTab === 'clipper'
                    ? 'bg-accent-dim/70 border-accent'
                    : 'bg-surface-2 border-line hover:border-accent/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-accent flex items-center gap-1">
                    <Scissors size={11} /> Clippers
                  </span>
                  <span className="font-tech text-[10px] text-muted-2">{clippersRows.length}</span>
                </div>
                <p className="font-display text-lg font-bold text-text">{fmtMoney(totals.pendingClippers)}</p>
                <p className="text-[10px] font-tech text-muted-2 mt-0.5">
                  Pagado: <span className="text-mint">{fmtMoney(totals.paidClippers)}</span>
                </p>
              </button>

              <button
                type="button"
                onClick={() => setRoleTab('editor')}
                className={`text-left rounded-xl p-3 border transition-all ${
                  roleTab === 'editor'
                    ? 'bg-mint-dim/70 border-mint'
                    : 'bg-surface-2 border-line hover:border-mint/40'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-medium text-mint flex items-center gap-1">
                    <Film size={11} /> Editores
                  </span>
                  <span className="font-tech text-[10px] text-muted-2">{editorsRows.length}</span>
                </div>
                <p className="font-display text-lg font-bold text-text">{fmtMoney(totals.pendingEditors)}</p>
                <p className="text-[10px] font-tech text-muted-2 mt-0.5">
                  Pagado: <span className="text-mint">{fmtMoney(totals.paidEditors)}</span>
                </p>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Selector de Sección: Clippers primero, Editores después + Filtro de Estado */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 bg-surface-2 border border-line rounded-xl p-1">
          <button
            type="button"
            onClick={() => setRoleTab('clipper')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              roleTab === 'clipper'
                ? 'bg-accent text-on-accent shadow-sm'
                : 'text-muted hover:text-text'
            }`}
          >
            <Scissors size={14} /> Nómina Clippers ({clippersRows.length})
            <span className={`font-tech text-[11px] px-1.5 py-0.5 rounded ${
              roleTab === 'clipper' ? 'bg-black/20 text-on-accent' : 'bg-surface-3 text-muted'
            }`}>
              {fmtMoney(totals.pendingClippers)}
            </span>
          </button>

          <button
            type="button"
            onClick={() => setRoleTab('editor')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-all ${
              roleTab === 'editor'
                ? 'bg-mint text-on-accent shadow-sm'
                : 'text-muted hover:text-text'
            }`}
          >
            <Film size={14} /> Nómina Editores ({editorsRows.length})
            <span className={`font-tech text-[11px] px-1.5 py-0.5 rounded ${
              roleTab === 'editor' ? 'bg-black/20 text-on-accent' : 'bg-surface-3 text-muted'
            }`}>
              {fmtMoney(totals.pendingEditors)}
            </span>
          </button>
        </div>

        <div className="flex items-center gap-1 bg-surface-2 border border-line rounded-xl p-1">
          {(
            [
              { key: 'todos', label: 'Todos' },
              { key: 'por_pagar', label: 'Por pagar' },
              { key: 'pagados', label: 'Pagados' },
            ] as const
          ).map(f => (
            <button
              key={f.key}
              type="button"
              onClick={() => setStatusFilter(f.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === f.key ? 'bg-surface-3 text-text border border-line' : 'text-muted hover:text-text'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grilla de tarjetas de Nómina por empleado */}
      {visibleRows.length === 0 ? (
        <div className="bg-surface-2 border border-dashed border-line rounded-2xl p-12 text-center">
          <Sparkles size={26} className="text-muted-2 mx-auto mb-2" />
          <p className="text-sm font-medium">No hay {roleTab === 'clipper' ? 'clippers' : 'editores'} en este filtro</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleRows.map(row => {
            const w: Worker = row.worker;
            const draft = draftReceipts[w.id];
            const isUploading = uploadingWorkerId === w.id;
            const isEditingAmt = editingAmountWorkerId === w.id;
            const wasJustPaid = justPaidId === w.id;

            return (
              <div
                key={w.id}
                className={`relative bg-surface-2 border rounded-xl p-5 transition-all overflow-hidden ${
                  row.isPaid
                    ? 'border-mint/40 bg-mint-dim/10'
                    : wasJustPaid
                    ? 'border-mint ring-2 ring-mint/40'
                    : 'border-line hover:border-accent/40'
                }`}
              >
                <CardNodeDeco color={row.isPaid ? 'var(--mint)' : w.role === 'clipper' ? 'var(--accent)' : 'var(--mint)'} />

                {/* Encabezado del trabajador y monto */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-display text-base font-bold shrink-0 ${
                      row.isPaid
                        ? 'bg-mint text-on-accent'
                        : w.role === 'clipper'
                        ? 'bg-accent-dim text-accent border border-accent/30'
                        : 'bg-mint-dim text-mint border border-mint/30'
                    }`}>
                      {row.isPaid ? <CheckCircle2 size={20} /> : w.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display text-base font-semibold truncate">{w.name}</h3>
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          row.isPaid
                            ? 'bg-mint-dim text-mint border border-mint/30'
                            : row.pendingAmount > 0
                            ? 'bg-amber-dim text-amber border border-amber/30'
                            : 'bg-surface-3 text-muted-2'
                        }`}>
                          {row.isPaid ? 'Pagado' : row.pendingAmount > 0 ? 'Pago por hacer' : 'Sin saldo pendiente'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-2 truncate mt-0.5">
                        {w.cargo} · {row.completedTasks.length} tarea(s) aprobada(s)
                      </p>
                    </div>
                  </div>

                  {/* Monto por hacer / pagado + botón de ajuste rápido */}
                  <div className="text-right shrink-0">
                    {isEditingAmt ? (
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          min={0}
                          value={customAmountInput}
                          onChange={e => setCustomAmountInput(e.target.value)}
                          className="w-24 bg-surface-3 border border-accent rounded-md px-2 py-1 text-xs font-tech text-right outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setWorkerPayrollAdjustment(w.id, Number(customAmountInput) || 0);
                            setEditingAmountWorkerId(null);
                          }}
                          className="w-7 h-7 rounded-md bg-accent text-on-accent flex items-center justify-center"
                          title="Guardar monto"
                        >
                          <Check size={13} />
                        </button>
                      </div>
                    ) : (
                      <div className="group/amt inline-flex flex-col items-end">
                        <div className="flex items-center gap-1.5">
                          <span className={`font-display text-2xl font-bold font-tech ${
                            row.isPaid ? 'text-mint line-through opacity-80' : 'text-text'
                          }`}>
                            {fmtMoney(row.isPaid ? row.paidAmount : row.pendingAmount)}
                          </span>
                          {!row.isPaid && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingAmountWorkerId(w.id);
                                setCustomAmountInput(String(row.grossForCycle));
                              }}
                              title="Ajustar monto a pagar"
                              className="text-muted-2 hover:text-accent transition-colors"
                            >
                              <SlidersHorizontal size={12} />
                            </button>
                          )}
                        </div>
                        <span className="text-[10px] font-tech text-muted-2">
                          {row.isPaid ? 'Transferido y restado' : 'Por transferir'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Cuenta bancaria para copiar en 1 clic */}
                <div className="mt-3.5 bg-surface-3/80 border border-line rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <Landmark size={13} className="text-accent shrink-0" />
                    <span className="truncate font-tech text-[11px] text-text">
                      {w.bankInfo || 'Sin cuenta bancaria registrada en Perfil'}
                    </span>
                  </div>
                  {w.bankInfo && (
                    <button
                      type="button"
                      onClick={() => copyBank(w.id, w.bankInfo)}
                      className="text-[11px] text-accent hover:text-accent-strong flex items-center gap-1 shrink-0 font-medium"
                    >
                      {copiedBankId === w.id ? <><Check size={11} className="text-mint" /> Copiado</> : <><Copy size={11} /> Copiar</>}
                    </button>
                  )}
                </div>

                {/* Desglose compacto de videos que componen su pago */}
                {row.completedTasks.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {row.completedTasks.slice(0, 4).map(t => (
                      <span
                        key={t.id}
                        className="text-[10px] font-tech px-2 py-0.5 rounded-md bg-surface-3 border border-line text-muted"
                      >
                        {t.name} ({t.stage}: {fmtMoney(t.amount)})
                      </span>
                    ))}
                    {row.completedTasks.length > 4 && (
                      <span className="text-[10px] font-tech px-2 py-0.5 rounded-md bg-surface-3 text-muted-2">
                        +{row.completedTasks.length - 4} más
                      </span>
                    )}
                  </div>
                )}

                {/* Zona de Comprobante de Transferencia + Botón Pagado */}
                <div className="mt-4 pt-3 border-t border-line/70 flex items-center justify-between gap-2 flex-wrap">
                  {row.isPaid && row.latestPayment ? (
                    <>
                      <div className="flex items-center gap-2 min-w-0">
                        <CheckCircle2 size={15} className="text-mint shrink-0" />
                        <div className="min-w-0 text-xs">
                          <p className="font-medium text-mint truncate">
                            Pagado ({fmtMoney(row.latestPayment.amount)})
                          </p>
                          <p className="text-[10px] text-muted-2 font-tech truncate">
                            {row.latestPayment.receiptFileName || 'Sin archivo adjunto'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {row.latestPayment.receiptFileUrl && (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                setPreviewReceipt({
                                  name: row.latestPayment!.receiptFileName || 'Comprobante',
                                  url: row.latestPayment!.receiptFileUrl!,
                                  workerName: w.name,
                                })
                              }
                              className="text-xs bg-surface-3 hover:bg-surface-2 border border-line rounded-lg px-2.5 py-1.5 text-accent flex items-center gap-1 transition-colors"
                            >
                              <Eye size={12} /> Comprobante
                            </button>
                            <a
                              href={row.latestPayment.receiptFileUrl}
                              download={row.latestPayment.receiptFileName || 'comprobante'}
                              className="w-7 h-7 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text transition-colors"
                              title="Descargar comprobante"
                            >
                              <Download size={12} />
                            </a>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => revertPayrollPayment(row.latestPayment!.id)}
                          className="w-7 h-7 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted-2 hover:text-amber transition-colors"
                          title="Deshacer pago (volver a sumar a pendientes)"
                        >
                          <RotateCcw size={12} />
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <input
                          ref={el => { fileInputRefs.current[w.id] = el; }}
                          type="file"
                          accept="image/*,.pdf,*/*"
                          className="hidden"
                          onChange={e => void handleUploadReceipt(w.id, e)}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRefs.current[w.id]?.click()}
                          disabled={isUploading}
                          className={`flex items-center gap-1.5 text-xs rounded-lg px-3 py-2 border transition-colors min-w-0 max-w-full ${
                            draft
                              ? 'bg-accent-dim/60 border-accent/40 text-accent'
                              : 'bg-surface-3 border-line border-dashed text-muted hover:text-text hover:border-accent/40'
                          }`}
                        >
                          {isUploading ? (
                            <Loader2 size={13} className="animate-spin shrink-0" />
                          ) : draft ? (
                            <FileText size={13} className="shrink-0" />
                          ) : (
                            <Upload size={13} className="shrink-0" />
                          )}
                          <span className="truncate">
                            {isUploading
                              ? 'Subiendo...'
                              : draft
                              ? draft.fileName
                              : 'Subir comprobante'}
                          </span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleMarkAsPaid(row)}
                        disabled={row.pendingAmount <= 0 && row.grossForCycle <= 0}
                        className="flex items-center gap-1.5 bg-mint text-on-accent rounded-lg px-3.5 py-2 text-xs font-semibold hover:opacity-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 shadow-[0_6px_18px_-6px_rgba(111,231,200,0.45)]"
                      >
                        <CheckCircle2 size={14} /> Marcar Pagado
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de vista previa del comprobante de transferencia */}
      {previewReceipt && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setPreviewReceipt(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-surface-2 border border-line rounded-2xl max-w-xl w-full p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-display text-base font-semibold">
                  Comprobante de pago · {previewReceipt.workerName}
                </h4>
                <p className="text-xs text-muted font-tech">{previewReceipt.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewReceipt(null)}
                className="text-xs text-muted hover:text-text px-2.5 py-1 rounded-lg bg-surface-3 border border-line"
              >
                Cerrar
              </button>
            </div>

            <div className="bg-surface-3 rounded-xl overflow-hidden max-h-[65vh] flex items-center justify-center p-3">
              {isImageFile(previewReceipt.name) || previewReceipt.url.startsWith('data:image') ? (
                <img src={previewReceipt.url} alt={previewReceipt.name} className="max-h-[60vh] object-contain rounded-lg" />
              ) : (
                <div className="text-center py-10 space-y-2">
                  <FileText size={32} className="text-accent mx-auto" />
                  <p className="text-sm">{previewReceipt.name}</p>
                </div>
              )}
            </div>

            <div className="flex justify-end">
              <a
                href={previewReceipt.url}
                download={previewReceipt.name}
                className="inline-flex items-center gap-1.5 bg-accent text-on-accent rounded-lg px-4 py-2 text-xs font-semibold hover:bg-accent-strong transition-colors"
              >
                <Download size={14} /> Descargar archivo
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
