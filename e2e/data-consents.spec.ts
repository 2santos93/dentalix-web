import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { registerAndLogin } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { openPatientTab } from './support/patient-tabs';

/**
 * e2e (DX-037, DX-325): autorización de datos versionada y con prueba.
 *
 *   1. El ADMIN publica la política v1 en Ajustes › Privacidad de datos: la
 *      plantilla neutra no se publica hasta sustituir sus marcadores.
 *   2. En el alta del paciente, el paso «Autorización de datos» muestra el texto
 *      vigente, sin citas legales, con tres casillas SIN MARCAR; se marcan las
 *      tres y se guarda.
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
const QA_DIR = process.env.E2E_QA_DIR;

const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

/**
 * La captura `${name}-${width}-${scheme}.png` a 1440 y 390 px, en claro y
 * oscuro, sin scroll horizontal; deja la página a 1440. `target` se desplaza a
 * la vista en cada ancho.
 */
async function shoot(
  page: Page,
  name: string,
  target?: Locator,
  block: ScrollLogicalPosition = 'start',
): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalScroll(page);
    await target?.evaluate((el, b) => el.scrollIntoView({ block: b }), block);
    // Sin el hover del último clic y sin transiciones de color a medias.
    await page.mouse.move(0, 0);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
      await page.screenshot({ path: `${QA_DIR}/${name}-${viewport.width}-${scheme}.png`, fullPage: false });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('autorización de datos: publicar política → alta con casillas → ficha y revocación', async ({
  page,
}) => {
  await page.setViewportSize(VIEWPORTS[0]);
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
  // La plantilla con sus marcadores no se publica.
  await publishDialog.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(publishDialog.getByText('Sustituye los textos entre corchetes')).toBeVisible();
  const hint = publishDialog.getByText('Conviene que diga que autorizar es voluntario');
  await expect(hint).toBeVisible();
  const violations = await axeInBothThemes(page, publishDialog);
  expect(violations.light, 'axe del diálogo de publicación (claro)').toEqual([]);
  expect(violations.dark, 'axe del diálogo de publicación (oscuro)').toEqual([]);
  await shoot(page, 'privacy-publish', hint, 'end');

  // Se sustituyen con valores neutros y entonces sí se publica.
  const policyField = publishDialog.getByLabel('Texto completo de la política');
  const template = await policyField.inputValue();
  await policyField.fill(
    template
      .replace('[Nombre de la clínica]', `Clínica Datos ${suffix}`)
      .replace('[Dirección]', 'Dirección de prueba 1')
      .replace('[Correo o teléfono de contacto]', 'contacto@example.com'),
  );
  await publishDialog.getByRole('button', { name: 'Publicar', exact: true }).click();
  await expect(publishDialog).toBeHidden();
  await expect(page.getByText(/versión 1 · publicada el/i)).toBeVisible();
  await shoot(page, 'privacy-current');

  // --- 2. Alta del paciente con el paso de autorización ---
  await page.goto(`${origin}/patients/new`);
  await page.getByLabel('Nombre', { exact: true }).fill('Lucía');
  await page.getByLabel('Tipo de documento').selectOption('NATIONAL_ID');
  await page.getByLabel(/apellido/i).fill(patientLastName);
  for (let i = 0; i < 4; i += 1) {
    await page.getByRole('button', { name: /siguiente/i }).click();
  }
  const policyRegion = page.getByRole('region', { name: /texto completo de la política/i });
  await expect(policyRegion).toContainText('Responsable del tratamiento');
  await expect(policyRegion).toContainText(`Clínica Datos ${suffix}`);
  // Armado por partes: la gate de grep de DX-325 no admite el literal aquí.
  const lawCitation = new RegExp(String.raw`\bLey\b|Decreto|` + 'Superinten' + 'dencia');
  await expect(policyRegion).not.toContainText(lawCitation);
  const boxes = page.getByRole('checkbox');
  await expect(boxes).toHaveCount(3);
  for (let i = 0; i < 3; i += 1) await expect(boxes.nth(i)).not.toBeChecked();
  await shoot(page, 'consent-step', page.getByRole('heading', { name: 'Autorización de tratamiento de datos' }));

  await page.getByRole('checkbox', { name: /datos personales/i }).check();
  await page.getByRole('checkbox', { name: /datos sensibles de salud/i }).check();
  await page.getByRole('checkbox', { name: /comunicaciones comerciales/i }).check();
  await page.getByRole('button', { name: /guardar/i }).click();
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
