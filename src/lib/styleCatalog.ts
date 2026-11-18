import { STATIC_STYLES } from '../data/styles';
import type { CatalogStyle } from '../types';

/** "A recomendación de SENDA": el cliente deja que la agencia elija el estilo de cada video */
export const AGENCY_STYLE_ID = 'agencia';
export const AGENCY_STYLE_NAME = 'A recomendación de SENDA';

/** Estilos de la agencia (definidos en el código) + los que el admin cree en el catálogo */
export function allStyles(catalogStyles: CatalogStyle[] = []): CatalogStyle[] {
  const ids = new Set(STATIC_STYLES.map(s => s.id));
  return [...STATIC_STYLES, ...catalogStyles.filter(s => !ids.has(s.id))];
}

export function findStyle(id: string | null | undefined, catalogStyles?: CatalogStyle[]): CatalogStyle | null {
  if (!id || id === AGENCY_STYLE_ID) return null;
  return allStyles(catalogStyles).find(s => s.id === id) || null;
}
