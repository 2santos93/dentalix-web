import { expect, type Page } from '@playwright/test';

/**
 * Abre una sección desde la navegación principal, como lo haría la persona en
 * ese ancho (A4, app shell v2): en escritorio y tableta es un enlace de la barra
 * lateral; en el teléfono (< 768 px) la barra inferior solo lleva 4 secciones
 * y el resto vive en la hoja «Más». Si el enlace no está en la barra inferior,
 * abre «Más» y lo pulsa allí.
 */
export async function openSection(page: Page, name: string): Promise<void> {
  const width = page.viewportSize()?.width ?? 1280;
  if (width >= 768) {
    await page.getByRole('navigation', { name: 'Secciones' }).getByRole('link', { name, exact: true }).click();
    return;
  }
  const bottomBar = page.getByRole('navigation', { name: 'Principal' });
  await expect(bottomBar).toBeVisible();
  const inBar = bottomBar.getByRole('link', { name, exact: true });
  if ((await inBar.count()) > 0) {
    await inBar.click();
    return;
  }
  await bottomBar.getByRole('button', { name: 'Más', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Más' });
  await sheet.getByRole('navigation', { name: 'Más' }).getByRole('link', { name, exact: true }).click();
  await expect(sheet).toBeHidden();
}

/**
 * El selector de la sede activa del shell que está a la vista. En escritorio
 * se llama «Sede»; en la barra superior del teléfono es una pastilla con el
 * rótulo corto y su nombre accesible dice también la sede elegida
 * («Sede: Todas las sedes»), porque el rótulo visible va recortado.
 */
export function activeSedeSelect(page: Page) {
  return page.getByRole('combobox', { name: /^Sede(: .+)?$/ }).locator('visible=true').first();
}
