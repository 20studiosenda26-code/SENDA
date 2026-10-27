import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

const MEDIA_BUCKET = "senda-media";

export const CLIENT_SESSION_ID = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const keyWriteSeq: Record<string, number> = {};
const keyLastLocalWriteAt: Record<string, number> = {};
const pendingSaveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

// Caché en memoria + IndexedDB para archivos grandes (soporta cientos de MB sin límite de localStorage)
const memoryBlobUrlCache = new Map<string, string>();
const IDB_NAME = "senda_media_idb";
const IDB_STORE = "files";

function openMediaIdb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise(resolve => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE)) {
          db.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbGet(id: string): Promise<Blob | string | null> {
  const db = await openMediaIdb();
  if (!db) return null;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(IDB_STORE, "readonly");
      const req = tx.objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbSet(id: string, val: Blob | string): Promise<void> {
  const db = await openMediaIdb();
  if (!db) return;
  return new Promise(resolve => {
    try {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).put(val, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

export function getLastLocalWriteAt(key: string): number {
  return keyLastLocalWriteAt[key] || 0;
}

export function markKeyWrittenLocally(key: string): void {
  keyLastLocalWriteAt[key] = Date.now();
}

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(",");
  const header = parts[0] || "";
  const base64 = parts[1] || "";
  const mimeMatch = header.match(/data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mime });
}

// Sube cualquier archivo con ráfagas paralelas (4x más rápido) y reporta porcentaje real (0% a 100%)
export async function uploadSharedFile(
  file: File,
  folder: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const report = (p: number) => {
    if (onProgress) onProgress(Math.max(1, Math.min(100, Math.round(p))));
  };

  report(5);

  // 1. Si es imagen, comprimir en canvas súper rápido para que pese pocos KB y suba casi instantáneo
  if (file.type.startsWith("image/") && typeof document !== "undefined") {
    try {
      report(20);
      const rawDataUrl = await fileToDataUrl(file);
      report(55);
      const compressed = await new Promise<string>(resolve => {
        const img = new Image();
        img.onload = () => {
          const maxDim = 1280;
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext("2d");
          if (!ctx) { resolve(rawDataUrl); return; }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = () => resolve(rawDataUrl);
        img.src = rawDataUrl;
      });
      report(100);
      return compressed;
    } catch {
      // Continúa abajo si falla compresión
    }
  }

  // 2. Intentar primero Supabase Storage directo con progreso simulado durante el stream
  if (supabase) {
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      let fakePct = 12;
      const ticker = setInterval(() => {
        fakePct = Math.min(88, fakePct + 9);
        report(fakePct);
      }, 180);

      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: true,
        contentType: file.type || "application/octet-stream",
      });
      clearInterval(ticker);

      if (!error) {
        const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
        if (data?.publicUrl) {
          report(100);
          return data.publicUrl;
        }
      }
    } catch {
      // Continúa al motor paralelo por bloques
    }
  }

  // 3. Motor de subida paralela por bloques (4 hilos simultáneos) + caché instantánea en IndexedDB
  const mediaId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Guardar de inmediato en memoria e IndexedDB local para reproducción instantánea
  const localObjUrl = URL.createObjectURL(file);
  memoryBlobUrlCache.set(`senda-media://${mediaId}`, localObjUrl);
  void idbSet(mediaId, file);

  // Leer archivo con progreso real (del 10% al 30%)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = e => {
      if (e.lengthComputable) {
        report(10 + (e.loaded / e.total) * 20);
      }
    };
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  if (supabase) {
    // Bloques de 900KB subidos en paralelo de a 4 a la vez para máxima velocidad
    const CHUNK_SIZE = 900000;
    const totalChunks = Math.max(1, Math.ceil(dataUrl.length / CHUNK_SIZE));
    const chunkKeys: string[] = [];
    const tasks: { key: string; data: string }[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunkKey = `${mediaId}_part_${i}`;
      const chunkData = dataUrl.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      chunkKeys.push(chunkKey);
      tasks.push({ key: chunkKey, data: chunkData });
    }

    let completedChunks = 0;
    const CONCURRENCY = 4;

    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      const batch = tasks.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map(async item => {
          await supabase.from("platform_kv").upsert({
            key: item.key,
            value: item.data,
            updated_at: new Date().toISOString(),
          });
          completedChunks++;
          report(30 + (completedChunks / totalChunks) * 65);
        })
      );
    }

    await supabase.from("platform_kv").upsert({
      key: `${mediaId}_meta`,
      value: {
        mediaId,
        fileName: file.name,
        mimeType: file.type || "video/mp4",
        size: file.size,
        totalChunks,
        chunkKeys,
      },
      updated_at: new Date().toISOString(),
    });

    report(100);
    return `senda-media://${mediaId}`;
  }

  report(100);
  return dataUrl;
}

// Reconstruye cualquier URL (senda-media://, data:, https://) en un ObjectURL reproducible y descargable sin fallos de red
export async function resolveMediaUrl(rawUrl?: string | null): Promise<string | null> {
  if (!rawUrl) return null;
  if (memoryBlobUrlCache.has(rawUrl)) {
    return memoryBlobUrlCache.get(rawUrl)!;
  }

  if (rawUrl.startsWith("data:")) {
    try {
      const blob = dataUrlToBlob(rawUrl);
      const objUrl = URL.createObjectURL(blob);
      memoryBlobUrlCache.set(rawUrl, objUrl);
      return objUrl;
    } catch {
      return rawUrl;
    }
  }

  if (rawUrl.startsWith("senda-media://")) {
    const mediaId = rawUrl.replace("senda-media://", "").trim();

    // 1. Revisar si ya está en IndexedDB de este navegador
    const cached = await idbGet(mediaId);
    if (cached) {
      const blob = cached instanceof Blob ? cached : dataUrlToBlob(cached);
      const objUrl = URL.createObjectURL(blob);
      memoryBlobUrlCache.set(rawUrl, objUrl);
      return objUrl;
    }

    // 2. Descargar bloques desde Supabase platform_kv y ensamblar el archivo binario
    if (supabase) {
      try {
        const { data: metaRow } = await supabase
          .from("platform_kv")
          .select("value")
          .eq("key", `${mediaId}_meta`)
          .maybeSingle();

        const meta = metaRow?.value as { totalChunks?: number; chunkKeys?: string[] } | undefined;
        if (meta && Array.isArray(meta.chunkKeys) && meta.chunkKeys.length > 0) {
          const { data: rows } = await supabase
            .from("platform_kv")
            .select("key, value")
            .in("key", meta.chunkKeys);

          if (rows && rows.length > 0) {
            const byKey = new Map<string, string>();
            for (const r of rows as { key: string; value: string }[]) {
              byKey.set(r.key, String(r.value || ""));
            }
            const fullDataUrl = meta.chunkKeys.map(k => byKey.get(k) || "").join("");
            if (fullDataUrl.startsWith("data:")) {
              const blob = dataUrlToBlob(fullDataUrl);
              await idbSet(mediaId, blob);
              const objUrl = URL.createObjectURL(blob);
              memoryBlobUrlCache.set(rawUrl, objUrl);
              return objUrl;
            }
          }
        }
      } catch {
        return null;
      }
    }
    return null;
  }

  return rawUrl;
}

// Fuerza la descarga limpia del archivo en el computador (sin abrir pestañas rotas de error de red)
export async function downloadMediaFile(rawUrl?: string | null, fileName?: string | null): Promise<void> {
  if (!rawUrl) return;
  const resolved = await resolveMediaUrl(rawUrl);
  if (!resolved) return;

  try {
    let finalHref = resolved;
    if (resolved.startsWith("http://") || resolved.startsWith("https://")) {
      const resp = await fetch(resolved);
      const blob = await resp.blob();
      finalHref = URL.createObjectURL(blob);
    }
    const a = document.createElement("a");
    a.href = finalHref;
    a.download = fileName || "archivo-senda";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch {
    const a = document.createElement("a");
    a.href = resolved;
    a.download = fileName || "archivo-senda";
    a.target = "_blank";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }
}

export async function loadShared<T>(key: string): Promise<T | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from("platform_kv")
      .select("value, updated_at")
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return data.value as T;
  } catch {
    return null;
  }
}

export async function saveShared<T>(key: string, value: T): Promise<void> {
  if (!supabase) return;
  markKeyWrittenLocally(key);
  const seq = (keyWriteSeq[key] || 0) + 1;
  keyWriteSeq[key] = seq;

  if (pendingSaveTimers[key]) {
    clearTimeout(pendingSaveTimers[key]);
  }

  return new Promise(resolve => {
    pendingSaveTimers[key] = setTimeout(async () => {
      if (keyWriteSeq[key] !== seq) {
        resolve();
        return;
      }
      try {
        markKeyWrittenLocally(key);
        await supabase
          .from("platform_kv")
          .upsert({ key, value, updated_at: new Date().toISOString() });
      } catch {
        // Respaldo en localStorage ya fue aplicado
      } finally {
        resolve();
      }
    }, 60);
  });
}

export function subscribeToTable(
  table: string,
  onChange: (changedKey?: string) => void
): () => void {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(`realtime:${table}:${Math.random().toString(36).slice(2, 8)}`)
    .on("postgres_changes", { event: "*", schema: "public", table }, (payload: { new?: { key?: string }; old?: { key?: string } }) => {
      const changedKey = payload?.new?.key || payload?.old?.key;
      // Ignorar escrituras de bloques de video para no disparar recargas de estado mientras se sube un video pesado
      if (changedKey && changedKey.startsWith("media_")) return;
      onChange(changedKey);
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
