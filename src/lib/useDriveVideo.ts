// Reproducción de videos de Google Drive dentro de SENDA con la línea de tiempo SIEMPRE enlazada.
//
// Por qué: Drive entrega el video "en streaming" sin permitir adelantar ni conocer la duración
// (el reproductor reporta duración infinita y ignora currentTime). Aquí el video se descarga una
// vez como archivo local (blob): la duración es exacta y se puede saltar a cualquier segundo.
// Si la descarga no es posible se prueba el streaming y, solo como último recurso, el visor de Google.
import { useCallback, useEffect, useState } from 'react';
import {
  extractGoogleDriveId, getGoogleDriveApiKey, getGoogleDriveStreamCandidates, isGoogleDriveUrl,
} from './supabaseClient';

const MAX_BLOB_BYTES = 300 * 1024 * 1024; // por encima de esto se usa streaming
const cache = new Map<string, string>(); // id de Drive -> URL local (blob)
const cacheOrder: string[] = [];

function remember(id: string, url: string) {
  cache.set(id, url);
  cacheOrder.push(id);
  while (cacheOrder.length > 5) {
    const old = cacheOrder.shift()!;
    const u = cache.get(old);
    cache.delete(old);
    if (u) URL.revokeObjectURL(u);
  }
}

async function downloadAsBlob(id: string, signal: AbortSignal): Promise<string | null> {
  const apiKey = getGoogleDriveApiKey();
  if (!apiKey) return null;
  const k = encodeURIComponent(apiKey);
  const urls = [
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media&key=${k}`,
    `https://www.googleapis.com/drive/v3/files/${id}?alt=media&acknowledgeAbuse=true&key=${k}`,
  ];
  for (const u of urls) {
    try {
      const res = await fetch(u, { signal });
      if (!res.ok) continue;
      const len = Number(res.headers.get('content-length')) || 0;
      if (len > MAX_BLOB_BYTES) { await res.body?.cancel(); return null; }
      const buf = await res.blob();
      if (buf.size === 0) continue;
      // El tipo debe ser de video para que el reproductor lo acepte
      const typed = buf.type.startsWith('video/') ? buf : new Blob([buf], { type: 'video/mp4' });
      return URL.createObjectURL(typed);
    } catch {
      if (signal.aborted) return null;
    }
  }
  return null;
}

export interface DriveVideo {
  /** Dirección que debe usar el <video> (null mientras carga) */
  src: string | null;
  loading: boolean;
  /** true solo si NADA funcionó y hay que usar el visor de Google */
  failed: boolean;
  /** Llamar desde onError del <video> */
  onError: () => void;
}

export function useDriveVideo(url: string | null | undefined): DriveVideo {
  const isDrive = Boolean(url && isGoogleDriveUrl(url));
  const id = isDrive ? extractGoogleDriveId(url) : null;
  const apiKey = isDrive ? getGoogleDriveApiKey() : '';
  const [blobUrl, setBlobUrl] = useState<string | null>(id ? cache.get(id) || null : null);
  const [downloading, setDownloading] = useState(Boolean(id && !cache.has(id)));
  const [streamIdx, setStreamIdx] = useState(0);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setStreamIdx(0);
    setFailed(false);
    if (!id) { setBlobUrl(null); setDownloading(false); return; }
    const cached = cache.get(id);
    if (cached) { setBlobUrl(cached); setDownloading(false); return; }
    setBlobUrl(null);
    setDownloading(true);
    const ctrl = new AbortController();
    void downloadAsBlob(id, ctrl.signal).then(u => {
      if (ctrl.signal.aborted) { if (u) URL.revokeObjectURL(u); return; }
      if (u) { remember(id, u); setBlobUrl(u); }
      setDownloading(false);
    });
    return () => ctrl.abort();
  }, [id, apiKey]);

  const candidates = isDrive && url ? getGoogleDriveStreamCandidates(url) : [];

  const onError = useCallback(() => {
    if (blobUrl && id) {
      // Un archivo local que no se reproduce (formato) no mejora con otra ruta: se descarta y se usa streaming
      cache.delete(id);
      setBlobUrl(null);
      return;
    }
    if (streamIdx < candidates.length - 1) setStreamIdx(i => i + 1);
    else setFailed(true);
  }, [blobUrl, id, streamIdx, candidates.length]);

  if (!url) return { src: null, loading: false, failed: false, onError };
  if (!isDrive) return { src: url, loading: false, failed: false, onError };
  if (downloading) return { src: null, loading: true, failed: false, onError };
  if (blobUrl) return { src: blobUrl, loading: false, failed: false, onError };
  if (failed || candidates.length === 0) return { src: null, loading: false, failed: true, onError };
  return { src: candidates[streamIdx], loading: false, failed: false, onError };
}
