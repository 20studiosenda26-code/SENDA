// Sube los videos de ejemplo de public/styles/<estilo>/ al almacenamiento público de Supabase (bucket "senda-media",
// carpeta "styles/"). Cada video debe pesar menos de 50 MB (comprímelo antes con ffmpeg si hace falta).
//   node scripts/upload-styles.mjs
// Usa VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY de .env.local (nunca se muestran ni se guardan en otro lado).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const env = Object.fromEntries(
  readFileSync(fileURLToPath(new URL('../.env.local', import.meta.url)), 'utf8').split('\n')
    .map(l => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map(m => [m[1], m[2].replace(/^["']|["']$/g, '')]),
);
const URL_ = (env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const KEY = env.VITE_SUPABASE_ANON_KEY || '';
if (!URL_ || !KEY) { console.error('Falta VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY en .env.local'); process.exit(1); }

const ROOT = fileURLToPath(new URL('../public/styles/', import.meta.url));
const TYPES = { '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' };
const files = [];
(function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : TYPES[extname(f).toLowerCase()] && files.push(p); } })(ROOT);

let ok = 0, fail = 0;
const queue = [...files];
async function worker() {
  while (queue.length) {
    const p = queue.shift();
    const path = `styles/${relative(ROOT, p).split('\\').join('/')}`;
    const res = await fetch(`${URL_}/storage/v1/object/senda-media/${path}`, {
      method: 'POST',
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': TYPES[extname(p).toLowerCase()], 'x-upsert': 'true', 'cache-control': 'max-age=31536000' },
      body: readFileSync(p),
    });
    if (res.ok) ok++; else { fail++; console.error('✗', path, res.status, (await res.text()).slice(0, 120)); }
  }
}
await Promise.all(Array.from({ length: 6 }, worker));
console.log(`✔ ${ok} subidos · ${fail} con error (de ${files.length})`);
process.exit(fail ? 1 : 0);
