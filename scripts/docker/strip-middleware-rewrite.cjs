'use strict';
// SEC-062: Next devuelve al navegador la cabecera `x-middleware-rewrite` en las
// respuestas reescritas por proxy.ts, y con la reescritura de /api/v1 su valor
// es la URL interna de la API (`API_URL`). Es una cabecera que Next fija DESPUÉS
// del proxy (router-server → res.setHeader), así que proxy.ts no puede quitarla
// y la respuesta no pasa por ningún route handler. La imagen de producción
// precarga este fichero (`node --require`) y las respuestas HTTP del proceso
// dejan de poder llevarla: Next no la lee de vuelta de la respuesta (decide con
// los valores que devuelve, no con la cabecera ya escrita).
//   CMD ["node", "--require", "./strip-middleware-rewrite.cjs", "server.js"]
// eslint-disable-next-line @typescript-eslint/no-require-imports -- precarga CommonJS, sin build
const http = require('node:http');

const BLOCKED = 'x-middleware-rewrite';
const isBlocked = (name) => typeof name === 'string' && name.toLowerCase() === BLOCKED;
const proto = http.ServerResponse.prototype;

const setHeader = proto.setHeader;
proto.setHeader = function (name, value) {
  if (isBlocked(name)) return this;
  return setHeader.call(this, name, value);
};

const appendHeader = proto.appendHeader;
if (appendHeader) {
  proto.appendHeader = function (name, value) {
    if (isBlocked(name)) return this;
    return appendHeader.call(this, name, value);
  };
}

const writeHead = proto.writeHead;
function strip(headers) {
  if (!headers || typeof headers !== 'object') return headers;
  if (Array.isArray(headers)) {
    // Forma plana [k, v, k, v, ...] o de pares [[k, v], ...].
    if (headers.length && Array.isArray(headers[0])) return headers.filter((pair) => !isBlocked(pair[0]));
    const out = [];
    for (let i = 0; i < headers.length; i += 2) if (!isBlocked(headers[i])) out.push(headers[i], headers[i + 1]);
    return out;
  }
  const out = {};
  for (const key of Object.keys(headers)) if (!isBlocked(key)) out[key] = headers[key];
  return out;
}
proto.writeHead = function (statusCode, ...rest) {
  const last = rest.length - 1;
  if (last >= 0) rest[last] = strip(rest[last]);
  if (!this.headersSent) this.removeHeader(BLOCKED);
  return writeHead.call(this, statusCode, ...rest);
};
