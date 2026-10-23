import { LiquidMetalButton } from "../components/ui/liquid-metal-button";
import { useState, useMemo } from 'react';
import { useStore } from '../store';
import type { Video, Order, AppExpense } from '../types';
import { CardNodeDeco } from '../components/BrandBackground';
import {
  DollarSign, Clock, CheckCircle2, ShieldCheck,
  Calendar, FileDown, Users, Scissors, Film,
  ArrowUpRight, Sparkles, Layers, Eye, History, Cpu, Plus, Trash2, ChevronDown,
} from 'lucide-react';

type DatePreset = 'hoy' | 'quincena' | 'mes' | 'todo' | 'rango';
type ReportTab = 'no_iniciados' | 'aprobado_senda' | 'aprobado_cliente';

interface FinancialProjectRow {
  id: string;
  source: 'order' | 'video';
  name: string;
  brand: string;
  date: string;
  videoCount: number;
  clipperId: string | null;
  clipperName: string;
  editorId: string | null;
  editorName: string;
  stage: 'no_iniciados' | 'aprobado_senda' | 'aprobado_cliente';
  statusLabel: string;
  grossAmount: number;
  clipperPayTotal: number;
  editorPayTotal: number;
  creatorCostTotal: number;
  netMargin: number;
  paid50: boolean;
  paid100: boolean;
  videoRef?: Video;
}

const CURRENCY_SIGN = String.fromCharCode(36);

function fmtMoney(n: number): string {
  const clean = Math.round(Number(n) || 0);
  return CURRENCY_SIGN + clean.toLocaleString('es-CO');
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function subtractDaysIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function firstDayOfMonthIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

export function FinancesView() {
  const {
    brands, orders, workers, financeSettings,
    financeClosings, recordFinanceDayClosing, setSelectedVideo, setView,
    appExpenses, addAppExpense, deleteAppExpense,
  } = useStore();

  const [preset, setPreset] = useState<DatePreset>('mes');
  const [dateFrom, setDateFrom] = useState<string>(() => firstDayOfMonthIso());
  const [dateTo, setDateTo] = useState<string>(() => todayIso());
  const [reportTab, setReportTab] = useState<ReportTab>('aprobado_cliente');

  const [appsBoxOpen, setAppsBoxOpen] = useState(false);
  const [expLabel, setExpLabel] = useState('');
  const [expAmount, setExpAmount] = useState('');
  const [expCategory, setExpCategory] = useState<AppExpense['category']>('creditos_ia');
  const [expDate, setExpDate] = useState<string>(() => todayIso());

  const effectiveRange = useMemo(() => {
    const today = todayIso();
    if (preset === 'hoy') return { from: today, to: today, label: `Hoy (${today})` };
    if (preset === 'quincena') {
      const from = subtractDaysIso(14);
      return { from, to: today, label: `15 Días (${from} a ${today})` };
    }
    if (preset === 'mes') {
      const from = firstDayOfMonthIso();
      return { from, to: today, label: `Este mes (${from} a ${today})` };
    }
    if (preset === 'rango') {
      return {
        from: dateFrom || '2000-01-01',
        to: dateTo || '2099-12-31',
        label: `${dateFrom || 'inicio'} a ${dateTo || 'hoy'}`,
      };
    }
    return { from: '2000-01-01', to: '2099-12-31', label: 'Todo el historial' };
  }, [preset, dateFrom, dateTo]);

  const allRows = useMemo<FinancialProjectRow[]>(() => {
    const unitPrice = financeSettings.clientPricePerVideo;
    const defClipper = financeSettings.defaultClipperCost;
    const defEditor = financeSettings.defaultEditorCost;

    const rows: FinancialProjectRow[] = [];
    const linkedOrderByVideoId = new Map<string, Order>();
    const linkedOrderByBrand = new Map<string, Order>();

    for (const o of orders) {
      if (o.boardVideoId) linkedOrderByVideoId.set(o.boardVideoId, o);
      linkedOrderByBrand.set(o.brand.trim().toLowerCase(), o);
    }

    for (const o of orders) {
      const hasBothAssigned = Boolean(o.clipperId && o.editorId);
      if (hasBothAssigned || o.promotedToBoard || o.status === 'finalizado') continue;

      const count = Math.max(1, o.videoCount || 1);
      const pricePerVid = o.unitPriceClient ?? unitPrice;
      const gross = count * pricePerVid;
      const clipperCost = count * (o.unitClipperPay ?? defClipper);
      const editorCost = count * (o.unitEditorPay ?? defEditor);
      const totalCreatorCost = clipperCost + editorCost;
      const clipperW = workers.find(w => w.id === o.clipperId);
      const editorW = workers.find(w => w.id === o.editorId);

      rows.push({
        id: `order-${o.id}`,
        source: 'order',
        name: `${o.brand} · ${count} videos`,
        brand: o.brand,
        date: o.deliveryDate || o.createdAt.slice(0, 10),
        videoCount: count,
        clipperId: o.clipperId || null,
        clipperName: clipperW?.name || 'Por asignar',
        editorId: o.editorId || null,
        editorName: editorW?.name || 'Por asignar',
        stage: 'no_iniciados',
        statusLabel: 'Disponible · Sin iniciar',
        grossAmount: gross,
        clipperPayTotal: clipperCost,
        editorPayTotal: editorCost,
        creatorCostTotal: totalCreatorCost,
        netMargin: gross - totalCreatorCost,
        paid50: false,
        paid100: false,
      });
    }

    for (const b of brands) {
      for (const v of b.videos) {
        const linked = linkedOrderByVideoId.get(v.id) || linkedOrderByBrand.get(b.name.trim().toLowerCase());
        const count = linked ? Math.max(1, linked.videoCount || 1) : 1;
        const pricePerVid = linked?.unitPriceClient ?? unitPrice;
        const gross = count * pricePerVid;

        const unitClipperPay = linked?.unitClipperPay ?? (v.tierSnapshot ? v.tierSnapshot.clipperPay : defClipper);
        const unitEditorPay = linked?.unitEditorPay ?? (v.tierSnapshot ? v.tierSnapshot.editorPay : defEditor);
        const clipperCost = count * unitClipperPay;
        const editorCost = count * unitEditorPay;
        const totalCreatorCost = clipperCost + editorCost;

        let stage: FinancialProjectRow['stage'] = 'no_iniciados';
        let statusLabel = 'En cola';
        if (v.qc === 'aprobado_cliente') {
          stage = 'aprobado_cliente';
          statusLabel = 'Aprobado Cliente';
        } else if (v.qc === 'aprobado_senda' || v.qc === 'aprobado') {
          stage = 'aprobado_senda';
          statusLabel = 'Aprobado Senda';
        } else {
          stage = 'no_iniciados';
          statusLabel = v.qc.replace(/_/g, ' ');
        }

        rows.push({
          id: v.id,
          source: 'video',
          name: v.name,
          brand: b.name,
          date: v.date || todayIso(),
          videoCount: count,
          clipperId: v.clipperId || null,
          clipperName: v.clipperName || 'Sin asignar',
          editorId: v.editorId || null,
          editorName: v.editorName || 'Sin asignar',
          stage,
          statusLabel,
          grossAmount: gross,
          clipperPayTotal: clipperCost,
          editorPayTotal: editorCost,
          creatorCostTotal: totalCreatorCost,
          netMargin: gross - totalCreatorCost,
          paid50: Boolean(v.paid50 || v.qc === 'aprobado_senda' || v.qc === 'aprobado_cliente'),
          paid100: Boolean(v.paid100 || v.qc === 'aprobado_cliente'),
          videoRef: v,
        });
      }
    }

    return rows.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [orders, brands, workers, financeSettings]);

  const filteredRows = useMemo(() => {
    if (preset === 'todo') return allRows;
    return allRows.filter(r => r.date >= effectiveRange.from && r.date <= effectiveRange.to);
  }, [allRows, preset, effectiveRange]);

  const filteredExpenses = useMemo(() => {
    if (preset === 'todo') return appExpenses;
    return appExpenses.filter(e => e.date >= effectiveRange.from && e.date <= effectiveRange.to);
  }, [appExpenses, preset, effectiveRange]);

  const expensesSummary = useMemo(() => {
    const today = todayIso();
    const monthStart = firstDayOfMonthIso();
    const todayTotal = appExpenses.filter(e => e.date === today).reduce((s, e) => s + e.amount, 0);
    const monthTotal = appExpenses.filter(e => e.date >= monthStart && e.date <= today).reduce((s, e) => s + e.amount, 0);
    const periodTotal = filteredExpenses.reduce((s, e) => s + e.amount, 0);
    return { todayTotal, monthTotal, periodTotal };
  }, [appExpenses, filteredExpenses]);

  const rowsNoIniciados = useMemo(() => filteredRows.filter(r => r.stage === 'no_iniciados'), [filteredRows]);
  const rowsAprobadoSenda = useMemo(() => filteredRows.filter(r => r.stage === 'aprobado_senda'), [filteredRows]);
  const rowsAprobadoCliente = useMemo(() => filteredRows.filter(r => r.stage === 'aprobado_cliente'), [filteredRows]);

  const metrics = useMemo(() => {
    const deferredRevenue = rowsNoIniciados.reduce((s, r) => s + r.grossAmount, 0);
    const deferredVideos = rowsNoIniciados.reduce((s, r) => s + r.videoCount, 0);

    const accruedGrossRevenue = rowsAprobadoSenda.reduce((s, r) => s + r.grossAmount, 0);
    const accruedVideos = rowsAprobadoSenda.reduce((s, r) => s + r.videoCount, 0);
    const accruedPaid50Cost = rowsAprobadoSenda.reduce((s, r) => s + r.creatorCostTotal * 0.5, 0);

    const realizedGrossRevenue = rowsAprobadoCliente.reduce((s, r) => s + r.grossAmount, 0);
    const realizedCreatorCost = rowsAprobadoCliente.reduce((s, r) => s + r.creatorCostTotal, 0);
    const realizedVideos = rowsAprobadoCliente.reduce((s, r) => s + r.videoCount, 0);

    const totalClipperPay = [...rowsAprobadoSenda, ...rowsAprobadoCliente].reduce((s, r) => s + r.clipperPayTotal, 0);
    const totalEditorPay = [...rowsAprobadoSenda, ...rowsAprobadoCliente].reduce((s, r) => s + r.editorPayTotal, 0);
    const totalCreatorPayroll = totalClipperPay + totalEditorPay;

    const realizedNetRevenue = realizedGrossRevenue - realizedCreatorCost - expensesSummary.periodTotal;

    const netMarginPct = realizedGrossRevenue > 0
      ? Math.max(0, Math.round((realizedNetRevenue / realizedGrossRevenue) * 100))
      : 0;

    return {
      deferredRevenue,
      deferredVideos,
      accruedGrossRevenue,
      accruedVideos,
      accruedPaid50Cost,
      realizedGrossRevenue,
      realizedCreatorCost,
      realizedNetRevenue,
      realizedVideos,
      totalClipperPay,
      totalEditorPay,
      totalCreatorPayroll,
      netMarginPct,
    };
  }, [rowsNoIniciados, rowsAprobadoSenda, rowsAprobadoCliente, expensesSummary.periodTotal]);

  const workerPayoutBreakdown = useMemo(() => {
    return workers.map(w => {
      const asClipper = filteredRows.filter(r => r.clipperId === w.id && (r.stage === 'aprobado_senda' || r.stage === 'aprobado_cliente'));
      const asEditor = filteredRows.filter(r => r.editorId === w.id && (r.stage === 'aprobado_senda' || r.stage === 'aprobado_cliente'));

      const earned50 = [
        ...asClipper.filter(r => r.stage === 'aprobado_senda').map(r => r.clipperPayTotal * 0.5),
        ...asEditor.filter(r => r.stage === 'aprobado_senda').map(r => r.editorPayTotal * 0.5),
      ].reduce((a, b) => a + b, 0);

      const earned100 = [
        ...asClipper.filter(r => r.stage === 'aprobado_cliente').map(r => r.clipperPayTotal),
        ...asEditor.filter(r => r.stage === 'aprobado_cliente').map(r => r.editorPayTotal),
      ].reduce((a, b) => a + b, 0);

      return {
        worker: w,
        totalAssignedProjects: asClipper.length + asEditor.length,
        earned50,
        earned100,
        totalPayable: earned50 + earned100,
      };
    });
  }, [workers, filteredRows]);

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amountNum = Number(expAmount);
    if (!expLabel.trim() || !amountNum || amountNum <= 0) return;
    addAppExpense({
      label: expLabel.trim(),
      amount: Math.round(amountNum),
      category: expCategory,
      date: expDate || todayIso(),
    });
    setExpLabel('');
    setExpAmount('');
  };

  const handleCloseDayAndDownloadPdf = () => {
    recordFinanceDayClosing({
      periodLabel: effectiveRange.label,
      deferredRevenue: metrics.deferredRevenue,
      accruedGrossRevenue: metrics.accruedGrossRevenue,
      realizedNetRevenue: metrics.realizedNetRevenue,
      totalCreatorPayouts: metrics.totalCreatorPayroll,
      totalAppExpenses: expensesSummary.periodTotal,
      projectsCount: filteredRows.length,
    });

    const nowStr = new Date().toLocaleString('es-CO', {
      dateStyle: 'full',
      timeStyle: 'short',
    });

    const projectRowsHtml = filteredRows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.name}</strong><br/><span style="color:#64748b;font-size:11px;">${r.brand} · ${r.videoCount} video(s)</span></td>
        <td>${r.date}</td>
        <td>${r.clipperName} / ${r.editorName}</td>
        <td>${r.statusLabel}</td>
        <td style="text-align:right;">${fmtMoney(r.grossAmount)}</td>
        <td style="text-align:right;">${fmtMoney(r.creatorCostTotal)}</td>
        <td style="text-align:right;font-weight:700;color:#0d9488;">${fmtMoney(r.netMargin)}</td>
      </tr>
    `).join('');

    const payrollRowsHtml = workerPayoutBreakdown.map(item => `
      <tr>
        <td><strong>${item.worker.name}</strong></td>
        <td>${item.worker.role === 'clipper' ? 'Clipper' : 'Editor(a)'}</td>
        <td>${item.worker.email || 'Sin correo'}<br/><span style="color:#64748b;font-size:11px;">${item.worker.phone || ''}</span></td>
        <td>${item.worker.bankInfo || 'Pendiente en Perfil'}</td>
        <td style="text-align:center;">${item.totalAssignedProjects}</td>
        <td style="text-align:right;">${fmtMoney(item.earned50)}</td>
        <td style="text-align:right;">${fmtMoney(item.earned100)}</td>
        <td style="text-align:right;font-weight:700;color:#0f172a;">${fmtMoney(item.totalPayable)}</td>
      </tr>
    `).join('');

    const expensesHtml = filteredExpenses.map(ex => `
      <tr>
        <td><strong>${ex.label}</strong></td>
        <td>${ex.category === 'creditos_ia' ? 'Créditos IA' : ex.category === 'suscripcion' ? 'Suscripción App' : 'Material'}</td>
        <td>${ex.date}</td>
        <td style="text-align:right;font-weight:700;">${fmtMoney(ex.amount)}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>SENDA - Respaldo Financiero (${todayIso()})</title>
        <style>
          * { box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
          body { margin: 0; padding: 32px; color: #0f172a; background: #ffffff; font-size: 12px; }
          .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0ea5e9; padding-bottom: 16px; margin-bottom: 24px; }
          .brand { font-size: 24px; font-weight: 800; letter-spacing: 0.08em; color: #0f172a; }
          .badge { display: inline-block; background: #e0f2fe; color: #0369a1; font-weight: 700; font-size: 10px; padding: 4px 8px; border-radius: 6px; text-transform: uppercase; }
          .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
          .card { border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; background: #f8fafc; }
          .card-highlight { border: 2px solid #10b981; background: #ecfdf5; }
          .card-label { font-size: 10px; text-transform: uppercase; color: #475569; font-weight: 700; margin-bottom: 6px; }
          .card-val { font-size: 20px; font-weight: 800; color: #0f172a; }
          h2 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.04em; color: #0f172a; margin: 22px 0 10px; border-left: 4px solid #0ea5e9; padding-left: 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; vertical-align: top; }
          th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; color: #334155; }
          .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; }
          @media print { body { padding: 12px; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">SENDA · FINANZAS</div>
            <p style="margin:4px 0 0;color:#475569;">Respaldo de Cierre, Nómina y Aplicaciones</p>
          </div>
          <div style="text-align:right;">
            <span class="badge">Respaldo Oficial</span>
            <p style="margin:6px 0 0;color:#475569;">${nowStr}</p>
            <p style="margin:2px 0 0;color:#0f172a;font-weight:600;">Período: ${effectiveRange.label}</p>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-label">Ingreso Diferido</div>
            <div class="card-val">${fmtMoney(metrics.deferredRevenue)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">${rowsNoIniciados.length} proyectos en cola</div>
          </div>
          <div class="card">
            <div class="card-label">Ingreso Bruto (Aprob. Senda)</div>
            <div class="card-val">${fmtMoney(metrics.accruedGrossRevenue)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">${rowsAprobadoSenda.length} proyectos asegurados</div>
          </div>
          <div class="card">
            <div class="card-label">Nómina + Apps/Créditos</div>
            <div class="card-val">${fmtMoney(metrics.totalCreatorPayroll + expensesSummary.periodTotal)}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">Nómina: ${fmtMoney(metrics.totalCreatorPayroll)} · Apps: ${fmtMoney(expensesSummary.periodTotal)}</div>
          </div>
          <div class="card card-highlight">
            <div class="card-label" style="color:#047857;">Ingreso Neto Realizado</div>
            <div class="card-val" style="color:#047857;">${fmtMoney(metrics.realizedNetRevenue)}</div>
            <div style="font-size:11px;color:#065f46;margin-top:4px;">Margen neto: ${metrics.netMarginPct}%</div>
          </div>
        </div>

        <h2>Respaldo para Pago Manual a Clippers y Editores</h2>
        <table>
          <thead>
            <tr>
              <th>Creador</th>
              <th>Rol</th>
              <th>Contacto</th>
              <th>Datos Bancarios</th>
              <th style="text-align:center;">Proyectos</th>
              <th style="text-align:right;">50% (Senda)</th>
              <th style="text-align:right;">100% (Cliente)</th>
              <th style="text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${payrollRowsHtml || '<tr><td colspan="8" style="text-align:center;">Sin registros</td></tr>'}
          </tbody>
        </table>

        <h2>Pagos de Aplicaciones, Créditos y Material (${filteredExpenses.length})</h2>
        <table>
          <thead>
            <tr>
              <th>Concepto / Aplicación</th>
              <th>Categoría</th>
              <th>Fecha</th>
              <th style="text-align:right;">Monto</th>
            </tr>
          </thead>
          <tbody>
            ${expensesHtml || '<tr><td colspan="4" style="text-align:center;">Sin gastos registrados en este período</td></tr>'}
          </tbody>
        </table>

        <h2>Informe de Proyectos (${filteredRows.length})</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Proyecto</th>
              <th>Fecha</th>
              <th>Equipo</th>
              <th>Estado</th>
              <th style="text-align:right;">Bruto</th>
              <th style="text-align:right;">Nómina</th>
              <th style="text-align:right;">Neto</th>
            </tr>
          </thead>
          <tbody>
            ${projectRowsHtml || '<tr><td colspan="8" style="text-align:center;">Sin proyectos</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          <span>SENDA Platform · Documento de Respaldo</span>
          <span>Generado automáticamente al cerrar día</span>
        </div>
        <script>
          window.onload = function() { setTimeout(function() { window.print(); }, 250); };
        </script>
      </body>
      </html>
    `;

    const printWin = window.open('', '_blank', 'width=1024,height=800');
    if (printWin) {
      printWin.document.open();
      printWin.document.write(html);
      printWin.document.close();
    }
  };

  const activeRows =
    reportTab === 'no_iniciados'
      ? rowsNoIniciados
      : reportTab === 'aprobado_senda'
      ? rowsAprobadoSenda
      : rowsAprobadoCliente;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-mint-dim border border-mint/30 text-mint flex items-center justify-center shadow-[0_0_20px_-4px_rgba(111,231,200,0.35)]">
            <DollarSign size={22} />
          </div>
          <div>
            <h2 className="font-display text-2xl sm:text-3xl font-bold">Finanzas</h2>
            <p className="text-xs text-muted">Flujo en vivo · Nómina automática y material de trabajo</p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCloseDayAndDownloadPdf}
          className="flex items-center gap-2 bg-mint text-on-accent rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold hover:opacity-95 transition-all shadow-[0_8px_24px_-6px_rgba(111,231,200,0.45)]"
        >
          <FileDown size={16} /> Cerrar día y Descargar PDF
        </button>
      </div>

      <div className="bg-surface-2 border border-line rounded-xl p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted flex items-center gap-1.5 mr-1">
            <Calendar size={14} className="text-accent" /> Período:
          </span>
          {(
            [
              { key: 'hoy', label: 'Hoy' },
              { key: 'quincena', label: '15 Días' },
              { key: 'mes', label: 'Este Mes' },
              { key: 'todo', label: 'Todo' },
              { key: 'rango', label: 'Rango' },
            ] as { key: DatePreset; label: string }[]
          ).map(item => (
            <button
              key={item.key}
              type="button"
              onClick={() => setPreset(item.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                preset === item.key
                  ? 'bg-accent text-on-accent shadow-sm'
                  : 'bg-surface-3 text-muted hover:text-text border border-line'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {preset === 'rango' ? (
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="bg-surface-3 border border-line rounded-lg px-2.5 py-1 text-xs font-tech outline-none focus:border-accent"
            />
            <span className="text-xs text-muted-2">a</span>
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="bg-surface-3 border border-line rounded-lg px-2.5 py-1 text-xs font-tech outline-none focus:border-accent"
            />
          </div>
        ) : (
          <span className="font-tech text-xs text-muted-2">{effectiveRange.label}</span>
        )}
      </div>

      {/* HERO: Ingreso Neto Realizado */}
      <div className="relative bg-surface-2 border border-mint/40 rounded-2xl p-6 sm:p-7 overflow-hidden shadow-[0_0_50px_-14px_rgba(111,231,200,0.32)]">
        <div
          className="absolute -left-16 -top-16 w-80 h-80 rounded-full pointer-events-none blur-3xl opacity-30 animate-pulse"
          style={{ background: 'radial-gradient(circle, var(--mint), transparent 70%)' }}
        />
        <div
          className="absolute right-10 -bottom-20 w-80 h-80 rounded-full pointer-events-none blur-3xl opacity-25"
          style={{ background: 'radial-gradient(circle, var(--accent), transparent 70%)' }}
        />

        <svg
          className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
          viewBox="0 0 900 260"
          fill="none"
          preserveAspectRatio="xMaxYMid slice"
        >
          <defs>
            <linearGradient id="sendaNetGrad1" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0" />
              <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.65" />
              <stop offset="100%" stopColor="var(--mint)" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="sendaNetGrad2" x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="var(--mint)" stopOpacity="0" />
              <stop offset="60%" stopColor="var(--mint)" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#E7ECEF" stopOpacity="0.85" />
            </linearGradient>
            <filter id="sendaGlow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feComposite in="SourceGraphic" in2="blur" operator="over" />
            </filter>
          </defs>

          <path
            d="M 280 225 L 430 225 L 485 165 L 610 165 L 665 105 L 790 105"
            stroke="url(#sendaNetGrad1)"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 390 35 L 510 35 L 560 85 L 695 85 L 740 50 L 835 50"
            stroke="url(#sendaNetGrad2)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M 485 165 L 525 205 L 635 205"
            stroke="var(--accent)"
            strokeOpacity="0.35"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          <circle r="4" fill="var(--mint)" filter="url(#sendaGlow)">
            <animateMotion dur="4.2s" repeatCount="indefinite" path="M 280 225 L 430 225 L 485 165 L 610 165 L 665 105 L 790 105" />
          </circle>
          <circle r="3.5" fill="var(--accent)" filter="url(#sendaGlow)">
            <animateMotion dur="5.1s" repeatCount="indefinite" path="M 390 35 L 510 35 L 560 85 L 695 85 L 740 50 L 835 50" />
          </circle>

          <circle cx="430" cy="225" r="4" fill="#E7ECEF" fillOpacity="0.7" />
          <circle cx="485" cy="165" r="5" fill="none" stroke="var(--accent)" strokeWidth="2" />
          <circle cx="610" cy="165" r="4" fill="var(--mint)" />
          <circle cx="560" cy="85" r="4.5" fill="none" stroke="#E7ECEF" strokeWidth="1.8" strokeOpacity="0.7" />
          <circle cx="695" cy="85" r="4" fill="var(--accent)" />
          <circle cx="635" cy="205" r="3.5" fill="var(--accent)" />

          <g transform="translate(790, 105)">
            <circle r="16" fill="none" stroke="var(--mint)" strokeWidth="1.2" strokeDasharray="6 5" opacity="0.65">
              <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="10s" repeatCount="indefinite" />
            </circle>
            <circle r="9" fill="var(--mint)" opacity="0.25">
              <animate attributeName="r" values="7;13;7" dur="2.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.35;0.1;0.35" dur="2.4s" repeatCount="indefinite" />
            </circle>
            <circle r="5" fill="var(--mint)" />
          </g>
        </svg>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-4">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mint-dim border border-mint/30 text-mint text-xs font-semibold tracking-wide">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mint opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-mint" />
                </span>
                INGRESO NETO REALIZADO
              </span>

              <span className="font-tech text-xs px-2.5 py-1 rounded-full bg-surface-3 border border-accent/30 text-accent flex items-center gap-1">
                <ArrowUpRight size={13} /> Margen: {metrics.netMarginPct}%
              </span>
            </div>

            <div className="flex items-baseline gap-4 flex-wrap">
              <p className="font-display text-5xl sm:text-6xl font-bold tracking-tight text-mint drop-shadow-[0_0_28px_rgba(111,231,200,0.28)]">
                {fmtMoney(metrics.realizedNetRevenue)}
              </p>
              <span className="text-xs text-muted font-tech">
                {rowsAprobadoCliente.length} aprobados cliente · {metrics.realizedVideos} videos
              </span>
            </div>

            <div className="flex items-center gap-2 flex-wrap pt-1">
              <div className="bg-surface-3/90 border border-line rounded-lg px-3 py-1.5 text-xs flex items-center gap-2">
                <span className="text-muted-2">Bruto Cliente:</span>
                <span className="font-tech font-semibold text-text">{fmtMoney(metrics.realizedGrossRevenue)}</span>
              </div>
              <span className="text-muted-2 font-tech text-xs">−</span>
              <div className="bg-surface-3/90 border border-line rounded-lg px-3 py-1.5 text-xs flex items-center gap-2">
                <span className="text-muted-2">Nómina:</span>
                <span className="font-tech font-semibold text-accent">{fmtMoney(metrics.realizedCreatorCost)}</span>
              </div>
              <span className="text-muted-2 font-tech text-xs">−</span>
              <div className="bg-surface-3/90 border border-line rounded-lg px-3 py-1.5 text-xs flex items-center gap-2">
                <span className="text-muted-2">Apps / Créditos:</span>
                <span className="font-tech font-semibold text-amber">{fmtMoney(expensesSummary.periodTotal)}</span>
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 bg-surface/85 backdrop-blur-md border border-line rounded-xl p-4 space-y-3 relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-text flex items-center gap-1.5">
                <Users size={14} className="text-accent" /> Nómina Creadores
              </span>
              <span className="font-display text-lg font-bold text-text font-tech">
                {fmtMoney(metrics.totalCreatorPayroll)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-surface-2 border border-accent/25 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted flex items-center gap-1">
                    <Scissors size={11} className="text-accent" /> Clippers
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
                </div>
                <p className="font-display text-xl font-bold text-accent">
                  {fmtMoney(metrics.totalClipperPay)}
                </p>
              </div>

              <div className="bg-surface-2 border border-mint/25 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-muted flex items-center gap-1">
                    <Film size={11} className="text-mint" /> Editores
                  </span>
                  <span className="w-1.5 h-1.5 rounded-full bg-mint animate-pulse" />
                </div>
                <p className="font-display text-xl font-bold text-mint">
                  {fmtMoney(metrics.totalEditorPay)}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 text-[11px] font-tech">
              <div className="bg-surface-3 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-muted-2">50% Senda:</span>
                <span className="text-amber font-semibold">{fmtMoney(metrics.accruedPaid50Cost)}</span>
              </div>
              <div className="bg-surface-3 rounded-lg px-2.5 py-1.5 flex items-center justify-between">
                <span className="text-muted-2">100% Cliente:</span>
                <span className="text-mint font-semibold">{fmtMoney(metrics.realizedCreatorCost)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Tarjetas: Ingreso Diferido | Ingreso Bruto | Apps, Créditos y Material */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-start">
        <button
          type="button"
          onClick={() => setReportTab('no_iniciados')}
          className={`relative text-left bg-surface-2 border rounded-xl p-5 transition-all overflow-hidden ${
            reportTab === 'no_iniciados' ? 'border-amber ring-1 ring-amber/30' : 'border-line hover:border-amber/40'
          }`}
        >
          <CardNodeDeco color="var(--amber)" />
          <div className="w-9 h-9 rounded-lg bg-amber-dim text-amber flex items-center justify-center mb-2.5">
            <Clock size={18} />
          </div>
          <p className="text-[11px] uppercase tracking-wider font-tech text-amber">Ingreso Diferido · Por Devengar</p>
          <p className="font-display text-2xl sm:text-3xl font-bold mt-1">
            {fmtMoney(metrics.deferredRevenue)}
          </p>
          <p className="text-xs text-muted mt-1.5">
            {rowsNoIniciados.length} proyectos en cola ({metrics.deferredVideos} videos).
          </p>
        </button>

        <button
          type="button"
          onClick={() => setReportTab('aprobado_senda')}
          className={`relative text-left bg-surface-2 border rounded-xl p-5 transition-all overflow-hidden ${
            reportTab === 'aprobado_senda' ? 'border-accent ring-1 ring-accent/30' : 'border-line hover:border-accent/40'
          }`}
        >
          <CardNodeDeco color="var(--accent)" />
          <div className="w-9 h-9 rounded-lg bg-accent-dim text-accent flex items-center justify-center mb-2.5">
            <ShieldCheck size={18} />
          </div>
          <p className="text-[11px] uppercase tracking-wider font-tech text-accent">Ingreso Bruto · Aprobado Senda</p>
          <p className="font-display text-2xl sm:text-3xl font-bold mt-1">
            {fmtMoney(metrics.accruedGrossRevenue)}
          </p>
          <p className="text-xs text-muted mt-1.5">
            {rowsAprobadoSenda.length} proyectos listos ({metrics.accruedVideos} videos) · 50% liberado.
          </p>
        </button>

        <div
          className={`relative bg-surface-2 border rounded-xl p-5 overflow-hidden transition-all ${
            appsBoxOpen ? 'border-violet ring-1 ring-violet/30' : 'border-line hover:border-violet/40'
          }`}
        >
          <CardNodeDeco color="var(--violet)" />
          <div
            onClick={() => setAppsBoxOpen(o => !o)}
            className="cursor-pointer select-none"
          >
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <div className="w-9 h-9 rounded-lg bg-violet-dim text-violet flex items-center justify-center">
                <Cpu size={18} />
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-surface-3 text-accent border border-line rounded-lg px-2.5 py-1">
                <Plus size={12} /> Registrar / Ver
                <ChevronDown size={13} className={`transition-transform duration-200 ${appsBoxOpen ? 'rotate-180' : ''}`} />
              </span>
            </div>

            <p className="text-[11px] uppercase tracking-wider font-tech text-violet">Apps, Créditos y Material</p>
            <p className="font-display text-2xl sm:text-3xl font-bold mt-1">
              {fmtMoney(expensesSummary.periodTotal)}
            </p>

            <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-line/60 text-[11px] font-tech">
              <div>
                <span className="text-muted-2 block">Pagado Hoy</span>
                <span className="text-text font-semibold">{fmtMoney(expensesSummary.todayTotal)}</span>
              </div>
              <div>
                <span className="text-muted-2 block">Este Mes</span>
                <span className="text-text font-semibold">{fmtMoney(expensesSummary.monthTotal)}</span>
              </div>
            </div>
          </div>

          {appsBoxOpen && (
            <div className="mt-4 pt-3.5 border-t border-line space-y-3 animate-fadeIn">
              <form onSubmit={handleAddExpense} className="space-y-2 bg-surface-3 p-3 rounded-lg border border-line">
                <p className="text-[11px] font-semibold text-muted">Registrar pago de app / créditos</p>
                <input
                  value={expLabel}
                  onChange={e => setExpLabel(e.target.value)}
                  placeholder="App o crédito (ej. ElevenLabs, HeyGen)"
                  className="w-full bg-surface-2 border border-line rounded-md px-2.5 py-1.5 text-xs outline-none focus:border-accent"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    min={1}
                    value={expAmount}
                    onChange={e => setExpAmount(e.target.value)}
                    placeholder="Monto"
                    className="bg-surface-2 border border-line rounded-md px-2.5 py-1.5 text-xs font-tech outline-none focus:border-accent"
                  />
                  <select
                    value={expCategory}
                    onChange={e => setExpCategory(e.target.value as AppExpense['category'])}
                    className="bg-surface-2 border border-line rounded-md px-2 py-1.5 text-xs outline-none focus:border-accent"
                  >
                    <option value="creditos_ia">Créditos IA</option>
                    <option value="suscripcion">Suscripción</option>
                    <option value="herramienta">Material</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    value={expDate}
                    onChange={e => setExpDate(e.target.value)}
                    className="flex-1 bg-surface-2 border border-line rounded-md px-2 py-1.5 text-xs font-tech outline-none focus:border-accent"
                  />
                  <LiquidMetalButton
                    type="submit"
                    label="Guardar"
                    height={36}
                    width={120}
                    variant="cyan"
                  />
                </div>
              </form>

              {filteredExpenses.length === 0 ? (
                <p className="text-[11px] text-muted-2 text-center py-2">Sin pagos registrados en este período</p>
              ) : (
                <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                  {filteredExpenses.map(exp => (
                    <div
                      key={exp.id}
                      className="flex items-center justify-between gap-2 bg-surface-3 border border-line rounded-lg px-2.5 py-1.5 text-xs"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate">{exp.label}</p>
                        <p className="text-[10px] text-muted-2 font-tech">{exp.date}</p>
                      </div>
                      <span className="font-tech text-amber font-semibold shrink-0">-{fmtMoney(exp.amount)}</span>
                      <button
                        type="button"
                        onClick={() => deleteAppExpense(exp.id)}
                        className="text-muted-2 hover:text-red-400 transition-colors shrink-0"
                        title="Eliminar"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Informe Financiero Detallado */}
      <div className="bg-surface-2 border border-line rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-line pb-3.5">
          <h3 className="font-display text-base sm:text-lg font-semibold flex items-center gap-2">
            <Layers size={18} className="text-accent" /> Informe Financiero Detallado
          </h3>

          <div className="flex items-center gap-1.5 bg-surface-3 border border-line rounded-xl p-1 flex-wrap">
            <button
              type="button"
              onClick={() => setReportTab('no_iniciados')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                reportTab === 'no_iniciados' ? 'bg-amber text-on-accent' : 'text-muted hover:text-text'
              }`}
            >
              Proyectos no iniciados ({rowsNoIniciados.length})
            </button>
            <button
              type="button"
              onClick={() => setReportTab('aprobado_senda')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                reportTab === 'aprobado_senda' ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'
              }`}
            >
              Aprobados Senda ({rowsAprobadoSenda.length})
            </button>
            <button
              type="button"
              onClick={() => setReportTab('aprobado_cliente')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                reportTab === 'aprobado_cliente' ? 'bg-mint text-on-accent' : 'text-muted hover:text-text'
              }`}
            >
              Aprobados Cliente ({rowsAprobadoCliente.length})
            </button>
          </div>
        </div>

        {activeRows.length === 0 ? (
          <div className="text-center py-8 bg-surface-3/40 rounded-xl border border-dashed border-line">
            <Sparkles size={22} className="text-muted-2 mx-auto mb-1.5" />
            <p className="text-sm text-muted">Sin proyectos en esta etapa para el período seleccionado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs border-b border-line">
                  <th className="py-2.5 pr-3 font-medium">Proyecto / Marca</th>
                  <th className="py-2.5 pr-3 font-medium">Fecha</th>
                  <th className="py-2.5 pr-3 font-medium">Videos</th>
                  <th className="py-2.5 pr-3 font-medium">Equipo</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Bruto</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Nómina (C + E)</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Neto</th>
                  <th className="py-2.5 font-medium text-right">Pago Automático</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map(r => (
                  <tr key={r.id} className="border-b border-line/50 hover:bg-surface-3/50 transition-colors">
                    <td className="py-3 pr-3">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-[11px] text-muted-2">{r.brand}</p>
                    </td>
                    <td className="py-3 pr-3 font-tech text-xs text-muted">{r.date}</td>
                    <td className="py-3 pr-3 font-tech text-xs">{r.videoCount}</td>
                    <td className="py-3 pr-3 text-xs">
                      <span className="text-text">{r.clipperName}</span>
                      <span className="text-muted-2"> + </span>
                      <span className="text-text">{r.editorName}</span>
                    </td>
                    <td className="py-3 pr-3 text-right font-tech text-xs font-medium">
                      {fmtMoney(r.grossAmount)}
                    </td>
                    <td className="py-3 pr-3 text-right font-tech text-xs text-muted">
                      -{fmtMoney(r.creatorCostTotal)}
                    </td>
                    <td className="py-3 pr-3 text-right font-tech text-sm font-bold text-mint">
                      {fmtMoney(r.netMargin)}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-2 justify-end">
                        {r.stage === 'aprobado_cliente' ? (
                          <span className="text-[11px] font-tech px-2.5 py-1 rounded-full bg-mint-dim text-mint border border-mint/30">
                            100% Liquidado
                          </span>
                        ) : r.stage === 'aprobado_senda' ? (
                          <span className="text-[11px] font-tech px-2.5 py-1 rounded-full bg-accent-dim text-accent border border-accent/30">
                            50% Liberado
                          </span>
                        ) : (
                          <span className="text-[11px] font-tech px-2.5 py-1 rounded-full bg-surface-3 text-muted-2 border border-line">
                            En cola (0%)
                          </span>
                        )}
                        {r.videoRef && (
                          <button
                            type="button"
                            onClick={() => { setSelectedVideo(r.videoRef!); setView('tareas'); }}
                            className="w-7 h-7 rounded-md bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-accent transition-colors"
                            title="Abrir en Tareas"
                          >
                            <Eye size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {financeClosings.length > 0 && (
        <div className="bg-surface-2 border border-line rounded-xl p-4 space-y-2.5">
          <h3 className="font-display text-sm font-semibold flex items-center gap-2 text-muted">
            <History size={15} className="text-mint" /> Últimos cierres descargados en PDF
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            {financeClosings.slice(0, 3).map(c => (
              <div key={c.id} className="bg-surface-3 border border-line rounded-lg p-2.5 text-xs flex items-center justify-between">
                <div>
                  <p className="font-medium">{c.periodLabel}</p>
                  <p className="text-[10px] text-muted-2 font-tech">
                    {new Date(c.closedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                  </p>
                </div>
                <span className="font-tech font-bold text-mint flex items-center gap-1">
                  <CheckCircle2 size={12} /> {fmtMoney(c.realizedNetRevenue)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
