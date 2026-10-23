import { useState, useMemo, useRef, useEffect } from 'react';
import { useStore } from '../store';
import { uploadSharedFile, isSupabaseConfigured } from '../lib/supabaseClient';
import type { Worker, Order, PayrollReportItem } from '../types';
import { fmtMoneyClean, parseBankInfo, openWorkerPayrollReportPdf } from '../lib/payrollPdf';
import {
  Wallet, Scissors, Film, Upload, CheckCircle2, Landmark,
  Copy, Check, Eye, Calendar, ChevronLeft, ChevronRight,
  Loader2, FileText, Download, Building2, CreditCard, UserCheck, Send,
} from 'lucide-react';

function isImageFile(name?: string | null) {
  if (!name) return false;
  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
}

function getWeekendCycle(offsetWeeks: number) {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const diffToSaturday = dayOfWeek === 0 ? -1 : 6 - dayOfWeek;

  const saturday = new Date(now);
  saturday.setHours(0, 0, 0, 0);
  saturday.setDate(now.getDate() + diffToSaturday + offsetWeeks * 7);

  const sunday = new Date(saturday);
  sunday.setDate(saturday.getDate() + 1);

  const satIso = saturday.toISOString().slice(0, 10);
  const weekKey = `wk-${satIso}`;

  const satLabel = saturday.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  const sunLabel = sunday.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  const weekendLabel = `Sáb ${satLabel} · Dom ${sunLabel}`;

  return { weekKey, weekendLabel };
}

export function PayrollView() {
  const {
    workers, brands, orders, financeSettings,
    payrollPayments, recordPayrollPayment, startAdminDm, sendChatGroupMessage,
  } = useStore();

  const [roleTab, setRoleTab] = useState<'clipper' | 'editor'>('clipper');
  const [weekOffset, setWeekOffset] = useState<number>(0);
  const [selectedWorkerId, setSelectedWorkerId] = useState<string | null>(null);

  const [draftReceipts, setDraftReceipts] = useState<Record<string, { fileName: string; fileUrl: string }>>({});
  const [uploadingWorkerId, setUploadingWorkerId] = useState<string | null>(null);
  const [payingWorkerId, setPayingWorkerId] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [previewReceipt, setPreviewReceipt] = useState<{ name: string; url: string; workerName: string } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cycle = useMemo(() => getWeekendCycle(weekOffset), [weekOffset]);

  // Cálculo 100% automático basado en todos los pedidos finalizados (Aprobado Cliente) de cada Clipper / Editor
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
      const reportItems: PayrollReportItem[] = [];
      let totalFromApprovedClient = 0;

      for (const v of allVideos) {
        const isMine = w.role === 'clipper' ? v.clipperId === w.id : v.editorId === w.id;
        if (!isMine) continue;

        // Únicamente pedidos finalizados completamente (Aprobado Cliente)
        if (v.qc !== 'aprobado_cliente' && !v.paid100) continue;

        const linked = linkedOrderByVideoId.get(v.id) || linkedOrderByBrand.get(v.brandName.trim().toLowerCase());
        const videosCount = linked ? Math.max(1, linked.videoCount || 1) : 1;
        const unitPay = w.role === 'clipper'
          ? (v.tierSnapshot ? v.tierSnapshot.clipperPay : defClipper)
          : (v.tierSnapshot ? v.tierSnapshot.editorPay : defEditor);

        const subtotal = videosCount * unitPay;
        totalFromApprovedClient += subtotal;

        reportItems.push({
          videoId: v.id,
          projectName: v.name,
          brandName: v.brandName,
          date: v.date,
          videosCount,
          unitPay,
          subtotal,
        });
      }

      const paymentsThisCycle = payrollPayments.filter(
        p => p.workerId === w.id && p.weekKey === cycle.weekKey
      );
      const paidAmount = paymentsThisCycle.reduce((s, p) => s + p.amount, 0);
      const latestPayment = paymentsThisCycle[0] || null;

      const pendingAmount = Math.max(0, totalFromApprovedClient - paidAmount);
      const isPaid = paymentsThisCycle.length > 0 && pendingAmount === 0;

      return {
        worker: w,
        totalFromApprovedClient,
        paidAmount,
        pendingAmount,
        isPaid,
        latestPayment,
        reportItems,
      };
    });
  }, [workers, brands, orders, financeSettings, payrollPayments, cycle.weekKey]);

  const clippersRows = useMemo(() => workerPayrollRows.filter(r => r.worker.role === 'clipper'), [workerPayrollRows]);
  const editorsRows = useMemo(() => workerPayrollRows.filter(r => r.worker.role === 'editor'), [workerPayrollRows]);
  const currentList = roleTab === 'clipper' ? clippersRows : editorsRows;

  useEffect(() => {
    if (!selectedWorkerId || !currentList.some(r => r.worker.id === selectedWorkerId)) {
      setSelectedWorkerId(currentList[0]?.worker.id || null);
    }
  }, [roleTab, currentList, selectedWorkerId]);

  const selectedRow = useMemo(
    () => currentList.find(r => r.worker.id === selectedWorkerId) || currentList[0] || null,
    [currentList, selectedWorkerId]
  );

  const totals = useMemo(() => {
    const totalPendingAll = workerPayrollRows.reduce((s, r) => s + r.pendingAmount, 0);
    const totalPaidAll = workerPayrollRows.reduce((s, r) => s + r.paidAmount, 0);
    const totalCycleAll = totalPendingAll + totalPaidAll;

    const pendingClippers = clippersRows.reduce((s, r) => s + r.pendingAmount, 0);
    const pendingEditors = editorsRows.reduce((s, r) => s + r.pendingAmount, 0);

    const remainingPct = totalCycleAll > 0 ? Math.round((totalPendingAll / totalCycleAll) * 100) : 0;

    return {
      totalPendingAll,
      totalPaidAll,
      totalCycleAll,
      pendingClippers,
      pendingEditors,
      remainingPct,
    };
  }, [workerPayrollRows, clippersRows, editorsRows]);

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

  const handleConfirmPayment = async (row: (typeof workerPayrollRows)[number]) => {
    if (row.pendingAmount <= 0 || row.isPaid) return;
    const draft = draftReceipts[row.worker.id];
    setPayingWorkerId(row.worker.id);

    try {
      recordPayrollPayment({
        workerId: row.worker.id,
        workerName: row.worker.name,
        role: row.worker.role,
        amount: row.pendingAmount,
        weekKey: cycle.weekKey,
        weekendLabel: cycle.weekendLabel,
        receiptFileName: draft?.fileName || null,
        receiptFileUrl: draft?.fileUrl || null,
        reportItems: row.reportItems,
        bankSnapshot: row.worker.bankInfo || null,
      });

      // Envía automáticamente al chat privado del Clipper/Editor el comprobante y el resumen de su Informe PDF
      if (isSupabaseConfigured) {
        try {
          const dmId = await startAdminDm(row.worker.id);
          if (dmId) {
            const summaryLines = row.reportItems
              .map(i => `• ${i.projectName} (${i.videosCount} vid): ${fmtMoneyClean(i.subtotal)}`)
              .join('\n');
            const msg = `Pago de nómina realizado (${cycle.weekendLabel}) por ${fmtMoneyClean(row.pendingAmount)}.\n\nInforme de pedidos Aprobado Cliente:\n${summaryLines}\n\nPuedes descargar tu Informe PDF y ver el comprobante directamente en tu pestaña Perfil.`;
            await sendChatGroupMessage(dmId, msg, draft?.fileName, draft?.fileUrl);
          }
        } catch {
          // La notificación y el informe en Perfil ya quedaron registrados
        }
      }
    } finally {
      setPayingWorkerId(null);
    }
  };

  const copyText = (key: string, value: string) => {
    if (!value || value === 'Sin registrar') return;
    void navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(prev => (prev === key ? null : prev)), 1600);
  };

  // Circunferencia para el medidor radial que se vacía a medida que pagas
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (totals.remainingPct / 100) * circumference;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      {/* BARRA SUPERIOR COMPACTA: Medidor Radial en Vivo + Total Pagos por Hacer + Selector Clippers/Editores + Corte */}
      <div className="bg-surface-2 border border-line rounded-2xl p-4 sm:p-5 flex items-center justify-between gap-5 flex-wrap relative overflow-hidden">
        {/* Pulso ambiental sutil */}
        <div
          className="absolute -left-10 top-1/2 -translate-y-1/2 w-56 h-56 rounded-full pointer-events-none blur-3xl opacity-20"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
        />

        {/* Anillo Radial que se resta en vivo + Cifra Total */}
        <div className="flex items-center gap-4 relative z-10">
          <div className="relative w-20 h-20 flex items-center justify-center shrink-0">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 80 80">
              <circle
                cx="40"
                cy="40"
                r={radius}
                stroke="var(--surface-3)"
                strokeWidth="6"
                fill="none"
              />
              <circle
                cx="40"
                cy="40"
                r={radius}
                stroke={totals.totalPendingAll === 0 ? 'var(--mint)' : 'var(--accent)'}
                strokeWidth="6"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={circumference}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-700 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <Wallet size={16} className={totals.totalPendingAll === 0 ? 'text-mint' : 'text-accent'} />
              <span className="font-tech text-[10px] text-muted-2 mt-0.5">{totals.remainingPct}%</span>
            </div>
          </div>

          <div>
            <span className="text-[11px] uppercase tracking-wider font-tech text-accent block">
              Total pagos por hacer
            </span>
            <div className="flex items-baseline gap-3 flex-wrap">
              <p className="font-display text-3xl sm:text-4xl font-bold text-text transition-all duration-500">
                {fmtMoneyClean(totals.totalPendingAll)}
              </p>
              {totals.totalPaidAll > 0 && (
                <span className="font-tech text-xs px-2 py-0.5 rounded-md bg-mint-dim text-mint border border-mint/30">
                  −{fmtMoneyClean(totals.totalPaidAll)} ya pagado
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Switch Clippers / Editores + Corte de Fin de Semana */}
        <div className="flex items-center gap-3 flex-wrap relative z-10">
          <div className="flex items-center gap-1 bg-surface-3 border border-line rounded-xl p-1">
            <button
              type="button"
              onClick={() => setRoleTab('clipper')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                roleTab === 'clipper'
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Scissors size={13} /> Clippers
              <span className={`font-tech text-[11px] px-1.5 py-0.5 rounded ${
                roleTab === 'clipper' ? 'bg-black/20 text-on-accent' : 'bg-surface-2 text-muted'
              }`}>
                {fmtMoneyClean(totals.pendingClippers)}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setRoleTab('editor')}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all ${
                roleTab === 'editor'
                  ? 'bg-mint text-on-accent shadow-sm'
                  : 'text-muted hover:text-text'
              }`}
            >
              <Film size={13} /> Editores
              <span className={`font-tech text-[11px] px-1.5 py-0.5 rounded ${
                roleTab === 'editor' ? 'bg-black/20 text-on-accent' : 'bg-surface-2 text-muted'
              }`}>
                {fmtMoneyClean(totals.pendingEditors)}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-1 bg-surface-3 border border-line rounded-xl p-1">
            <button
              type="button"
              onClick={() => setWeekOffset(w => w - 1)}
              className="w-7 h-7 rounded-lg hover:bg-surface-2 flex items-center justify-center text-muted hover:text-text transition-colors"
              title=" Fin de semana anterior"
            >
              <ChevronLeft size={15} />
            </button>
            <div className="px-2.5 text-center">
              <span className="text-[10px] font-tech text-muted-2 flex items-center gap-1">
                <Calendar size={10} className="text-accent" /> {cycle.weekendLabel}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setWeekOffset(w => w + 1)}
              className="w-7 h-7 rounded-lg hover:bg-surface-2 flex items-center justify-center text-muted hover:text-text transition-colors"
              title="Fin de semana siguiente"
            >
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      </div>

      {/* WORKSPACE EN 2 COLUMNAS: Izquierda = Lista de Empleados | Derecha = Terminal de Pago + Informe PDF Pre-cargado */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Columna Izquierda (4 cols): Lista de Clippers o Editores */}
        <div className="lg:col-span-4 bg-surface-2 border border-line rounded-2xl p-3 space-y-2">
          <div className="px-2 py-1.5 flex items-center justify-between text-xs text-muted border-b border-line/60">
            <span className="font-semibold">
              {roleTab === 'clipper' ? 'Lista de Clippers' : 'Lista de Editores'} ({currentList.length})
            </span>
            <span className="font-tech text-[11px]">Automático</span>
          </div>

          <div className="space-y-1.5 max-h-[540px] overflow-y-auto pr-0.5">
            {currentList.map(row => {
              const active = selectedRow?.worker.id === row.worker.id;
              return (
                <button
                  key={row.worker.id}
                  type="button"
                  onClick={() => setSelectedWorkerId(row.worker.id)}
                  className={`w-full text-left p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                    active
                      ? 'bg-accent-dim/50 border-accent shadow-sm'
                      : 'bg-surface-3/60 border-transparent hover:bg-surface-3 hover:border-line'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-display text-sm font-bold shrink-0 ${
                      row.isPaid
                        ? 'bg-mint text-on-accent'
                        : active
                        ? 'bg-accent text-on-accent'
                        : 'bg-surface-2 text-muted border border-line'
                    }`}>
                      {row.isPaid ? <CheckCircle2 size={16} /> : row.worker.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate">{row.worker.name}</p>
                      <p className="text-[11px] text-muted-2 font-tech">
                        {row.reportItems.length} proyecto(s) finalizados
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className={`font-display text-base font-bold font-tech ${
                      row.isPaid ? 'text-mint line-through opacity-75' : 'text-text'
                    }`}>
                      {fmtMoneyClean(row.isPaid ? row.paidAmount : row.pendingAmount)}
                    </p>
                    <span className={`text-[10px] font-tech ${
                      row.isPaid ? 'text-mint' : row.pendingAmount > 0 ? 'text-amber' : 'text-muted-2'
                    }`}>
                      {row.isPaid ? 'Pagado' : row.pendingAmount > 0 ? 'Por pagar' : 'Al día'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Columna Derecha (8 cols): Mesa de Dispersión + Cuenta Bancaria Detallada + Informe PDF Pre-cargado */}
        <div className="lg:col-span-8">
          {!selectedRow ? (
            <div className="bg-surface-2 border border-line rounded-2xl p-12 text-center text-sm text-muted">
              Selecciona un empleado a la izquierda
            </div>
          ) : (() => {
            const w: Worker = selectedRow.worker;
            const bank = parseBankInfo(w.bankInfo, w.name);
            const draft = draftReceipts[w.id];
            const isUploading = uploadingWorkerId === w.id;
            const isPaying = payingWorkerId === w.id;

            return (
              <div className="bg-surface-2 border border-line rounded-2xl p-5 sm:p-6 space-y-5">
                {/* Cabecera del empleado seleccionado */}
                <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-line">
                  <div className="flex items-center gap-3.5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center font-display text-lg font-bold ${
                      selectedRow.isPaid ? 'bg-mint text-on-accent' : 'bg-accent-dim text-accent border border-accent/30'
                    }`}>
                      {selectedRow.isPaid ? <CheckCircle2 size={22} /> : w.name.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-display text-xl font-bold">{w.name}</h3>
                        <span className={`text-[11px] font-medium px-2.5 py-0.5 rounded-full ${
                          selectedRow.isPaid
                            ? 'bg-mint-dim text-mint border border-mint/30'
                            : 'bg-amber-dim text-amber border border-amber/30'
                        }`}>
                          {selectedRow.isPaid ? 'Liquidado' : 'Pendiente de transferencia'}
                        </span>
                      </div>
                      <p className="text-xs text-muted font-tech mt-0.5">
                        {w.cargo} · {w.email || 'Sin correo'}
                      </p>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className="text-[10px] uppercase tracking-wider font-tech text-muted-2 block">
                      {selectedRow.isPaid ? 'Monto transferido' : 'Total automático a transferir'}
                    </span>
                    <p className="font-display text-3xl sm:text-4xl font-bold font-tech text-mint">
                      {fmtMoneyClean(selectedRow.isPaid ? selectedRow.paidAmount : selectedRow.pendingAmount)}
                    </p>
                  </div>
                </div>

                {/* 1. Datos Bancarios Estructurados (Banco, Número de cuenta, Titular) */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-muted flex items-center gap-1.5">
                      <Landmark size={14} className="text-accent" /> Datos Bancarios para Transferencia
                    </span>
                    {w.bankInfo && (
                      <button
                        type="button"
                        onClick={() => copyText(`all-${w.id}`, `${bank.bankName} - ${bank.accountNumber} - ${bank.accountHolder}`)}
                        className="text-[11px] text-accent hover:text-accent-strong flex items-center gap-1 font-medium"
                      >
                        {copiedKey === `all-${w.id}` ? <><Check size={11} className="text-mint" /> Todo copiado</> : <><Copy size={11} /> Copiar todo</>}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="bg-surface-3 border border-line rounded-xl p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-muted-2 uppercase font-tech flex items-center gap-1">
                          <Building2 size={11} className="text-accent" /> Banco
                        </span>
                        <p className="text-xs font-semibold truncate mt-0.5">{bank.bankName}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(`bank-${w.id}`, bank.bankName)}
                        className="text-muted-2 hover:text-accent shrink-0"
                        title="Copiar banco"
                      >
                        {copiedKey === `bank-${w.id}` ? <Check size={13} className="text-mint" /> : <Copy size={13} />}
                      </button>
                    </div>

                    <div className="bg-surface-3 border border-line rounded-xl p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-muted-2 uppercase font-tech flex items-center gap-1">
                          <CreditCard size={11} className="text-mint" /> Número de cuenta
                        </span>
                        <p className="text-xs font-tech font-semibold truncate mt-0.5">{bank.accountNumber}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(`acc-${w.id}`, bank.accountNumber)}
                        className="text-muted-2 hover:text-accent shrink-0"
                        title="Copiar número de cuenta"
                      >
                        {copiedKey === `acc-${w.id}` ? <Check size={13} className="text-mint" /> : <Copy size={13} />}
                      </button>
                    </div>

                    <div className="bg-surface-3 border border-line rounded-xl p-3 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[10px] text-muted-2 uppercase font-tech flex items-center gap-1">
                          <UserCheck size={11} className="text-violet" /> Titular / Tipo
                        </span>
                        <p className="text-xs font-semibold truncate mt-0.5">
                          {bank.accountHolder} <span className="text-muted-2 font-normal">({bank.accountType})</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyText(`holder-${w.id}`, bank.accountHolder)}
                        className="text-muted-2 hover:text-accent shrink-0"
                        title="Copiar titular"
                      >
                        {copiedKey === `holder-${w.id}` ? <Check size={13} className="text-mint" /> : <Copy size={13} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* 2. Informe PDF Automático Pre-cargado (Pedidos Finalizados · Aprobado Cliente) */}
                <div className="bg-surface-3/70 border border-line rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-accent-dim text-accent flex items-center justify-center shrink-0">
                        <FileText size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">
                          Informe PDF de {w.name} (Pre-cargado desde su perfil)
                        </p>
                        <p className="text-[11px] text-muted-2 font-tech">
                          {selectedRow.reportItems.length} pedido(s) con estado Aprobado Cliente
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        openWorkerPayrollReportPdf({
                          worker: w,
                          weekendLabel: cycle.weekendLabel,
                          items: selectedRow.reportItems,
                          totalAmount: selectedRow.isPaid ? selectedRow.paidAmount : selectedRow.pendingAmount,
                          isPaid: selectedRow.isPaid,
                          paidAt: selectedRow.latestPayment?.paidAt,
                          receiptFileName: selectedRow.latestPayment?.receiptFileName || draft?.fileName,
                        })
                      }
                      className="flex items-center gap-1.5 bg-surface-2 hover:bg-accent-dim text-accent border border-accent/30 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
                    >
                      <Eye size={13} /> Ver / Descargar Informe PDF
                    </button>
                  </div>

                  {selectedRow.reportItems.length === 0 ? (
                    <p className="text-xs text-muted text-center py-4">
                      Este creador aún no tiene pedidos en estado Aprobado Cliente.
                    </p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-line bg-surface-2">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left text-muted-2 border-b border-line bg-surface-3/60 font-tech text-[10px] uppercase">
                            <th className="py-2 px-3">Pedido finalizado (Aprobado Cliente)</th>
                            <th className="py-2 px-3">Fecha</th>
                            <th className="py-2 px-3 text-center">Videos</th>
                            <th className="py-2 px-3 text-right">Tarifa</th>
                            <th className="py-2 px-3 text-right">Subtotal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-line/50">
                          {selectedRow.reportItems.map(item => (
                            <tr key={item.videoId}>
                              <td className="py-2 px-3 font-medium">
                                {item.projectName} <span className="text-muted-2">· {item.brandName}</span>
                              </td>
                              <td className="py-2 px-3 font-tech text-muted">{item.date}</td>
                              <td className="py-2 px-3 font-tech text-center">{item.videosCount}</td>
                              <td className="py-2 px-3 font-tech text-right text-muted">{fmtMoneyClean(item.unitPay)}</td>
                              <td className="py-2 px-3 font-tech text-right font-semibold text-mint">{fmtMoneyClean(item.subtotal)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* 3. Barra de Cierre de Transferencia (Sin opción de restablecer una vez enviado) */}
                <div className="pt-2 border-t border-line flex items-center justify-between gap-3 flex-wrap">
                  {selectedRow.isPaid && selectedRow.latestPayment ? (
                    <div className="w-full flex items-center justify-between gap-3 flex-wrap bg-mint-dim/40 border border-mint/30 rounded-xl px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <CheckCircle2 size={18} className="text-mint shrink-0" />
                        <div className="text-xs">
                          <p className="font-semibold text-mint">
                            Transferencia enviada + Informe PDF entregado a {w.name}
                          </p>
                          <p className="text-[11px] text-muted font-tech">
                            {new Date(selectedRow.latestPayment.paidAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                            {selectedRow.latestPayment.receiptFileName ? ` · Comprobante: ${selectedRow.latestPayment.receiptFileName}` : ''}
                          </p>
                        </div>
                      </div>

                      {selectedRow.latestPayment.receiptFileUrl && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              setPreviewReceipt({
                                name: selectedRow.latestPayment!.receiptFileName || 'Comprobante',
                                url: selectedRow.latestPayment!.receiptFileUrl!,
                                workerName: w.name,
                              })
                            }
                            className="text-xs bg-surface-2 hover:bg-surface-3 border border-line rounded-lg px-3 py-1.5 text-accent flex items-center gap-1 font-medium"
                          >
                            <Eye size={13} /> Ver comprobante
                          </button>
                          <a
                            href={selectedRow.latestPayment.receiptFileUrl}
                            download={selectedRow.latestPayment.receiptFileName || 'comprobante'}
                            className="w-8 h-8 rounded-lg bg-surface-2 border border-line flex items-center justify-center text-muted hover:text-text"
                            title="Descargar comprobante"
                          >
                            <Download size={13} />
                          </a>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-1 min-w-[220px]">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,.pdf,*/*"
                          className="hidden"
                          onChange={e => void handleUploadReceipt(w.id, e)}
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={isUploading}
                          className={`flex items-center gap-2 text-xs rounded-xl px-3.5 py-2.5 border transition-colors flex-1 ${
                            draft
                              ? 'bg-accent-dim/60 border-accent/40 text-accent font-medium'
                              : 'bg-surface-3 border-line border-dashed text-muted hover:text-text hover:border-accent/40'
                          }`}
                        >
                          {isUploading ? (
                            <Loader2 size={14} className="animate-spin shrink-0" />
                          ) : (
                            <Upload size={14} className="shrink-0" />
                          )}
                          <span className="truncate">
                            {isUploading
                              ? 'Subiendo comprobante...'
                              : draft
                              ? `Comprobante listo: ${draft.fileName}`
                              : '1. Subir comprobante de transferencia'}
                          </span>
                        </button>
                      </div>

                      <button
                        type="button"
                        onClick={() => void handleConfirmPayment(selectedRow)}
                        disabled={selectedRow.pendingAmount <= 0 || isPaying}
                        className="flex items-center gap-2 bg-mint text-on-accent rounded-xl px-5 py-2.5 text-xs sm:text-sm font-semibold hover:opacity-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_8px_22px_-6px_rgba(111,231,200,0.5)]"
                      >
                        {isPaying ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        2. Pagado · Enviar Comprobante + Informe PDF
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Modal de vista previa del comprobante */}
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
                  Comprobante · {previewReceipt.workerName}
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
                <Download size={14} /> Descargar comprobante
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
