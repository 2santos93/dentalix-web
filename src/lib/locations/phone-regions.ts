// Lee la copia byte a byte de `prisma/reference/phone-regions-list.json` de la API: no se edita aquí.
// La fuente es la API; `scripts/check-api-reference-sync.mjs` (CI) falla si
// divergen. Ver src/lib/money/README.md.
import phoneRegionsList from './phone-regions-list.json';
import { countrySearchKey } from './countries';

/**
 * DX-329 (spec §6.2): las regiones de numeración que puede tener una sede como
 * prefijo telefónico por defecto, con su nombre en español y su indicativo.
 * Es la lista de la librería de la API, sin quitar ni destacar ninguna. La web
 * no valida ni normaliza teléfonos: lo hace la API.
 */
export interface PhoneRegionOption {
  code: string;
  name: string;
  callingCode: string;
}

const BY_SPANISH_NAME = new Intl.Collator('es');

/** Todas las regiones de la copia, ordenadas por nombre en español. */
export const PHONE_REGIONS: readonly PhoneRegionOption[] = [...phoneRegionsList]
  .map(({ code, name, callingCode }) => ({ code, name, callingCode }))
  .sort((a, b) => BY_SPANISH_NAME.compare(a.name, b.name));

const BY_CODE = new Map(PHONE_REGIONS.map((r) => [r.code, r]));

/** `true` si `code` es, tal cual, una región de la copia (`VE`; no `ve`). */
export function isPhoneRegion(code: string): boolean {
  return BY_CODE.has(code);
}

/** «Nombre (+indicativo)»; un código que no está en la copia se devuelve tal cual. */
export function phoneRegionLabel(code: string | null): string | null {
  if (code === null) return null;
  const region = BY_CODE.get(code);
  return region ? `${region.name} (+${region.callingCode})` : code;
}

const KEYS = PHONE_REGIONS.map((r) => ({ region: r, key: countrySearchKey(r.name) }));

/**
 * Regiones que casan con lo escrito. Unas cifras, con o sin `+` y con
 * espacios, dan las regiones cuyo indicativo empieza por ellas, para que la
 * lista se acote mientras se escribe; ningún indicativo es el principio de
 * otro, así que el completo da solo los suyos. Si no, la del código exacto
 * primero, luego los nombres que empiezan por la clave y luego los que la
 * contienen. Cada grupo, en el orden de `PHONE_REGIONS`. Sin consulta, todas.
 */
export function searchPhoneRegions(query: string): PhoneRegionOption[] {
  const key = countrySearchKey(query);
  if (key === '') return [...PHONE_REGIONS];
  const digits = /^\+?(\d+)$/.exec(key.replace(/\s/g, ''))?.[1];
  if (digits !== undefined) return PHONE_REGIONS.filter((r) => r.callingCode.startsWith(digits));
  const code = key.toUpperCase();
  const exact = BY_CODE.get(code);
  const rest = KEYS.filter(({ region }) => region !== exact);
  return [
    ...(exact ? [exact] : []),
    ...rest.filter(({ key: k }) => k.startsWith(key)).map(({ region }) => region),
    ...rest.filter(({ key: k }) => !k.startsWith(key) && k.includes(key)).map(({ region }) => region),
  ];
}
