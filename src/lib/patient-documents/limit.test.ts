import { createLimiter } from './limit';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('createLimiter', () => {
  it('no corre más de `max` tareas a la vez y arranca las siguientes en orden', async () => {
    const run = createLimiter(3);
    const tasks = Array.from({ length: 5 }, deferred);
    const started: number[] = [];
    const all = tasks.map((t, i) =>
      run(async () => {
        started.push(i);
        await t.promise;
      }),
    );
    const settled = Promise.allSettled(all);
    await flush();
    expect(started).toEqual([0, 1, 2]);
    tasks[1].resolve();
    await flush();
    expect(started).toEqual([0, 1, 2, 3]);
    tasks[0].reject(new Error('fallo'));
    await flush();
    expect(started).toEqual([0, 1, 2, 3, 4]);
    tasks[2].resolve();
    tasks[3].resolve();
    tasks[4].resolve();
    const results = await settled;
    expect(results.map((r) => r.status)).toEqual(['rejected', 'fulfilled', 'fulfilled', 'fulfilled', 'fulfilled']);
  });
});
