#!/usr/bin/env node
// DX-585: BCV falso para la E2E. La API bajo prueba apunta BCV_BASE_URL y
// BCV_FALLBACK_BASE_URL aquí (scripts/e2e-ci.sh), así que la suite nunca
// consulta www.bcv.org.ve ni el respaldo reales.
//
//   GET /         portada con los bloques #dolar y #euro en formato es y la
//                 «Fecha Valor» de hoy en Caracas (la forma que lee el parser
//                 de la API, bcv-page-parser.ts)
//   GET /health   200 «ok» (para esperar a que esté listo)
//   lo demás      503 (el respaldo «caído»: la tasa sale de la portada)
//
// Uso: node scripts/bcv-stub.mjs [puerto]   (por defecto E2E_BCV_STUB_PORT o 3599)
import { createServer } from 'node:http';

/** Bs. por USD y por EUR: las del recorte real del 2026-11-21 que usan los tests de la API. */
export const BCV_STUB_USD_VES = '919,82270000';
export const BCV_STUB_EUR_VES = '1.011,17949056';

/** Hoy (AAAA-MM-DD) en Caracas, la zona en la que publica el BCV. */
function caracasToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Caracas',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function page(valueDate) {
  const block = (id, code, value) => `
<div id="${id}" class="col-sm-12 col-xs-12">
  <div class="field-content"><div class="row recuadrotsmc">
    <div class="col-sm-6 col-xs-6"><span> ${code} </span></div>
    <div class="col-sm-6 col-xs-6 centrado textp"><strong class="strong-tb"> ${value}</strong></div>
  </div></div>
</div>`;
  return `<!DOCTYPE html>
<html lang="es"><head><meta charset="utf-8"><title>BCV falso (e2e)</title></head><body>
<section class="block"><h2>Tipo de Cambio Oficial del BCV</h2>
${block('euro', 'EUR', BCV_STUB_EUR_VES)}
${block('dolar', 'USD', BCV_STUB_USD_VES)}
<div class="pull-right dinpro center">
Fecha Valor: <span property="dc:date" datatype="xsd:dateTime" content="${valueDate}T00:00:00-04:00" class="date-display-single">${valueDate}</span>
</div></section>
</body></html>
`;
}

const port = Number(process.argv[2] ?? process.env.E2E_BCV_STUB_PORT ?? 3599);
const server = createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  if (req.method === 'GET' && path === '/') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page(caracasToday()));
    return;
  }
  if (req.method === 'GET' && path === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('ok');
    return;
  }
  res.writeHead(503, { 'content-type': 'text/plain' });
  res.end('');
});
server.listen(port, '127.0.0.1', () => {
  console.log(`BCV falso en http://127.0.0.1:${port}`);
});
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
