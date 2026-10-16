import { test as base, expect } from '@playwright/test';

export * from '@playwright/test';

/**
 * `test` de la suite con un guardián de CSP (DX-062): cualquier violación de la
 * Content-Security-Policy que el navegador registre en la consola (en la página
 * del test o en las que abra, como la imprimible) hace fallar el test. Así la
 * suite completa demuestra que la app funciona con la CSP activa.
 */
export const test = base.extend<{ cspGuard: void }>({
  cspGuard: [
    async ({ context }, use) => {
      const violations: string[] = [];
      context.on('console', (msg) => {
        const text = msg.text();
        if (/Content Security Policy/i.test(text)) violations.push(text);
      });
      await use();
      expect(violations, 'violaciones de CSP en la consola del navegador').toEqual([]);
    },
    { auto: true },
  ],
});
