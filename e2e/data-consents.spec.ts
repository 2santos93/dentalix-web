import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { registerAndLogin } from './support/auth';
import { openPatientTab } from './support/patient-tabs';

/**
 * e2e (DX-037): autorización de datos Ley 1581 versionada y con prueba.
 *
 *   1. El ADMIN publica la política v1 en Ajustes › Privacidad de datos.
 *   2. En el alta del paciente, el paso «Autorización de datos» muestra el texto
 *      vigente con tres casillas SIN MARCAR; se marcan las tres y se guarda.
 *   3. La pestaña «Autorizaciones» de la ficha muestra el estado vigente y el
 *      historial; revocar MARKETING añade una fila y cambia su estado.
 *   4. A 390px la pestaña no desborda la página en horizontal.
 *
 * Requiere los dos servidores (ver `playwright.config.ts` y
 * `e2e/support/urls.ts` para cambiar puertos). Toda la navegación va sobre el
 * origen del tenant que devuelve `registerAndLogin`.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `test-clinic-dc-${suffix}`.slice(0, 40);
const email = `test.user.datos.${suffix}@example.com`;
const password = 'Password123!';
const patientLastName = `Autoriza${suffix}`.slice(0, 30);

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('autorización de datos: publicar política → alta con casillas → ficha y revocación', async ({
  page,
}) => {
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName: `Clinica Datos ${suffix}`,
    fullName: 'Test Admin',
    email,
    password,
  });

  // --- 1. Publicar la política v1 (ADMIN) ---
  await page.goto(`${origin}/settings/privacidad`);
  await expect(page.getByText(/aún no ha publicado su política/i)).toBeVisible();
  await page.getByRole('button', { name: 'Publicar la política' }).click();
  const publishDialog = page.getByRole('dialog');
  await expect(publishDialog.getByLabel(/datos sensibles de salud/i)).not.toHaveValue('');
  await publishDialog.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(publishDialog).toBeHidden();
  await expect(page.getByText(/versión 1 · publicada el/i)).toBeVisible();

  // --- 2. Alta del paciente con el paso de autorización ---
  await page.goto(`${origin}/patients/new`);
  await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
  await page.getByLabel('Tipo de documento').selectOption('NATIONAL_ID');
  await page.getByLabel(/apellido/i).fill(patientLastName);
  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: /siguiente/i }).click();
  }
  await expect(
    page.getByRole('region', { name: /texto completo de la política/i }),
  ).toContainText('Ley 1581');
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) await expect(boxes.nth(i)).not.toBeChecked();

  await page.getByRole('checkbox', { name: /datos personales/i }).check();
  await page.getByRole('checkbox', { name: /datos sensibles de salud/i }).check();
  await page.getByRole('checkbox', { name: /comunicaciones comerciales/i }).check();
  await page.getByRole('button', { name: 'Crear paciente' }).click();
  await page.waitForURL(/\/patients\/[0-9a-f-]{36}$/);

  // --- 3. Pestaña «Autorizaciones» y revocación de MARKETING ---
  await openPatientTab(page, 'Autorizaciones');
  for (const scope of ['GENERAL', 'SENSITIVE_HEALTH', 'MARKETING']) {
    await expect(page.getByTestId(`consent-status-${scope}`)).toContainText('Autorizado');
  }
  const history = page.getByRole('table', { name: /historial de autorizaciones/i });
  await expect(history.getByRole('row')).toHaveCount(4);
  await expect(history).toContainText('Test Admin');

  await page
    .getByTestId('consent-status-MARKETING')
    .getByRole('button', { name: /revocar/i })
    .click();
  const revokeDialog = page.getByRole('dialog');
  await revokeDialog.getByRole('button', { name: 'Revocar', exact: true }).click();
  await expect(revokeDialog).toBeHidden();
  await expect(page.getByTestId('consent-status-MARKETING')).toContainText('No autorizado');
  await expect(history.getByRole('row')).toHaveCount(5);
  await expect(page.getByTestId('consent-status-GENERAL')).toContainText('Autorizado');

  // --- 4. Usable a 390px ---
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId('consent-status-MARKETING')).toBeVisible();
  await expectNoHorizontalScroll(page);
});
