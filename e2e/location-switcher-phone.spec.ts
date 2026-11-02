import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-523: a 390 px el selector de sede de la barra enseña el nombre entero
 * (30 caracteres o más) a dos líneas sin mover la barra, y en Ajustes › Sedes
 * «Editar» está activo con «Todas las sedes». Axe en claro y oscuro; capturas a
 * 390 y 1440 px en `test-results`, que CI sube como artefacto.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `selector-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.selector.${suffix}@example.com`;
const LONG_NAME = 'Sede Avenida Francisco de Miranda';

let session: ApiSession;

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Selector ${suffix}`,
    fullName: 'Valeria Titular',
    email: adminEmail,
    password,
  });
  await apiPost(request, session, '/locations', { name: LONG_NAME, ...E2E_REGION });
});

test('a 390 px el nombre largo se lee entero y «Editar» sigue activo', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/settings/sedes`);

  const select = page.getByRole('combobox', { name: /^Sede/ }).first();
  await select.selectOption({ label: LONG_NAME });
  const pill = page.locator('span[title^="Sede:"]');
  const label = pill.locator('span').first();
  await expect(label).toHaveText(LONG_NAME);

  const fits = await label.evaluate((el) => ({ full: el.scrollHeight <= el.clientHeight, height: el.clientHeight }));
  expect(fits.full, 'el nombre cabe en sus dos líneas').toBe(true);
  expect((await pill.boundingBox())?.height).toBe(44);
  await expectNoHorizontalScroll(page);

  const brand = page.locator('header').getByText(`Clínica Selector ${suffix}`).first();
  if (await brand.isVisible()) expect((await brand.boundingBox())?.width ?? 0).toBeGreaterThan(80);

  const violations = await axeInBothThemes(page, page.locator('body'), async (scheme) => {
    await page.screenshot({ path: testInfo.outputPath(`pill-390-${scheme}.png`) });
  });
  for (const [scheme, list] of Object.entries(violations)) {
    const serious = list.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    expect(serious, `axe en ${scheme}`).toEqual([]);
  }

  await select.selectOption({ index: 0 });
  await page.setViewportSize({ width: 1440, height: 900 });
  const edit = page.getByRole('button', { name: new RegExp(`Editar.*${LONG_NAME}`) });
  await expect(edit).toBeEnabled();
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: testInfo.outputPath(`editar-1440-${scheme}.png`) });
  }
});
