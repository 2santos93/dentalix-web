import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL } from './support/urls';

/**
 * e2e (DX-484): código del paciente para el software de imagen.
 *
 *  1. La ficha muestra «Código N» con «Copiar», que copia solo el código; el
 *     código es el mismo que da la API y dos pacientes no lo comparten.
 *  2. «Datos para el software de imagen» (ADMIN): el diálogo enseña el .txt de
 *     la API (apellidos y nombre también sin tildes, fecha en los dos
 *     formatos), lo copia y lo descarga como `paciente-<código>.txt`.
 *  3. RECEPCIÓN ve el código pero no la acción, y la API le niega el .txt.
 *  4. A 390 px: botón de copiar ≥ 44 px y sin desplazamiento lateral; la
 *     página de ayuda tiene las cuatro secciones.
 */
const rawSuffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const password = 'Password123!';

let suffix: string;
let origin: string;
let admin: ApiSession;
let adminEmail: string;
let receptionEmail: string;
let patient: { id: string; patientCode: string };
let other: { id: string; patientCode: string };

test.beforeAll(async ({ playwright }) => {
  suffix = `${rawSuffix.slice(0, 10)}${randomUUID().slice(0, 6)}`;
  adminEmail = `admin.img.${suffix}@example.com`;
  receptionEmail = `recepcion.img.${suffix}@example.com`;
  const request = await playwright.request.newContext();
  try {
    admin = await registerClinicViaApi(request, {
      subdomain: `img-${suffix}`,
      clinicName: `Clinica Imagen ${suffix}`,
      fullName: 'Dra Imagen',
      email: adminEmail,
      password,
    });
    origin = admin.origin;
    await addStaffViaApi(request, admin, {
      fullName: 'Recepción Imagen',
      email: receptionEmail,
      role: 'RECEPTION',
      password,
    });
    patient = await apiPost(request, admin, '/patients', {
      firstName: 'José Ángel',
      lastName: 'Pérez Núñez',
      docType: 'NATIONAL_ID',
      docNumber: `IMG1${suffix}`.slice(0, 20),
      sex: 'M',
      birthDate: '1990-03-05',
    });
    other = await apiPost(request, admin, '/patients', {
      firstName: 'María',
      lastName: 'Gómez',
      docType: 'NATIONAL_ID',
      docNumber: `IMG2${suffix}`.slice(0, 20),
      sex: 'F',
    });
  } finally {
    await request.dispose();
  }
});

test('DX-484: código con «Copiar» y datos para el software de imagen (ADMIN), descarga .txt y 390 px', async ({
  page,
}) => {
  expect(patient.patientCode).toMatch(/^[1-9][0-9]*$/);
  expect(other.patientCode).not.toBe(patient.patientCode);

  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
  await loginAs(page, origin, adminEmail, password);
  await page.goto(`${origin}/patients/${patient.id}`);

  const code = page.getByTestId('patient-code');
  await expect(code).toHaveText(patient.patientCode);
  await page.getByRole('button', { name: `Copiar el código del paciente ${patient.patientCode}` }).click();
  await expect(page.getByTestId('patient-code-status')).toHaveText('Código copiado');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(patient.patientCode);

  await page.getByRole('button', { name: 'Más acciones' }).click();
  await page.getByRole('menuitem', { name: 'Datos para el software de imagen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Datos para el software de imagen' });
  await expect(dialog).toBeVisible();
  const text = dialog.locator('pre');
  await expect(text).toContainText(`Código del paciente: ${patient.patientCode}`);
  await expect(text).toContainText('Apellidos: Pérez Núñez');
  await expect(text).toContainText('Apellidos (sin tildes): Perez Nunez');
  await expect(text).toContainText('Nombre (sin tildes): Jose Angel');
  await expect(text).toContainText('Fecha de nacimiento: 05.03.1990');
  await expect(text).toContainText('Fecha de nacimiento (aaaa-mm-dd): 1990-03-05');
  await expect(text).toContainText('Sexo: M');

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Descargar .txt' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`paciente-${patient.patientCode}.txt`);
  const body = readFileSync((await download.path())!, 'utf8');
  expect(body).toContain('Nombre: José Ángel\r\n');
  expect(body).not.toMatch(/IMG1/); // sin el documento ni otros datos

  await dialog.getByRole('button', { name: 'Copiar' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain(
    `Código del paciente: ${patient.patientCode}`,
  );

  await dialog.getByRole('link', { name: 'Cómo darlo de alta en Sidexis, Romexis, Dexis o CS Imaging' }).click();
  await expect(page).toHaveURL(/\/ayuda\/software-de-imagen$/);
  for (const name of ['Sidexis', 'Romexis', 'Dexis', 'CS Imaging']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await page.goto(`${origin}/patients/${patient.id}`);
  const copyButton = page.getByRole('button', { name: `Copiar el código del paciente ${patient.patientCode}` });
  await expect(copyButton).toBeVisible();
  const box = await copyButton.boundingBox();
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(box!.width).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalScroll(page);
});

test('DX-484: RECEPCIÓN ve el código pero no los datos para el software de imagen', async ({ page, request }) => {
  await loginAs(page, origin, receptionEmail, password);
  await page.goto(`${origin}/patients/${patient.id}`);
  await expect(page.getByTestId('patient-code')).toHaveText(patient.patientCode);
  const menu = page.getByRole('button', { name: 'Más acciones' });
  if (await menu.count()) {
    await menu.click();
    await expect(page.getByRole('menuitem', { name: 'Datos para el software de imagen' })).toHaveCount(0);
    await page.keyboard.press('Escape');
  }

  const reception = await apiLogin(request, origin, receptionEmail, password);
  const denied = await request.get(`${API_URL}/patients/${patient.id}/imaging-export.txt`, {
    headers: reception.headers,
  });
  expect(denied.status()).toBe(403);
});
