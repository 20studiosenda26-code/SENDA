import { useState, type ReactNode } from 'react';
import { AlertCircle, Check, Download, Loader2 } from 'lucide-react';
import { downloadMediaFile } from '../lib/supabaseClient';

/** Botón que SÍ descarga el archivo (también PDF guardados en otro sitio), con estado de carga y reintento.
 *  Un enlace con "download" no funciona cuando el archivo está en otro dominio: por eso se baja desde aquí. */
export function DownloadFileButton({ url, fileName, label, className = '', icon }: {
  url?: string | null; fileName?: string | null; label: string; className?: string; icon?: ReactNode;
}) {
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  return (
    <button
      type="button"
      disabled={!url || state === 'loading'}
      onClick={async e => {
        e.stopPropagation();
        if (!url) return;
        setState('loading');
        try {
          await downloadMediaFile(url, fileName);
          setState('done');
        } catch {
          // Último recurso: abrir el archivo en otra pestaña para guardarlo desde ahí
          window.open(url, '_blank', 'noopener');
          setState('error');
        } finally {
          setTimeout(() => setState('idle'), 2200);
        }
      }}
      className={`inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${className}`}
    >
      {state === 'loading' ? <Loader2 size={13} className="animate-spin" /> : state === 'done' ? <Check size={13} /> : state === 'error' ? <AlertCircle size={13} /> : (icon || <Download size={13} />)}
      {state === 'loading' ? 'Descargando…' : state === 'done' ? 'Descargado' : state === 'error' ? 'Abierto en otra pestaña' : label}
    </button>
  );
}
