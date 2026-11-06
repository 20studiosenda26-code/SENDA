import { useEffect, useState } from 'react';
import { Check, ExternalLink, FolderOpen, Pencil, X } from 'lucide-react';
import { useStore } from '../store';
import { extractDriveFolderId } from '../lib/supabaseClient';
import type { Order } from '../types';

/**
 * Carpeta de Google Drive de un proyecto (marca). Todos los videos del pedido
 * usan esta carpeta para el video final. Compacto, editable en línea.
 */
export function DriveFolderField({ order, compact = false }: { order: Order; compact?: boolean }) {
  const { updateOrder } = useStore();
  const saved = order.driveFolderUrl || '';
  const [editing, setEditing] = useState(!saved && !compact);
  const [draft, setDraft] = useState(saved);
  const [justSaved, setJustSaved] = useState(false);

  useEffect(() => { setDraft(saved); }, [saved]);

  const valid = !draft.trim() || Boolean(extractDriveFolderId(draft));

  const save = () => {
    if (!valid) return;
    updateOrder(order.id, { driveFolderUrl: draft.trim() || null });
    setEditing(false);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 1800);
  };

  if (!editing) {
    return (
      <div className={`flex items-center gap-2 rounded-lg border px-3 ${compact ? 'py-1.5' : 'py-2'} ${saved ? 'bg-mint/5 border-mint/30' : 'bg-surface-3 border-line border-dashed'}`}>
        <FolderOpen size={14} className={saved ? 'text-mint shrink-0' : 'text-muted-2 shrink-0'} />
        <span className="text-xs flex-1 min-w-0 truncate">
          {saved ? (
            <><span className="text-mint font-medium">Drive vinculado</span><span className="text-muted-2"> · videos finales de {order.brand}</span></>
          ) : (
            <span className="text-muted">Sin carpeta de Drive para este proyecto</span>
          )}
        </span>
        {justSaved && <Check size={14} className="text-mint animate-fadeIn" />}
        {saved && (
          <a href={saved} target="_blank" rel="noreferrer" title="Abrir carpeta" onClick={e => e.stopPropagation()}
            className="w-7 h-7 rounded-md flex items-center justify-center text-muted hover:text-mint hover:bg-mint/10 transition-colors">
            <ExternalLink size={13} />
          </a>
        )}
        <button type="button" onClick={e => { e.stopPropagation(); setEditing(true); }} title={saved ? 'Cambiar carpeta' : 'Vincular carpeta'}
          className="text-[11px] font-medium text-accent hover:text-accent-strong flex items-center gap-1 shrink-0">
          {saved ? <Pencil size={12} /> : <><FolderOpen size={12} /> Vincular Drive</>}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1" onClick={e => e.stopPropagation()}>
      <span className="text-[11px] font-medium text-muted flex items-center gap-1.5">
        <FolderOpen size={12} className="text-mint" /> Carpeta de Google Drive del proyecto (todos los videos de {order.brand})
      </span>
      <div className="flex items-center gap-2">
        <input
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') { setDraft(saved); setEditing(false); } }}
          placeholder="https://drive.google.com/drive/folders/..."
          className={`flex-1 bg-surface-2 border rounded-lg px-3 py-2 text-xs outline-none placeholder:text-muted-2 transition-colors ${valid ? 'border-line focus:border-mint' : 'border-red-500/60'}`}
        />
        <button type="button" onClick={save} disabled={!valid}
          className="h-8 px-3 rounded-lg bg-mint text-on-accent text-xs font-semibold flex items-center gap-1 disabled:opacity-40 disabled:cursor-not-allowed">
          <Check size={13} /> Guardar
        </button>
        {(saved || compact) && (
          <button type="button" onClick={() => { setDraft(saved); setEditing(false); }} title="Cancelar"
            className="w-8 h-8 rounded-lg bg-surface-3 border border-line flex items-center justify-center text-muted hover:text-text">
            <X size={13} />
          </button>
        )}
      </div>
      {!valid && <p className="text-[10px] text-red-400">Pega el enlace de una carpeta (debe contener /drive/folders/).</p>}
    </div>
  );
}
