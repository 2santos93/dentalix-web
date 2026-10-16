import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';

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
 * La siembra (paciente + plan) va por `page.request` con `X-Tenant-Host`.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Clinica Consentimientos ${suffix}`;
const subdomain = `test-clinic-cons-${suffix}`;
const email = `test.user.consent.${suffix}@example.com`;
const password = 'Password123!';
const ownerName = 'Dra Consentimientos';
const patientFirstName = 'Lucía';
const patientLastName = `Consentida${suffix}`;
const templateTitle = `Exodoncia ${suffix}`;

async function seedPatient(
  request: APIRequestContext,
  origin: string,
  accessToken: string,
): Promise<string> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await post<{ id: string }>('/patients', {
    firstName: patientFirstName,
    lastName: patientLastName,
    docType: 'CC',
    docNumber: `CS${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await post<{ id: string }>('/catalog/items', {
    code: `cs-${suffix}`,
    kind: 'PROCEDURE',
    labelEs: `Exodoncia simple ${suffix}`,
    color: '#3366CC',
    defaultPrice: 100,
  });
  const plan = await post<{ id: string }>(`/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  await post(`/treatment-plans/${plan.id}/items`, { toothNumber: '48', catalogItemId: catalog.id });
  return patient.id;
}

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

async function signConsent(page: Page) {
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

test.describe.configure({ mode: 'serial' });

let origin: string;
let patientId: string;

test('ADMIN crea la plantilla, el profesional firma y se imprime en A4', async ({
  page,
  context,
}) => {
  origin = await registerAndLogin(page, {
    subdomain,
    clinicName,
    fullName: ownerName,
    email,
    password,
  });
  const authRaw = await page.evaluate(() => localStorage.getItem('dentalix-auth'));
  const accessToken =
    (JSON.parse(authRaw as string) as { state?: { accessToken?: string | null } }).state
      ?.accessToken ?? '';
  expect(accessToken).toBeTruthy();
  patientId = await seedPatient(page.request, origin, accessToken);

  // --- 1. Plantilla desde /settings/consentimientos ---
  await page.goto(`${origin}/settings/consentimientos`);
  await expect(page.getByRole('heading', { name: 'Consentimientos informados' })).toBeVisible();
  await page.getByRole('button', { name: 'Nueva plantilla' }).click();
  const tplDialog = page.getByRole('dialog', { name: 'Nueva plantilla' });
  await tplDialog.getByLabel('Título').fill(templateTitle);
  await tplDialog
    .getByLabel('Texto del consentimiento')
    .fill('Yo, {{paciente}} ({{documento}}), autorizo a {{profesional}} de {{clinica}} a realizar: {{tratamiento}}. Fecha: {{fecha}}.');
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
  await signConsent(page);
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
  test.skip(!origin, 'depende del primer test');
  await page.setViewportSize({ width: 390, height: 844 });
  // Misma sesión: se reutiliza la del primer test iniciando sesión de nuevo.
  await page.goto(`${origin}/login`);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(password);
  await page.getByRole('button', { name: /iniciar sesión|entrar/i }).click();
  await page.waitForURL(/\/(dashboard|agenda|patients)/, { timeout: 15_000 });

  await page.goto(`${origin}/patients/${patientId}?tab=consents`);
  const panel = page.locator('#tabpanel-consents');
  await expect(panel.getByRole('list', { name: 'Consentimientos firmados' })).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole('button', { name: 'Nuevo consentimiento' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo consentimiento' });
  const width = await dialog.evaluate((el) => el.getBoundingClientRect().width);
  expect(width).toBeLessThanOrEqual(390);
  await page.keyboard.press('Escape');

  await signConsent(page);
  await expect(panel.getByRole('list', { name: 'Consentimientos firmados' }).getByRole('listitem')).toHaveCount(2);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
