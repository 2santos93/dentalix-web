/**
 * @jest-environment node
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';

/**
 * SEC-062: la precarga de la imagen (`node --require`) impide que una
 * respuesta HTTP lleve `x-middleware-rewrite`, la cabecera con la URL interna
 * de la API (p. ej. https://api-interna.dentalix.app/api/v1). Se prueba en un
 * proceso hijo para no parchear `http` dentro de jest.
 */
const PRELOAD = path.join(__dirname, 'strip-middleware-rewrite.cjs');
const URL_INTERNA = 'https://api-interna.dentalix.app/api/v1/patients';

const CHILD = `
const http = require('node:http');
const modes = {
  setHeader: (res) => { res.setHeader('X-Middleware-Rewrite', '${URL_INTERNA}'); res.end('ok'); },
  writeHead: (res) => { res.writeHead(200, { 'x-middleware-rewrite': '${URL_INTERNA}', 'x-otra': '1' }); res.end('ok'); },
  writeHeadArray: (res) => { res.writeHead(200, ['x-middleware-rewrite', '${URL_INTERNA}', 'x-otra', '1']); res.end('ok'); },
  appendHeader: (res) => { res.appendHeader('x-middleware-rewrite', '${URL_INTERNA}'); res.end('ok'); },
};
const server = http.createServer((req, res) => {
  res.setHeader('x-otra', '1');
  modes[req.url.slice(1)](res);
});
server.listen(0, '127.0.0.1', async () => {
  const out = {};
  for (const mode of Object.keys(modes)) {
    const r = await fetch('http://127.0.0.1:' + server.address().port + '/' + mode);
    out[mode] = { rewrite: r.headers.get('x-middleware-rewrite'), otra: r.headers.get('x-otra') };
  }
  console.log(JSON.stringify(out));
  server.close();
});
`;

function run(preload: boolean): Record<string, { rewrite: string | null; otra: string | null }> {
  const args = [...(preload ? ['--require', PRELOAD] : []), '-e', CHILD];
  return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8' }));
}

describe('strip-middleware-rewrite (SEC-062)', () => {
  it('sin la precarga la cabecera sale (el control del test)', () => {
    for (const reply of Object.values(run(false))) expect(reply.rewrite).toBe(URL_INTERNA);
  });

  it('con la precarga ninguna vía de escribirla la deja salir, y las demás cabeceras siguen', () => {
    for (const [mode, reply] of Object.entries(run(true))) {
      expect({ mode, rewrite: reply.rewrite }).toEqual({ mode, rewrite: null });
      expect(reply.otra).toBe('1');
    }
  });
});
