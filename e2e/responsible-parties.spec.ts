import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-203: bloque «Responsable y familia» y consentimiento de un menor.
 *
 * - 1440 px, tema claro: recepción busca a la madre (paciente) y la vincula
 *   como pagadora del hijo menor; la ficha del hijo la enseña con enlace y la
 *   de la madre dice «Responsable de: Tomás…».
 * - 390 px, tema oscuro: recepción da de alta un contacto sin ficha solo con
 *   el teclado, sin scroll horizontal y con el diálogo dentro de la pantalla.
 * - Consentimiento: el profesional firma el de un menor y el firmante tutor
 *   viene precargado desde la madre; si elige al paciente, se le avisa.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `responsables-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.resp.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.resp.${suffix}@example.com` };
const lastName = `Ortiz${suffix}`.slice(0, 40);
const templateTitle = `Sellantes ${suffix}`;

let session: ApiSession;
let motherId: string;
let sonId: string;
let daughterId: string;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Responsables ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  ({ id: motherId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Claudia',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `RM${suffix}`.slice(0, 20),
    sex: 'F',
    birthDate: '1985-01-01',
    email: `claudia.${suffix}@example.com`,
  }));
  ({ id: sonId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Tomás',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `RH${suffix}`.slice(0, 20),
    sex: 'M',
    birthDate: '2016-04-10',
  }));
  ({ id: daughterId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Sofía',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `RS${suffix}`.slice(0, 20),
    sex: 'F',
    birthDate: '2015-02-11',
  }));
  await apiPost(request, session, '/consent-templates', {
    title: templateTitle,
    body: 'Yo, {{paciente}} ({{documento}}), autorizo a {{profesional}} de {{clinica}}. Fecha: {{fecha}}.',
  });
});

function block(page: Page): Locator {
  return page.getByRole('region', { name: 'Responsable y familia' });
}

test('1440 px claro: recepción vincula a la madre como pagadora y sale en la ficha de ambos', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ colorScheme: 'light' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${sonId}`);

  await expect(block(page).getByText('Sin responsable registrado')).toBeVisible({ timeout: 15_000 });
  await block(page).getByRole('button', { name: 'Añadir responsable' }).click();
  const dialog = page.getByRole('dialog', { name: 'Añadir responsable' });
  await dialog.getByLabel('Buscar paciente').fill('Claudia');
  await dialog.getByRole('button', { name: new RegExp(`Claudia ${lastName}`) }).click();
  await dialog.getByLabel('Parentesco').selectOption('MOTHER');
  await dialog.getByLabel('Pagador principal').check();
  await dialog.getByRole('button', { name: 'Añadir' }).click();
  await expect(dialog).toBeHidden();

  const row = block(page).getByTestId('responsible-row');
  await expect(row).toContainText('Pagador principal');
  await expect(block(page)).toContainText(`Los avisos de este paciente van a Claudia`);
  await expectNoHorizontalScroll(page);

  await row.getByRole('link', { name: `Claudia ${lastName}` }).click();
  await expect(page).toHaveURL(new RegExp(`/patients/${motherId}`));
  const responsibleFor = block(page).getByTestId('responsible-for');
  await expect(responsibleFor).toContainText('Responsable de', { timeout: 15_000 });
  await expect(responsibleFor.getByRole('link', { name: new RegExp(`Tomás ${lastName}`) })).toHaveAttribute(
    'href',
    `/patients/${sonId}`,
  );
});

test('390 px oscuro: alta de un contacto sin ficha con el teclado, sin scroll horizontal', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/patients/${daughterId}`);

  await expect(block(page).getByText('Sin responsable registrado')).toBeVisible({ timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  const add = block(page).getByRole('button', { name: 'Añadir responsable' });
  await add.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Añadir responsable' });
  await expectDialogInsideViewport(page, dialog);

  await dialog.getByRole('radio', { name: 'Un contacto nuevo (sin ficha)' }).focus();
  await page.keyboard.press('Space');
  await dialog.getByLabel('Nombre completo').focus();
  await page.keyboard.type('Luis Ortiz');
  await dialog.getByLabel('Email').focus();
  await page.keyboard.type(`luis.${suffix}@example.com`);
  await dialog.getByLabel('Parentesco').selectOption('FATHER');
  await expectDialogInsideViewport(page, dialog);
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();

  await expect(block(page).getByTestId('responsible-row')).toContainText('Luis Ortiz');
  await expect(block(page)).toContainText('Recibe avisos');
  await expectNoHorizontalScroll(page);
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

test('consentimiento de un menor: el tutor viene precargado desde la madre y se avisa si firma el paciente', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/patients/${sonId}?tab=consents`);

  await page.getByRole('button', { name: 'Nuevo consentimiento' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo consentimiento' });
  await dialog.getByLabel('Plantilla').selectOption({ label: templateTitle });
  await dialog.getByRole('button', { name: 'Continuar' }).click();
  await expect(dialog.getByRole('region', { name: 'Texto del consentimiento' })).toContainText(
    `Yo, Tomás ${lastName}`,
  );
  await dialog.getByRole('button', { name: 'Continuar' }).click();

  await expect(dialog.getByRole('radio', { name: /tutor/i })).toBeChecked();
  await expect(dialog.getByLabel('Nombre del tutor')).toHaveValue(`Claudia ${lastName}`);
  await expect(dialog.getByLabel('Documento del tutor')).toHaveValue(`Documento nacional ${`RM${suffix}`.slice(0, 20)}`);

  await dialog.getByRole('radio', { name: 'El paciente' }).check();
  await expect(dialog).toContainText('El paciente es menor de 18 años: lo habitual es que firme su responsable.');
  await dialog.getByRole('radio', { name: /tutor/i }).check();

  await signOn(page, dialog.getByRole('img', { name: 'Firma del tutor' }));
  await signOn(page, dialog.getByRole('img', { name: /Firma del profesional/ }));
  await dialog.getByRole('button', { name: 'Firmar' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
});
