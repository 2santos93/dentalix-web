import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';

/**
 * e2e (DX-006): consentimiento informado firmado en pantalla.
 *
 *   1. /settings/consentimientos: el ADMIN crea una plantilla con variables.
 *   2. Ficha → «Consentimientos» (vacío) → «Nuevo consentimiento» → plantilla
 *      → vista previa con las variables resueltas → firmas → «Firmar»
 *      (deshabilitado hasta tener las dos firmas) → aparece en la lista.
 *   3. «Ver e imprimir» abre el documento en otra pestaña con la clínica, el
 *      texto, las dos firmas y la fecha; en `media: print` solo queda el
 *      documento.
 *   4. A 390px el modal cabe sin desplazar la página de lado y se firma igual.
 *
 * Requiere API y web levantadas (ver playwright.config.ts y support/urls.ts).
 * La clínica, el paciente con su plan y una plantilla se siembran por la API en
 * el `beforeAll` (DX-070), así que los dos tests son independientes: ninguno se
 * salta si el otro falla o se corre solo.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const runSuffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';
const ownerName = 'Dra Consentimientos';
const patientFirstName = 'Lucía';
const TEMPLATE_BODY =
  'Yo, {{paciente}} ({{documento}}), autorizo a {{profesional}} de {{clinica}} a realizar: {{tratamiento}}. Fecha: {{fecha}}.';

// Lo fija el `beforeAll` (DX-070): cada test es independiente y no se salta.
// El sufijo lleva una parte aleatoria por worker: si un reintento de CI vuelve
// a correr el `beforeAll`, la clínica nueva no choca con la anterior.
let suffix: string;
let clinicName: string;
let email: string;
let origin: string;
let patientId: string;
let patientLastName: string;
/** Plantilla sembrada por la API, para el test que no prueba crearla. */
let seededTemplateTitle: string;

/** Paciente con un plan de tratamiento (para la variable {{tratamiento}}). */
async function seedPatient(request: APIRequestContext, session: ApiSession): Promise<string> {
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: patientFirstName,
    lastName: patientLastName,
    docType: 'CC',
    docNumber: `CS${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
    code: `cs-${suffix}`,
    kind: 'PROCEDURE',
    labelEs: `Exodoncia simple ${suffix}`,
    color: '#3366CC',
    defaultPrice: 100,
  });
  const plan = await apiPost<{ id: string }>(
    request,
    session,
    `/patients/${patient.id}/treatment-plans`,
    { currency: 'USD' },
  );
  await apiPost(request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '48',
    catalogItemId: catalog.id,
  });
  return patient.id;
}

test.beforeAll(async ({ playwright }) => {
  suffix = `${runSuffix}${randomUUID().slice(0, 6)}`;
  clinicName = `Clinica Consentimientos ${suffix}`;
  email = `test.user.consent.${suffix}@example.com`;
  patientLastName = `Consentida${suffix}`;
  seededTemplateTitle = `Endodoncia ${suffix}`;

  const request = await playwright.request.newContext();
  try {
    const session = await registerClinicViaApi(request, {
      subdomain: `test-clinic-cons-${suffix}`,
      clinicName,
      fullName: ownerName,
      email,
      password,
    });
    origin = session.origin;
    patientId = await seedPatient(request, session);
    await apiPost(request, session, '/consent-templates', {
      title: seededTemplateTitle,
      body: TEMPLATE_BODY,
    });
  } finally {
    await request.dispose();
  }
});

/** Un trazo con el ratón (Pointer Events: mismo camino que el dedo). */
async function signOn(page: Page, canvas: Locator) {
  await canvas.scrollIntoViewIfNeeded();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('lienzo sin caja');
  await page.mouse.move(box.x + 20, box.y + box.height / 2);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(box.x + 20 + i * 25, box.y + box.height / 2 + (i % 2 ? -18 : 18));
  }
  await page.mouse.up();
}

async function signConsent(page: Page, templateTitle: string) {
  await page.getByRole('button', { name: 'Nuevo consentimiento' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo consentimiento' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Plantilla').selectOption({ label: templateTitle });
  await dialog.getByLabel(/plan de tratamiento/i).selectOption({ index: 1 });
  await dialog.getByRole('button', { name: 'Continuar' }).click();

  const text = dialog.getByRole('region', { name: 'Texto del consentimiento' });
  await expect(text).toContainText(`Yo, ${patientFirstName} ${patientLastName}`);
  await expect(text).toContainText(`Exodoncia simple ${suffix} (diente 48)`);
  await expect(text).toContainText(clinicName);
  await expect(text).not.toContainText('{{');
  await dialog.getByRole('button', { name: 'Continuar' }).click();

  const firmar = dialog.getByRole('button', { name: 'Firmar' });
  await expect(firmar).toBeDisabled();
  await signOn(page, dialog.getByRole('img', { name: 'Firma del paciente' }));
  await expect(firmar).toBeDisabled();
  await signOn(page, dialog.getByRole('img', { name: /Firma del profesional/ }));
  await expect(firmar).toBeEnabled();
  await firmar.click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
}

test('ADMIN crea la plantilla, el profesional firma y se imprime en A4', async ({
  page,
  context,
}) => {
  const templateTitle = `Exodoncia ${suffix}`;
  await loginAs(page, origin, email, password);

  // --- 1. Plantilla desde /settings/consentimientos ---
  await page.goto(`${origin}/settings/consentimientos`);
  await expect(page.getByRole('heading', { name: 'Consentimientos informados' })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva plantilla' }).click();
  const tplDialog = page.getByRole('dialog', { name: 'Nueva plantilla' });
  await tplDialog.getByLabel('Título').fill(templateTitle);
  await tplDialog
    .getByLabel('Texto del consentimiento')
    .fill(TEMPLATE_BODY);
  await tplDialog.getByRole('button', { name: 'Crear plantilla' }).click();
  await expect(tplDialog).toBeHidden();
  await expect(page.getByRole('table', { name: 'Plantillas de consentimiento' })).toContainText(
    templateTitle,
  );

  // La vista imprimible abre el diálogo de impresión: se neutraliza.
  await context.addInitScript(() => {
    window.print = () => undefined;
  });

  // --- 2. Ficha → «Consentimientos» → firmar ---
  await page.goto(`${origin}/patients/${patientId}?tab=consents`);
  const panel = page.locator('#tabpanel-consents');
  await expect(panel.getByText('Este paciente no tiene consentimientos firmados.')).toBeVisible({
    timeout: 10_000,
  });
  await signConsent(page, templateTitle);
  const table = panel.getByRole('table', { name: 'Consentimientos firmados' });
  await expect(table).toContainText(templateTitle);
  await expect(table).toContainText(`${patientFirstName} ${patientLastName} (paciente)`);

  // --- 3. Vista imprimible ---
  const [printPage] = await Promise.all([
    context.waitForEvent('page'),
    table.getByRole('link', { name: /Ver e imprimir/ }).click(),
  ]);
  await printPage.waitForLoadState();
  await expect(printPage).toHaveURL(new RegExp(`/print/patients/${patientId}/consents/[0-9a-f-]+$`));
  const header = printPage.getByTestId('consent-header');
  await expect(header).toContainText(clinicName);
  await expect(header.getByRole('heading', { level: 1 })).toHaveText(templateTitle);
  await expect(printPage.getByText(`Yo, ${patientFirstName} ${patientLastName}`)).toBeVisible();
  await expect(
    printPage.getByRole('img', { name: `Firma de ${patientFirstName} ${patientLastName}` }),
  ).toBeVisible();
  await expect(printPage.getByRole('img', { name: `Firma de ${ownerName}` })).toBeVisible();
  await expect(printPage.getByText('Huella SHA-256 del documento')).toBeVisible();

  const toolbar = printPage.getByRole('toolbar', { name: 'Acciones del documento' });
  await expect(toolbar).toBeVisible();
  await printPage.emulateMedia({ media: 'print' });
  await expect(toolbar).toBeHidden();
  await expect(printPage.getByTestId('consent-header')).toBeVisible();
});

test('a 390px el modal cabe y se firma con el puntero', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, email, password);

  await page.goto(`${origin}/patients/${patientId}?tab=consents`);
  const panel = page.locator('#tabpanel-consents');
  // Con o sin el consentimiento del otro test: este no depende de él.
  const list = panel.getByRole('list', { name: 'Consentimientos firmados' });
  await expect(
    list.or(panel.getByText('Este paciente no tiene consentimientos firmados.')),
  ).toBeVisible({ timeout: 10_000 });
  const before = await list.getByRole('listitem').count();

  await page.getByRole('button', { name: 'Nuevo consentimiento' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo consentimiento' });
  const width = await dialog.evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');

  await signConsent(page, seededTemplateTitle);
  await expect(list.getByRole('listitem')).toHaveCount(before + 1);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
