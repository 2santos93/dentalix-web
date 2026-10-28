import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { DAY_MS, sedeDate } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-328: la mayoría de edad es de la clínica y la cambia el ADMIN en
 * Ajustes › Mayoría de edad.
 *
 * - Una clínica nueva empieza en 18: la ficha de un paciente de 17 años dice
 *   «menor de edad» y sus avisos van a su responsable.
 * - A 16, ese paciente deja de ser menor y sus avisos van a él; la auditoría
 *   muestra «Mayoría de edad: 18 → 16 años» en «Ajustes de la clínica».
 * - A 20, la ficha de un paciente de 19 años sin responsable dice «Es menor de
 *   20 años…» en «Responsable y familia».
 * - Recepción no ve la entrada en Ajustes y, por URL, ve el estado bloqueado.
 * - Capturas de la pantalla, el modal, la ficha y la fila de auditoría a 390 y
 *   1440 px en claro y oscuro (en E2E_QA_DIR, o en el `outputDir` del test).
 *
 * Una clínica nueva por corrida. En serie: cada test parte de la edad que dejó
 * el anterior.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `mayoria-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.edad.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.edad.${suffix}@example.com` };
const lastName = `Mora${suffix.slice(0, 6)}`;
const minorEmail = `lucia.${suffix}@example.com`;
const guardianEmail = `marta.${suffix}@example.com`;
const AUDIT_DETAIL = 'Mayoría de edad: 18 → 16 años';

let session: ApiSession;
let minorId: string;
let youngAdultId: string;

test.describe.configure({ mode: 'serial' });

/**
 * Fecha de nacimiento de alguien que hoy, en la sede, tiene `years` años y
 * unos dos meses: lejos del cumpleaños, el resultado no depende de la hora.
 */
function birthDateForAge(years: number): string {
  const [y, m, d] = sedeDate(new Date(Date.now() - 60 * DAY_MS)).split('-');
  return `${Number(y) - years}-${m}-${String(Math.min(Number(d), 28)).padStart(2, '0')}`;
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Mayoría ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  ({ id: minorId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Lucía',
    lastName,
    docType: 'TI',
    docNumber: `ML${suffix}`.slice(0, 20),
    sex: 'F',
    birthDate: birthDateForAge(17),
    email: minorEmail,
  }));
  await apiPost(request, session, `/patients/${minorId}/responsible-parties`, {
    fullName: `Marta ${lastName}`,
    email: guardianEmail,
    relationship: 'MOTHER',
    isPayer: true,
    receivesNotices: true,
  });
  ({ id: youngAdultId } = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Diego',
    lastName,
    docType: 'CC',
    docNumber: `MD${suffix}`.slice(0, 20),
    sex: 'M',
    birthDate: birthDateForAge(19),
    email: `diego.${suffix}@example.com`,
  }));
});

const communication = (page: Page) => page.getByRole('region', { name: 'Comunicaciones' });
const responsibles = (page: Page) => page.getByRole('region', { name: 'Responsable y familia' });

/** `GET /patients/:id/communication`: a quién van hoy los avisos. */
async function recipientKind(page: Page, patientId: string): Promise<string> {
  const res = await page.request.get(`${API_URL}/patients/${patientId}/communication`, {
    headers: session.headers,
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { recipient: { kind: string } }).recipient.kind;
}

async function openSettings(page: Page): Promise<Locator> {
  await page.goto(`${origin}/settings/mayoria-de-edad`);
  await expect(page.getByRole('heading', { level: 1, name: 'Mayoría de edad' })).toBeVisible({
    timeout: 15_000,
  });
  const value = page.getByTestId('majority-age');
  await expect(value).toBeVisible({ timeout: 15_000 });
  return value;
}

async function changeTo(page: Page, age: number): Promise<void> {
  const value = await openSettings(page);
  await page.getByRole('button', { name: 'Cambiar' }).click();
  const dialog = page.getByRole('dialog', { name: 'Cambiar la mayoría de edad' });
  await expectDialogInsideViewport(page, dialog);
  await dialog.getByLabel('Edad').selectOption(String(age));
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden({ timeout: 10_000 });
  await expect(page.getByRole('status').filter({ hasText: 'Mayoría de edad guardada.' })).toBeVisible();
  await expect(value).toHaveText(`${age} años`);
}

test('ADMIN: una clínica nueva está en 18 y el paciente de 17 años es menor', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);

  await expect(await openSettings(page)).toHaveText('18 años');

  await page.goto(`${origin}/patients/${minorId}`);
  await expect(communication(page)).toContainText('menor de edad', { timeout: 15_000 });
  await expect(communication(page)).toContainText(guardianEmail);
  await expect(responsibles(page)).toContainText(
    `Los avisos de este paciente van a Marta (${guardianEmail}).`,
  );
  expect(await recipientKind(page, minorId)).toBe('RESPONSIBLE');
});

test('ADMIN baja a 16: el de 17 años deja de ser menor y sus avisos van a él', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await changeTo(page, 16);

  await page.goto(`${origin}/patients/${minorId}`);
  await expect(communication(page)).toContainText(minorEmail, { timeout: 15_000 });
  await expect(communication(page)).not.toContainText('menor de edad');
  await expect(communication(page)).not.toContainText('Destinatario de los avisos');
  await expect(responsibles(page).getByTestId('responsible-row')).toContainText(`Marta ${lastName}`);
  await expect(responsibles(page)).not.toContainText('Los avisos de este paciente van a');
  await expect(responsibles(page)).not.toContainText('Es menor de');
  expect(await recipientKind(page, minorId)).toBe('PATIENT');
});

test('la auditoría muestra «Mayoría de edad: 18 → 16 años» en «Ajustes de la clínica»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/auditoria`);
  const table = page.getByRole('table', { name: 'Registro de auditoría' });
  await expect(table).toBeVisible({ timeout: 15_000 });
  const row = table.getByRole('row').filter({ hasText: AUDIT_DETAIL });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Ajustes de la clínica');
  await expect(row).toContainText(admin.fullName);
});

test('ADMIN sube a 20: el de 19 años sin responsable muestra «Es menor de 20 años…»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);

  await page.goto(`${origin}/patients/${youngAdultId}`);
  await expect(responsibles(page).getByText('Sin responsable registrado')).toBeVisible({ timeout: 15_000 });
  await expect(responsibles(page)).not.toContainText('Es menor de');

  await changeTo(page, 20);
  await page.goto(`${origin}/patients/${youngAdultId}`);
  await expect(responsibles(page)).toContainText(
    'Es menor de 20 años: añade un responsable con email para que reciba sus recordatorios y recibos.',
    { timeout: 15_000 },
  );
  // El de 17 vuelve a ser menor con 20.
  expect(await recipientKind(page, minorId)).toBe('RESPONSIBLE');
});

test('RECEPCIÓN no ve la entrada en Ajustes y, por URL, ve el estado bloqueado', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/settings`);
  const links = page.getByRole('main').getByRole('listitem').getByRole('link');
  await expect(links.first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('link', { name: /Mayoría de edad/ })).toHaveCount(0);

  await page.goto(`${origin}/settings/mayoria-de-edad`);
  await expect(page.getByText('Solo administración cambia la mayoría de edad.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('La ficha de cada paciente dice si es menor y a quién van sus avisos.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cambiar' })).toHaveCount(0);
  await expect(page.getByTestId('majority-age')).toHaveCount(0);
});

test('capturas a 390 y 1440 px en claro y oscuro: ajuste, modal, ficha y auditoría', async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const evidence = process.env.E2E_QA_DIR ?? testInfo.outputPath('qa');
  mkdirSync(evidence, { recursive: true });
  const shot = (view: string, width: number, theme: string) =>
    page.screenshot({ path: path.join(evidence, `${view}-${width}-${theme}.png`) });

  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);

  for (const width of [390, 1440]) {
    for (const theme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 900 });
      await page.emulateMedia({ colorScheme: theme, reducedMotion: 'reduce' });

      await expect(await openSettings(page)).toHaveText('20 años');
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${theme}\\b`));
      await expectNoHorizontalScroll(page);
      await expectNoHorizontalScrollIn(page);
      await shot('ajuste', width, theme);

      await page.getByRole('button', { name: 'Cambiar' }).click();
      const dialog = page.getByRole('dialog', { name: 'Cambiar la mayoría de edad' });
      await expectDialogInsideViewport(page, dialog);
      if (width < 640) {
        // DESIGN.md: 44 px de objetivo táctil en móvil para la acción principal y el campo.
        for (const target of [dialog.getByRole('button', { name: 'Guardar' }), dialog.getByLabel('Edad')]) {
          expect((await target.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
      }
      await expectNoHorizontalScroll(page);
      await shot('modal', width, theme);
      await dialog.getByRole('button', { name: 'Cancelar' }).click();
      await expect(dialog).toBeHidden();

      await page.goto(`${origin}/patients/${youngAdultId}`);
      const notice = responsibles(page).getByText(/^Es menor de 20 años/);
      await expect(notice).toBeVisible({ timeout: 15_000 });
      await notice.scrollIntoViewIfNeeded();
      await expectNoHorizontalScroll(page);
      await expectNoHorizontalScrollIn(page);
      await shot('ficha', width, theme);

      await page.goto(`${origin}/settings/auditoria`);
      const row = page.getByRole('table', { name: 'Registro de auditoría' }).getByRole('row').filter({
        hasText: AUDIT_DETAIL,
      });
      await expect(row).toBeVisible({ timeout: 15_000 });
      await row.scrollIntoViewIfNeeded();
      await expectNoHorizontalScroll(page);
      await shot('auditoria', width, theme);
    }
  }
});
