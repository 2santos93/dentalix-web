'use strict';
// DX-458 (OPS-054): arranque de la imagen de producción de la web. Envuelve el
// `server.js` de `output: 'standalone'` (no lo sustituye) para tres cosas que
// Next 16 no da por sí solo:
//
// 1. Keep-alive MAYOR que la inactividad del balanceador. Node cierra una
//    conexión ociosa a los 5 s; un balanceador con 60 s de inactividad
//    reutiliza una conexión que la web ya cerró y el cliente recibe un 502
//    esporádico. `HTTP_KEEP_ALIVE_TIMEOUT_MS` (65 s) y
//    `HTTP_HEADERS_TIMEOUT_MS` (keep-alive + 1 s: si fuese menor, Node cortaría
//    la conexión reutilizada esperando sus cabeceras). Mismos nombres y valores
//    que la API (DX-431). Next lee su propio `KEEP_ALIVE_TIMEOUT`; aquí se fija
//    con el mismo valor, y si alguien lo pone distinto la web no arranca (dos
//    variables para lo mismo acaban discrepando).
// 2. `/api/health` (src/app/api/health/route.ts) da 503 en cuanto llega
//    SIGTERM: el balanceador saca la instancia mientras sigue atendiendo.
// 3. Apagado ordenado con SIGTERM/SIGINT (`NEXT_MANUAL_SIG_HANDLE`: el de Next
//    cierra al momento, sin drenaje ni tope, y una conexión keep-alive ociosa
//    lo retiene hasta su plazo):
//      a. la salud da 503 y las respuestas llevan `Connection: close`;
//      b. espera `SHUTDOWN_DRAIN_MS` (15 s) atendiendo;
//      c. deja de aceptar conexiones (`server.close()`), cierra las que se
//         quedan ociosas y espera a las peticiones en vuelo;
//      d. sale con 0; si vence `SHUTDOWN_TIMEOUT_MS` (25 s) corta las que
//         queden y sale con 1.
//    El periodo de gracia del orquestador (Kubernetes
//    `terminationGracePeriodSeconds`, `docker stop -t`) tiene que ser MAYOR
//    que drenaje + tope (40 s por defecto); si no, SIGKILL corta a medias.
//    Ojo: con el apagado manual no se llama a `nextServer.close()`, así que
//    callbacks pendientes de `after()` no se esperarían; la web no usa
//    `after()` hoy.
//
//   CMD ["node", "server-entry.cjs"]            (Dockerfile)
//   node server-entry.cjs ./otro-server.js      (pruebas)
/* eslint-disable @typescript-eslint/no-require-imports -- CommonJS, sin build */
const http = require('node:http');
const path = require('node:path');

/** Lo lee `src/app/api/health/route.ts` (mismo proceso: Next standalone no usa workers). */
const SHUTTING_DOWN = Symbol.for('dentalix.web.shuttingDown');

const DEFAULT_KEEP_ALIVE_MS = 65_000;
const HEADERS_OVER_KEEP_ALIVE_MS = 1_000;
const DEFAULT_DRAIN_MS_PRODUCTION = 15_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 25_000;
/** Cada cuánto se cierran las conexiones keep-alive que se quedan ociosas al apagar. */
const IDLE_SWEEP_MS = 100;

const LIMITS = {
  HTTP_KEEP_ALIVE_TIMEOUT_MS: [1_000, 600_000],
  HTTP_HEADERS_TIMEOUT_MS: [1_000, 600_000],
  SHUTDOWN_DRAIN_MS: [0, 120_000],
  SHUTDOWN_TIMEOUT_MS: [1_000, 600_000],
};

function intIn(raw, [min, max]) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!/^\d{1,9}$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

const isSet = (raw) => typeof raw === 'string' && raw.trim() !== '';

/** Configuración y problemas (con problemas, la web no arranca). */
function loadServerConfig(env) {
  const problems = [];
  const read = (key) => {
    if (!isSet(env[key])) return undefined;
    const value = intIn(env[key], LIMITS[key]);
    if (value === null) {
      problems.push(`${key} debe ser un entero entre ${LIMITS[key][0]} y ${LIMITS[key][1]} (ms).`);
      return undefined;
    }
    return value;
  };
  const keepAliveTimeoutMs = read('HTTP_KEEP_ALIVE_TIMEOUT_MS') ?? DEFAULT_KEEP_ALIVE_MS;
  const config = {
    keepAliveTimeoutMs,
    headersTimeoutMs: read('HTTP_HEADERS_TIMEOUT_MS') ?? keepAliveTimeoutMs + HEADERS_OVER_KEEP_ALIVE_MS,
    drainMs: read('SHUTDOWN_DRAIN_MS') ?? (env.NODE_ENV === 'production' ? DEFAULT_DRAIN_MS_PRODUCTION : 0),
    timeoutMs: read('SHUTDOWN_TIMEOUT_MS') ?? DEFAULT_SHUTDOWN_TIMEOUT_MS,
  };
  // Las relaciones solo con valores válidos: si no, repetirían el problema.
  if (problems.length === 0 && config.headersTimeoutMs <= config.keepAliveTimeoutMs) {
    problems.push(
      `HTTP_HEADERS_TIMEOUT_MS (${config.headersTimeoutMs}) debe ser mayor que HTTP_KEEP_ALIVE_TIMEOUT_MS (${config.keepAliveTimeoutMs}): si no, Node corta conexiones keep-alive que el cliente reutiliza.`,
    );
  }
  if (isSet(env.KEEP_ALIVE_TIMEOUT) && env.KEEP_ALIVE_TIMEOUT.trim() !== String(keepAliveTimeoutMs)) {
    problems.push(
      `KEEP_ALIVE_TIMEOUT (${env.KEEP_ALIVE_TIMEOUT}) no coincide con HTTP_KEEP_ALIVE_TIMEOUT_MS (${keepAliveTimeoutMs}): quítala y usa solo HTTP_KEEP_ALIVE_TIMEOUT_MS.`,
    );
  }
  return { config, problems };
}

/** Plazos del servidor HTTP de Next (los aplica en cuanto Next lo crea). */
function applyTimeouts(server, config) {
  server.keepAliveTimeout = config.keepAliveTimeoutMs;
  server.headersTimeout = config.headersTimeoutMs;
  // La petición entera incluye sus cabeceras (requestTimeout 0 = sin plazo).
  if (server.requestTimeout > 0 && server.requestTimeout < config.headersTimeoutMs) {
    server.requestTimeout = config.headersTimeoutMs;
  }
}

/**
 * Instala el apagado ordenado. `getServer` da el servidor HTTP de Next (o
 * null si la señal llega antes de que exista: entonces no hay nada que drenar).
 */
function installGracefulShutdown(getServer, config, proc = process, log = console.log) {
  let started = false;
  const exit = (code) => proc.exit(code);

  function closeServer(server) {
    const sweep = setInterval(() => server.closeIdleConnections(), IDLE_SWEEP_MS);
    const timer = setTimeout(() => {
      clearInterval(sweep);
      log(`[apagado] vencieron SHUTDOWN_TIMEOUT_MS (${config.timeoutMs} ms) con peticiones en vuelo: se cortan y sale con 1.`);
      server.closeAllConnections();
      exit(1);
    }, config.timeoutMs);
    server.close(() => {
      clearInterval(sweep);
      clearTimeout(timer);
      log('[apagado] sin peticiones en vuelo: sale con 0.');
      exit(0);
    });
    server.closeIdleConnections();
    log('[apagado] ya no acepta conexiones nuevas; esperando a las peticiones en vuelo.');
  }

  function shutdown(signal) {
    if (started) return;
    started = true;
    globalThis[SHUTTING_DOWN] = true;
    const server = getServer();
    if (!server || !server.listening) {
      log(`[apagado] ${signal} antes de escuchar: sale con 0.`);
      exit(0);
      return;
    }
    // Cada respuesta desde ahora cierra su conexión: el cliente (el
    // balanceador) no la reutiliza y abre otra, en otra instancia.
    server.prependListener('request', (_req, res) => {
      if (!res.headersSent) res.setHeader('Connection', 'close');
    });
    log(`[apagado] ${signal}: /api/health da 503; drenaje de ${config.drainMs} ms atendiendo antes de cerrar.`);
    setTimeout(() => closeServer(server), config.drainMs);
  }

  proc.once('SIGTERM', () => shutdown('SIGTERM'));
  proc.once('SIGINT', () => shutdown('SIGINT'));
  return { shutdown };
}

function main() {
  const { config, problems } = loadServerConfig(process.env);
  if (problems.length > 0) {
    for (const problem of problems) console.error(`[arranque] ${problem}`);
    process.exit(1);
  }
  process.env.KEEP_ALIVE_TIMEOUT = String(config.keepAliveTimeoutMs);
  process.env.NEXT_MANUAL_SIG_HANDLE = 'true';

  // Next crea su servidor con `http.createServer` dentro de `startServer`: se
  // captura el primero para fijarle los plazos y apagarlo.
  let server = null;
  const createServer = http.createServer;
  http.createServer = function (...args) {
    const created = createServer.apply(this, args);
    if (!server) {
      server = created;
      http.createServer = createServer;
      applyTimeouts(server, config);
      server.once('listening', () =>
        console.log(
          `[arranque] keep-alive ${config.keepAliveTimeoutMs} ms, cabeceras ${config.headersTimeoutMs} ms, drenaje ${config.drainMs} ms, tope de apagado ${config.timeoutMs} ms.`,
        ),
      );
    }
    return created;
  };
  installGracefulShutdown(() => server, config);
  require(path.resolve(process.argv[2] || path.join(__dirname, 'server.js')));
}

if (require.main === module) main();

module.exports = { SHUTTING_DOWN, LIMITS, loadServerConfig, applyTimeouts, installGracefulShutdown };
