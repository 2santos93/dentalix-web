import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { sessionCookie, waitForHydratedForm } from './support/auth';
import { API_URL, tenantOrigin } from './support/urls';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import { DEMO_CURRENCY } from './support/demo';

/**
 * e2e (DX-204): tope de descuento por rol, motivo obligatorio e informe.
 *
 * Corre contra la clínica DEMO sembrada (`npm run seed:demo` en la API), con
 * la política por defecto (ADMIN 100 %, DENTIST 10 %; motivo por encima del
 * 10 %):
 *   1. El odontólogo selecciona tres ítems de un plan en borrador y pide un
 *      15 % con «Descuento %»: ve «Tu rol permite hasta un 10 %…» y nada
 *      cambia. Con un 10 % se aplica, redondeado al céntimo (USD, DX-340).
 *   2. En «Agregar ítem», un descuento por encima del 10 % pide el motivo.
 *      DX-513: las sedes de la demo están en USD, BRL y GBP, así que la
 *      moneda del catálogo no se sabe (DX-502): bajar el precio del de
 *      catálogo NO es un descuento. El formulario lo dice sin pedir motivo y
 *      la API guarda el 50 % sin 403 ni firma. La rebaja frente a un catálogo
 *      en la moneda del plan (SEC-041) la prueba
 *      `plan-item-discount-currency.spec.ts` en una clínica de una moneda.
 *   3. La administración abre «Descuentos» (menú lateral): el total del periodo
 *      incluye el 10 % del odontólogo, con su nombre, y no la «rebaja» frente
 *      al catálogo de moneda desconocida, ni la de convenio (SEC-047, ver el
 *      spec de DX-513). Y Ajustes → Descuentos enseña los topes.
 * En escritorio (1440 px) y en móvil (390 px, tarjetas apiladas, sin scroll
 * horizontal).
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const ADMIN_EMAIL = process.env.E2E_DEMO_ADMIN_EMAIL ?? 'admin@demo.dentalix.app';
const DENTIST_EMAIL = process.env.E2E_DEMO_DENTIST_EMAIL ?? 'dentista@demo.dentalix.app';

// En la moneda de la sede principal (USD, con céntimos: DX-340). Ninguno por
// debajo del de catálogo (el primero), que contaría como descuento (SEC-041).
const PRICES = [800, 923.45, 899.99];
const PRICE_NOTICE = 'Precio por debajo del de catálogo: cuenta como descuento.';
// DX-513: con la moneda del catálogo desconocida, la referencia no cuenta.
const UNKNOWN_CATALOG_NOTE =
  'Precio de catálogo en una moneda que no se sabe, sin convertir. No cuenta como descuento: ni pide motivo ni sale en el informe de descuentos.';

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

/** Siembra como ADMIN un paciente con un plan en la moneda de la sede (USD) de tres ítems sin descuento. */
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
    currency: DEMO_CURRENCY,
  });
  for (const [i, price] of PRICES.entries()) {
    await post(`/treatment-plans/${plan.id}/items`, {
      toothNumber: ['16', '26', '36'][i],
      catalogItemId: procedure.id,
      price,
    });
  }
  // SEC-047: otra paciente con un convenio interno (lo asigna el ADMIN, sin
  // cobertura) y un ítem resuelto por él. DX-513: en la demo la moneda del
  // catálogo no se sabe, así que su rebaja no sale en el informe; la frase
  // larga a 390 px (QA D1) la prueba `plan-item-discount-currency.spec.ts`.
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
    currency: DEMO_CURRENCY,
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

    // Con su 10 %, se aplica redondeado al céntimo.
    await dialog.getByLabel('Porcentaje de descuento').fill('10');
    await dialog.getByRole('button', { name: 'Aplicar descuento' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });
    await expect(panel.getByText('Descuento aplicado a 3 ítems.')).toBeVisible();
    await expect(panel.getByText(/Descuento −(?:[A-Z]{3}\s)?80,00/).filter({ visible: true }).first()).toBeVisible();

    // --- 2. «Agregar ítem» pide el motivo por encima del 10 % (del precio:
    // sin precio ni procedimiento no hay % que comparar).
    await panel.getByLabel('Precio', { exact: true }).fill('1000');
    await panel.getByLabel(/^descuento/i).fill('200');
    await expect(panel.getByText('Por encima del 10 % el motivo es obligatorio.')).toBeVisible();

    // --- 2b. DX-513: en la demo (sedes en USD, BRL y GBP) la moneda del
    // catálogo no se sabe: bajar del precio de catálogo (800) no es un
    // descuento. Ni aviso, ni motivo, ni tope del rol.
    await panel.getByLabel(/^descuento/i).fill('');
    await panel.getByLabel('Código FDI').fill('46');
    await panel.getByLabel('Buscar en el catálogo').fill(data.procedureLabel);
    await panel.getByRole('radio', { name: data.procedureLabel }).check();
    const priceField = panel.getByLabel('Precio', { exact: true });
    await expect(priceField).toHaveValue('800');
    await priceField.fill('400');
    await expect(panel.locator('#tp-price-below-catalog')).toHaveText(UNKNOWN_CATALOG_NOTE);
    await expect(panel.getByText(PRICE_NOTICE, { exact: true })).toHaveCount(0);
    await expect(panel.getByLabel(/^Motivo del descuento/)).toHaveCount(0);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);

    // La API dice lo mismo: al 50 %, 201 sin firma de descuento.
    const itemsUrl = `${API_URL}/treatment-plans/${data.planId}/items`;
    const dentistHeaders = { 'X-Tenant-Host': host, Authorization: `Bearer ${dentistToken}` };
    const halfPrice = await page.request.post(itemsUrl, {
      headers: dentistHeaders,
      data: { toothNumber: '46', catalogItemId: data.procedureId, price: 400 },
    });
    expect(halfPrice.status()).toBe(201);
    expect(await halfPrice.json()).toMatchObject({
      catalogPrice: 800,
      catalogCurrency: null,
      price: 400,
      discount: 0,
      discountById: null,
    });

    // --- 3. La administración ve el descuento en el informe.
    const adminContext = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    const admin = await adminContext.newPage();
    await webLogin(admin, origin, ADMIN_EMAIL);
    await admin.goto(`${origin}/caja/descuentos`);
    await expect(admin.getByRole('heading', { name: 'Descuentos', level: 1 })).toBeVisible({ timeout: 15_000 });
    await expect(admin.getByTestId(`discount-total-${DEMO_CURRENCY}`)).toBeVisible();
    // DataList: filas de la tabla (escritorio) o tarjetas de la lista (teléfono).
    const rows =
      viewport.width === 390
        ? admin.getByRole('list', { name: 'Descuentos del periodo' }).getByRole('listitem')
        : admin.getByRole('table', { name: 'Descuentos del periodo' }).getByRole('row');
    await expect(rows.filter({ hasText: data.fullName }).first()).toBeVisible();
    // Los tres del 10 %; el ítem al 50 % frente al catálogo de moneda
    // desconocida no es un descuento (DX-513).
    await expect(rows.filter({ hasText: data.fullName })).toHaveCount(3);
    await expect(rows.filter({ hasText: data.fullName }).filter({ hasText: /Precio rebajado a/ })).toHaveCount(0);
    // SEC-047 + DX-513: la rebaja de convenio se mide frente al catálogo, en
    // una moneda que en la demo no se sabe: no sale. La frase larga a 390 px
    // la prueba `plan-item-discount-currency.spec.ts`.
    await expect(rows.filter({ hasText: data.agreementPatientName })).toHaveCount(0);
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
