import { test, expect } from './support/test';
import { expectNoHorizontalScroll } from './support/layout';

// DX-116: una URL mal escrita no enseña la pantalla de Next en inglés.
for (const { width, height } of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`una URL que no existe responde 404 en español, sin texto de Next (${width} px)`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const response = await page.goto('/no-existe');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeVisible();
    await expect(page.getByText('This page could not be found')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Ir al inicio' })).toHaveAttribute('href', '/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'es');
    await expectNoHorizontalScroll(page);
  });
}
