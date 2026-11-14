import { mkdirSync } from 'node:fs';
import { expect, type Page } from '@playwright/test';

/**
 * La captura `${name}-${width}-${scheme}.png` en claro y oscuro, en
 * `E2E_QA_DIR` (sin la variable no captura); deja la página en claro.
 */
export async function shot(page: Page, name: string, width: number): Promise<void> {
  const qaDir = process.env.E2E_QA_DIR;
  if (!qaDir) return;
  mkdirSync(qaDir, { recursive: true });
  // Sin el hover del último clic y sin transiciones de color a medias.
  await page.mouse.move(0, 0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
    await page.screenshot({ path: `${qaDir}/${name}-${width}-${scheme}.png`, fullPage: false });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}
