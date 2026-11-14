// DX-458 (OPS-054): una conexión keep-alive con la web sigue viva tras estar
// ociosa más que los 5 s por defecto de Node. Dos GET por el MISMO socket con
// `idleMs` de inactividad entre ellos; falla si el servidor cerró la conexión
// en medio (el segundo GET iría por un socket nuevo).
//   node keep-alive.mjs <url> <idleMs>
import http from 'node:http';

const [url, idleArg] = process.argv.slice(2);
const idleMs = Number(idleArg);
const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });

function get() {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { agent }, (res) => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, reused: req.reusedSocket, socket: req.socket }));
    });
    req.on('error', reject);
  });
}

const first = await get();
let closedAt = null;
first.socket.once('close', () => (closedAt = Date.now()));
const t0 = Date.now();
await new Promise((resolve) => setTimeout(resolve, idleMs));
if (closedAt !== null) {
  console.error(`FALLO: la web cerró la conexión ociosa a los ${closedAt - t0} ms`);
  process.exit(1);
}
const second = await get();
agent.destroy();
if (first.status !== 200 || second.status !== 200 || !second.reused) {
  console.error(`FALLO: ${JSON.stringify({ first: first.status, second: second.status, reused: second.reused })}`);
  process.exit(1);
}
console.log(`keep-alive: la conexión siguió viva tras ${idleMs} ms ociosa y se reutilizó`);
