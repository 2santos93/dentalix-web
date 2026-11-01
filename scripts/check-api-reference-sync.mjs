#!/usr/bin/env node
// DX-350 (G1-B §8), DX-312 (§6.5), DX-329 (§3.2), DX-340 y DX-517: las listas de referencia que posee la API y la web copia
// byte a byte no pueden divergir.
//
//   node scripts/check-api-reference-sync.mjs [dir-de-la-api] [dir-de-la-web]
//
// El directorio de la API sale del primer argumento, de $API_DIR o de
// ../dentalix-api. Sale con 1, nombrando cada copia, si una difiere
// («<web> difiere de <api> (primer byte distinto: N)», N desde 0) o si falta
// un fichero («falta <ruta> en la API» / «… en la web», ruta relativa). Sale
// con 2 si no hay checkout de la API.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** [fuente en la API, copia en la web] (spec G1-B §8; DX-312 §6.5; DX-329 §3.2; DX-340). */
export const PAIRS = [
  ['prisma/reference/cldr-format-digits-zero.json', 'src/lib/money/cldr-format-digits-zero.json'],
  ['prisma/reference/iana-zone-names.json', 'src/lib/locations/iana-zone-names.json'],
  ['src/shared/format/regional-format.cases.json', 'src/lib/format/regional-format.cases.json'],
  ['prisma/reference/iso3166-countries.json', 'src/lib/locations/iso3166-countries.json'],
  ['prisma/reference/phone-regions-list.json', 'src/lib/locations/phone-regions-list.json'],
  ['src/shared/money/rounding-vectors.json', 'src/lib/money/rounding-vectors.json'],
  // DX-517: vectores del texto propio de cada moneda.
  ['src/shared/format/currency-text.cases.json', 'src/lib/format/currency-text.cases.json'],
];

/** Mensajes de deriva de cada par; vacío si las copias son idénticas. */
export function checkApiReferenceSync(apiDir, webDir) {
  const problems = [];
  for (const [apiRel, webRel] of PAIRS) {
    const apiFile = path.join(apiDir, apiRel);
    const webFile = path.join(webDir, webRel);
    if (!existsSync(apiFile)) problems.push(`falta ${apiRel} en la API`);
    if (!existsSync(webFile)) problems.push(`falta ${webRel} en la web`);
    if (!existsSync(apiFile) || !existsSync(webFile)) continue;
    const a = readFileSync(apiFile);
    const w = readFileSync(webFile);
    if (a.equals(w)) continue;
    let i = 0;
    while (i < a.length && i < w.length && a[i] === w[i]) i++;
    problems.push(`${webRel} difiere de ${apiRel} (primer byte distinto: ${i})`);
  }
  return problems;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const webDir = process.argv[3] ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const apiDir = path.resolve(process.argv[2] ?? process.env.API_DIR ?? path.join(webDir, '..', 'dentalix-api'));
  if (!existsSync(apiDir)) {
    console.error(`No encuentro dentalix-api en ${apiDir}: define API_DIR.`);
    process.exit(2);
  }
  const problems = checkApiReferenceSync(apiDir, webDir);
  if (problems.length > 0) {
    console.error(`Las listas compartidas con la API divergen:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    console.error('\nLa API es la fuente: copia su fichero a la web byte a byte (o corrige la API y vuelve a copiar).');
    process.exit(1);
  }
  console.log(`Referencias compartidas con la API: ${PAIRS.length} ficheros idénticos.`);
}
