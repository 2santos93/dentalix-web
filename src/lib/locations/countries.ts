// Copia byte a byte de `prisma/reference/iso3166-countries.json` de la API: no se edita aquí.
// La fuente es la API; `scripts/check-api-reference-sync.mjs` (CI) falla si
// divergen. Ver src/lib/money/README.md.
import iso3166Countries from './iso3166-countries.json';

/**
 * DX-312 (spec §6.2, R8, R12): los países que puede tener una sede, con su
 * nombre en español, y el único mapa de nombres de país de la web para las
 * sedes. Todos, sin quitar ni destacar ninguno.
 *
 * Hay dos fuentes de nombres:
 * - esta copia, para las sedes (alta, registro sin sesión, lista de sedes y
 *   pista del móvil), que la necesitan sin sesión ni espera;
 * - `GET /countries` (`lib/reference/countries-api.ts`), para la ficha del
 *   paciente.
 * Coinciden en los 250 desde la migración M1 de la API; solo difieren en filas
 * propias que una base tenga de antes, que no están en la copia y que el
 * selector de sede no ofrece.
 */
export interface CountryOption {
  code: string;
  name: string;
}

const BY_SPANISH_NAME = new Intl.Collator('es');

/** Todos los países de la copia, ordenados por nombre en español. */
export const COUNTRIES: readonly CountryOption[] = [...iso3166Countries]
  .map(({ code, name }) => ({ code, name }))
  .sort((a, b) => BY_SPANISH_NAME.compare(a.name, b.name));

const NAMES = new Map(COUNTRIES.map((c) => [c.code, c.name]));

/** `true` si `code` es, tal cual, un código de la copia (`VE`; no `ve`). */
export function isCountryCode(code: string): boolean {
  return NAMES.has(code);
}

/** Nombre en español del país; un código que no está en la copia se devuelve tal cual. */
export function countryName(code: string | null): string | null {
  if (code === null) return null;
  return NAMES.get(code) ?? code;
}

/** Clave de búsqueda: sin tildes, en minúsculas y con los espacios juntados («Côte  d’Ivoire» → «cote d’ivoire»). */
export function countrySearchKey(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

const KEYS = COUNTRIES.map((c) => ({ country: c, key: countrySearchKey(c.name) }));

/**
 * Países que casan con lo escrito: el del código exacto primero, luego los
 * nombres que empiezan por la clave y luego los que la contienen, cada grupo
 * en el orden de `COUNTRIES`. Sin consulta, todos.
 */
export function searchCountries(query: string): CountryOption[] {
  const key = countrySearchKey(query);
  if (key === '') return [...COUNTRIES];
  const code = key.toUpperCase();
  const exact = COUNTRIES.find((c) => c.code === code);
  const rest = KEYS.filter(({ country }) => country !== exact);
  return [
    ...(exact ? [exact] : []),
    ...rest.filter(({ key: k }) => k.startsWith(key)).map(({ country }) => country),
    ...rest.filter(({ key: k }) => !k.startsWith(key) && k.includes(key)).map(({ country }) => country),
  ];
}
