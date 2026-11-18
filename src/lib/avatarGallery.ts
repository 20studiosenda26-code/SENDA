// Galería de avatares de SENDA. Cada imagen vive en public/avatars/ y TODOS sus datos salen del nombre del archivo:
//   {GÉNERO}_{CATEGORÍA}_{EDAD}_{PAÍS}_{nombre}_{ID}.jpg   →   M_IGELITE_22_CO_isabella_M32.jpg
// La lista de archivos está en src/data/avatars.ts (se regenera con scripts/gen-avatars.mjs); las imágenes están en Supabase Storage.
import { AVATAR_FILES } from '../data/avatars';
import type { CatalogAvatar } from '../types';

export type AvatarGender = 'mujer' | 'hombre';
export type AvatarCategory = 'ugc' | 'ig' | 'igelite' | 'estetico';

export interface GalleryAvatar {
  /** Código único que se guarda en el proyecto (ej. M32) */
  id: string;
  gender: AvatarGender;
  category: AvatarCategory;
  age: number;
  /** Código de país (CO, MX…) */
  country: string;
  name: string;
  /** Imagen completa (comp card) */
  src: string;
  /** Miniatura liviana para la cuadrícula */
  thumb: string;
  alt: string;
}

export const CATEGORIES: { key: AvatarCategory; label: string; description: string }[] = [
  { key: 'ugc', label: 'Natural (UGC)', description: 'Personas reales y cercanas, ideales para testimonios y anuncios auténticos.' },
  { key: 'ig', label: 'Instagram', description: 'Personas cuidadas y atractivas, estilo creador de contenido.' },
  { key: 'igelite', label: 'Instagram Élite', description: 'Perfiles de alto impacto visual, estilo influencer top.' },
  { key: 'estetico', label: 'Élite Estético', description: 'Look con procedimientos estéticos, ideal para clínicas, belleza y estética.' },
];

const CATEGORY_CODE: Record<string, AvatarCategory> = { UGC: 'ugc', IG: 'ig', IGELITE: 'igelite', ESTETICO: 'estetico' };

export const COUNTRIES: Record<string, string> = {
  CO: 'Colombia', MX: 'México', ES: 'España', AR: 'Argentina', VE: 'Venezuela', PE: 'Perú', CL: 'Chile', BR: 'Brasil',
  US: 'Estados Unidos', EC: 'Ecuador', DO: 'República Dominicana', KR: 'Corea del Sur', CN: 'China', JP: 'Japón', IN: 'India',
};
export const countryName = (code: string) => COUNTRIES[code] || code;
/** Bandera como emoji a partir del código de país */
export const flag = (code: string) => String.fromCodePoint(...Array.from(code.toUpperCase()).map(c => 127397 + c.charCodeAt(0)));

export const AGE_RANGES: { key: string; label: string; min: number; max: number }[] = [
  { key: '18-25', label: '18-25', min: 18, max: 25 },
  { key: '26-35', label: '26-35', min: 26, max: 35 },
  { key: '36-45', label: '36-45', min: 36, max: 45 },
  { key: '46-55', label: '46-55', min: 46, max: 55 },
  { key: '56+', label: '56+', min: 56, max: 200 },
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
// Las imágenes viven en el almacenamiento público de Supabase (bucket senda-media, carpeta avatars/):
// se ven igual en cualquier publicación. Sin Supabase (desarrollo local) se leen de public/avatars/.
const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const BASE = SUPABASE_URL
  ? `${SUPABASE_URL}/storage/v1/object/public/senda-media/avatars/`
  : `${(import.meta.env.BASE_URL || '/').replace(/\/?$/, '/')}avatars/`;

export function parseAvatarFile(path: string): GalleryAvatar | null {
  const file = path.split('/').pop() || '';
  const m = file.match(/^([MH])_(UGC|IG|IGELITE|ESTETICO)_(\d+)_([A-Z]{2})_([a-z]+)_([MH]\d+)\.jpe?g$/i);
  if (!m) return null;
  const [, g, cat, age, country, rawName, id] = m;
  const name = cap(rawName.toLowerCase());
  const cc = country.toUpperCase();
  return {
    id: id.toUpperCase(),
    gender: g.toUpperCase() === 'M' ? 'mujer' : 'hombre',
    category: CATEGORY_CODE[cat.toUpperCase()],
    age: Number(age),
    country: cc,
    name,
    src: `${BASE}${path}`,
    thumb: `${BASE}thumbs/${id.toUpperCase()}.webp`,
    alt: `Avatar ${name}, ${age} años, ${countryName(cc)}`,
  };
}

const ORDER = CATEGORIES.map(c => c.key);
export const GALLERY_AVATARS: GalleryAvatar[] = AVATAR_FILES
  .map(parseAvatarFile)
  .filter((a): a is GalleryAvatar => Boolean(a))
  .sort((a, b) => ORDER.indexOf(a.category) - ORDER.indexOf(b.category) || a.age - b.age || a.name.localeCompare(b.name));

/** Un avatar listo para mostrar, venga de la galería de SENDA o del catálogo antiguo subido por el admin. */
export interface ResolvedAvatar {
  id: string;
  name: string;
  imageUrl: string | null;
  gender?: string;
  subtitle?: string;
}

export function findAvatar(id?: string | null, catalog?: CatalogAvatar[], fallbackImage?: string | null, fallbackName?: string | null): ResolvedAvatar | null {
  if (!id) return null;
  const g = GALLERY_AVATARS.find(a => a.id === id);
  if (g) {
    const cat = CATEGORIES.find(c => c.key === g.category)?.label;
    return { id: g.id, name: g.name, imageUrl: g.src, gender: g.gender, subtitle: `${cat} · ${g.age} años · ${countryName(g.country)}` };
  }
  const c = catalog?.find(a => a.id === id);
  if (c) return { id: c.id, name: c.name, imageUrl: c.imageUrl, gender: c.gender, subtitle: c.description };
  // Guardado en el proyecto pero ya no está en la lista: se conserva lo que se guardó
  if (fallbackImage || fallbackName) return { id, name: fallbackName || id, imageUrl: fallbackImage || null };
  return null;
}
