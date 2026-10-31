import { test, expect, type APIRequestContext, type Browser, type Page } from './support/test';
import { fillDate, fillTime } from './support/dates';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { accessTokenOf, loginAs, registerAndLogin } from './support/auth';
import { addStaffViaApi, type ApiSession } from './support/api';
import { atSede, sedeDate, sedeDayFromToday, sedeTime } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL } from './support/urls';
import { E2E_BROWSER_LOCALE, E2E_REGION } from './support/regional';
import { dataList, dataListRows } from './support/data-list';

/**
 * e2e (DX-089): personal restringido a sedes.
 *
 * En escritorio (1440) y móvil (390), cada uno con su clínica:
 *   1. El ADMIN da de alta «Sede Norte» y, por la API, una recepcionista; siembra
 *      una cita y un abono en CADA sede (con `X-Location-Id`).
 *   2. Desde `/staff/[id]`, tarjeta «Sedes»: desmarca «Todas las sedes», marca
 *      Norte y guarda (toast).
 *   3. La recepcionista entra (contexto nuevo): el selector de sede solo ofrece
 *      Norte (sin «Todas las sedes»); la agenda y la caja muestran solo lo de
 *      Norte; abre la ficha del paciente de la OTRA sede (los pacientes son de
 *      la clínica).
 *   4. Agenda una cita sin elegir sede → la API (como ADMIN) la ve en Norte.
 *   5. Una llamada directa con `X-Location-Id` = la sede principal → 403
 *      `LOCATION_NOT_ALLOWED`; con esa sede guardada en el navegador la web se
 *      recompone sola (sin pantalla de error) y vuelve a Norte.
 * Capturas claro/oscuro de la tarjeta, el selector y la agenda en
 * `E2E_QA_DIR` (si está definida).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const ownerName = 'Dra. Sofía Sedes';
const QA_DIR = process.env.E2E_QA_DIR;

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

const LOCATION_KEY = 'dentalix.activeLocationId';

// Mismo formateador que la app (`formatCurrency`, locale `es`): solo la cifra.
const cop = new Intl.NumberFormat('es', { style: 'currency', currency: 'COP' });
function figure(amount: number): string {
  return cop.format(amount).split(/\s/)[0];
}

interface Location {
  id: string;
  name: string;
}

/** Cliente de la API con la sesión de `session` y, opcionalmente, una sede. */
function apiClient(request: APIRequestContext, session: ApiSession) {
  return async function call<T>(
    method: 'get' | 'post' | 'put' | 'patch',
    path: string,
    data?: object,
    locationId?: string,
  ): Promise<T> {
    const headers = locationId ? { ...session.headers, 'X-Location-Id': locationId } : session.headers;
    const res = await request[method](`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  };
}

/** Paciente con un plan aceptado y un abono en COP registrado en `locationId`. */
async function patientWithPayment(
  call: ReturnType<typeof apiClient>,
  tag: string,
  lastName: string,
  amount: number,
  locationId: string,
): Promise<{ id: string }> {
  const patient = await call<{ id: string }>('post', '/patients', {
    firstName: 'Paciente',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `${lastName}`.slice(0, 20),
    sex: 'F',
  });
  const catalog = await call<{ id: string }>('post', '/catalog/items', {
    code: `sd-${tag}-${lastName}`.slice(0, 40).toLowerCase(),
    kind: 'PROCEDURE',
    labelEs: `Resina ${lastName}`,
    color: '#3366CC',
    defaultPrice: amount * 2,
  });
  const plan = await call<{ id: string }>('post', `/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
  });
  const item = await call<{ id: string }>('post', `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11',
    catalogItemId: catalog.id,
  });
  await call('patch', `/treatment-plans/${plan.id}/items/${item.id}`, { status: 'ACCEPTED' });
  await call(
    'post',
    `/treatment-plans/${plan.id}/payments`,
    { amount, currency: 'COP', paidAt: new Date().toISOString(), method: 'CASH' },
    locationId,
  );
  return patient;
}

async function shoot(page: Page, name: string, width: number): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /dark/ : /^(?!.*\bdark\b)/);
    await page.screenshot({ path: `${QA_DIR}/${name}-${width}-${scheme}.png`, fullPage: false });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

/** El selector de sede visible (sidebar en escritorio, topbar en móvil). */
function locationSelect(page: Page) {
  return page.getByRole('combobox', { name: 'Sede' }).locator('visible=true').first();
}

async function openDayList(page: Page, origin: string, day: string): Promise<void> {
  await page.goto(`${origin}/agenda`);
  await expect(page.getByRole('heading', { name: 'Agenda', exact: true })).toBeVisible({ timeout: 15_000 });
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await fillDate(page, 'Fecha', day);
}

async function receptionPage(browser: Browser, width: number, height: number): Promise<Page> {
  const context = await browser.newContext({
    viewport: { width, height },
    timezoneId: 'America/Bogota',
    locale: E2E_BROWSER_LOCALE,
  });
  return context.newPage();
}

for (const viewport of VIEWPORTS) {
  test(`recepción acotada a «Sede Norte»: selector, agenda, caja y ficha (${viewport.name})`, async ({
    page,
    browser,
    request,
  }) => {
    test.setTimeout(180_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const ownerEmail = `test.user.sedes.${tag}@example.com`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-sedes-${tag}`,
      clinicName: `Clinica Sedes ${tag}`,
      fullName: ownerName,
      email: ownerEmail,
      password,
    });
    const admin: ApiSession = {
      origin,
      headers: {
        Authorization: `Bearer ${await accessTokenOf(page)}`,
        'X-Tenant-Host': new URL(origin).host,
      },
    };
    const call = apiClient(request, admin);

    // --- 1. Siembra como ADMIN ------------------------------------------------
    const norte = await call<Location>('post', '/locations', { name: 'Sede Norte', ...E2E_REGION });
    const principal = (await call<Location[]>('get', '/locations')).find((l) => l.id !== norte.id)!;
    expect(principal, 'la clínica nace con su sede principal').toBeTruthy();
    for (const loc of [principal, norte]) {
      await call('put', '/locations/schedule', { ranges: [] }, loc.id);
    }

    const receptionEmail = `test.recepcion.sedes.${tag}@example.com`;
    await addStaffViaApi(request, admin, {
      fullName: 'Rita Recepción Norte',
      email: receptionEmail,
      role: 'RECEPTION',
      password,
    });
    const staff = await call<{ userId: string; email: string; locationIds: string[] | null }[]>(
      'get',
      '/staff',
    );
    const reception = staff.find((s) => s.email === receptionEmail)!;
    expect(reception.locationIds, 'recién invitada trabaja en todas las sedes').toBeNull();
    const me = await call<{ id: string }>('get', '/me');

    const northName = `Norte${tag}`;
    const centerName = `Centro${tag}`;
    const northPatient = await patientWithPayment(call, tag, northName, 41_000, norte.id);
    const centerPatient = await patientWithPayment(call, tag, centerName, 73_000, principal.id);

    const day = sedeDayFromToday(1);
    for (const [patient, loc, hhmm, reason] of [
      [northPatient, norte, '09:00', `Control norte ${tag}`],
      [centerPatient, principal, '09:30', `Control centro ${tag}`],
    ] as const) {
      await call(
        'post',
        '/appointments',
        {
          patientId: patient.id,
          providerId: me.id,
          start: atSede(day, hhmm).toISOString(),
          end: atSede(day, hhmm === '09:00' ? '09:30' : '10:00').toISOString(),
          reason,
        },
        loc.id,
      );
    }

    // --- 2. El ADMIN la acota a Norte desde su ficha -------------------------
    await page.goto(`${origin}/staff/${reception.userId}`);
    const allBox = page.getByRole('checkbox', { name: 'Todas las sedes' });
    await expect(allBox).toBeChecked({ timeout: 15_000 });
    await allBox.uncheck();
    await page.getByRole('checkbox', { name: 'Sede Norte' }).check();
    await expect(page.getByRole('checkbox', { name: principal.name })).not.toBeChecked();
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Guardar sedes' }).click();
    await expect(page.getByText(/^Sedes guardadas\./)).toBeVisible({ timeout: 10_000 });
    await page.getByRole('heading', { name: 'Sedes', exact: true }).scrollIntoViewIfNeeded();
    await shoot(page, 'tarjeta-sedes', viewport.width);

    const afterSave = await call<{ all: boolean; locationIds: string[] }>(
      'get',
      `/staff/${reception.userId}/locations`,
    );
    expect(afterSave).toEqual({ all: false, locationIds: [norte.id] });

    // --- 3. La recepcionista entra --------------------------------------------
    const rec = await receptionPage(browser, viewport.width, viewport.height);
    try {
      await loginAs(rec, origin, receptionEmail, password);

      // Selector: solo Norte, sin «Todas las sedes».
      await rec.goto(`${origin}/agenda`);
      const select = locationSelect(rec);
      await expect(select).toBeVisible({ timeout: 15_000 });
      await expect(select).toHaveValue(norte.id);
      await expect(select.locator('option')).toHaveText(['Sede Norte']);
      await expect(select.locator('option', { hasText: 'Todas las sedes' })).toHaveCount(0);
      await shoot(rec, 'selector-recepcion', viewport.width);

      // Agenda: solo la cita de Norte.
      await openDayList(rec, origin, day);
      await expect(rec.getByText(`Control norte ${tag}`).locator('visible=true').first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(rec.getByText(`Control centro ${tag}`)).toHaveCount(0);
      if (viewport.width === 390) await expectNoHorizontalScroll(rec);
      await shoot(rec, 'agenda-recepcion', viewport.width);

      // Caja: solo el abono de Norte.
      await rec.goto(`${origin}/caja`);
      const cash = dataList(rec, 'Abonos del período');
      await expect(cash).toBeVisible({ timeout: 15_000 });
      await expect(dataListRows(cash).filter({ hasText: northName })).toContainText(figure(41_000));
      await expect(dataListRows(cash).filter({ hasText: centerName })).toHaveCount(0);

      // La ficha del paciente de la OTRA sede se abre: los pacientes son de la clínica.
      await rec.goto(`${origin}/patients/${centerPatient.id}`);
      await expect(rec.getByRole('heading', { name: new RegExp(centerName) }).first()).toBeVisible({
        timeout: 15_000,
      });

      // --- 4. Cita nueva sin elegir sede → Norte -------------------------------
      const reason = `Recepción sin sede ${tag}`;
      await openDayList(rec, origin, day);
      await rec.getByRole('button', { name: 'Nueva cita' }).click();
      const form = rec.getByRole('form', { name: 'Agendar cita' });
      await expect(form).toBeVisible();
      await expect(form.getByLabel(/Sede/)).toHaveCount(0);
      await form.getByLabel('Paciente', { exact: true }).fill(northName);
      await expect(form.getByRole('button', { name: 'Cambiar' })).toBeVisible({ timeout: 10_000 });
      await form.getByLabel('Profesional', { exact: true }).selectOption({ label: ownerName });
      await fillTime(form, 'Hora de inicio', '11:00');
      await fillTime(form, 'Hora de fin', '11:30');
      await form.getByLabel('Motivo (opcional)').fill(reason);
      await form.getByRole('button', { name: 'Agendar cita' }).click();
      await expect(form).toBeHidden({ timeout: 10_000 });
      await expect(rec.getByText(reason).locator('visible=true').first()).toBeVisible({ timeout: 10_000 });

      const from = atSede(day, '00:00').toISOString();
      const to = atSede(sedeDayFromToday(2), '00:00').toISOString();
      const all = await call<{ reason: string | null; locationId: string; start: string }[]>(
        'get',
        `/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      );
      const created = all.find((a) => a.reason === reason);
      expect(created, 'la cita de recepción existe').toBeTruthy();
      expect(created!.locationId).toBe(norte.id);
      expect(sedeDate(new Date(created!.start))).toBe(day);
      expect(sedeTime(new Date(created!.start))).toBe('11:00');

      // --- 5. 403 por la sede principal y la web se recompone sola -------------
      const recToken = await accessTokenOf(rec);
      const denied = await request.get(
        `${API_URL}/appointments?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        {
          headers: {
            Authorization: `Bearer ${recToken}`,
            'X-Tenant-Host': new URL(origin).host,
            'X-Location-Id': principal.id,
          },
        },
      );
      expect(denied.status()).toBe(403);
      expect(((await denied.json()) as { code?: string }).code).toBe('LOCATION_NOT_ALLOWED');

      await rec.evaluate(([key, id]) => window.localStorage.setItem(key, id), [LOCATION_KEY, principal.id]);
      await openDayList(rec, origin, day);
      await expect(rec.getByText(`Control norte ${tag}`).locator('visible=true').first()).toBeVisible({
        timeout: 15_000,
      });
      await expect(rec.getByText(`Control centro ${tag}`)).toHaveCount(0);
      await expect(rec.getByText(/No pudimos|Algo salió mal/)).toHaveCount(0);
      await expect(locationSelect(rec)).toHaveValue(norte.id);
      await expect
        .poll(() => rec.evaluate((key) => window.localStorage.getItem(key), LOCATION_KEY))
        .toBe(norte.id);
    } finally {
      await rec.context().close();
    }
  });
}
