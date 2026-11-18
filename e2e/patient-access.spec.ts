import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { atSede, sedeDayFromToday } from './support/clock';
import { fillDate } from './support/dates';
import { axeInBothThemes } from './support/axe';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR } from './support/mail';
import { shot } from './support/qa-shot';
import { API_URL } from './support/urls';

/**
 * e2e DX-101: el enlace de acceso del paciente (solo lectura).
 *
 *   1. La administradora de una clínica nueva (sede en Caracas, sembrada por
 *      la API: paciente con fecha de nacimiento y teléfono +58, una cita
 *      futura y un presupuesto USD presentado) abre la ficha → «⋯» →
 *      «Compartir con el paciente» con los tres apartados: la URL sale una
 *      sola vez, con «Copiar» y «Abrir WhatsApp», y el enlace aparece en
 *      «Enlaces activos» como «Nunca abierto».
 *   2. El paciente, a 390 px y sin sesión: una fecha errónea da «Datos
 *      incorrectos»; con la buena ve sus tres pestañas (Citas, Presupuestos,
 *      Mi cuenta), sin scroll horizontal y sin violaciones de axe (claro y
 *      oscuro).
 *   3. La administradora revoca el enlace; la siguiente acción del paciente
 *      (abrir otra pestaña no pide nada; «Confirmar» sí) muestra «Este enlace
 *      ya no está disponible», sin ningún dato del paciente.
 *
 * Estado: crea su propia clínica (no toca la demo). Datos de Venezuela.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinic = {
  subdomain: `test-clinic-portal-${suffix}`.slice(0, 40),
  clinicName: `Clínica Ávila ${suffix}`.slice(0, 60),
  fullName: 'Dra. Ávila',
  email: `portal.${suffix}@example.com`,
  password: 'Password123!',
};
const BIRTH_DATE = '1988-05-20';
const PROCEDURE = `Corona ${suffix}`.slice(0, 40);
const LAST_NAME = `Rondón${suffix}`.slice(0, 40);

let admin: ApiSession | null = null;
let patientId = '';

test.describe('Enlace de acceso del paciente (DX-101)', () => {
  test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede registrar la clínica (usa scripts/e2e-ci.sh)');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    admin = await registerClinicViaApi(request, clinic);
    const staff = (await (await request.get(`${API_URL}/staff`, { headers: admin.headers })).json()) as {
      userId: string;
    }[];
    await request.put(`${API_URL}/locations/schedule`, { headers: admin.headers, data: { ranges: [] } });
    const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
      firstName: 'Daniela',
      lastName: LAST_NAME,
      docType: 'NATIONAL_ID',
      docNumber: `DX101${suffix}`.slice(0, 20),
      sex: 'F',
      birthDate: BIRTH_DATE,
      phone: '+58 414 555 0101',
    });
    patientId = patient.id;
    const day = sedeDayFromToday(3);
    await apiPost(request, admin, '/appointments', {
      patientId,
      providerId: staff[0].userId,
      start: atSede(day, '10:00').toISOString(),
      end: atSede(day, '10:30').toISOString(),
      reason: `Control ${suffix}`,
    });
    const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `cor-${suffix}`.slice(0, 30),
      kind: 'PROCEDURE',
      labelEs: PROCEDURE,
      color: '#3366CC',
      defaultPrice: 250,
    });
    const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patientId}/treatment-plans`, {
      currency: 'USD',
    });
    await apiPost(request, admin, `/treatment-plans/${plan.id}/items`, { toothNumber: '36', catalogItemId: catalog.id });
    await apiPost(request, admin, `/treatment-plans/${plan.id}/present`, {});
  });

  test('el personal comparte; el paciente verifica a 390 px; al revocar, «ya no está disponible»', async ({
    browser,
    page,
  }) => {
    const origin = admin!.origin;

    // --- (a) La administradora crea el enlace con los tres apartados.
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, clinic.email, clinic.password);
    await page.goto(`${origin}/patients/${patientId}`);
    await page.getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Compartir con el paciente' }).click();
    const dialog = page.getByRole('dialog', { name: 'Compartir con el paciente' });
    await expect(dialog.getByRole('checkbox', { name: 'Citas' })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Presupuestos' })).toBeChecked();
    await expect(dialog.getByRole('checkbox', { name: 'Mi cuenta' })).toBeChecked();
    await expect(dialog.getByRole('radio', { name: '14 días' })).toBeChecked();
    await expect(dialog.getByText('No tiene enlaces activos.')).toBeVisible({ timeout: 15_000 });
    await dialog.getByRole('button', { name: 'Crear enlace' }).click();
    const url = await dialog.getByLabel('Enlace para el paciente', { exact: true }).inputValue({ timeout: 15_000 });
    expect(url).toMatch(/\/mi-clinica\/[A-Za-z0-9_-]+$/);
    await expect(dialog.getByText('Copia el enlace ahora: no se podrá volver a ver.')).toBeVisible();
    await expect(dialog.getByRole('link', { name: /Abrir WhatsApp/ })).toHaveAttribute('href', /^https:\/\/wa\.me\/58414/);
    const active = dialog.getByRole('region', { name: 'Enlaces activos' });
    await expect(active.getByText('Citas · Presupuestos · Mi cuenta')).toBeVisible({ timeout: 15_000 });
    await expect(active.getByText(/Nunca abierto/)).toBeVisible();
    await expectDialogInsideViewport(page, dialog);
    await shot(page, 'dx101-share-created', 1440);
    await dialog.getByRole('button', { name: 'Cerrar' }).first().click();

    // --- (b) El paciente, a 390 px y sin sesión.
    const patientContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
    const patient = await patientContext.newPage();
    await patient.goto(url);
    await expect(patient.getByRole('heading', { level: 1, name: 'Consulta tus citas y tu cuenta' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(patient.getByText(clinic.clinicName)).toBeVisible();
    // Fecha errónea: «Datos incorrectos» y la ayuda.
    await fillDate(patient, 'Fecha de nacimiento', '1990-01-01');
    await patient.getByRole('button', { name: 'Entrar' }).click();
    await expect(patient.getByText('Datos incorrectos')).toBeVisible({ timeout: 15_000 });
    await shot(patient, 'dx101-verify-invalid', 390);
    await expect(patient.getByText('Revisa la fecha. Si el enlace caducó o la clínica lo anuló, pide uno nuevo.')).toBeVisible();
    // La buena.
    await fillDate(patient, 'Fecha de nacimiento', BIRTH_DATE);
    await patient.getByRole('button', { name: 'Entrar' }).click();
    await expect(patient.getByRole('heading', { level: 1, name: 'Hola, Daniela' })).toBeVisible({ timeout: 15_000 });
    const tabs = patient.getByRole('tablist', { name: 'Apartados' });
    await expect(tabs.getByRole('tab')).toHaveText(['Citas', 'Presupuestos', 'Mi cuenta']);
    await expect(patient.getByTestId('portal-appointment')).toHaveCount(1);
    await expect(patient.getByTestId('portal-appointment')).toContainText('10:00');
    await expect(patient.getByRole('button', { name: /Confirmar la cita/ })).toBeVisible();
    await expectNoHorizontalScroll(patient);
    await shot(patient, 'dx101-citas', 390);
    await tabs.getByRole('tab', { name: 'Presupuestos' }).click();
    await expect(patient.getByTestId('portal-plan')).toContainText(PROCEDURE);
    await expect(patient.getByTestId('portal-plan')).toContainText('Presentado');
    await expectNoHorizontalScroll(patient);
    await shot(patient, 'dx101-presupuestos', 390);
    await tabs.getByRole('tab', { name: 'Mi cuenta' }).click();
    await expect(patient.getByRole('heading', { name: 'Tu estado de cuenta' })).toBeVisible();
    await expectNoHorizontalScroll(patient);
    await shot(patient, 'dx101-cuenta', 390);
    const violations = await axeInBothThemes(patient, patient.locator('main'));
    expect(violations.light, 'axe en claro').toEqual([]);
    expect(violations.dark, 'axe en oscuro').toEqual([]);

    // La ficha ya dice cuándo lo abrió.
    await page.getByRole('button', { name: 'Más acciones' }).click();
    await page.getByRole('menuitem', { name: 'Compartir con el paciente' }).click();
    const again = page.getByRole('dialog', { name: 'Compartir con el paciente' });
    const row = again.getByTestId('patient-access-link');
    await expect(row).toContainText('Último acceso:', { timeout: 15_000 });

    // --- (c) La administradora revoca; la siguiente acción del paciente: «ya no está disponible».
    await row.getByRole('button', { name: /Revocar el enlace/ }).click();
    const confirm = page.getByRole('dialog', { name: '¿Revocar este enlace?' });
    await confirm.getByRole('button', { name: 'Revocar enlace' }).click();
    await expect(again.getByText('No tiene enlaces activos.')).toBeVisible({ timeout: 15_000 });

    await tabs.getByRole('tab', { name: 'Citas' }).click();
    await patient.getByRole('button', { name: /Confirmar la cita/ }).click();
    await expect(patient.getByRole('heading', { level: 1, name: 'Este enlace ya no está disponible' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(patient.getByText('Daniela')).toHaveCount(0);
    await expect(patient.getByText(PROCEDURE)).toHaveCount(0);
    await expect(patient.getByRole('tablist')).toHaveCount(0);
    await expectNoHorizontalScroll(patient);
    await shot(patient, 'dx101-gone', 390);
    await patientContext.close();
  });
});
