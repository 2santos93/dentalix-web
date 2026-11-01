import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';

/**
 * e2e (DX-204): tope de descuento por rol, motivo obligatorio e informe.
 *
 * Corre contra la clínica DEMO sembrada (`npm run seed:demo` en la API), con
 * la política por defecto (ADMIN 100 %, DENTIST 10 %; motivo por encima del
 * 10 %):
 *   1. El odontólogo selecciona tres ítems de un plan en borrador y pide un
 *      15 % con «Descuento %»: ve «Tu rol permite hasta un 10 %…» y nada
 *      cambia. Con un 10 % se aplica, redondeado al peso (COP sin decimales).
 *   2. En «Agregar ítem», un descuento por encima del 10 % pide el motivo.
 *      SEC-041: bajar el precio del de catálogo avisa «Precio por debajo del
 *      de catálogo: cuenta como descuento.» y pide el motivo; al 50 % el
 *      odontólogo ve su tope (y la API da 403); al 95 % se guarda (201).
 *   3. La administración abre «Descuentos» (menú lateral): el total del periodo
 *      incluye el 10 % del odontólogo, con su nombre, y la rebaja de precio
 *      del 95 % («Precio rebajado a…»). Y Ajustes → Descuentos
 *      enseña los topes.
 * En escritorio (1440 px) y en móvil (390 px, tarjetas apiladas, sin scroll
 * horizontal).
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const DENTIST_EMAIL = process.env.E2E_DEMO_DENTIST_EMAIL ?? 'dentista@demo.dentalix.app';

const PRICES = [85_000, 123_457, 99_999];
const PRICE_NOTICE = 'Precio por debajo del de catálogo: cuenta como descuento.';
const PRICE_CAP_10 = `${PRICE_NOTICE} Tu rol permite hasta un 10 % de descuento por ítem.`;

const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 8);

async function apiLogin(request: APIRequestContext, host: string, email: string): Promise<string> {
  const res = await request.post(`${API_URL}/auth/login`, {
    headers: { 'X-Tenant-Host': host },
    data: { email, password: DEMO_PASSWORD },
  });
  expect(res.ok(), `login ${email} falló: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** Siembra como ADMIN un paciente con un plan en COP de tres ítems sin descuento. */
async function seed(
  request: APIRequestContext,
  origin: string,
  tag: string,
): Promise<{
  patientId: string;
  planId: string;
  fullName: string;
  procedureId: string;
  procedureLabel: string;
  agreementPatientName: string;
}> {
  const host = new URL(origin).host;
  const headers = {
    'X-Tenant-Host': host,
    Authorization: `Bearer ${await apiLogin(request, host, ADMIN_EMAIL)}`,
  };
  async function post<T>(path: string, data?: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const lastName = `Descuento${tag}`;
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Rosa',
    lastName,
    docType: 'NATIONAL_ID',
    docNumber: `DX204${tag}`.slice(0, 20),
    sex: 'F',
  });
  const procedure = await post<{ id: string }>('/catalog/items', {
    code: `dx204-${tag}`,
    kind: 'PROCEDURE',
    labelEs: `Resina DX204 ${tag}`,
    color: '#3366CC',
    defaultPrice: PRICES[0],
  });
  const plan = await post<{ id: string }>(`/patients/${patient.id}/treatment-plans`, {
    currency: 'COP',
  });
  for (const [i, price] of PRICES.entries()) {
    await post(`/treatment-plans/${plan.id}/items`, {
      toothNumber: ['16', '26', '36'][i],
      catalogItemId: procedure.id,
      price,
    });
  }
  // SEC-047: otra paciente con un convenio interno (lo asigna el ADMIN, sin
  // cobertura) y un ítem resuelto por él: su línea del informe lleva la frase
  // larga del convenio, que a 390 px no debe desbordar la tarjeta (QA D1).
  const payer = await post<{ id: string }>('/payers', { name: `Cortesía empleados ${tag}`, type: 'OTHER' });
  const agreement = await post<{ id: string }>('/agreements', {
    name: `Cortesía empleados de la clínica 100 % ${tag}`,
    payerId: payer.id,
    kind: 'PERCENT_DISCOUNT',
    percent: 100,
  });
  const agreementLastName = `Convenio${tag}`;
  const agreementPatient = await post<{ id: string }>('/patients', {
    firstName: 'Marta',
    lastName: agreementLastName,
    docType: 'NATIONAL_ID',
    docNumber: `SEC47${tag}`.slice(0, 20),
    sex: 'F',
  });
  const assigned = await request.put(`${API_URL}/patients/${agreementPatient.id}/agreement`, {
    headers,
    data: { agreementId: agreement.id },
  });
  expect(assigned.ok(), `PUT agreement falló: ${await assigned.text()}`).toBeTruthy();
  const agreementPlan = await post<{ id: string }>(`/patients/${agreementPatient.id}/treatment-plans`, {
    currency: 'COP',
  });
  await post(`/treatment-plans/${agreementPlan.id}/items`, { toothNumber: '11', catalogItemId: procedure.id });
  return {
    patientId: patient.id,
    planId: plan.id,
    fullName: `Rosa ${lastName}`,
    procedureId: procedure.id,
    procedureLabel: `Resina DX204 ${tag}`,
    agreementPatientName: `Marta ${agreementLastName}`,
  };
}

async function webLogin(page: Page, origin: string, email: string): Promise<void> {
  await page.goto(`${origin}/login`);
  await waitForHydratedForm(page);
  await page.getByLabel('Correo electrónico').fill(email);
  await page.getByLabel('Contraseña', { exact: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect
    .poll(async () => Boolean((await sessionCookie(page, origin))?.httpOnly), { timeout: 15_000 })
    .toBe(true);
  await page.waitForURL((url) => !url.pathname.endsWith('/login'), { timeout: 10_000 });
}

test.describe.configure({ mode: 'serial' });

for (const viewport of [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
]) {
  test(`un DENTIST no puede pasar su tope; el informe recoge su descuento (${viewport.name})`, async ({
    page,
    browser,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const origin = tenantOrigin(DEMO_SUBDOMAIN);
    const data = await seed(page.request, origin, `${suffix}${viewport.width}`);

    // --- 1. El odontólogo intenta un 15 % sobre tres ítems.
    await webLogin(page, origin, DENTIST_EMAIL);
    await page.goto(`${origin}/patients/${data.patientId}?tab=treatment-plans`);
    const panel = page.locator('#tabpanel-treatment-plans');
    for (const tooth of ['16', '26', '36']) {
      await panel
        .getByRole('checkbox', { name: `Seleccionar el ítem del diente ${tooth}` })
        .filter({ visible: true })
        .check({ timeout: 15_000 });
    }
    await expect(panel.getByText('3 ítems seleccionados')).toBeVisible();
    await panel.getByRole('button', { name: 'Descuento %' }).click();
    const dialog = page.getByRole('dialog', { name: 'Descuento %' });
    await dialog.getByLabel('Porcentaje de descuento').fill('15');
    await dialog.getByRole('button', { name: 'Aplicar descuento' }).click();
    await expect(dialog.getByText('Tu rol permite hasta un 10 % de descuento por ítem.')).toBeVisible();
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // Por la API tampoco: 403 en español y el plan sigue sin descuento.
    const host = new URL(origin).host;
    const dentistToken = await apiLogin(page.request, host, DENTIST_EMAIL);
    const items = (
      (await (
        await page.request.get(`${API_URL}/treatment-plans/${data.planId}`, {
          headers: { 'X-Tenant-Host': host, Authorization: `Bearer ${dentistToken}` },
        })
      ).json()) as { items: { id: string; discount: number }[] }
    ).items;
    const denied = await page.request.post(`${API_URL}/treatment-plans/${data.planId}/items/bulk-discount`, {
      headers: { 'X-Tenant-Host': host, Authorization: `Bearer ${dentistToken}` },
      data: { itemIds: items.map((i) => i.id), percent: 15, discountReason: 'LOYALTY' },
    });
    expect(denied.status()).toBe(403);
    expect(((await denied.json()) as { message: string }).message).toBe(
      'Tu rol permite hasta un 10 % de descuento por ítem.',
    );

    // Con su 10 %, se aplica redondeado al peso.
    await dialog.getByLabel('Porcentaje de descuento').fill('10');
    await dialog.getByRole('button', { name: 'Aplicar descuento' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(panel.getByText('Descuento aplicado a 3 ítems.')).toBeVisible();
    await expect(panel.getByText(/Descuento −(?:[A-Z]{3}\s)?8\.?500,00/).filter({ visible: true }).first()).toBeVisible();

    // --- 2. «Agregar ítem» pide el motivo por encima del 10 % (del precio:
    // sin precio ni procedimiento no hay % que comparar).
    await panel.getByLabel('Precio', { exact: true }).fill('100000');
    await panel.getByLabel(/^descuento/i).fill('20000');
    await expect(panel.getByText('Por encima del 10 % el motivo es obligatorio.')).toBeVisible();

    // --- 2b. SEC-041: el precio por debajo del de catálogo (85.000) cuenta
    // como descuento: aviso, motivo y tope del rol.
    await panel.getByLabel(/^descuento/i).fill('');
    await panel.getByLabel('Código FDI').fill('46');
    await panel.getByLabel('Buscar en el catálogo').fill(data.procedureLabel);
    await panel.getByRole('radio', { name: data.procedureLabel }).check();
    const priceField = panel.getByLabel('Precio', { exact: true });
    await expect(priceField).toHaveValue('85000');
    await expect(panel.getByText(PRICE_NOTICE, { exact: true })).toHaveCount(0);
    await priceField.fill('42500');
    await expect(panel.getByText(PRICE_NOTICE, { exact: true })).toBeVisible();
    await expect(panel.getByLabel('Motivo del descuento', { exact: true })).toBeVisible();
    await expect(panel.getByText('Por encima del 10 % el motivo es obligatorio.')).toBeVisible();
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await panel.getByRole('button', { name: 'Agregar ítem', exact: true }).click();
    await expect(panel.getByText(PRICE_CAP_10)).toBeVisible();
    // Al 95 % el aviso sigue, pero el motivo es opcional.
    await priceField.fill('80750');
    await expect(panel.getByText(PRICE_NOTICE, { exact: true })).toBeVisible();
    await expect(panel.getByLabel('Motivo del descuento (opcional)')).toBeVisible();

    // La API es la frontera: al 50 %, 403 en español; al 95 %, 201 a su nombre.
    const itemsUrl = `${API_URL}/treatment-plans/${data.planId}/items`;
    const dentistHeaders = { 'X-Tenant-Host': host, Authorization: `Bearer ${dentistToken}` };
    const halfPrice = await page.request.post(itemsUrl, {
      headers: dentistHeaders,
      data: { toothNumber: '46', catalogItemId: data.procedureId, price: 42_500 },
    });
    expect(halfPrice.status()).toBe(403);
    expect(((await halfPrice.json()) as { message: string }).message).toBe(PRICE_CAP_10);
    const reduced = await page.request.post(itemsUrl, {
      headers: dentistHeaders,
      data: { toothNumber: '46', catalogItemId: data.procedureId, price: 80_750 },
    });
    expect(reduced.status()).toBe(201);
    expect(await reduced.json()).toMatchObject({ catalogPrice: 85_000, price: 80_750, discount: 0 });

    // --- 3. La administración ve el descuento en el informe.
    const adminContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const admin = await adminContext.newPage();
    await webLogin(admin, origin, ADMIN_EMAIL);
    await admin.goto(`${origin}/caja/descuentos`);
    await expect(admin.getByRole('heading', { name: 'Descuentos', level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(admin.getByTestId('discount-total-COP')).toBeVisible();
    // DataList: filas de la tabla (escritorio) o tarjetas de la lista (teléfono).
    const rows =
      viewport.width === 390
        ? admin.getByRole('list', { name: 'Descuentos del periodo' }).getByRole('listitem')
        : admin.getByRole('table', { name: 'Descuentos del periodo' }).getByRole('row');
    await expect(rows.filter({ hasText: data.fullName }).first()).toBeVisible();
    // Los tres del 10 % y la rebaja de precio del 95 % (SEC-041).
    await expect(rows.filter({ hasText: data.fullName })).toHaveCount(4);
    await expect(
      // DX-378 (FE-078): separadores de la sede (es-CO) y siempre el código de la moneda, nunca «$».
      rows.filter({ hasText: data.fullName }).filter({ hasText: /Precio rebajado a COP\s80\.750,00/ }),
    ).toHaveCount(1);
    // SEC-047: la línea solo de convenio, con su frase, sin desbordar a 390 px.
    const agreementLine = rows.filter({ hasText: data.agreementPatientName });
    await expect(agreementLine).toHaveCount(1);
    await expect(agreementLine).toContainText('Convenio «Cortesía empleados de la clínica 100 %');
    if (viewport.width === 390) {
      await expectNoHorizontalScroll(admin);
      await expectNoHorizontalScrollIn(admin);
    }

    await admin.goto(`${origin}/settings/descuentos`);
    await expect(admin.getByText('Motivo obligatorio por encima del 10 %.')).toBeVisible({ timeout: 15_000 });
    if (viewport.width === 390) await expectNoHorizontalScroll(admin);
    await adminContext.close();
  });
}
