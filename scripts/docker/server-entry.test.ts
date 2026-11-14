/**
 * @jest-environment node
 */
import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

/**
 * DX-458 (OPS-054): el arranque de la imagen (`server-entry.cjs`) fija el
 * keep-alive y las cabeceras por encima del balanceador y apaga en orden. Las
 * pruebas de proceso usan un `server.js` falso que, como el de Next, crea su
 * servidor con `http.createServer` y responde `/slow` tarde y `/health` según
 * la marca de apagado. La imagen real la prueba la CI (scripts/docker-smoke/web.sh).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- módulo CommonJS de la imagen
const entry = require('./server-entry.cjs') as {
  loadServerConfig: (env: Record<string, string | undefined>) => {
    config: { keepAliveTimeoutMs: number; headersTimeoutMs: number; drainMs: number; timeoutMs: number };
    problems: string[];
  };
};
const ENTRY = path.join(__dirname, 'server-entry.cjs');

describe('loadServerConfig (DX-458)', () => {
  it('por defecto en producción: keep-alive 65 s (> 60 s del balanceador), cabeceras 66 s, drenaje 15 s, tope 25 s', () => {
    expect(entry.loadServerConfig({ NODE_ENV: 'production' })).toEqual({
      config: { keepAliveTimeoutMs: 65_000, headersTimeoutMs: 66_000, drainMs: 15_000, timeoutMs: 25_000 },
      problems: [],
    });
  });

  it('fuera de producción no hay balanceador: sin drenaje', () => {
    expect(entry.loadServerConfig({}).config.drainMs).toBe(0);
  });

  it('todo configurable; las cabeceras siguen al keep-alive si no se fijan', () => {
    const { config, problems } = entry.loadServerConfig({
      NODE_ENV: 'production',
      HTTP_KEEP_ALIVE_TIMEOUT_MS: '125000',
      SHUTDOWN_DRAIN_MS: '0',
      SHUTDOWN_TIMEOUT_MS: '5000',
    });
    expect(problems).toEqual([]);
    expect(config).toEqual({ keepAliveTimeoutMs: 125_000, headersTimeoutMs: 126_000, drainMs: 0, timeoutMs: 5_000 });
  });

  it.each([
    [{ HTTP_KEEP_ALIVE_TIMEOUT_MS: '65s' }, /HTTP_KEEP_ALIVE_TIMEOUT_MS debe ser un entero/],
    [{ HTTP_KEEP_ALIVE_TIMEOUT_MS: '500' }, /HTTP_KEEP_ALIVE_TIMEOUT_MS debe ser un entero entre 1000/],
    [{ SHUTDOWN_DRAIN_MS: '-1' }, /SHUTDOWN_DRAIN_MS debe ser un entero/],
    [{ SHUTDOWN_TIMEOUT_MS: '0' }, /SHUTDOWN_TIMEOUT_MS debe ser un entero entre 1000/],
    [{ HTTP_HEADERS_TIMEOUT_MS: '65000' }, /HTTP_HEADERS_TIMEOUT_MS \(65000\) debe ser mayor que HTTP_KEEP_ALIVE_TIMEOUT_MS \(65000\)/],
    [{ KEEP_ALIVE_TIMEOUT: '5000' }, /KEEP_ALIVE_TIMEOUT \(5000\) no coincide con HTTP_KEEP_ALIVE_TIMEOUT_MS \(65000\)/],
  ])('rechaza %j', (env, message) => {
    const { problems } = entry.loadServerConfig(env);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(message);
  });

  it('KEEP_ALIVE_TIMEOUT de Next igual al nuestro: se admite', () => {
    expect(entry.loadServerConfig({ KEEP_ALIVE_TIMEOUT: '65000' }).problems).toEqual([]);
  });
});

const FAKE_SERVER = `
const http = require('node:http');
const SHUTTING_DOWN = Symbol.for('dentalix.web.shuttingDown');
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    const down = globalThis[SHUTTING_DOWN] === true;
    res.writeHead(down ? 503 : 200);
    return res.end(down ? 'draining' : 'ok');
  }
  if (req.url.startsWith('/slow')) {
    const ms = Number(new URL(req.url, 'http://x').searchParams.get('ms'));
    process.stdout.write('SLOW_STARTED\\n');
    return setTimeout(() => res.end('slow-done'), ms);
  }
  res.end('fast');
});
server.listen(0, '127.0.0.1', () => process.stdout.write('PORT=' + server.address().port + '\\n'));
`;

interface Started {
  child: ChildProcess;
  port: number;
  output: () => string;
  exited: Promise<number | null>;
}

let dir: string;
const children: ChildProcess[] = [];

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dx458-entry-'));
  fs.writeFileSync(path.join(dir, 'server.js'), FAKE_SERVER);
});
afterEach(() => {
  for (const child of children.splice(0)) if (child.exitCode === null) child.kill('SIGKILL');
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

async function waitFor<T>(what: string, check: () => T | undefined | false, timeoutMs = 10_000): Promise<T> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > until) throw new Error(`no llegó: ${what}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function start(env: Record<string, string>): Promise<Started> {
  let out = '';
  const child = spawn(process.execPath, [ENTRY, path.join(dir, 'server.js')], {
    env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  children.push(child);
  child.stdout!.on('data', (chunk) => (out += chunk));
  child.stderr!.on('data', (chunk) => (out += chunk));
  const exited = new Promise<number | null>((resolve) => child.on('exit', (code) => resolve(code)));
  const port = await waitFor('PORT', () => Number(/PORT=(\d+)/.exec(out)?.[1]) || undefined);
  return { child, port, output: () => out, exited };
}

interface Reply {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

function get(port: number, urlPath: string, agent?: http.Agent): Promise<Reply> {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port, path: urlPath, agent }, (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body, headers: res.headers }));
      })
      .on('error', reject);
  });
}

function connectError(port: number): Promise<string | null> {
  return new Promise((resolve) => {
    const socket = net.connect(port, '127.0.0.1');
    socket.once('connect', () => {
      socket.destroy();
      resolve(null);
    });
    socket.once('error', (err: NodeJS.ErrnoException) => resolve(err.code ?? 'error'));
  });
}

describe('server-entry.cjs en un proceso (DX-458)', () => {
  it('keep-alive configurable: anuncia `Keep-Alive: timeout=65` por defecto', async () => {
    const web = await start({});
    const reply = await get(web.port, '/');
    expect(reply.headers['keep-alive']).toBe('timeout=65');
    await waitFor('log de arranque', () => /keep-alive 65000 ms, cabeceras 66000 ms/.test(web.output()));
  });

  it('con HTTP_KEEP_ALIVE_TIMEOUT_MS=90000 anuncia timeout=90', async () => {
    const web = await start({ HTTP_KEEP_ALIVE_TIMEOUT_MS: '90000' });
    expect((await get(web.port, '/')).headers['keep-alive']).toBe('timeout=90');
  });

  it('SIGTERM: salud 503 y Connection: close mientras drena, luego rechaza conexiones nuevas, termina la petición en vuelo y sale con 0', async () => {
    const web = await start({ SHUTDOWN_DRAIN_MS: '600', SHUTDOWN_TIMEOUT_MS: '8000' });
    expect((await get(web.port, '/health')).status).toBe(200);

    const slow = get(web.port, '/slow?ms=2000');
    await waitFor('petición lenta en vuelo', () => web.output().includes('SLOW_STARTED'));
    web.child.kill('SIGTERM');
    // `kill` solo envía la señal: sin esperar a que el proceso la atienda, la
    // petición de salud podía llegar antes y dar 200 (DX-458-bis, intermitente
    // en CI).
    await waitFor('SIGTERM atendido', () => web.output().includes('[apagado] SIGTERM: /api/health da 503'));

    // Drenando: sigue atendiendo, pero la salud da 503 y no reutiliza conexiones.
    const draining = await get(web.port, '/health');
    expect(draining).toMatchObject({ status: 503, body: 'draining' });
    expect(draining.headers.connection).toBe('close');

    // Tras el drenaje: conexiones nuevas rechazadas con la lenta aún en vuelo.
    let refused: string | null = null;
    const until = Date.now() + 5_000;
    while (Date.now() < until && !(refused = await connectError(web.port))) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(refused).toBe('ECONNREFUSED');
    expect(web.child.exitCode).toBeNull();

    await expect(slow).resolves.toMatchObject({ status: 200, body: 'slow-done' });
    await expect(web.exited).resolves.toBe(0);
    expect(web.output()).toMatch(/sin peticiones en vuelo: sale con 0/);
  });

  it('una conexión keep-alive ociosa no retiene el apagado hasta su plazo', async () => {
    const web = await start({ SHUTDOWN_DRAIN_MS: '0', SHUTDOWN_TIMEOUT_MS: '30000' });
    const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
    await get(web.port, '/', agent);
    const t0 = Date.now();
    web.child.kill('SIGTERM');
    await expect(web.exited).resolves.toBe(0);
    expect(Date.now() - t0).toBeLessThan(5_000);
    agent.destroy();
  });

  it('SIGTERM con una petición más larga que SHUTDOWN_TIMEOUT_MS: la corta y sale con 1 dentro del tope', async () => {
    const web = await start({ SHUTDOWN_DRAIN_MS: '0', SHUTDOWN_TIMEOUT_MS: '1000' });
    // El rechazo llega antes del `await`: se recoge ya, sin rechazo sin manejar.
    const slow = get(web.port, '/slow?ms=15000').then(
      () => 'respondió',
      (err: Error) => err.message,
    );
    await waitFor('petición lenta en vuelo', () => web.output().includes('SLOW_STARTED'));
    const t0 = Date.now();
    web.child.kill('SIGTERM');
    await expect(web.exited).resolves.toBe(1);
    expect(Date.now() - t0).toBeLessThan(5_000);
    await expect(slow).resolves.toBe('socket hang up');
    expect(web.output()).toMatch(/vencieron SHUTDOWN_TIMEOUT_MS \(1000 ms\)/);
  });

  it('con configuración inválida no arranca y dice por qué', async () => {
    let out = '';
    const child = spawn(process.execPath, [ENTRY, path.join(dir, 'server.js')], {
      env: { PATH: process.env.PATH ?? '', NODE_ENV: 'production', HTTP_HEADERS_TIMEOUT_MS: '1000' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    children.push(child);
    child.stderr!.on('data', (chunk) => (out += chunk));
    const code = await new Promise((resolve) => child.on('exit', resolve));
    expect(code).toBe(1);
    expect(out).toMatch(/HTTP_HEADERS_TIMEOUT_MS \(1000\) debe ser mayor que HTTP_KEEP_ALIVE_TIMEOUT_MS/);
    expect(out).not.toMatch(/PORT=/);
  });
});
