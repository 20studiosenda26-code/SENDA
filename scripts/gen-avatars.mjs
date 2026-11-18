// Genera la lista de avatares de la galería a partir de las imágenes de public/avatars.
//   node scripts/gen-avatars.mjs          → actualiza src/data/avatars.ts
//   (si tienes "sharp" instalado) también crea las miniaturas WebP de public/avatars/thumbs
// Para agregar un avatar nuevo: sube la imagen a su carpeta (ej. public/avatars/mujeres/2_Instagram/)
// con el nombre {M|H}_{UGC|IG|IGELITE|ESTETICO}_{edad}_{PAIS}_{nombre}_{ID}.jpg y ejecuta este script.
import { readdirSync, statSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

const ROOT = new URL('../public/avatars/', import.meta.url).pathname;
const OUT = new URL('../src/data/avatars.ts', import.meta.url).pathname;
const NAME_RE = /^[MH]_(UGC|IG|IGELITE|ESTETICO)_\d+_[A-Z]{2}_[a-z]+_[MH]\d+\.jpe?g$/i;

const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (f === 'thumbs') continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (NAME_RE.test(f)) files.push(relative(ROOT, p).split('\\').join('/'));
    else if (/\.(jpe?g|png|webp)$/i.test(f)) console.warn('⚠ nombre fuera de formato (se ignora):', f);
  }
})(ROOT);
files.sort((a, b) => basename(a).localeCompare(basename(b)));

writeFileSync(OUT, `// Generado por scripts/gen-avatars.mjs — no editar a mano la lista salvo para agregar una línea.
// Cada línea es la ruta de una imagen dentro de public/avatars/. Los datos salen del nombre del archivo:
//   {GÉNERO}_{CATEGORÍA}_{EDAD}_{PAÍS}_{nombre}_{ID}.jpg   (ej. M_IGELITE_22_CO_isabella_M32.jpg)
export const AVATAR_FILES: string[] = [
${files.map(f => `  '${f}',`).join('\n')}
];
`);
console.log(`✔ ${files.length} avatares en src/data/avatars.ts`);

// Miniaturas (opcional)
let sharp;
try { sharp = (await import('sharp')).default; } catch { console.log('ℹ Sin "sharp": se omiten las miniaturas (la galería usa la imagen original).'); }
if (sharp) {
  const TH = join(ROOT, 'thumbs');
  if (!existsSync(TH)) mkdirSync(TH, { recursive: true });
  let n = 0;
  for (const f of files) {
    const id = basename(f).replace(/\.jpe?g$/i, '').split('_').pop();
    const out = join(TH, `${id}.webp`);
    if (existsSync(out)) continue;
    await sharp(join(ROOT, f)).resize({ width: 480 }).webp({ quality: 78 }).toFile(out);
    n++;
  }
  console.log(`✔ ${n} miniaturas nuevas`);
}
