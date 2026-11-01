// Optional, isolated QA backend. Synthetic fixtures only; no database or credentials.
// node --experimental-strip-types e2e/support/public-anamnesis-fixture-server.mjs
import { createServer } from 'node:http';
import { publicAnamnesisFixture } from './public-anamnesis-fixture.ts';

const port = Number(process.env.DX297_FIXTURE_PORT ?? 4297);
createServer((request, response) => {
  const token = /^\/api\/v1\/public\/medical-history\/(synthetic(?:-[A-Za-z0-9]+)?|x)$/.exec(request.url ?? '')?.[1];
  let status = 200;
  let body;
  if (!token) { status = 404; body = { message: 'Ruta de fixture inexistente.' }; }
  else if (token === 'synthetic-404' || token === 'synthetic-410') {
    status = Number(token.slice(-3)); body = { message: 'Enlace sintético no disponible.' };
  } else if (request.method === 'POST') {
    body = { submittedAt: '2026-10-30T12:00:00.000Z' };
  } else if (request.method === 'GET') {
    const color = /^synthetic-([0-9A-Fa-f]{6})$/.exec(token)?.[1];
    body = publicAnamnesisFixture(color ? `#${color}` : undefined);
    if (token === 'x') {
      body.consent = { required: false, policy: null };
      body.questionnaire = { ...body.questionnaire, sections: null };
    }
  } else { status = 405; body = { message: 'Método no disponible en el fixture.' }; }
  response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}).listen(port, '127.0.0.1', () => process.stdout.write(`DX-297 synthetic fixture API: http://127.0.0.1:${port}\n`));
