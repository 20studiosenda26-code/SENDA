import type { PayrollReportItem, Worker } from '../types';

const CURRENCY_SIGN = String.fromCharCode(36);

export function fmtMoneyClean(n: number): string {
  const clean = Math.round(Number(n) || 0);
  return CURRENCY_SIGN + clean.toLocaleString('es-CO');
}

export interface StructuredBankInfo {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  accountType: string;
}

/** Extrae Banco, Número de cuenta, Titular y Tipo desde bankInfo (sea JSON o texto separado por " | " o ",") */
export function parseBankInfo(raw?: string | null, fallbackName?: string): StructuredBankInfo {
  const defaultHolder = fallbackName || 'Titular sin especificar';
  if (!raw || !raw.trim()) {
    return {
      bankName: 'Sin registrar',
      accountNumber: 'Sin registrar',
      accountHolder: defaultHolder,
      accountType: 'Ahorros / Corriente',
    };
  }
  const trimmed = raw.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed = JSON.parse(trimmed) as Partial<StructuredBankInfo>;
      return {
        bankName: parsed.bankName?.trim() || 'Sin registrar',
        accountNumber: parsed.accountNumber?.trim() || 'Sin registrar',
        accountHolder: parsed.accountHolder?.trim() || defaultHolder,
        accountType: parsed.accountType?.trim() || 'Ahorros',
      };
    } catch {
      // cae al parser de texto
    }
  }
  const parts = trimmed.includes('|')
    ? trimmed.split('|').map(s => s.trim())
    : trimmed.split(',').map(s => s.trim());

  return {
    bankName: parts[0] || trimmed,
    accountNumber: parts[1] || 'Ver detalle en banco',
    accountHolder: parts[2] || defaultHolder,
    accountType: parts[3] || 'Cuenta bancaria',
  };
}

export function serializeBankInfo(info: StructuredBankInfo): string {
  return `${info.bankName.trim()} | ${info.accountNumber.trim()} | ${info.accountHolder.trim()} | ${info.accountType.trim()}`;
}

/** Abre el Informe PDF Oficial de Liquidación Individual (basado en todos los pedidos finalizados Aprobado Cliente del creador) */
export function openWorkerPayrollReportPdf(params: {
  worker: Worker;
  weekendLabel: string;
  items: PayrollReportItem[];
  totalAmount: number;
  isPaid: boolean;
  paidAt?: string | null;
  receiptFileName?: string | null;
}) {
  const { worker, weekendLabel, items, totalAmount, isPaid, paidAt, receiptFileName } = params;
  const bank = parseBankInfo(worker.bankInfo, worker.name);
  const generatedAt = paidAt
    ? new Date(paidAt).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
    : new Date().toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });

  const totalVideos = items.reduce((s, i) => s + i.videosCount, 0);

  const rowsHtml = items.map((item, idx) => `
    <tr>
      <td>${idx + 1}</td>
      <td><strong>${item.projectName}</strong></td>
      <td>${item.brandName}</td>
      <td>${item.date}</td>
      <td style="text-align:center;">${item.videosCount}</td>
      <td style="text-align:right;">${fmtMoneyClean(item.unitPay)}</td>
      <td style="text-align:right;font-weight:700;color:#0d9488;">${fmtMoneyClean(item.subtotal)}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="UTF-8" />
      <title>SENDA - Informe de Liquidacion - ${worker.name}</title>
      <style>
        * { box-sizing: border-box; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; }
        body { margin: 0; padding: 32px; color: #0f172a; background: #ffffff; font-size: 12px; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0ea5e9; padding-bottom: 16px; margin-bottom: 22px; }
        .brand { font-size: 22px; font-weight: 800; letter-spacing: 0.08em; color: #0f172a; }
        .badge { display: inline-block; padding: 4px 10px; border-radius: 999px; font-size: 10px; font-weight: 700; text-transform: uppercase; background: ${isPaid ? '#d1fae5' : '#fef3c7'}; color: ${isPaid ? '#065f46' : '#92400e'}; }
        .meta-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; margin-bottom: 22px; }
        .box { border: 1px solid #cbd5e1; border-radius: 10px; padding: 14px; background: #f8fafc; }
        .box-title { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 8px; letter-spacing: 0.04em; }
        .row { display: flex; justify-content: space-between; margin-bottom: 5px; font-size: 12px; }
        .summary-banner { display: flex; justify-content: space-between; align-items: center; background: #0f172a; color: #ffffff; border-radius: 12px; padding: 16px 20px; margin-bottom: 22px; }
        .summary-val { font-size: 26px; font-weight: 800; color: #6fe7c8; }
        h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.04em; color: #0f172a; margin: 18px 0 10px; border-left: 4px solid #0ea5e9; padding-left: 8px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th, td { border: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
        th { background: #f1f5f9; font-size: 10px; text-transform: uppercase; color: #334155; }
        .footer { margin-top: 28px; padding-top: 12px; border-top: 1px solid #cbd5e1; font-size: 10px; color: #64748b; display: flex; justify-content: space-between; }
        @media print { body { padding: 12px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <div>
          <div class="brand">SENDA · INFORME DE LIQUIDACIÓN INDIVIDUAL</div>
          <p style="margin:4px 0 0;color:#475569;">Proyectos finalizados y aprobados por el cliente (${weekendLabel})</p>
        </div>
        <div style="text-align:right;">
          <span class="badge">${isPaid ? 'Nómina Pagada y Transferida' : 'Informe Pre-cargado · Por Pagar'}</span>
          <p style="margin:6px 0 0;color:#475569;">Fecha: ${generatedAt}</p>
        </div>
      </div>

      <div class="meta-grid">
        <div class="box">
          <div class="box-title">Datos del Creador</div>
          <div class="row"><span style="color:#64748b;">Nombre:</span> <strong>${worker.name}</strong></div>
          <div class="row"><span style="color:#64748b;">Rol:</span> <strong>${worker.role === 'clipper' ? 'Clipper' : 'Editor(a)'}</strong></div>
          <div class="row"><span style="color:#64748b;">Correo:</span> <span>${worker.email || 'No registrado'}</span></div>
        </div>
        <div class="box">
          <div class="box-title">Cuenta Bancaria de Destino</div>
          <div class="row"><span style="color:#64748b;">Banco:</span> <strong>${bank.bankName}</strong></div>
          <div class="row"><span style="color:#64748b;">Número de cuenta:</span> <strong>${bank.accountNumber}</strong></div>
          <div class="row"><span style="color:#64748b;">Titular / Tipo:</span> <span>${bank.accountHolder} (${bank.accountType})</span></div>
        </div>
      </div>

      <div class="summary-banner">
        <div>
          <div style="font-size:11px;text-transform:uppercase;color:#94a3b8;font-weight:600;">Total Liquidado (Pedidos Aprobados Cliente)</div>
          <div style="font-size:12px;color:#cbd5e1;margin-top:3px;">${items.length} pedido(s) finalizado(s) · ${totalVideos} video(s) entregados${receiptFileName ? ` · Comprobante: ${receiptFileName}` : ''}</div>
        </div>
        <div class="summary-val">${fmtMoneyClean(totalAmount)}</div>
      </div>

      <h2>Detalle de Pedidos Finalizados (Aprobado Cliente)</h2>
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Proyecto</th>
            <th>Marca</th>
            <th>Fecha</th>
            <th style="text-align:center;">Videos</th>
            <th style="text-align:right;">Tarifa / Video</th>
            <th style="text-align:right;">Subtotal</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml || '<tr><td colspan="7" style="text-align:center;">Sin pedidos con estado Aprobado Cliente en este corte</td></tr>'}
        </tbody>
      </table>

      <div class="footer">
        <span>SENDA Platform · Informe automático sincronizado con el perfil del creador</span>
        <span>Documento oficial de respaldo de pago</span>
      </div>
      <script>
        window.onload = function() { setTimeout(function() { window.print(); }, 250); };
      </script>
    </body>
    </html>
  `;

  const win = window.open('', '_blank', 'width=980,height=780');
  if (win) {
    win.document.open();
    win.document.write(html);
    win.document.close();
  }
}
