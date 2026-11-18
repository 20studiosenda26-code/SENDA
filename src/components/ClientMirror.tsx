import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Loader2, RefreshCw, TriangleAlert } from 'lucide-react';
import { useStore } from '../store';
import { clientShownUrl, clientViewKey } from '../lib/clientSync';
import { extractGoogleDriveId, fetchDriveFileName, loadShared } from '../lib/supabaseClient';
import type { ClientView, Video } from '../types';

const sameFile = (a?: string | null, b?: string | null) => {
  if (!a || !b) return a === b;
  const ia = extractGoogleDriveId(a);
  const ib = extractGoogleDriveId(b);
  return ia && ib ? ia === ib : a === b;
};

/** Solo admin: comprueba en vivo qué video tiene realmente el visor del cliente y lo corrige con un clic. */
export function ClientMirror({ video, clientId }: { video: Video; clientId: string | null }) {
  const { resyncClientView } = useStore();
  const [state, setState] = useState<'loading' | 'ok' | 'diff' | 'none'>('loading');
  const [clientName, setClientName] = useState<string | null>(null);
  const expected = clientShownUrl(video);
  const delivered = Boolean(video.publishedToClient || video.qc === 'aprobado_senda' || video.qc === 'aprobado_cliente');

  const check = useCallback(async () => {
    if (!clientId || !delivered || !expected) { setState('none'); return; }
    const view = await loadShared<ClientView>(clientViewKey(clientId));
    const v = view?.brands.flatMap(b => b.videos).find(x => x.id === video.id);
    const remote = v?.finalVideos?.[0]?.fileUrl || null;
    if (sameFile(remote, expected)) {
      setState('ok');
      void fetchDriveFileName(remote).then(setClientName);
    } else {
      setState('diff');
    }
  }, [clientId, delivered, expected, video.id]);

  useEffect(() => {
    setState('loading');
    void check();
    const iv = setInterval(() => { if (document.visibilityState === 'visible') void check(); }, 8000);
    return () => clearInterval(iv);
  }, [check]);

  if (state === 'none') return null;
  if (state === 'loading') {
    return <p className="text-[11px] text-muted-2 flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Comprobando lo que ve el cliente…</p>;
  }
  if (state === 'ok') {
    return (
      <p className="text-[11px] text-mint bg-mint-dim/40 border border-mint/30 rounded-lg px-3 py-2 flex items-center gap-1.5">
        <CheckCircle2 size={13} /> El cliente ve este mismo video{clientName ? <span className="font-tech text-muted-2"> · {clientName}</span> : null}
      </p>
    );
  }
  return (
    <div className="text-[11px] text-amber bg-amber-dim/40 border border-amber/30 rounded-lg px-3 py-2 flex items-center gap-2 flex-wrap">
      <TriangleAlert size={13} className="shrink-0" />
      <span>El visor del cliente todavía no tiene este video. Se está copiando solo…</span>
      <button type="button" onClick={() => { resyncClientView(); setTimeout(() => void check(), 2500); }}
        className="ml-auto flex items-center gap-1 text-accent hover:text-accent-strong font-semibold">
        <RefreshCw size={12} /> Sincronizar ahora
      </button>
    </div>
  );
}
