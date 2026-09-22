import { useStore } from '../store';
import { useState } from 'react';
import { Folder, Film, ChevronRight, ChevronDown, CheckCircle2, Clock, Upload } from 'lucide-react';

export function CarpetaView() {
  const { brands, role, setSelectedVideo, setView, togglePaid50, approveFinal } = useStore();
  const [expanded, setExpanded] = useState<Set<string>>(new Set(brands.map(b => b.id)));

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="space-y-2">
        {brands.map(brand => (
          <div key={brand.id} className="bg-surface-2 border border-line rounded-xl overflow-hidden">
            <button
              onClick={() => toggle(brand.id)}
              className="w-full flex items-center gap-3 p-4 hover:bg-surface-3 transition-colors"
            >
              {expanded.has(brand.id) ? <ChevronDown size={18} className="text-muted" /> : <ChevronRight size={18} className="text-muted" />}
              <div className="w-10 h-10 rounded-lg bg-accent-dim flex items-center justify-center">
                <Folder size={18} className="text-accent" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium">{brand.name}</p>
                <p className="text-xs text-muted">{brand.videos.length} videos</p>
              </div>
            </button>
            {expanded.has(brand.id) && (
              <div className="border-t border-line">
                {brand.videos.map(v => (
                  <div key={v.id} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-3 transition-colors border-b border-line/50 last:border-0">
                    <div className="w-9 h-9 rounded bg-surface-3 flex items-center justify-center shrink-0">
                      <Film size={16} className="text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{v.name}</p>
                      <p className="text-xs text-muted">{v.clipperName} → {v.editorName} · {v.date}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {v.qc === 'aprobado_cliente' ? (
                        <span className="text-xs text-mint flex items-center gap-1"><CheckCircle2 size={14} /> Aprobado</span>
                      ) : v.qc === 'sin_iniciar' ? (
                        <span className="text-xs text-muted-2 flex items-center gap-1"><Clock size={14} /> Sin iniciar</span>
                      ) : (
                        <span className="text-xs text-amber">{v.qc.replace(/_/g, ' ')}</span>
                      )}
                      {role === 'admin' && (
                        <div className="flex gap-1 ml-2">
                          <button onClick={() => togglePaid50(v.id)} className={`text-xs px-2 py-1 rounded ${v.paid50 ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted'}`}>
                            50%
                          </button>
                          <button onClick={() => approveFinal(v.id)} className={`text-xs px-2 py-1 rounded ${v.paid100 ? 'bg-mint-dim text-mint' : 'bg-surface-3 text-muted'}`}>
                            100%
                          </button>
                        </div>
                      )}
                      <button
                        onClick={() => { setSelectedVideo(v); setView('tareas'); }}
                        className="text-muted hover:text-accent transition-colors"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
