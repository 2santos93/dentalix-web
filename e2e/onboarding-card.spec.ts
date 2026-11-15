import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiPost, registerClinicViaApi } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e (DX-020): la tarjeta «Pon en marcha tu clínica» de Inicio.
 *
 * Una clínica NUEVA por viewport (la demo ya tiene todo hecho):
 *  1. El ADMIN entra en Inicio y ve los cinco pasos pendientes (0 de 5).
 *  2. Abre «Crea los tipos de cita» desde la tarjeta, crea uno y, al volver a
 *     Inicio, ese paso sale hecho (1 de 5) sin tocar la tarjeta.
 *  3. «No mostrar más» la esconde y sigue escondida al recargar.
 * A 390 y 1440 px, sin scroll horizontal a 390. Capturas en E2E_QA_DIR.
 */
const runSuffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

async function shoot(page: Page, name: string, width: number): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  await page.mouse.move(0, 0);
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    await page.screenshot({ path: `${QA_DIR}/${name}-${width}-${scheme}.png`, fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

for (const viewport of VIEWPORTS) {
  test(`una clínica nueva a ${viewport.width} px: pasos pendientes, se marcan solos y se descarta`, async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const suffix = `${runSuffix}${viewport.width}`;
    const subdomain = `onboard-${suffix}`.slice(0, 30);
    const origin = tenantOrigin(subdomain);
    const email = `admin.onboard.${suffix}@example.com`;
    await registerClinicViaApi(request, {
      subdomain,
      clinicName: `Clínica Arranque ${suffix}`,
      fullName: 'Ana Arranque',
      email,
      password,
    });

    await page.setViewportSize(viewport);
    await loginAs(page, origin, email, password);
    await page.goto(`${origin}/dashboard`);

    const card = page.getByTestId('inicio-onboarding');
    await expect(card.getByRole('heading', { name: 'Pon en marcha tu clínica' })).toBeVisible({ timeout: 20_000 });
    await expect(card.getByTestId('inicio-onboarding-progress')).toHaveText('0 de 5 hechos');
    for (const key of ['BUSINESS_HOURS', 'APPOINTMENT_TYPES', 'CATALOG_PRICES', 'STAFF', 'FIRST_APPOINTMENT']) {
      await expect(card.getByTestId(`inicio-onboarding-step-${key}`)).toHaveAttribute('data-done', 'false');
    }
    await expect(card.getByRole('link', { name: /Importa tus pacientes/ })).toHaveAttribute(
      'href',
      '/settings/importar-pacientes',
    );
    if (viewport.width === 390) {
      await expectNoHorizontalScroll(page);
      await expectNoHorizontalScrollIn(page);
    }
    await shoot(page, 'onboarding-pendiente', viewport.width);

    // El paso enlaza a su pantalla; crear el tipo lo marca solo.
    await card.getByRole('link', { name: /Crea los tipos de cita/ }).click();
    await expect(page).toHaveURL(/\/settings\/tipos-de-cita$/);
    await page.getByRole('button', { name: 'Nuevo tipo' }).click();
    const typeDialog = page.getByRole('dialog');
    await typeDialog.getByLabel('Nombre').fill('Limpieza');
    await typeDialog.getByLabel('Duración (minutos)').fill('30');
    await typeDialog.getByLabel('Código del color').fill('#0E7490');
    await typeDialog.getByRole('button', { name: 'Crear tipo' }).click();
    await expect(typeDialog).toBeHidden();

    await page.goto(`${origin}/dashboard`);
    await expect(card.getByTestId('inicio-onboarding-progress')).toHaveText('1 de 5 hechos', { timeout: 20_000 });
    await expect(card.getByTestId('inicio-onboarding-step-APPOINTMENT_TYPES')).toHaveAttribute('data-done', 'true');
    await expect(card.getByTestId('inicio-onboarding-step-BUSINESS_HOURS')).toHaveAttribute('data-done', 'false');
    if (viewport.width === 390) {
      await expectNoHorizontalScroll(page);
      await expectNoHorizontalScrollIn(page);
    }
    await shoot(page, 'onboarding-un-paso', viewport.width);

    // Descartar la esconde, también al recargar.
    await card.getByRole('button', { name: 'No mostrar más' }).click();
    await expect(card).toHaveCount(0);
    const reloaded = page.waitForResponse((r) => r.url().includes('/onboarding/status') && r.ok());
    await page.reload();
    expect(((await (await reloaded).json()) as { dismissedAt: string | null }).dismissedAt).not.toBeNull();
    await expect(page.getByTestId('dashboard-scope')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('inicio-onboarding')).toHaveCount(0);
  });
}

/**
 * Con los cinco pasos hechos (por la API), «Tu clínica está lista» con el
 * enlace al paso opcional y «Cerrar». A 390 px, ni el documento ni <main>
 * se desplazan en horizontal (la frase del opcional envuelve).
 */
test('con los cinco pasos hechos: «Tu clínica está lista», sin scroll horizontal a 390 px', async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  const suffix = `${runSuffix}ready`;
  const subdomain = `onboard-${suffix}`.slice(0, 30);
  const origin = tenantOrigin(subdomain);
  const email = `admin.onboard.${suffix}@example.com`;
  const session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Lista ${suffix}`,
    fullName: 'Ana Lista',
    email,
    password,
  });
  // 1. Horario guardado (sin restricción, para que la cita no dependa del día).
  const schedule = await request.put(`${API_URL}/locations/schedule`, { headers: session.headers, data: { ranges: [] } });
  expect(schedule.ok(), `PUT /locations/schedule falló: ${await schedule.text()}`).toBeTruthy();
  // 2. Tipo de cita. 3. Un precio en el catálogo. 4. Una invitación.
  await apiPost(request, session, '/appointment-types', { name: 'Control', durationMinutes: 30, color: '#0E7490' });
  await apiPost(request, session, '/catalog/items', {
    code: `dx020-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: 'Limpieza dental',
    color: '#3366CC',
    defaultPrice: 40,
  });
  await apiPost(request, session, '/staff/invitations', {
    fullName: 'Luis Invitado',
    email: `luis.onboard.${suffix}@example.com`,
    role: 'DENTIST',
  });
  // 5. La primera cita.
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'María',
    lastName: `Lista${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `V${suffix}`.slice(0, 20),
    sex: 'F',
  });
  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  const providerId = staff.find((m) => m.fullName === 'Ana Lista')!.userId;
  const day = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  await apiPost(request, session, '/appointments', {
    patientId: patient.id,
    providerId,
    start: `${day}T14:00:00.000Z`,
    end: `${day}T14:30:00.000Z`,
  });

  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, email, password);
  await page.goto(`${origin}/dashboard`);
  const card = page.getByTestId('inicio-onboarding');
  await expect(card.getByRole('heading', { name: 'Tu clínica está lista' })).toBeVisible({ timeout: 20_000 });
  await expect(card.getByRole('link', { name: 'Si traes pacientes de otro sistema, impórtalos' })).toHaveAttribute(
    'href',
    '/settings/importar-pacientes',
  );
  await expectNoHorizontalScroll(page);
  await expectNoHorizontalScrollIn(page);
  await shoot(page, 'onboarding-lista', 390);
  await page.setViewportSize({ width: 1440, height: 900 });
  await shoot(page, 'onboarding-lista', 1440);

  await card.getByRole('button', { name: 'Cerrar' }).click();
  await expect(card).toHaveCount(0);
});
