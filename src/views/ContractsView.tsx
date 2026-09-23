import { CONTRACTS } from '../data';
import { FileText, Download, Eye } from 'lucide-react';

export function ContractsView() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="bg-surface-2 border border-line rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-accent-dim flex items-center justify-center">
            <FileText size={20} className="text-accent" />
          </div>
          <div>
            <h2 className="font-display text-lg font-semibold">Mis Contratos</h2>
            <p className="text-sm text-muted">Documentos vigentes y historial</p>
          </div>
        </div>
      </div>

      {CONTRACTS.map(c => (
        <div key={c.id} className="bg-surface-2 border border-line rounded-xl p-5 hover:border-accent/30 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-surface-3 flex items-center justify-center shrink-0">
                <FileText size={18} className="text-muted" />
              </div>
              <div>
                <p className="font-medium">{c.type}</p>
                <p className="text-sm text-muted mt-0.5">{c.worker} · {c.role}</p>
                <div className="flex gap-4 mt-2 text-xs text-muted-2">
                  <span>Inicio: {c.start}</span>
                  <span>Fin: {c.end}</span>
                  <span className="text-mint">{c.status}</span>
                </div>
              </div>
            </div>
            <div className="flex gap-2 shrink-0">
              <button className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-accent transition-colors">
                <Eye size={16} />
              </button>
              <button className="w-9 h-9 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-accent transition-colors">
                <Download size={16} />
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
