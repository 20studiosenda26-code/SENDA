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

// Memoriza si el bucket de Supabase Storage existe para NUNCA hacer doble subida ni perder segundos
let storageBucketAvailable: boolean | null = null;

// Sube cualquier archivo a máxima velocidad y reporta porcentaje 100% real (nunca retrocede)
export async function uploadSharedFile(
  file: File,
  folder: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  let highestPct = 0;
  const report = (p: number) => {
    const clamped = Math.max(1, Math.min(100, Math.round(p)));
    if (clamped > highestPct) {
      highestPct = clamped;
      if (onProgress) onProgress(highestPct);
    }
  };

  report(2);

  // 1. Imágenes: compresión instantánea por hardware en Canvas (< 200ms)
  if (file.type.startsWith("image/") && typeof document !== "undefined") {
    try {
      report(15);
      const bmpUrl = URL.createObjectURL(file);
      const compressed = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(bmpUrl);
          report(60);
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
          if (!ctx) { reject(new Error("no-ctx")); return; }
          ctx.drawImage(img, 0, 0, w, h);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = err => {
          URL.revokeObjectURL(bmpUrl);
          reject(err);
        };
        img.src = bmpUrl;
      });
      report(100);
      return compressed;
    } catch {
      // Continúa abajo si no se pudo comprimir
    }
  }

  // 2. Si Supabase Storage está disponible, subir directo por stream binario XHR con progreso real de bytes
  if (supabase && supabaseUrl && supabaseAnonKey && storageBucketAvailable !== false) {
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      const uploadEndpoint = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/${MEDIA_BUCKET}/${path}`;

      const uploadedOk = await new Promise<boolean>(resolve => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", uploadEndpoint, true);
        xhr.setRequestHeader("Authorization", `Bearer ${supabaseAnonKey}`);
        xhr.setRequestHeader("apikey", supabaseAnonKey);
        xhr.setRequestHeader("x-upsert", "true");
        xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");

        xhr.upload.onprogress = e => {
          if (e.lengthComputable && e.total > 0) {
            const pct = 5 + (e.loaded / e.total) * 92;
            report(pct);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            storageBucketAvailable = true;
            resolve(true);
          } else {
            storageBucketAvailable = false;
            resolve(false);
          }
        };
        xhr.onerror = () => {
          storageBucketAvailable = false;
          resolve(false);
        };
        xhr.send(file);
      });

      if (uploadedOk) {
        const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
        if (data?.publicUrl) {
          report(100);
          return data.publicUrl;
        }
      }
    } catch {
      storageBucketAvailable = false;
    }
  }

  // 3. Subida directa de alta velocidad por bloques grandes (2.2MB x 6 canales paralelos)
  const mediaId = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Caché local inmediata: quien sube el archivo lo tiene disponible al instante
  const localObjUrl = URL.createObjectURL(file);
  memoryBlobUrlCache.set(`senda-media://${mediaId}`, localObjUrl);
  void idbSet(mediaId, file);

  // Lectura rápida en memoria (avanza del 2% al 15%)
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = e => {
      if (e.lengthComputable && e.total > 0) {
        report(2 + (e.loaded / e.total) * 13);
      }
    };
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  report(16);

  if (supabase) {
    // Bloques grandes de 2.2MB con 6 hilos en paralelo para reducir peticiones HTTP a menos de la mitad
    const CHUNK_SIZE = 2200000;
    const totalChunks = Math.max(1, Math.ceil(dataUrl.length / CHUNK_SIZE));
    const chunkKeys: string[] = new Array(totalChunks);
    const tasks: { index: number; key: string; data: string }[] = [];

    for (let i = 0; i < totalChunks; i++) {
      const chunkKey = `${mediaId}_part_${i}`;
      chunkKeys[i] = chunkKey;
      tasks.push({
        index: i,
        key: chunkKey,
        data: dataUrl.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      });
    }

    let completedChunks = 0;
    const CONCURRENCY = 6;
    let cursor = 0;

    const workers = Array.from({ length: Math.min(CONCURRENCY, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const currentIndex = cursor++;
        const item = tasks[currentIndex];
        await supabase.from("platform_kv").upsert({
          key: item.key,
          value: item.data,
          updated_at: new Date().toISOString(),
        });
        completedChunks++;
        // Avanza de forma estrictamente lineal del 16% al 96% según los bloques reales terminados
        report(16 + (completedChunks / totalChunks) * 80);
      }
    });

    await Promise.all(workers);

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
