/**
 * Semáforo simple: como mucho `max` tareas a la vez, el resto espera en orden
 * de llegada. La cola de documentos (DX-151) lo usa para no lanzar 20 subidas
 * de 20 MB en paralelo.
 */
export function createLimiter(max: number) {
  let running = 0;
  const waiting: (() => void)[] = [];

  function release() {
    running -= 1;
    const next = waiting.shift();
    if (next) next();
  }

  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (running >= max) {
      await new Promise<void>((resolve) => waiting.push(resolve));
    }
    running += 1;
    try {
      return await task();
    } finally {
      release();
    }
  };
}
