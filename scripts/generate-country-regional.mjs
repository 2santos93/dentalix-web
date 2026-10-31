/**
 * Genera `src/lib/locations/country-regional.json` (R1, 2026-10-31): para cada
 * país de la lista de sedes, su moneda de uso general y sus zonas IANA, solo
 * para PROPONER valores al dar de alta una sede.
 *
 * Fuentes: `country-state-city` (dependencia de la API) para moneda y zonas,
 * filtradas contra las listas de referencia de la API (ISO 4217 admitidas e
 * IANA), y `Intl.Locale#getTimeZones` (ICU) para los nombres viejos de zona
 * que dan algunos navegadores. Las correcciones a mano (`FIX_*`) arreglan
 * códigos retirados de la librería (VEF → VES, HRK → EUR, …).
 *
 * Uso (desde la API, que tiene la dependencia y las listas):
 *   cd ../dentalix-api && node ../dentalix-web/scripts/generate-country-regional.mjs \
 *     ../dentalix-web/src/lib/locations/country-regional.json
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';

const { Country } = createRequire(`${process.cwd()}/package.json`)('country-state-city');
const iso=JSON.parse(fs.readFileSync(process.cwd()+'/prisma/reference/iso3166-countries.json','utf8'));
const iana=new Set(JSON.parse(fs.readFileSync(process.cwd()+'/prisma/reference/iana-zone-names.json','utf8')));
const src=fs.readFileSync(process.cwd()+'/prisma/reference/iso4217.ts','utf8');
const whitelist=new Set([...src.matchAll(/code: '([A-Z]{3})'/g)].map(m=>m[1]));
// Correcciones a mano sobre country-state-city 3.2.1 (códigos retirados o cambios recientes).
// VE: el dueño (V1, 2026-10-31) — las clínicas venezolanas trabajan sobre todo en USD;
// VES se ofrece con un clic (`CURRENCY_ALTERNATIVES`).
const FIX_CURRENCY={VE:'USD',HR:'EUR',BG:'EUR',CW:'XCG',SX:'XCG',MR:'MRU',SL:'SLE',ST:'STN',ZW:'ZWG',PA:'USD'};
// Otras monedas de uso en el país, que el alta ofrece con «Usar …» junto a la propuesta.
const CURRENCY_ALTERNATIVES={VE:['VES']};
const FIX_ZONES={BQ:['America/Kralendijk'],SX:['America/Lower_Princes'],BV:[],HM:[]};
const currencies={}, zones={};
const seen=new Map();
for (const {code} of iso){
  const c=Country.getCountryByCode(code);
  const cur=FIX_CURRENCY[code] ?? c?.currency?.split(',')[0];
  if (cur && whitelist.has(cur)) currencies[code]=cur;
  const z=(FIX_ZONES[code] ?? (c?.timezones??[]).map(t=>t.zoneName)).filter(x=>iana.has(x));
  zones[code]=z;
  for (const zone of z){ seen.set(zone,(seen.get(zone)??[]).concat(code)); }
}
// Nombres que da ICU (Intl) y no están en la lista anterior: solo para saber el país de la zona del navegador.
const icuOnly={};
for (const {code} of iso){
  for (const zone of new Intl.Locale('und-'+code).getTimeZones?.()??[]){
    if (!seen.has(zone) && iana.has(zone)) { icuOnly[zone]=code; }
  }
}
const shared=[...seen].filter(([,cs])=>cs.length>1);
console.error('shared',JSON.stringify(shared)); console.error('icuOnly',Object.keys(icuOnly).length, 'cur',Object.keys(currencies).length);
const missing=Object.keys(zones).filter(k=>!zones[k].length); console.error('noZone',missing.join(','));
const currencyAlternatives=Object.fromEntries(Object.entries(CURRENCY_ALTERNATIVES).map(([k,v])=>[k,v.filter(c=>whitelist.has(c)&&c!==currencies[k])]));
const out={currencies,currencyAlternatives,zones,icuZoneCountries:icuOnly};
fs.writeFileSync(process.argv[2], JSON.stringify(out,null,2)+'\n');
