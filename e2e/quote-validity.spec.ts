import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi } from './support/api';
import { API_URL } from './support/urls';
import { addDays, sedeDayFromToday } from './support/clock';
import { E2E_REGION } from './support/regional';
import { axeInBothThemes } from './support/axe';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { shot } from './support/qa-shot';
import { regionalFormat } from '../src/lib/format/regional-format';

/**
 * e2e (DX-379, porción A): la validez del presupuesto se guarda y se ve.
 *
 * En una clínica nueva (el ajuste es de la clínica: cambiarlo en la DEMO
 * movería los «Válido 30 días» de otros specs):
 *   - la administradora cambia en Ajustes › Presupuestos los días a 45;
 *   - crea por la API un plan con un ítem y lo presenta en la ficha;
 *   - la cabecera del plan dice «Válido hasta el …» y la vista A4 «Válido 45
 *     días hasta el …», con el día de la sede (hoy en la sede + 45);
 *   - axe limpio en Ajustes › Presupuestos; nada se desplaza en horizontal a
 *     390 px; capturas a 390 y 1440 px.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 12);
const clinic = {
  subdomain: `test-clinic-validez-${suffix}`,
  clinicName: `Clínica Validez ${suffix}`,
  fullName: 'Dra. Validez',
  email: `validez.${suffix}@example.com`,
  password: 'Password123!',
};
const DAYS = 45;
// El formato de la sede de la clínica (es-VE): el mismo que pinta la web.
const fmt = regionalFormat(E2E_REGION);

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

async function expectSettingsClean(page: Page, width: number): Promise<void> {
  const found = await axeInBothThemes(page, page.locator('main'));
  for (const scheme of ['light', 'dark'] as const) {
    expect(found[scheme], `axe (${scheme}) en Ajustes › Presupuestos a ${width} px`).toEqual([]);
  }
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
}

/**
 * La validez en sus dos sitios de la ficha (M-6): la cabecera del plan (la
 * línea de estado bajo «#tp-detail-heading») y el panel de opciones (junto a
 * «Presentado al paciente el …»). Una vez en cada uno.
 */
async function expectValidityInBothPlaces(page: Page, until: string): Promise<void> {
  const panel = page.locator('#tabpanel-treatment-plans');
  const text = `Válido hasta el ${until}`;
  await expect(panel.getByTestId('quote-valid-until')).toHaveCount(2, { timeout: 15_000 });
  await expect(panel.locator('#tp-detail-heading + p').getByTestId('quote-valid-until')).toHaveText(text);
  await expect(
    panel.locator('p', { hasText: /^Presentado al paciente el / }).getByTestId('quote-valid-until'),
  ).toHaveText(text);
}

test('ADMIN fija 45 días; al presentar, el plan y el presupuesto impreso valen hasta hoy + 45 en la sede', async ({
  page,
  context,
  request,
}) => {
  const admin = await registerClinicViaApi(request, clinic);
  // La vista imprimible abre el diálogo de impresión: se neutraliza.
  await context.addInitScript(() => {
    window.print = () => undefined;
  });
  await loginAs(page, admin.origin, clinic.email, clinic.password);

  // --- 1. Ajustes › Presupuestos: 30 días por defecto → 45.
  await page.setViewportSize(VIEWPORTS[0]);
  await page.goto(`${admin.origin}/settings/presupuestos`);
  await expect(page.getByRole('heading', { level: 1, name: 'Presupuestos' })).toBeVisible({ timeout: 15_000 });
  const value = page.getByTestId('quote-validity-days');
  await expect(value).toHaveText('30 días');
  await page.getByRole('button', { name: 'Cambiar la validez del presupuesto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cambiar la validez del presupuesto' });
  const dialogAxe = await axeInBothThemes(page, dialog);
  expect(dialogAxe.light, 'axe del diálogo (claro)').toEqual([]);
  expect(dialogAxe.dark, 'axe del diálogo (oscuro)').toEqual([]);
  await dialog.getByLabel('Días').fill(String(DAYS));
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect(value).toHaveText(`${DAYS} días`);
  await expect(page.getByText(`Validez guardada: ${DAYS} días.`)).toBeVisible();
  // Lo guardado es lo que devuelve la API.
  const saved = await request.get(`${API_URL}/treatment-plan-settings`, { headers: admin.headers });
  expect(await saved.json()).toEqual({ validityDays: DAYS });

  // --- 2. Un plan con un ítem por la API; se presenta en la ficha.
  const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
    code: `val-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: `Resina ${suffix}`,
    color: '#3366CC',
    defaultPrice: 150,
  });
  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Valeria',
    lastName: `Validez${suffix}`,
    docType: 'NATIONAL_ID',
    docNumber: `DX379${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  await apiPost(request, admin, `/treatment-plans/${plan.id}/items`, { toothNumber: '16', catalogItemId: catalog.id });

  await page.goto(`${admin.origin}/patients/${patient.id}?tab=treatment-plans`);
  const panel = page.locator('#tabpanel-treatment-plans');
  const before = sedeDayFromToday(0);
  await panel.getByRole('button', { name: 'Presentar al paciente' }).click();
  await expect(panel.getByText(/^Presentado al paciente el /)).toBeVisible({ timeout: 15_000 });
  const after = sedeDayFromToday(0);

  // El día de emisión es el de la sede cuando la API presentó (entre `before`
  // y `after`, que solo difieren si se cruzó la medianoche de la sede).
  const res = await request.get(`${API_URL}/treatment-plans/${plan.id}`, {
    headers: admin.headers,
  });
  expect(res.ok(), `GET del plan falló: ${await res.text()}`).toBeTruthy();
  const stored = (await res.json()) as { quoteIssuedOn: string; quoteValidUntil: string; quoteExpired: boolean };
  expect([before, after]).toContain(stored.quoteIssuedOn);
  expect(stored.quoteValidUntil).toBe(addDays(stored.quoteIssuedOn, DAYS));
  expect(stored.quoteExpired).toBe(false);
  const until = fmt.civilDate(stored.quoteValidUntil);

  // Cabecera del plan y panel de opciones: «Válido hasta el …», sin «Vencido».
  await expectValidityInBothPlaces(page, until);
  await expect(panel.getByTestId('quote-expired')).toHaveCount(0);

  // --- 3. La vista A4: «Válido 45 días hasta el …».
  const [printPage] = await Promise.all([
    context.waitForEvent('page'),
    panel.getByRole('link', { name: /Imprimir presupuesto/ }).click(),
  ]);
  const header = printPage.getByTestId('quote-header');
  await expect(header).toBeVisible({ timeout: 15_000 });
  await expect(header).toContainText(`Válido ${DAYS} días hasta el ${until}`);
  await expect(header).toContainText(fmt.civilDate(stored.quoteIssuedOn));

  // --- 4. 1440 y 390 px: Ajustes, la ficha y la vista A4.
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await page.goto(`${admin.origin}/settings/presupuestos`);
    await expect(page.getByTestId('quote-validity-days')).toHaveText(`${DAYS} días`, { timeout: 15_000 });
    await expectSettingsClean(page, viewport.width);
    await shot(page, 'dx379-settings', viewport.width);

    await page.goto(`${admin.origin}/patients/${patient.id}?tab=treatment-plans`);
    await expectValidityInBothPlaces(page, until);
    await expectNoHorizontalScroll(page);
    await shot(page, 'dx379-plan', viewport.width);

    await printPage.setViewportSize(viewport);
    await printPage.reload();
    await expect(header).toContainText(`Válido ${DAYS} días hasta el ${until}`, { timeout: 15_000 });
    await expectNoHorizontalScroll(printPage);
    await shot(printPage, 'dx379-print', viewport.width);
  }
  await printPage.close();
});
