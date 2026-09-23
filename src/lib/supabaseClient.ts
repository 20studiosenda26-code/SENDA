import { createClient } from '@supabase/supabase-js';

// --- Conexión a Supabase (base de datos + storage compartidos) ---
// Estas variables se configuran en el hosting (Bolt/Netlify/Vercel/.env)
// como VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY. Ver supabase/migrations
// y README para las instrucciones de configuración.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl as string, supabaseAnonKey as string)
  : null;

if (!isSupabaseConfigured && typeof window !== 'undefined') {
  // Aviso visible solo en consola: mientras no se configure Supabase, la
  // información seguirá guardándose solo en este navegador (como antes),
  // por lo que NO se verá desde otro dispositivo/navegador.
  // eslint-disable-next-line no-console
  console.warn(
    '[SENDA] Supabase no está configurado (faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY). ' +
    'Los datos de tareas, clips e imágenes solo se guardarán en este navegador.'
  );
}

const MEDIA_BUCKET = 'senda-media';

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Sube un archivo (clip, imagen principal, brief, video final) al bucket
 * compartido de Supabase Storage y devuelve una URL pública real, visible
 * desde cualquier dispositivo o sesión.
 *
 * Si Supabase no está configurado o la subida falla, cae de vuelta a un
 * data URL local (comportamiento anterior) para que la interfaz nunca se
 * rompa, aunque en ese caso el archivo NO quedará compartido entre
 * dispositivos hasta que se configure Supabase.
 */
export async function uploadSharedFile(file: File, folder: string): Promise<string> {
  if (supabase) {
    try {
      const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_');
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, file, {
        cacheControl: '3600',
        upsert: false,
      });
      if (!error) {
        const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
        return data.publicUrl;
      }
      // eslint-disable-next-line no-console
      console.warn('[SENDA] Falló la subida a Supabase Storage, usando respaldo local:', error.message);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[SENDA] Error subiendo archivo a Supabase Storage, usando respaldo local:', err);
    }
  }
  return fileToDataUrl(file);
}

// --- Persistencia compartida clave/valor ---
// Usa la tabla `platform_kv` (ver supabase/migrations) como reemplazo de
// localStorage para todo lo que debe verse igual desde cualquier
// dispositivo/navegador: tareas, clips, imágenes principales, notas,
// estados de aprobación/rechazo y notificaciones.
export async function loadShared<T>(key: string): Promise<T | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('platform_kv')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    if (error || !data) return null;
    return data.value as T;
  } catch {
    return null;
  }
}

export async function saveShared<T>(key: string, value: T): Promise<void> {
  if (!supabase) return;
  try {
    await supabase.from('platform_kv').upsert({ key, value, updated_at: new Date().toISOString() });
  } catch {
    // Si falla el guardado remoto, no rompemos la interfaz: el respaldo en
    // localStorage sigue funcionando mientras se resuelve la conexión.
  }
}
