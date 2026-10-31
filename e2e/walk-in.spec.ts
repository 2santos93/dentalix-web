import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-470: «Atender sin cita», urgencia de punta a punta.
 *
 * Una clínica nueva por corrida con un odontólogo («Óscar Urgencias»),
 * recepción («Rosa Mostrador»), el tipo «Consulta de urgencia» (Urgencia) y
 * una paciente. Sin huecos reservados: la API responde
 * `NO_RESERVED_SLOT` y el diálogo pide el motivo del sobrecupo (no depende
 * de la hora a la que corra). En serie:
 * 1. 1440 px, desde la agenda: alta mínima de un paciente nuevo, dos
 *    señales y nota; sobrecupo con motivo → sale en «En clínica» con la
 *    insignia «Urgencia», «Sobrecupo», sus señales y la nota;
 * 2. 390 px, desde «En clínica», solo con teclado: la paciente existente, una
 *    señal, sobrecupo; el diálogo cabe sin scroll horizontal.
 * 3. QA DX-470: alta mínima con el documento de otro paciente → el duplicado
 *    se avisa ANTES que el sobrecupo y «Usar ese paciente» muestra su nombre
 *    real (no el tecleado); en «En clínica» no sale la puntualidad.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `sincita-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.wi.${suffix}@example.com` };
const dentist = { fullName: 'Óscar Urgencias', email: `oscar.wi.${suffix}@example.com` };
const reception = { fullName: 'Rosa Mostrador', email: `rosa.wi.${suffix}@example.com` };
const lastName = `SinCita${suffix}`.slice(0, 40);
const existingDoc = `WI${suffix}`.slice(0, 20);
const duplicateDoc = `WD${suffix}`.slice(0, 20);

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Sin Cita ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await apiPost(request, session, '/appointment-types', {
    name: 'Consulta de urgencia',
    durationMinutes: 30,
    color: '#DC2626',
    isUrgent: true,
  });
  await apiPost(request, session, '/patients', {
    firstName: 'Berta',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: existingDoc,
    sex: 'F',
  });
  await apiPost(request, session, '/patients', {
    firstName: 'Sebastián',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: duplicateDoc,
    sex: 'M',
  });
});

async function expectInClinic(page: Page, name: string, signals: string[]) {
  await page.goto(`${origin}/agenda/en-clinica`);
  const row = page.getByTestId('in-clinic-item').filter({ hasText: name });
  await expect(row).toBeVisible({ timeout: 15_000 });
  const triage = row.getByRole('list', { name: `Señales de triaje de ${name}` });
  await expect(triage.getByRole('listitem')).toHaveText(['Urgencia', 'Sin cita', 'Sobrecupo', ...signals]);
  return row;
}

test('1440: paciente nuevo desde la agenda, sobrecupo con motivo y sale en «En clínica»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);

  await page.getByRole('button', { name: 'Atender sin cita' }).click();
  const dialog = page.getByRole('dialog', { name: 'Atender sin cita' });
  await dialog.getByRole('radio', { name: 'Paciente nuevo' }).click();
  await dialog.getByLabel('Nombre', { exact: true }).fill('Lucía');
  await dialog.getByLabel('Apellido', { exact: true }).fill(lastName);
  await dialog.getByLabel('Teléfono', { exact: true }).fill('+57 300 555 0101');
  await dialog.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await dialog.getByRole('checkbox', { name: 'Dolor' }).check();
  await dialog.getByRole('checkbox', { name: 'Inflamación' }).check();
  await dialog.getByLabel('Nota de triaje (opcional)').fill('Muela 36, dolor nocturno');
  await dialog.getByRole('button', { name: 'Atender', exact: true }).click();

  // Sin hueco reservado libre: el diálogo ofrece el sobrecupo con motivo.
  await expect(dialog.getByTestId('walk-in-overbook')).toContainText('No queda ningún hueco reservado libre hoy');
  await expect(dialog.getByLabel('Motivo del sobrecupo')).toBeFocused();
  await dialog.getByLabel('Motivo del sobrecupo').fill('Dolor agudo, no puede esperar');
  await dialog.getByRole('button', { name: 'Atender en sobrecupo' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const row = await expectInClinic(page, `Lucía ${lastName}`, ['Dolor', 'Inflamación']);
  await expect(row).toContainText('Muela 36, dolor nocturno');
  await expect(row).toContainText(dentist.fullName);
});

test('390: paciente existente desde «En clínica», solo con teclado y sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda/en-clinica`);

  await page.getByRole('button', { name: 'Atender sin cita' }).focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: 'Atender sin cita' });
  await expect(dialog).toBeVisible();
  await expect
    .poll(async () => {
      const box = (await dialog.boundingBox())!;
      return box.x >= 0 && box.x + box.width <= 390;
    })
    .toBe(true);
  await expectNoHorizontalScroll(page);
  const dialogOverflow = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(dialogOverflow).toBeLessThanOrEqual(0);

  await dialog.getByLabel('Buscar paciente').focus();
  await page.keyboard.type(existingDoc);
  const match = dialog.getByRole('button', { name: new RegExp(`Berta ${lastName}`) });
  await expect(match).toBeVisible({ timeout: 10_000 });
  await match.focus();
  await page.keyboard.press('Enter');
  await expect(dialog.getByTestId('walk-in-patient')).toHaveText(`Berta ${lastName}`);

  await dialog.getByLabel('Profesional', { exact: true }).focus();
  await dialog.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await dialog.getByRole('checkbox', { name: 'Sangrado' }).focus();
  await page.keyboard.press('Space');
  await expect(dialog.getByRole('checkbox', { name: 'Sangrado' })).toBeChecked();
  await dialog.getByRole('button', { name: 'Atender', exact: true }).focus();
  await page.keyboard.press('Enter');

  const reason = dialog.getByLabel('Motivo del sobrecupo');
  await expect(reason).toBeFocused({ timeout: 10_000 });
  await page.keyboard.type('Sangrado tras extracción');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  await expectInClinic(page, `Berta ${lastName}`, ['Sangrado']);
  await expectNoHorizontalScroll(page);
});

test('1440: documento duplicado → aviso antes del sobrecupo y «Usar ese paciente» con su nombre real', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);

  await page.getByRole('button', { name: 'Atender sin cita' }).click();
  const dialog = page.getByRole('dialog', { name: 'Atender sin cita' });
  await dialog.getByRole('radio', { name: 'Paciente nuevo' }).click();
  await dialog.getByLabel('Nombre', { exact: true }).fill('Sebastián');
  await dialog.getByLabel('Apellido', { exact: true }).fill('Tecleado');
  await dialog.getByLabel('Teléfono', { exact: true }).fill('+57 300 555 0102');
  await dialog.getByLabel('Documento (opcional)', { exact: true }).fill(duplicateDoc);
  await dialog.getByLabel('Profesional', { exact: true }).selectOption({ label: dentist.fullName });
  await dialog.getByRole('checkbox', { name: 'Dolor' }).check();
  await dialog.getByRole('button', { name: 'Atender', exact: true }).click();

  // Sin hueco reservado, pero el duplicado manda: todavía no se pide motivo.
  await expect(dialog.getByText('Ya existe un paciente con ese documento')).toBeVisible();
  await expect(dialog.getByText(`Es Sebastián ${lastName}.`)).toBeVisible();
  await expect(dialog.getByTestId('walk-in-overbook')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Usar ese paciente' }).click();
  await expect(dialog.getByTestId('walk-in-patient')).toHaveText(`Sebastián ${lastName}`);

  await dialog.getByRole('button', { name: 'Atender', exact: true }).click();
  await expect(dialog.getByLabel('Motivo del sobrecupo')).toBeFocused();
  await dialog.getByLabel('Motivo del sobrecupo').fill('Dolor agudo, no puede esperar');
  await dialog.getByRole('button', { name: 'Atender en sobrecupo' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const row = await expectInClinic(page, `Sebastián ${lastName}`, ['Dolor']);
  await expect(row).toContainText(/Llegó \d{1,2}:\d{2}/);
  await expect(row).not.toContainText('tarde');
  await expect(page.getByTestId('in-clinic-item').filter({ hasText: 'Tecleado' })).toHaveCount(0);
});
