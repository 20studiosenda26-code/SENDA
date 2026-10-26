import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { Briefcase, ArrowRight, FileText, Settings, Search, PackageOpen, Download, AlertCircle, FileCheck, CheckSquare, Square } from 'lucide-react';
import { LiquidMetalButton } from '../components/ui/liquid-metal-button';

type ClientTab = 'feedback' | 'new_order' | 'billing';

export function ClientsView() {
  const [activeTab, setActiveTab] = useState<ClientTab>('feedback');
  
  return (
    <div className="space-y-6 animate-fade-in pb-20">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-display font-bold text-white mb-2 tracking-tight">Clientes y Pedidos Comerciales</h1>
          <p className="text-sm text-[var(--surface-4)]">Portal de revisión de videos por cliente (1 ronda de feedback), ingreso con factura 100% pagada y expedientes</p>
        </div>
        <div className="flex bg-[var(--surface-2)] p-1 rounded-xl border border-[var(--border-line)]">
          <button
            onClick={() => setActiveTab('feedback')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'feedback'
                ? 'bg-[var(--accent)]/10 text-[var(--accent)] shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-[var(--surface-3)]'
            }`}
          >
            <ArrowRight className="w-4 h-4" />
            Clientes · Videos y Feedback
          </button>
          <button
            onClick={() => setActiveTab('new_order')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'new_order'
                ? 'bg-[var(--accent)]/10 text-[var(--accent)] shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-[var(--surface-3)]'
            }`}
          >
            <Briefcase className="w-4 h-4" />
            Nuevo Pedido (Pago 100%)
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              activeTab === 'billing'
                ? 'bg-[var(--accent)]/10 text-[var(--accent)] shadow-sm'
                : 'text-gray-400 hover:text-white hover:bg-[var(--surface-3)]'
            }`}
          >
            <FileText className="w-4 h-4" />
            Facturas y Expedientes
          </button>
        </div>
      </div>

      {activeTab === 'billing' && <BillingPanel />}
    </div>
  );
}

function BillingPanel() {
  const { orders, financeSettings, liquidateOrders } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [isLiquidationMode, setIsLiquidationMode] = useState(false);
  const [selectedForLiquidation, setSelectedForLiquidation] = useState<Set<string>>(new Set());

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      const match = o.brand.toLowerCase().includes(searchTerm.toLowerCase());
      return match;
    });
  }, [orders, searchTerm]);

  const handleToggleSelection = (orderId: string) => {
    const next = new Set(selectedForLiquidation);
    if (next.has(orderId)) next.delete(orderId);
    else next.add(orderId);
    setSelectedForLiquidation(next);
  };

  const executeLiquidation = () => {
    const ordersToLiquidate = orders.filter(o => selectedForLiquidation.has(o.id));
    if (ordersToLiquidate.length === 0) return;

    const printWindow = window.open('', '', 'width=900,height=700');
    if (!printWindow) {
      alert("Por favor habilita las ventanas emergentes para generar el PDF.");
      return;
    }

    const htmlContent = `
      <html>
        <head>
          <title>Liquidación de Proyectos - SENDA</title>
          <style>
            @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&family=Inter:wght@400;500&display=swap');
            body { font-family: 'Inter', sans-serif; padding: 40px; color: #131519; }
            h1 { font-family: 'Space Grotesk', sans-serif; color: #0EA6B8; font-size: 24px; margin-bottom: 5px; }
            p { color: #666; font-size: 14px; margin-top: 0; margin-bottom: 30px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 14px; }
            th, td { border: 1px solid #e5e7eb; padding: 12px 16px; text-align: left; }
            th { background: #f9fafb; font-weight: 500; color: #374151; }
            .total-row td { font-weight: bold; background: #f3f4f6; }
            .footer { margin-top: 40px; font-size: 12px; color: #9ca3af; text-align: center; }
          </style>
        </head>
        <body>
          <h1>Resumen de Liquidación de Proyectos</h1>
          <p>Generado el: ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString()} · SENDA Studio</p>
          <table>
            <thead>
              <tr>
                <th>Cliente / Proyecto</th>
                <th>Folio</th>
                <th>Estado</th>
                <th>Cant. Videos</th>
                <th>Total Facturado</th>
              </tr>
            </thead>
            <tbody>
              ${ordersToLiquidate.map(o => {
                const total = (o.videoCount || 0) * financeSettings.clientPricePerVideo;
                return `
                  <tr>
                    <td><strong>${o.brand}</strong></td>
                    <td>FAC-${o.createdAt.slice(0, 10).replace(/-/g, '')}-${o.brand.substring(0, 4).toUpperCase()}-101</td>
                    <td>Completado y Liquidado</td>
                    <td>${o.videoCount}</td>
                    <td>$${total}</td>
                  </tr>
                `;
              }).join('')}
              <tr class="total-row">
                <td colspan="3" style="text-align: right;">Totales de Liquidación</td>
                <td>${ordersToLiquidate.reduce((sum, o) => sum + (o.videoCount || 0), 0)}</td>
                <td>$${ordersToLiquidate.reduce((sum, o) => sum + ((o.videoCount || 0) * financeSettings.clientPricePerVideo), 0)}</td>
              </tr>
            </tbody>
          </table>
          <div class="footer">Este documento sirve como comprobante de que los proyectos fueron finalizados y eliminados de la plataforma operativa de SENDA.</div>
          <script>
            window.onload = () => {
              window.print();
              setTimeout(() => { window.close(); }, 500);
            }
          </script>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();

    // Eliminar del store (Supabase persistirá este cambio automáticamente)
    liquidateOrders(Array.from(selectedForLiquidation));
    setSelectedForLiquidation(new Set());
    setIsLiquidationMode(false);
  };

  return (
    <div className="bg-[var(--surface-2)] border border-[var(--border-line)] rounded-xl p-6 shadow-sm">
      <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <div className="relative w-full md:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cliente o marca en los expedientes..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full bg-[var(--surface-1)] border border-[var(--border-line)] rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[var(--accent)] transition-colors"
          />
        </div>
        
        <div className="flex gap-3">
          {isLiquidationMode ? (
            <>
              <button
                onClick={() => {
                  setIsLiquidationMode(false);
                  setSelectedForLiquidation(new Set());
                }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-300 bg-[var(--surface-3)] hover:bg-gray-700 transition-colors"
              >
                Cancelar
              </button>
              <LiquidMetalButton
                onClick={executeLiquidation}
                disabled={selectedForLiquidation.size === 0}
                className="text-sm px-4 py-2"
              >
                Generar PDF y Borrar ({selectedForLiquidation.size})
              </LiquidMetalButton>
            </>
          ) : (
            <button
              onClick={() => setIsLiquidationMode(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-[var(--accent)] bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 border border-[var(--accent)]/20 transition-all"
            >
              <FileCheck className="w-4 h-4" />
              Modo Liquidación
            </button>
          )}
        </div>
      </div>

      {isLiquidationMode && (
        <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm text-gray-300">
            <strong className="text-amber-400 block mb-1">Modo de Liquidación Activo</strong>
            Solo puedes seleccionar pedidos que estén marcados como <strong>Finalizados</strong>. Al generar el PDF, estos proyectos se borrarán permanentemente del sistema para no acumular histórico.
          </div>
        </div>
      )}

      {filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center border border-dashed border-[var(--border-line)] rounded-xl bg-[var(--surface-1)]">
          <PackageOpen className="w-12 h-12 text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">No hay expedientes</h3>
          <p className="text-sm text-gray-400 max-w-sm">No hay pedidos registrados. Todo pedido pagado al 100% aparecerá aquí.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredOrders.map(order => {
            const isFinished = order.status === 'finalizado';
            const isSelected = selectedForLiquidation.has(order.id);
            const canSelect = isLiquidationMode && isFinished;
            
            return (
              <div 
                key={order.id} 
                className={`flex flex-col p-4 rounded-xl border transition-all ${
                  isSelected 
                    ? 'bg-[var(--accent)]/10 border-[var(--accent)] shadow-[0_0_15px_rgba(53,214,228,0.15)]' 
                    : 'bg-[var(--surface-1)] border-[var(--border-line)] hover:border-gray-600'
                } ${canSelect ? 'cursor-pointer' : ''}`}
                onClick={() => {
                  if (canSelect) handleToggleSelection(order.id);
                }}
              >
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    {isLiquidationMode && (
                      <div className="shrink-0">
                        {isSelected ? (
                          <CheckSquare className="w-5 h-5 text-[var(--accent)]" />
                        ) : (
                          <Square className={`w-5 h-5 ${isFinished ? 'text-gray-400' : 'text-gray-700'}`} />
                        )}
                      </div>
                    )}
                    <div className="w-10 h-10 rounded-lg bg-[var(--surface-3)] flex items-center justify-center font-bold text-white shadow-sm border border-[var(--border-line)]">
                      {order.brand.charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="text-white font-medium text-base truncate">{order.brand}</h3>
                      <p className="text-xs text-gray-400">{order.videoCount} video(s)</p>
                    </div>
                  </div>
                  <span className="text-[10px] px-2 py-1 rounded bg-[var(--accent)]/10 text-[var(--accent)] font-semibold border border-[var(--accent)]/20">
                    {order.status.toUpperCase().replace('_', ' ')}
                  </span>
                </div>
                
                <div className="mt-auto pt-4 border-t border-[var(--border-line)] flex justify-between items-end">
                  <div>
                    <span className="text-xs text-gray-500 uppercase font-semibold">Facturado</span>
                    <p className="text-lg font-bold text-white">
                      ${(order.videoCount || 0) * financeSettings.clientPricePerVideo}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-gray-500 uppercase font-semibold">Fecha de Pedido</span>
                    <p className="text-sm font-medium text-gray-300">
                      {order.createdAt ? order.createdAt.slice(0, 10) : 'N/A'}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
