import { readFileSync } from 'node:fs';
import type { Locator, Page } from '@playwright/test';
import type { AxeResults } from 'axe-core';

const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

export type AxeViolation = { id: string; impact: string | null | undefined; nodes: { target: unknown[]; summary?: string }[] };

/**
 * Todas las violaciones de axe (cualquier gravedad, sin exclusiones) dentro
 * de `scope`, en el reposo: el ratón sale de encima de los botones (un hover a
 * medio color no es el reposo) y se esperan las animaciones del diálogo y del
 * cambio de tema, que a medias dan contrastes falsos.
 */
export async function axeViolations(page: Page, scope: Locator): Promise<AxeViolation[]> {
  await page.mouse.move(0, 0);
  // Reposo = varios frames seguidos sin transiciones ni animaciones finitas
  // en curso (p. ej. el `transition-colors` al pasar a `.dark`, que arranca
  // con retraso); las infinitas (`animate-pulse`) no cuentan.
  await page.evaluate(async () => {
    const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const running = () =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity);
    for (let quiet = 0, i = 0; quiet < 3 && i < 300; i++) {
      const now = running();
      if (now.length === 0) quiet++;
      else {
        quiet = 0;
        await Promise.allSettled(now.map((a) => a.finished));
      }
      await frame();
    }
  });
  if (!(await page.evaluate(() => 'axe' in window))) await page.evaluate(axeSource);
  return scope.evaluate(async (element) => {
    const axe = (window as unknown as { axe: { run: (context: Element) => Promise<AxeResults> } }).axe;
    const results = await axe.run(element);
    return results.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({ target: n.target as unknown[], summary: n.failureSummary })),
    }));
  });
}

/**
 * `axeViolations` en claro y en oscuro (por `prefers-color-scheme`, con
 * movimiento reducido); deja la página en claro. Devuelve las violaciones por
 * tema para afirmarlas con un mensaje que diga dónde.
 */
export async function axeInBothThemes(
  page: Page,
  scope: Locator,
  onTheme?: (colorScheme: 'light' | 'dark') => Promise<void>,
): Promise<Record<'light' | 'dark', AxeViolation[]>> {
  const out = {} as Record<'light' | 'dark', AxeViolation[]>;
  for (const colorScheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    // next-themes pone `.dark` desde su escucha de `matchMedia`, un instante
    // después; hasta entonces las transiciones de color aún no han empezado.
    await page.waitForFunction(
      (dark) => document.documentElement.classList.contains('dark') === dark,
      colorScheme === 'dark',
    );
    out[colorScheme] = await axeViolations(page, scope);
    if (onTheme) await onTheme(colorScheme);
  }
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' });
  return out;
}
