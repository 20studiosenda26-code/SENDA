import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

const MEDIA_BUCKET = "senda-media";
const GDRIVE_BRIDGE_STORAGE_KEY = "senda_gdrive_bridge_url";
const GDRIVE_FOLDER_STORAGE_KEY = "senda_gdrive_folder_url";

// Límite para considerar un archivo "pequeño" (ej. imagen o clip corto de <= 10 seg ~ 12 MB)
export const SMALL_FILE_MAX_BYTES = 12 * 1024 * 1024;

export function getGoogleDriveBridgeUrl(): string {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(GDRIVE_BRIDGE_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  }
  return (import.meta.env.VITE_GDRIVE_BRIDGE_URL as string | undefined) || "";
}

export function setGoogleDriveBridgeUrl(url: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(GDRIVE_BRIDGE_STORAGE_KEY, url.trim());
  }
  if (supabase) {
    void supabase.from("platform_kv").upsert({
      key: "gdrive_config",
      value: { bridgeUrl: url.trim(), folderUrl: getGoogleDriveFolderUrl() },
      updated_at: new Date().toISOString(),
    });
  }
}

export function getGoogleDriveFolderUrl(): string {
  if (typeof window !== "undefined") {
    const saved = window.localStorage.getItem(GDRIVE_FOLDER_STORAGE_KEY);
    if (saved && saved.trim()) return saved.trim();
  }
  return (import.meta.env.VITE_GDRIVE_FOLDER_URL as string | undefined) || "";
}

export function setGoogleDriveFolderUrl(url: string): void {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(GDRIVE_FOLDER_STORAGE_KEY, url.trim());
  }
  if (supabase) {
    void supabase.from("platform_kv").upsert({
      key: "gdrive_config",
      value: { bridgeUrl: getGoogleDriveBridgeUrl(), folderUrl: url.trim() },
      updated_at: new Date().toISOString(),
    });
  }
}

// Sincronizar configuración de Google Drive guardada por el Admin para que todos los Clippers y Editores la usen automáticamente
if (supabase && typeof window !== "undefined") {
  void (async () => {
    try {
      const { data } = await supabase
        .from("platform_kv")
        .select("value")
        .eq("key", "gdrive_config")
        .maybeSingle();
      const val = data?.value as { bridgeUrl?: string; folderUrl?: string } | undefined;
      if (val?.bridgeUrl) window.localStorage.setItem(GDRIVE_BRIDGE_STORAGE_KEY, val.bridgeUrl);
      if (val?.folderUrl) window.localStorage.setItem(GDRIVE_FOLDER_STORAGE_KEY, val.folderUrl);
    } catch {
      // Ignorar
    }
  })();
}

// Extrae el ID de archivo de cualquier enlace de Google Drive
export function extractGoogleDriveId(url?: string | null): string | null {
  if (!url) return null;
  if (url.startsWith("gdrive://")) return url.replace("gdrive://", "").trim();
  const m1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  const m2 = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  const m3 = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (m3) return m3[1];
  return null;
}

export function isGoogleDriveUrl(url?: string | null): boolean {
  return Boolean(extractGoogleDriveId(url));
}

export function getGoogleDrivePreviewUrl(url?: string | null): string | null {
  const id = extractGoogleDriveId(url);
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview`;
}

export function getGoogleDriveDownloadUrl(url?: string | null): string | null {
  const id = extractGoogleDriveId(url);
  if (!id) return null;
  return `https://drive.google.com/uc?export=download&id=${id}`;
}

export const CLIENT_SESSION_ID = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const keyWriteSeq: Record<string, number> = {};
const keyLastLocalWriteAt: Record<string, number> = {};
const pendingSaveTimers: Record<string, ReturnType<typeof setTimeout>> = {};
const memoryBlobUrlCache = new Map<string, string>();

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

// Subida directa desde la plataforma hacia la carpeta de Google Drive mediante el puente de Apps Script con porcentaje real XHR
async function uploadViaGoogleDriveBridge(
  file: File,
  folder: string,
  bridgeUrl: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  // Leemos en base64 (del 1% al 15%) y enviamos por XHR midiendo cada byte real enviado a Google Drive (del 15% al 98%)
  const base64Data = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = e => {
      if (e.lengthComputable && e.total > 0 && onProgress) {
        onProgress(Math.max(1, Math.round((e.loaded / e.total) * 15)));
      }
    };
    reader.onload = () => {
      const res = String(reader.result || "");
      resolve(res.includes(",") ? res.split(",")[1] : res);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const payload = JSON.stringify({
    fileName: file.name,
    mimeType: file.type || "video/mp4",
    folder,
    base64: base64Data,
  });

  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", bridgeUrl, true);
    xhr.setRequestHeader("Content-Type", "text/plain;charset=utf-8");

    xhr.upload.onprogress = e => {
      if (e.lengthComputable && e.total > 0 && onProgress) {
        const pct = 15 + Math.round((e.loaded / e.total) * 82);
        onProgress(Math.min(98, pct));
      }
    };

    xhr.onload = () => {
      try {
        const json = JSON.parse(xhr.responseText || "{}");
        if (json.fileId) {
          if (onProgress) onProgress(100);
          resolve(`https://drive.google.com/file/d/${json.fileId}/view`);
          return;
        }
        if (json.url) {
          if (onProgress) onProgress(100);
          resolve(json.url);
          return;
        }
        reject(new Error(json.error || "Respuesta inválida de Google Drive"));
      } catch (err) {
        reject(err);
      }
    };

    xhr.onerror = () => reject(new Error("Error de conexión con Google Drive"));
    xhr.send(payload);
  });
}

// Función principal de subida:
// - Imágenes: se comprimen en <200ms (no ocupan espacio en Supabase)
// - Archivos grandes (>12MB) o si hay puente de Drive activo: suben directo a Google Drive sin tocar Supabase
// - Clips cortos (<=12MB): suben directo con progreso real de bytes
export async function uploadSharedFile(
  file: File,
  folder: string,
  onProgress?: (percent: number) => void
): Promise<string> {
  const report = (p: number) => {
    if (onProgress) onProgress(Math.max(1, Math.min(100, Math.round(p))));
  };

  report(2);

  // 1. Imágenes (Imagen Principal, etc.): compresión ultraligera en Canvas
  if (file.type.startsWith("image/") && typeof document !== "undefined") {
    try {
      report(25);
      const bmpUrl = URL.createObjectURL(file);
      const compressed = await new Promise<string>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(bmpUrl);
          report(70);
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
      // Continúa abajo
    }
  }

  // 2. ÚNICAMENTE para Videos Finales del Editor (folder "finals/"): subir directo a Google Drive
  const isEditorFinalFolder = folder.startsWith("finals/");
  const bridgeUrl = getGoogleDriveBridgeUrl();
  if (isEditorFinalFolder && bridgeUrl) {
    try {
      return await uploadViaGoogleDriveBridge(file, folder, bridgeUrl, report);
    } catch (err) {
      console.warn("[SENDA] Falló subida a Google Drive Bridge en video final:", err);
      if (file.size > SMALL_FILE_MAX_BYTES) {
        throw new Error("DRIVE_REQUIRED_FOR_LARGE_FILE");
      }
    }
  }

  // 3. Si es un Video Final pesado del Editor (> 12 MB) y no hay puente automático, pedir enlace de Google Drive
  if (isEditorFinalFolder && file.size > SMALL_FILE_MAX_BYTES) {
    throw new Error("DRIVE_REQUIRED_FOR_LARGE_FILE");
  }

  // 4. Para clips cortos (<= 10 seg / <= 12 MB) o PDFs de Brief/Factura:
  // Primero intentar Supabase Storage con medición real de bytes XHR
  if (supabase && supabaseUrl && supabaseAnonKey) {
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
            report(5 + (e.loaded / e.total) * 92);
          }
        };
        xhr.onload = () => resolve(xhr.status >= 200 && xhr.status < 300);
        xhr.onerror = () => resolve(false);
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
      // Fallback ligero para archivos pequeños
    }
  }

  // 5. Fallback solo para archivos pequeños (<= 12 MB) con progreso real de lectura
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onprogress = e => {
      if (e.lengthComputable && e.total > 0) {
        report(10 + (e.loaded / e.total) * 88);
      }
    };
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  report(100);
  return dataUrl;
}

export async function resolveMediaUrl(rawUrl?: string | null): Promise<string | null> {
  if (!rawUrl) return null;
  if (isGoogleDriveUrl(rawUrl)) {
    return rawUrl;
  }
  if (memoryBlobUrlCache.has(rawUrl)) {
    return memoryBlobUrlCache.get(rawUrl)!;
  }
  if (rawUrl.startsWith("data:")) {
    try {
      const parts = rawUrl.split(",");
      const header = parts[0] || "";
      const base64 = parts[1] || "";
      const mimeMatch = header.match(/data:([^;]+)/);
      const mime = mimeMatch ? mimeMatch[1] : "application/octet-stream";
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: mime });
      const objUrl = URL.createObjectURL(blob);
      memoryBlobUrlCache.set(rawUrl, objUrl);
      return objUrl;
    } catch {
      return rawUrl;
    }
  }
  return rawUrl;
}

export async function downloadMediaFile(rawUrl?: string | null, fileName?: string | null): Promise<void> {
  if (!rawUrl) return;
  const gdriveDownload = getGoogleDriveDownloadUrl(rawUrl);
  if (gdriveDownload) {
    window.open(gdriveDownload, "_blank", "noopener,noreferrer");
    return;
  }
  const resolved = await resolveMediaUrl(rawUrl);
  if (!resolved) return;

  const a = document.createElement("a");
  a.href = resolved;
  a.download = fileName || "archivo-senda";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
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
        // Respaldo local aplicado
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
      onChange(changedKey);
    })
    .subscribe();
  return () => {
    void supabase.removeChannel(channel);
  };
}
