// Estilos de edición de la agencia. Los videos de ejemplo viven en el almacenamiento público de Supabase
// (bucket senda-media, carpeta styles/). Para sumar un estilo: agrega un bloque aquí y sube sus videos con
// scripts/upload-styles.mjs. Los estilos que el admin cree desde Ajustes se suman a esta lista.
import type { CatalogStyle } from '../types';

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, '');
const BASE = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/senda-media/styles/` : '/styles/';

export const STATIC_STYLES: CatalogStyle[] = [
  {
    id: 'vidrio',
    name: 'Estilo Vidrio',
    description: 'Estilo de edición Vidrio de SENDA. Abre los videos de ejemplo para ver cómo queda.',
    videos: [
      { id: 'vidrio-1', name: 'NORDIK · 3 ingredientes', url: `${BASE}vidrio/NORDIK_v3_3_ingredientes.mp4` },
      { id: 'vidrio-2', name: 'NORDIK · Top 5', url: `${BASE}vidrio/NORDIK_v5_top5_lista_v3.mp4` },
      { id: 'vidrio-3', name: 'SENDA · 16:9', url: `${BASE}vidrio/SENDA_01_16x9_v1.mp4` },
      { id: 'vidrio-4', name: 'SORELLA · VSL', url: `${BASE}vidrio/SORELLA_VSL_01_v1.mp4` },
    ],
  },
];
