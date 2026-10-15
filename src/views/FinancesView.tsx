import { useState, useMemo } from 'react';
import { useStore } from '../store';
import type { Video, Order } from '../types';
import { CardNodeDeco } from '../components/BrandBackground';
import {
  DollarSign, TrendingUp, Clock, CheckCircle2, ShieldCheck,
  Calendar, FileDown, Sliders, Users, Scissors, Film, Landmark,
  ArrowUpRight, Sparkles, Check, Layers, Eye, History,
} from 'lucide-react';

type DatePreset = 'hoy' | 'quincena' | 'mes' | 'todo' | 'rango';
type ReportTab = 'no_iniciados' | 'aprobado_senda' | 'aprobado_cliente' | 'nomina_equipo';

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
    brands, orders, workers, financeSettings, updateFinanceSettings,
    financeClosings, recordFinanceDayClosing, setSelectedVideo, setView,
    togglePaid50, approveFinal,
  } = useStore();

  const [preset, setPreset] = useState<DatePreset>('mes');
  const [dateFrom, setDateFrom] = useState<string>(() => firstDayOfMonthIso());
  const [dateTo, setDateTo] = useState<string>(() => todayIso());
  const [reportTab, setReportTab] = useState<ReportTab>('aprobado_cliente');
  const [showRateConfig, setShowRateConfig] = useState(false);

  const [priceInput, setPriceInput] = useState(String(financeSettings.clientPricePerVideo));
  const [clipperCostInput, setClipperCostInput] = useState(String(financeSettings.defaultClipperCost));
  const [editorCostInput, setEditorCostInput] = useState(String(financeSettings.defaultEditorCost));
  const [savedRatesToast, setSavedRatesToast] = useState(false);

  // Rango efectivo de fechas según el filtro elegido
  const effectiveRange = useMemo(() => {
    const today = todayIso();
    if (preset === 'hoy') return { from: today, to: today, label: `Hoy (${today})` };
    if (preset === 'quincena') {
      const from = subtractDaysIso(14);
      return { from, to: today, label: `Últimos 15 días (${from} a ${today})` };
    }
    if (preset === 'mes') {
      const from = firstDayOfMonthIso();
      return { from, to: today, label: `Este mes (${from} a ${today})` };
    }
    if (preset === 'rango') {
      return {
        from: dateFrom || '2000-01-01',
        to: dateTo || '2099-12-31',
        label: `Del ${dateFrom || 'inicio'} al ${dateTo || 'hoy'}`,
      };
    }
    return { from: '2000-01-01', to: '2099-12-31', label: 'Todo el historial' };
  }, [preset, dateFrom, dateTo]);

  // Construimos las filas financieras unificando pedidos disponibles (orders sin promover) y videos del tablero
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

    // 1. Pedidos disponibles en Tareas -> Proyectos disponibles (aún no promovidos al tablero o sin ambos asignados)
    for (const o of orders) {
      const hasBothAssigned = Boolean(o.clipperId && o.editorId);
      if (hasBothAssigned || o.promotedToBoard || o.status === 'finalizado') continue;

      const count = Math.max(1, o.videoCount || 1);
      const pricePerVid = o.unitPriceClient || unitPrice;
      const gross = count * pricePerVid;
      const clipperCost = count * defClipper;
      const editorCost = count * defEditor;
      const totalCreatorCost = clipperCost + editorCost;
      const clipperW = workers.find(w => w.id === o.clipperId);
      const editorW = workers.find(w => w.id === o.editorId);

      rows.push({
        id: `order-${o.id}`,
        source: 'order',
        name: `${o.brand} · Pedido (${count} videos)`,
        brand: o.brand,
        date: o.deliveryDate || o.createdAt.slice(0, 10),
        videoCount: count,
        clipperId: o.clipperId || null,
        clipperName: clipperW?.name || 'Por asignar',
        editorId: o.editorId || null,
        editorName: editorW?.name || 'Por asignar',
        stage: 'no_iniciados',
        statusLabel: 'En Proyectos disponibles (sin iniciar)',
        grossAmount: gross,
        clipperPayTotal: clipperCost,
        editorPayTotal: editorCost,
        creatorCostTotal: totalCreatorCost,
        netMargin: gross - totalCreatorCost,
        paid50: false,
        paid100: false,
      });
    }

    // 2. Videos en el tablero de marcas
    for (const b of brands) {
      for (const v of b.videos) {
        const linked = linkedOrderByVideoId.get(v.id) || linkedOrderByBrand.get(b.name.trim().toLowerCase());
        const count = linked ? Math.max(1, linked.videoCount || 1) : 1;
        const pricePerVid = linked?.unitPriceClient || unitPrice;
        const gross = count * pricePerVid;

        const unitClipperPay = v.tierSnapshot ? v.tierSnapshot.clipperPay : defClipper;
        const unitEditorPay = v.tierSnapshot ? v.tierSnapshot.editorPay : defEditor;
        const clipperCost = count * unitClipperPay;
        const editorCost = count * unitEditorPay;
        const totalCreatorCost = clipperCost + editorCost;

        let stage: FinancialProjectRow['stage'] = 'no_iniciados';
        let statusLabel = 'En producción / Sin iniciar';
        if (v.qc === 'aprobado_cliente') {
          stage = 'aprobado_cliente';
          statusLabel = 'Aprobado Cliente · Neto Realizado';
        } else if (v.qc === 'aprobado_senda' || v.qc === 'aprobado') {
          stage = 'aprobado_senda';
          statusLabel = 'Aprobado Senda · Ingreso Devengado';
        } else {
          stage = 'no_iniciados';
          statusLabel = `En cola / ${v.qc.replace(/_/g, ' ')}`;
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

  // Filtrado por fecha (si en "Hoy" no hay coincidencias exactas de fecha pero el usuario selecciona otro filtro, se adapta)
  const filteredRows = useMemo(() => {
    if (preset === 'todo') return allRows;
    return allRows.filter(r => r.date >= effectiveRange.from && r.date <= effectiveRange.to);
  }, [allRows, preset, effectiveRange]);

  const rowsNoIniciados = useMemo(() => filteredRows.filter(r => r.stage === 'no_iniciados'), [filteredRows]);
  const rowsAprobadoSenda = useMemo(() => filteredRows.filter(r => r.stage === 'aprobado_senda'), [filteredRows]);
  const rowsAprobadoCliente = useMemo(() => filteredRows.filter(r => r.stage === 'aprobado_cliente'), [filteredRows]);

  // Cálculos de los 3 tipos de ingreso + Nómina de Clippers y Editores
  const metrics = useMemo(() => {
    // 1. Ingreso Diferido (Por Devengar): pedidos disponibles / no aprobados aún
    const deferredRevenue = rowsNoIniciados.reduce((s, r) => s + r.grossAmount, 0);
    const deferredVideos = rowsNoIniciados.reduce((s, r) => s + r.videoCount, 0);

    // 2. Ingreso Devengado (Bruto Asegurado en Aprobado Senda)
    const accruedGrossRevenue = rowsAprobadoSenda.reduce((s, r) => s + r.grossAmount, 0);
    const accruedVideos = rowsAprobadoSenda.reduce((s, r) => s + r.videoCount, 0);
    // En Aprobado Senda se libera el 50% a Clippers/Editores; el otro 50% queda pendiente de aprobación cliente
    const accruedPaid50Cost = rowsAprobadoSenda.reduce((s, r) => s + r.creatorCostTotal * 0.5, 0);
    const accruedPending50Cost = rowsAprobadoSenda.reduce((s, r) => s + r.creatorCostTotal * 0.5, 0);

    // 3. Ingreso Neto Realizado (Ganancia Neta Libre en Aprobado Cliente, ya descontado el 100% de pago a Clipper y Editor)
    const realizedGrossRevenue = rowsAprobadoCliente.reduce((s, r) => s + r.grossAmount, 0);
    const realizedCreatorCost = rowsAprobadoCliente.reduce((s, r) => s + r.creatorCostTotal, 0);
    const realizedNetRevenue = rowsAprobadoCliente.reduce((s, r) => s + r.netMargin, 0);
    const realizedVideos = rowsAprobadoCliente.reduce((s, r) => s + r.videoCount, 0);

    // Nómina total a Clippers y Editores (en el período seleccionado)
    const totalClipperPay = [...rowsAprobadoSenda, ...rowsAprobadoCliente].reduce((s, r) => s + r.clipperPayTotal, 0);
    const totalEditorPay = [...rowsAprobadoSenda, ...rowsAprobadoCliente].reduce((s, r) => s + r.editorPayTotal, 0);
    const totalCreatorPayroll = totalClipperPay + totalEditorPay;

    // Margen neto porcentual sobre facturación realizada
    const netMarginPct = realizedGrossRevenue > 0
      ? Math.round((realizedNetRevenue / realizedGrossRevenue) * 100)
      : Math.round(((financeSettings.clientPricePerVideo - financeSettings.defaultClipperCost - financeSettings.defaultEditorCost) / Math.max(financeSettings.clientPricePerVideo, 1)) * 100);

    return {
      deferredRevenue,
      deferredVideos,
      accruedGrossRevenue,
      accruedVideos,
      accruedPaid50Cost,
      accruedPending50Cost,
      realizedGrossRevenue,
      realizedCreatorCost,
      realizedNetRevenue,
      realizedVideos,
      totalClipperPay,
      totalEditorPay,
      totalCreatorPayroll,
      netMarginPct,
    };
  }, [rowsNoIniciados, rowsAprobadoSenda, rowsAprobadoCliente, financeSettings]);

  // Liquidación detallada por cada Clipper / Editor (con datos bancarios de respaldo para pago manual)
  const workerPayoutBreakdown = useMemo(() => {
    return workers.map(w => {
      const asClipper = filteredRows.filter(r => r.clipperId === w.id && (r.stage === 'aprobado_senda' || r.stage === 'aprobado_cliente'));
      const asEditor = filteredRows.filter(r => r.editorId === w.id && (r.stage === 'aprobado_senda' || r.stage === 'aprobado_cliente'));

      const earned50 = [
        ...asClipper.filter(r => r.stage === 'aprobado_senda').map(r => r.clipperPayTotal * 0.5),
        ...asEditor.filter(r => r.stage === 'aprobado_senda').map(r => r.editorPayTotal * 0.5),
      ].reduce((a, b) => a + b, 0);

      const pending50 = earned50;

      const earned100 = [
        ...asClipper.filter(r => r.stage === 'aprobado_cliente').map(r => r.clipperPayTotal),
        ...asEditor.filter(r => r.stage === 'aprobado_cliente').map(r => r.editorPayTotal),
      ].reduce((a, b) => a + b, 0);

      const totalAssignedProjects = asClipper.length + asEditor.length;
      const totalPayable = earned50 + earned100;

      return {
        worker: w,
        totalAssignedProjects,
        earned50,
        pending50,
        earned100,
        totalPayable,
      };
    });
  }, [workers, filteredRows]);

  const handleSaveRates = () => {
    updateFinanceSettings({
      clientPricePerVideo: Math.max(1, Number(priceInput) || 25),
      defaultClipperCost: Math.max(0, Number(clipperCostInput) || 3),
      defaultEditorCost: Math.max(0, Number(editorCostInput) || 4),
    });
    setSavedRatesToast(true);
    setTimeout(() => setSavedRatesToast(false), 2500);
  };

  // Generador de Informe PDF Oficial (abre ventana de impresión/descarga PDF nativa con diseño ejecutivo de respaldo)
  const handleCloseDayAndDownloadPdf = () => {
    recordFinanceDayClosing({
      periodLabel: effectiveRange.label,
      deferredRevenue: metrics.deferredRevenue,
      accruedGrossRevenue: metrics.accruedGrossRevenue,
      realizedNetRevenue: metrics.realizedNetRevenue,
      totalCreatorPayouts: metrics.totalCreatorPayroll,
      projectsCount: filteredRows.length,
    });

    const nowStr = new Date().toLocaleString('es-CO', {
      dateStyle: 'full',
      timeStyle: 'short',
    });

    const projectRowsHtml = filteredRows.map((r, i) => `
      <tr>
        <td>${i + 1}</td>
        <td><strong>${r.name}</strong><br/><span style="color:#64748b;font-size:11px;">Marca: ${r.brand} · ${r.videoCount} video(s)</span></td>
        <td>${r.date}</td>
        <td>${r.clipperName} / ${r.editorName}</td>
        <td>${r.statusLabel}</td>
        <td style="text-align:right;">$${r.grossAmount.toLocaleString('es-CO')}</td>
        <td style="text-align:right;">$${r.creatorCostTotal.toLocaleString('es-CO')}</td>
        <td style="text-align:right;font-weight:700;color:#0d9488;">$${r.netMargin.toLocaleString('es-CO')}</td>
      </tr>
    `).join('');

    const payrollRowsHtml = workerPayoutBreakdown.map(item => `
      <tr>
        <td><strong>${item.worker.name}</strong></td>
        <td>${item.worker.role === 'clipper' ? 'Clipper' : 'Editor(a)'}</td>
        <td>${item.worker.email || 'Sin correo'}<br/><span style="color:#64748b;font-size:11px;">${item.worker.phone || ''}</span></td>
        <td>${item.worker.bankInfo || 'Pendiente registrar en Perfil'}</td>
        <td style="text-align:center;">${item.totalAssignedProjects}</td>
        <td style="text-align:right;">$${item.earned50.toLocaleString('es-CO')}</td>
        <td style="text-align:right;">$${item.earned100.toLocaleString('es-CO')}</td>
        <td style="text-align:right;font-weight:700;color:#0f172a;">$${item.totalPayable.toLocaleString('es-CO')}</td>
      </tr>
    `).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>SENDA - Respaldo Financiero y Liquidacion (${todayIso()})</title>
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
          @media print {
            body { padding: 12px; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="brand">SENDA · TESORERÍA Y FINANZAS</div>
            <p style="margin:4px 0 0;color:#475569;">Informe Oficial de Cierre y Respaldo Manual de Nómina (Clippers y Editores)</p>
          </div>
          <div style="text-align:right;">
            <span class="badge">Documento de Respaldo Operativo</span>
            <p style="margin:6px 0 0;color:#475569;">Generado: ${nowStr}</p>
            <p style="margin:2px 0 0;color:#0f172a;font-weight:600;">Período: ${effectiveRange.label}</p>
          </div>
        </div>

        <div class="grid">
          <div class="card">
            <div class="card-label">1. Ingreso Diferido (Por Devengar)</div>
            <div class="card-val">$${metrics.deferredRevenue.toLocaleString('es-CO')}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">${rowsNoIniciados.length} proyectos (${metrics.deferredVideos} videos en cola)</div>
          </div>
          <div class="card">
            <div class="card-label">2. Ingreso Devengado (Aprobado Senda)</div>
            <div class="card-val">$${metrics.accruedGrossRevenue.toLocaleString('es-CO')}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">${rowsAprobadoSenda.length} proyectos (${metrics.accruedVideos} videos asegurados)</div>
          </div>
          <div class="card">
            <div class="card-label">Pagos Clippers + Editores</div>
            <div class="card-val">$${metrics.totalCreatorPayroll.toLocaleString('es-CO')}</div>
            <div style="font-size:11px;color:#64748b;margin-top:4px;">Clippers: $${metrics.totalClipperPay.toLocaleString('es-CO')} · Editores: $${metrics.totalEditorPay.toLocaleString('es-CO')}</div>
          </div>
          <div class="card card-highlight">
            <div class="card-label" style="color:#047857;">3. Utilidad Neta Realizada (Aprobado Cliente)</div>
            <div class="card-val" style="color:#047857;">$${metrics.realizedNetRevenue.toLocaleString('es-CO')}</div>
            <div style="font-size:11px;color:#065f46;margin-top:4px;">Descontado 100% pagos (${metrics.netMarginPct}% margen libre)</div>
          </div>
        </div>

        <h2>Respaldo para Pago Manual a Clippers y Editores (Con Datos Bancarios)</h2>
        <table>
          <thead>
            <tr>
              <th>Creador</th>
              <th>Rol</th>
              <th>Contacto</th>
              <th>Datos Bancarios (Respaldo)</th>
              <th style="text-align:center;">Proyectos</th>
              <th style="text-align:right;">50% (Aprob. Senda)</th>
              <th style="text-align:right;">100% (Aprob. Cliente)</th>
              <th style="text-align:right;">Total Liquidado</th>
            </tr>
          </thead>
          <tbody>
            ${payrollRowsHtml || '<tr><td colspan="8" style="text-align:center;">Sin registros</td></tr>'}
          </tbody>
        </table>

        <h2>Desglose Detallado de Proyectos (${filteredRows.length})</h2>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Proyecto / Marca</th>
              <th>Fecha</th>
              <th>Clipper / Editor(a)</th>
              <th>Estado Contable</th>
              <th style="text-align:right;">Ingreso Bruto</th>
              <th style="text-align:right;">Costo Creadores</th>
              <th style="text-align:right;">Ingreso Neto Senda</th>
            </tr>
          </thead>
          <tbody>
            ${projectRowsHtml || '<tr><td colspan="8" style="text-align:center;">Sin proyectos en este rango de fechas</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          <span>SENDA Platform · Respaldo automático contra pérdida de datos</span>
          <span>Tarifa base cliente: $${financeSettings.clientPricePerVideo}/video · Base Clipper: $${financeSettings.defaultClipperCost} · Base Editor: $${financeSettings.defaultEditorCost}</span>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() { window.print(); }, 250);
          };
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

  const grossVsCostTotal = Math.max(1, metrics.realizedNetRevenue + metrics.realizedCreatorCost);
  const netBarWidth = Math.min(100, Math.max(12, Math.round((metrics.realizedNetRevenue / grossVsCostTotal) * 100)));

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Cabecera + Selector de Fechas + Botón Cerrar Día / Descargar PDF */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-mint-dim border border-mint/30 text-mint flex items-center justify-center shadow-[0_0_20px_-4px_rgba(111,231,200,0.35)]">
              <DollarSign size={22} />
            </div>
            <div>
              <h2 className="font-display text-2xl sm:text-3xl font-bold">Finanzas y Flujo de Caja</h2>
              <p className="text-xs sm:text-sm text-muted">
                Trazabilidad contable en tiempo real: Ingresos Diferidos → Ingresos Devengados (Senda) → Utilidad Neta Realizada (Cliente).
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setShowRateConfig(s => !s)}
            className="flex items-center gap-1.5 bg-surface-2 hover:bg-surface-3 border border-line rounded-xl px-3.5 py-2.5 text-xs font-medium text-muted hover:text-text transition-colors"
          >
            <Sliders size={14} className="text-accent" /> Parámetros ($/video)
          </button>
          <button
            type="button"
            onClick={handleCloseDayAndDownloadPdf}
            className="flex items-center gap-2 bg-mint text-on-accent rounded-xl px-4 py-2.5 text-xs sm:text-sm font-semibold hover:opacity-95 transition-all shadow-[0_8px_24px_-6px_rgba(111,231,200,0.45)]"
          >
            <FileDown size={16} /> Cerrar día y Descargar PDF
          </button>
        </div>
      </div>

      {/* Configurador desplegable de tarifas comerciales para cálculo exacto */}
      {showRateConfig && (
        <div className="bg-surface-2 border border-accent/40 rounded-xl p-4 space-y-3 animate-fadeIn">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold flex items-center gap-2">
                <Sliders size={15} className="text-accent" /> Tarifa Comercial Base por Video
              </p>
              <p className="text-xs text-muted">
                Define cuánto cobra SENDA al cliente por cada video y el pago base a Clipper/Editor cuando una tarea aún no tiene tier específico.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <label className="bg-surface-3 border border-line rounded-lg p-3 block">
              <span className="text-[11px] text-muted-2 block mb-1">Precio cobrado al Cliente por video ($)</span>
              <input
                type="number"
                min={1}
                value={priceInput}
                onChange={e => setPriceInput(e.target.value)}
                className="w-full bg-surface-2 border border-line rounded-md px-3 py-1.5 text-sm font-tech outline-none focus:border-accent"
              />
            </label>
            <label className="bg-surface-3 border border-line rounded-lg p-3 block">
              <span className="text-[11px] text-muted-2 block mb-1">Pago base Clipper por video ($)</span>
              <input
                type="number"
                min={0}
                value={clipperCostInput}
                onChange={e => setClipperCostInput(e.target.value)}
                className="w-full bg-surface-2 border border-line rounded-md px-3 py-1.5 text-sm font-tech outline-none focus:border-accent"
              />
            </label>
            <label className="bg-surface-3 border border-line rounded-lg p-3 block">
              <span className="text-[11px] text-muted-2 block mb-1">Pago base Editor(a) por video ($)</span>
              <input
                type="number"
                min={0}
                value={editorCostInput}
                onChange={e => setEditorCostInput(e.target.value)}
                className="w-full bg-surface-2 border border-line rounded-md px-3 py-1.5 text-sm font-tech outline-none focus:border-accent"
              />
            </label>
          </div>
          <div className="flex items-center justify-end gap-3">
            {savedRatesToast && (
              <span className="text-xs text-mint flex items-center gap-1">
                <Check size={13} /> Tarifas actualizadas en vivo
              </span>
            )}
            <button
              type="button"
              onClick={handleSaveRates}
              className="bg-accent text-on-accent rounded-lg px-4 py-2 text-xs font-semibold hover:bg-accent-strong transition-colors"
            >
              Guardar tarifas
            </button>
          </div>
        </div>
      )}

      {/* Barra de Filtro de Fechas (Hoy, 15 días, Mes, Todo, o Rango Desde-Hasta) */}
      <div className="bg-surface-2 border border-line rounded-xl p-3.5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs text-muted flex items-center gap-1.5 mr-1">
            <Calendar size={14} className="text-accent" /> Período:
          </span>
          {(
            [
              { key: 'hoy', label: 'Solo Hoy' },
              { key: 'quincena', label: '15 Días (Quincena)' },
              { key: 'mes', label: 'Este Mes' },
              { key: 'todo', label: 'Todo el Historial' },
              { key: 'rango', label: 'Rango Personalizado' },
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
            <span className="text-xs text-muted-2">hasta</span>
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

      {/* HERO: Utilidad Neta Realizada (Grande, animada con lenguaje de circuito SENDA) */}
      <div className="relative bg-surface-2 border border-mint/40 rounded-2xl p-6 sm:p-7 overflow-hidden shadow-[0_0_40px_-15px_rgba(111,231,200,0.28)]">
        {/* Resplandor y circuito animado de marca */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 88% 20%, rgba(111,231,200,0.12), transparent 48%), ' +
              'radial-gradient(circle at 10% 90%, rgba(53,214,228,0.10), transparent 45%)',
          }}
        />
        <svg
          className="absolute right-4 top-4 pointer-events-none opacity-35 hidden sm:block"
          width="240"
          height="120"
          viewBox="0 0 240 120"
          fill="none"
        >
          <path
            d="M 10 95 L 85 95 L 120 55 L 185 55 L 215 25"
            stroke="var(--mint)"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray="6 6"
          >
            <animate attributeName="stroke-dashoffset" values="24;0" dur="3s" repeatCount="indefinite" />
          </path>
          <path
            d="M 85 95 L 110 110 L 170 110"
            stroke="var(--accent)"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <circle cx="85" cy="95" r="4" fill="var(--mint)" />
          <circle cx="120" cy="55" r="4.5" fill="none" stroke="var(--accent)" strokeWidth="2" />
          <circle cx="185" cy="55" r="4" fill="var(--mint)" />
          <circle cx="215" cy="25" r="6" fill="var(--mint)">
            <animate attributeName="r" values="4;7;4" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="1;0.5;1" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </svg>

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          <div className="lg:col-span-7 space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-mint-dim border border-mint/30 text-mint text-xs font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-mint opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-mint" />
              </span>
              INGRESO NETO REALIZADO · GANANCIA LIBRE SENDA
            </div>

            <div className="flex items-baseline gap-3 flex-wrap">
              <p className="font-display text-4xl sm:text-5xl font-bold tracking-tight text-mint">
                ${metrics.realizedNetRevenue.toLocaleString('es-CO')}
              </p>
              <span className="font-tech text-xs px-2.5 py-1 rounded-md bg-surface-3 border border-line text-accent flex items-center gap-1">
                <ArrowUpRight size={13} /> Margen neto: {metrics.netMarginPct}%
              </span>
            </div>

            <p className="text-xs sm:text-sm text-muted max-w-xl">
              Dinero 100% consolidado de proyectos en estado <span className="text-text font-medium">Aprobado Cliente</span> ({rowsAprobadoCliente.length} proyectos · {metrics.realizedVideos} videos), habiendo descontado ya el pago total de <span className="text-text font-medium">Clippers y Editores</span> (${metrics.realizedCreatorCost.toLocaleString('es-CO')}).
            </p>

            {/* Barra de composición de cada dólar facturado */}
            <div className="pt-2 max-w-lg">
              <div className="flex justify-between text-[11px] font-tech text-muted-2 mb-1">
                <span>Utilidad neta Senda ({netBarWidth}%)</span>
                <span>Costo Clippers + Editores ({100 - netBarWidth}%)</span>
              </div>
              <div className="h-2.5 w-full bg-surface-3 rounded-full overflow-hidden flex border border-line">
                <div className="h-full bg-mint transition-all duration-500" style={{ width: `${netBarWidth}%` }} />
                <div className="h-full bg-accent/60 transition-all duration-500" style={{ width: `${100 - netBarWidth}%` }} />
              </div>
            </div>
          </div>

          {/* Mini-resumen compacto de Nómina Clippers + Editores */}
          <div className="lg:col-span-5 bg-surface-3/90 border border-line rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted flex items-center gap-1.5">
                <Users size={14} className="text-accent" /> Nómina de Creadores (Clippers + Editores)
              </span>
              <span className="font-tech text-sm font-bold text-text">
                ${metrics.totalCreatorPayroll.toLocaleString('es-CO')}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="bg-surface-2 border border-line rounded-lg p-2.5">
                <p className="text-[10px] text-muted-2 flex items-center gap-1">
                  <Scissors size={11} className="text-accent" /> Total Clippers
                </p>
                <p className="font-display text-base font-bold text-accent mt-0.5">
                  ${metrics.totalClipperPay.toLocaleString('es-CO')}
                </p>
              </div>
              <div className="bg-surface-2 border border-line rounded-lg p-2.5">
                <p className="text-[10px] text-muted-2 flex items-center gap-1">
                  <Film size={11} className="text-mint" /> Total Editores
                </p>
                <p className="font-display text-base font-bold text-mint mt-0.5">
                  ${metrics.totalEditorPay.toLocaleString('es-CO')}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-muted-2 pt-1 border-t border-line/60">
              <span>50% devengado en Senda: <strong className="text-amber font-tech">${metrics.accruedPaid50Cost.toLocaleString('es-CO')}</strong></span>
              <span>100% liquidado: <strong className="text-mint font-tech">${metrics.realizedCreatorCost.toLocaleString('es-CO')}</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* Tarjetas de las 3 Etapas del Ingreso */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* 1. Ingresos Diferidos (Por Devengar / Flotante en cola) */}
        <button
          type="button"
          onClick={() => setReportTab('no_iniciados')}
          className={`relative text-left bg-surface-2 border rounded-xl p-5 transition-all overflow-hidden ${
            reportTab === 'no_iniciados' ? 'border-amber ring-1 ring-amber/30' : 'border-line hover:border-amber/40'
          }`}
        >
          <CardNodeDeco color="var(--amber)" />
          <div className="w-10 h-10 rounded-lg bg-amber-dim text-amber flex items-center justify-center mb-3">
            <Clock size={20} />
          </div>
          <p className="text-xs uppercase tracking-wider font-tech text-amber">1. Ingreso Diferido (Por Devengar)</p>
          <p className="font-display text-2xl sm:text-3xl font-bold mt-1">
            ${metrics.deferredRevenue.toLocaleString('es-CO')}
          </p>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Pedidos que entraron en <span className="text-text font-medium">Proyectos disponibles</span> o están en proceso sin aprobarse aún ({rowsNoIniciados.length} proyectos · {metrics.deferredVideos} videos).
          </p>
        </button>

        {/* 2. Ingresos Devengados (Bruto Asegurado - Aprobado Senda) */}
        <button
          type="button"
          onClick={() => setReportTab('aprobado_senda')}
          className={`relative text-left bg-surface-2 border rounded-xl p-5 transition-all overflow-hidden ${
            reportTab === 'aprobado_senda' ? 'border-accent ring-1 ring-accent/30' : 'border-line hover:border-accent/40'
          }`}
        >
          <CardNodeDeco color="var(--accent)" />
          <div className="w-10 h-10 rounded-lg bg-accent-dim text-accent flex items-center justify-center mb-3">
            <ShieldCheck size={20} />
          </div>
          <p className="text-xs uppercase tracking-wider font-tech text-accent">2. Ingreso Devengado (Aprobado Senda)</p>
          <p className="font-display text-2xl sm:text-3xl font-bold mt-1">
            ${metrics.accruedGrossRevenue.toLocaleString('es-CO')}
          </p>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Ingreso bruto ya asegurado porque el video fue terminado y aprobado por Senda ({rowsAprobadoSenda.length} proyectos · {metrics.accruedVideos} videos). Pendiente solo de firma final del cliente.
          </p>
        </button>

        {/* 3. Ingreso Neto Realizado (Aprobado Cliente) */}
        <button
          type="button"
          onClick={() => setReportTab('aprobado_cliente')}
          className={`relative text-left bg-surface-2 border rounded-xl p-5 transition-all overflow-hidden ${
            reportTab === 'aprobado_cliente' ? 'border-mint ring-1 ring-mint/30' : 'border-line hover:border-mint/40'
          }`}
        >
          <CardNodeDeco color="var(--mint)" />
          <div className="w-10 h-10 rounded-lg bg-mint-dim text-mint flex items-center justify-center mb-3">
            <TrendingUp size={20} />
          </div>
          <p className="text-xs uppercase tracking-wider font-tech text-mint">3. Ingreso Neto (Aprobado Cliente)</p>
          <p className="font-display text-2xl sm:text-3xl font-bold mt-1 text-mint">
            ${metrics.realizedNetRevenue.toLocaleString('es-CO')}
          </p>
          <p className="text-xs text-muted mt-2 leading-relaxed">
            Facturación bruta: <span className="font-tech text-text">${metrics.realizedGrossRevenue.toLocaleString('es-CO')}</span> menos pagos completos a Clippers y Editores (<span className="font-tech text-text">-${metrics.realizedCreatorCost.toLocaleString('es-CO')}</span>).
          </p>
        </button>
      </div>

      {/* Informe Detallado e Interactivo por Categoría */}
      <div className="bg-surface-2 border border-line rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap border-b border-line pb-4">
          <div>
            <h3 className="font-display text-lg font-semibold flex items-center gap-2">
              <Layers size={18} className="text-accent" /> Informe Financiero Detallado
            </h3>
            <p className="text-xs text-muted mt-0.5">
              Explora cada proyecto según su etapa contable o revisa la tabla de respaldo bancario por creador.
            </p>
          </div>

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
            <button
              type="button"
              onClick={() => setReportTab('nomina_equipo')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
                reportTab === 'nomina_equipo' ? 'bg-violet text-on-accent' : 'text-muted hover:text-text'
              }`}
            >
              <Landmark size={12} /> Respaldo Pagos Equipo ({workers.length})
            </button>
          </div>
        </div>

        {reportTab === 'nomina_equipo' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs border-b border-line">
                  <th className="py-2.5 pr-4 font-medium">Creador</th>
                  <th className="py-2.5 pr-4 font-medium">Rol</th>
                  <th className="py-2.5 pr-4 font-medium">Datos bancarios (para pago manual)</th>
                  <th className="py-2.5 pr-4 font-medium">Proyectos en período</th>
                  <th className="py-2.5 pr-4 font-medium text-right">50% (Aprob. Senda)</th>
                  <th className="py-2.5 pr-4 font-medium text-right">100% (Aprob. Cliente)</th>
                  <th className="py-2.5 font-medium text-right">Total a Pagar</th>
                </tr>
              </thead>
              <tbody>
                {workerPayoutBreakdown.map(item => (
                  <tr key={item.worker.id} className="border-b border-line/50 hover:bg-surface-3/50 transition-colors">
                    <td className="py-3 pr-4">
                      <p className="font-medium">{item.worker.name}</p>
                      <p className="text-[11px] text-muted-2 font-tech">{item.worker.email || 'Sin correo'}</p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className={`text-xs px-2 py-0.5 rounded-md font-medium ${
                        item.worker.role === 'clipper' ? 'bg-accent-dim text-accent' : 'bg-mint-dim text-mint'
                      }`}>
                        {item.worker.role === 'clipper' ? 'Clipper' : 'Editor(a)'}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-xs">
                      {item.worker.bankInfo ? (
                        <span className="font-tech text-text">{item.worker.bankInfo}</span>
                      ) : (
                        <span className="text-muted-2 italic">No registrado en perfil todavía</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 font-tech text-xs">{item.totalAssignedProjects}</td>
                    <td className="py-3 pr-4 text-right font-tech text-xs text-amber">
                      ${item.earned50.toLocaleString('es-CO')}
                    </td>
                    <td className="py-3 pr-4 text-right font-tech text-xs text-mint">
                      ${item.earned100.toLocaleString('es-CO')}
                    </td>
                    <td className="py-3 text-right font-tech text-sm font-bold text-text">
                      ${item.totalPayable.toLocaleString('es-CO')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : activeRows.length === 0 ? (
          <div className="text-center py-10 bg-surface-3/40 rounded-xl border border-dashed border-line">
            <Sparkles size={24} className="text-muted-2 mx-auto mb-2" />
            <p className="text-sm font-medium">No hay proyectos en esta categoría para el período seleccionado</p>
            <p className="text-xs text-muted mt-1">Prueba cambiando el filtro superior a "Este Mes" o "Todo el Historial".</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted text-xs border-b border-line">
                  <th className="py-2.5 pr-3 font-medium">Proyecto / Marca</th>
                  <th className="py-2.5 pr-3 font-medium">Fecha</th>
                  <th className="py-2.5 pr-3 font-medium">Videos</th>
                  <th className="py-2.5 pr-3 font-medium">Equipo asignado</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Ingreso Bruto</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Pago Clipper + Editor</th>
                  <th className="py-2.5 pr-3 font-medium text-right">Neto SENDA</th>
                  <th className="py-2.5 font-medium text-right">Estado / Acción</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map(r => (
                  <tr key={r.id} className="border-b border-line/50 hover:bg-surface-3/50 transition-colors">
                    <td className="py-3 pr-3">
                      <p className="font-medium">{r.name}</p>
                      <p className="text-[11px] text-muted-2">{r.brand} · {r.statusLabel}</p>
                    </td>
                    <td className="py-3 pr-3 font-tech text-xs text-muted">{r.date}</td>
                    <td className="py-3 pr-3 font-tech text-xs">{r.videoCount}</td>
                    <td className="py-3 pr-3 text-xs">
                      <span className="text-text">{r.clipperName}</span>
                      <span className="text-muted-2"> + </span>
                      <span className="text-text">{r.editorName}</span>
                    </td>
                    <td className="py-3 pr-3 text-right font-tech text-xs font-medium">
                      ${r.grossAmount.toLocaleString('es-CO')}
                    </td>
                    <td className="py-3 pr-3 text-right font-tech text-xs text-muted">
                      -${r.creatorCostTotal.toLocaleString('es-CO')}
                      <span className="block text-[10px] text-muted-2">
                        C: ${r.clipperPayTotal} · E: ${r.editorPayTotal}
                      </span>
                    </td>
                    <td className="py-3 pr-3 text-right font-tech text-sm font-bold text-mint">
                      ${r.netMargin.toLocaleString('es-CO')}
                    </td>
                    <td className="py-3 text-right">
                      <div className="inline-flex items-center gap-1.5 justify-end">
                        {r.videoRef && (
                          <>
                            <button
                              type="button"
                              onClick={() => togglePaid50(r.videoRef!.id)}
                              className={`text-[11px] font-tech px-2 py-1 rounded border transition-colors ${
                                r.paid50 ? 'bg-mint-dim text-mint border-mint/30' : 'bg-surface-3 text-muted border-line hover:text-text'
                              }`}
                              title="Marcar/desmarcar anticipo 50%"
                            >
                              50%
                            </button>
                            {r.stage !== 'aprobado_cliente' && (
                              <button
                                type="button"
                                onClick={() => approveFinal(r.videoRef!.id)}
                                className="text-[11px] font-tech px-2 py-1 rounded bg-accent-dim text-accent border border-accent/30 hover:bg-accent/20 transition-colors"
                                title="Aprobar cliente y liberar 100%"
                              >
                                Pasar a Neto (100%)
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => { setSelectedVideo(r.videoRef!); setView('tareas'); }}
                              className="w-7 h-7 rounded-md bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-accent transition-colors"
                              title="Ver proyecto en Tareas"
                            >
                              <Eye size={13} />
                            </button>
                          </>
                        )}
                        {!r.videoRef && (
                          <button
                            type="button"
                            onClick={() => setView('tareas')}
                            className="text-[11px] text-amber hover:underline flex items-center gap-1"
                          >
                            Asignar en Tareas
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

      {/* Bitácora de Cierres Financieros realizados */}
      {financeClosings.length > 0 && (
        <div className="bg-surface-2 border border-line rounded-xl p-5 space-y-3">
          <h3 className="font-display text-base font-semibold flex items-center gap-2">
            <History size={16} className="text-mint" /> Bitácora de Cierres de Día (Respaldos Generados)
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
            {financeClosings.slice(0, 6).map(c => (
              <div key={c.id} className="bg-surface-3 border border-line rounded-lg p-3 text-xs space-y-1">
                <div className="flex items-center justify-between text-muted-2 font-tech">
                  <span>{new Date(c.closedAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  <span className="text-mint font-semibold flex items-center gap-1"><CheckCircle2 size={11} /> Respaldado</span>
                </div>
                <p className="font-medium truncate">{c.periodLabel}</p>
                <div className="flex items-center justify-between pt-1 border-t border-line/60 font-tech">
                  <span className="text-muted">Bruto Senda: \${c.accruedGrossRevenue.toLocaleString('es-CO')}</span>
                  <span className="text-mint font-bold">Neto: \${c.realizedNetRevenue.toLocaleString('es-CO')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
