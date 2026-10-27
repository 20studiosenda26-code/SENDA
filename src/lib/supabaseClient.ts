import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

const MEDIA_BUCKET = "senda-media";

// Identificador único de esta pestaña/sesión y control de versión por llave para evitar parpadeos (Realtime Echo)
export const CLIENT_SESSION_ID = `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const keyWriteSeq: Record<string, number> = {};
const keyLastLocalWriteAt: Record<string, number> = {};
const pendingSaveTimers: Record<string, ReturnType<typeof setTimeout>> = {};

export function getLastLocalWriteAt(key: string): number {
  return keyLastLocalWriteAt[key] || 0;
}

export function markKeyWrittenLocally(key: string): void {
  keyLastLocalWriteAt[key] = Date.now();
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function uploadSharedFile(file: File, folder: string): Promise<string> {
  if (supabase) {
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, "_");
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (!error) {
        const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
        return data.publicUrl;
      }
    } catch {
      // Fallback debajo
    }
  }
  // Si el archivo pesa más de 180KB y el bucket no está disponible, usamos ObjectURL local
  // para nunca bloquear ni reventar el JSON de platform_kv en Supabase
  if (file.size > 180 * 1024 && typeof URL !== "undefined" && URL.createObjectURL) {
    return URL.createObjectURL(file);
  }
  try {
    return await fileToDataUrl(file);
  } catch {
    return `#local-file-${encodeURIComponent(file.name)}`;
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

// Guardado con cola secuencial por llave: garantiza que el último clic SIEMPRE gane en Supabase
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

// Suscripción inteligente: si es platform_kv, entrega qué llave cambió para NO recargar todo por culpa de online_heartbeats
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
