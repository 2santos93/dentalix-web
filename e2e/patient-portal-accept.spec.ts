import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { fillDate } from './support/dates';
import { axeInBothThemes } from './support/axe';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR } from './support/mail';
import { shot } from './support/qa-shot';

/**
 * e2e DX-101-bis: el paciente acepta su presupuesto con firma desde el portal.
 *
 *   1. Clínica nueva por la API (sede en Caracas): paciente con fecha de
 *      nacimiento, un plan USD con dos opciones A/B presentadas y un enlace
 *      del portal con «Presupuestos».
 *   2. El paciente, a 1440 px, verifica y ve las dos opciones con «Elegir esta
 *      opción»; abre la B (diálogo con resumen, casilla, nombre y firma) y lo
 *      cierra con Escape. A 390 px elige la B SOLO con el teclado (Enter,
 *      Espacio, Tab, su nombre y Enter) con «Escribir mi nombre»: ve
 *      «Presupuesto aceptado…» y «Aceptado el …»; la A ya no ofrece aceptar.
 *      Sin scroll horizontal y sin violaciones de axe (claro y oscuro).
 *   3. El personal (1440 y 390) ve la B aceptada con «Aceptado por el paciente
 *      desde el portal» y sus evidencias; el impreso, lo mismo.
 *
 * Estado: crea su propia clínica (no toca la demo). Datos de Venezuela, USD.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinic = {
  subdomain: `test-clinic-pacc-${suffix}`.slice(0, 40),
  clinicName: `Clínica Caroní ${suffix}`.slice(0, 60),
  fullName: 'Dr. Caroní',
  email: `portal.accept.${suffix}@example.com`,
  password: 'Password123!',
};
const BIRTH_DATE = '1985-09-14';
const PROCEDURE = `Implante ${suffix}`.slice(0, 40);
const SIGNER = 'Gabriela Rondón';

let admin: ApiSession | null = null;
let patientId = '';
let planA = '';
let planB = '';
let portalUrl = '';

test.describe('Aceptar el presupuesto desde el portal (DX-101-bis)', () => {
  test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede registrar la clínica (usa scripts/e2e-ci.sh)');
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async ({ request }) => {
    admin = await registerClinicViaApi(request, clinic);
    const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
      firstName: 'Gabriela',
      lastName: `Rondón${suffix}`.slice(0, 40),
      docType: 'NATIONAL_ID',
      docNumber: `DX101B${suffix}`.slice(0, 20),
      sex: 'F',
      birthDate: BIRTH_DATE,
      phone: '+58 414 555 0102',
    });
    patientId = patient.id;
    const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `imp-${suffix}`.slice(0, 30),
      kind: 'PROCEDURE',
      labelEs: PROCEDURE,
      color: '#3366CC',
      defaultPrice: 900,
    });
    const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patientId}/treatment-plans`, {
      currency: 'USD',
    });
    planA = plan.id;
    await apiPost(request, admin, `/treatment-plans/${planA}/items`, { toothNumber: '36', catalogItemId: catalog.id });
    // La B copia los ítems vivos de la A; las dos se presentan.
    ({ id: planB } = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${planA}/alternatives`, {}));
    await apiPost(request, admin, `/treatment-plans/${planA}/present`, {});
    await apiPost(request, admin, `/treatment-plans/${planB}/present`, {});
    const link = await apiPost<{ url: string }>(request, admin, `/patients/${patientId}/access-links`, {
      scopes: ['PLANS'],
      ttlDays: 7,
    });
    portalUrl = link.url;
    expect(portalUrl).toMatch(/\/mi-clinica\/[A-Za-z0-9_-]+$/);
  });

  test('el paciente elige la opción B con su nombre escrito, solo con el teclado (1440 y 390)', async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const patient = await context.newPage();
    try {
      await patient.goto(portalUrl);
      await fillDate(patient, 'Fecha de nacimiento', BIRTH_DATE);
      await patient.getByRole('button', { name: 'Entrar' }).click();
      await expect(patient.getByRole('heading', { level: 1, name: 'Hola, Gabriela' })).toBeVisible({ timeout: 15_000 });
      const group = patient.getByTestId('portal-plan-group');
      await expect(group.getByTestId('portal-plan')).toHaveCount(2);
      await expect(group).toContainText('Opción A');
      await expect(group).toContainText('Opción B');
      const chooseA = patient.getByRole('button', { name: 'Elegir esta opción: Opción A' });
      const chooseB = patient.getByRole('button', { name: 'Elegir esta opción: Opción B' });
      await expect(chooseA).toBeVisible();
      await expect(chooseB).toBeVisible();
      await expect(group.getByText(/^Válido hasta el /)).toHaveCount(2);
      await shot(patient, 'dx101b-portal-ab', 1440);

      // 1440: el diálogo (resumen, casilla, nombre y firma); Escape lo cierra y el foco vuelve.
      await chooseB.click();
      const dialog = patient.getByRole('dialog', { name: 'Elegir la opción B' });
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      await expect(dialog.getByRole('region', { name: 'Resumen del presupuesto' })).toContainText('Total (USD)');
      await expect(dialog.getByRole('radio', { name: 'Escribir mi nombre' })).toHaveAttribute('aria-checked', 'true');
      await expectDialogInsideViewport(patient, dialog);
      await shot(patient, 'dx101b-accept-dialog', 1440);
      const dialogAxe1440 = await axeInBothThemes(patient, dialog);
      expect(dialogAxe1440.light, 'axe del diálogo en claro (1440)').toEqual([]);
      expect(dialogAxe1440.dark, 'axe del diálogo en oscuro (1440)').toEqual([]);
      await patient.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
      await expect(chooseB).toBeFocused();

      // 390: todo con el teclado.
      await patient.setViewportSize({ width: 390, height: 844 });
      await expectNoHorizontalScroll(patient);
      await chooseB.focus();
      await patient.keyboard.press('Enter');
      await expect(dialog).toBeVisible({ timeout: 15_000 });
      const consent = dialog.getByRole('checkbox', { name: 'He leído el presupuesto y lo acepto' });
      await expect(consent).toBeFocused();
      await patient.keyboard.press('Space');
      await expect(consent).toBeChecked();
      await patient.keyboard.press('Tab');
      const name = dialog.getByLabel('Tu nombre completo', { exact: true });
      await expect(name).toBeFocused();
      await patient.keyboard.type(SIGNER);
      await expect(dialog.getByRole('img', { name: `Vista previa de tu firma: ${SIGNER}` })).toBeVisible();
      await expectNoHorizontalScroll(patient);
      await shot(patient, 'dx101b-accept-typed', 390);
      const dialogAxe390 = await axeInBothThemes(patient, dialog);
      expect(dialogAxe390.light, 'axe del diálogo en claro (390)').toEqual([]);
      expect(dialogAxe390.dark, 'axe del diálogo en oscuro (390)').toEqual([]);
      await name.focus();
      await patient.keyboard.press('Enter');

      await expect(dialog).toHaveCount(0, { timeout: 15_000 });
      await expect(patient.getByRole('status').filter({ hasText: 'Presupuesto aceptado.' })).toBeVisible();
      const cards = group.getByTestId('portal-plan');
      await expect(cards.filter({ hasText: 'Opción B' }).getByTestId('portal-plan-accepted')).toContainText(
        /^Aceptado el .*\d{4}$/,
      );
      // La A ya no ofrece aceptar (la API la rechazó al elegir la B; el portal releyó los datos).
      await expect(patient.getByRole('button', { name: /Elegir esta opción/ })).toHaveCount(0);
      await expectNoHorizontalScroll(patient);
      await shot(patient, 'dx101b-accepted', 390);
      const pageAxe = await axeInBothThemes(patient, patient.locator('main'));
      expect(pageAxe.light, 'axe del portal en claro').toEqual([]);
      expect(pageAxe.dark, 'axe del portal en oscuro').toEqual([]);

      await patient.setViewportSize({ width: 1440, height: 900 });
      await shot(patient, 'dx101b-accepted', 1440);
    } finally {
      await context.close();
    }
  });

  test('el personal ve la opción B aceptada desde el portal, con sus evidencias (1440 y 390)', async ({ page }) => {
    const origin = admin!.origin;
    await loginAs(page, origin, clinic.email, clinic.password);
    for (const width of [1440, 390] as const) {
      await page.setViewportSize({ width, height: width === 1440 ? 900 : 844 });
      await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans&planId=${planB}`);
      const status = page.getByText(/^Aceptado por el paciente desde el portal el .+ · firmó Gabriela Rondón$/);
      await expect(status).toBeVisible({ timeout: 15_000 });
      const evidence = page.getByLabel('Evidencias de la aceptación desde el portal', { exact: true });
      await expect(evidence).toContainText('Canal:Portal del paciente');
      await expect(page.getByLabel('Evidencias de la aceptación a distancia', { exact: true })).toHaveCount(0);
      if (width === 390) await expectNoHorizontalScroll(page);
      await shot(page, 'dx101b-staff-accepted', width);

      await page.goto(`${origin}/print/patients/${patientId}/treatment-plans/${planB}`);
      const signature = page.getByTestId('quote-signature');
      await expect(signature).toContainText('Aceptado por el paciente desde el portal', { timeout: 15_000 });
      await expect(signature).toContainText(`Firmado por ${SIGNER} el `);
      await expect(signature).not.toContainText('Registró la firma');
      if (width === 390) await expectNoHorizontalScroll(page);
    }
  });
});
