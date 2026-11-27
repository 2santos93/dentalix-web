import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { LATE_BROWSER_TIME, addDays, atSede, birthDateTurnedLastMonth, sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';
import { fillDate } from './support/dates';
import { shot } from './support/qa-shot';

/**
 * e2e (DX-132): bordes del odontograma contra la API y la base reales.
 *
 * Clínica nueva (su dueña es ADMIN), un ítem del catálogo, una paciente de 7
 * años (dentición mixta por la edad) con un plan ACEPTADO con un procedimiento
 * en el 55, y la posición 15 ya exfoliada (permanente) por la API.
 *   - Plan: marcar «Realizado» el ítem del 55 responde 422
 *     `TOOTH_DENTITION_MISMATCH`; el modal lo explica en español, dice que sigue
 *     sin marcar y enlaza al diente en el odontograma.
 *   - Odontograma: el rótulo dice «Ajustada a mano en parte…» (no «Según la
 *     edad»); el conmutador de dentición se maneja con el teclado (una parada de
 *     Tab, flechas, Enter confirma) y pasar la carta entera a permanente la deja
 *     «Ajustada a mano».
 *   - «Ver la carta al» un día futuro de la sede: «La fecha de la carta no puede
 *     ser futura», sin «Reintentar».
 *   - Carta a una fecha: el historial del diente pide el MISMO `asOf` y la
 *     misma `X-Location-Id` que la carta (el navegador va en Tokio, la sede en
 *     Caracas).
 *   - Si solo falla la carta, el error no menciona el catálogo.
 * A 1440 y 390 px, sin scroll horizontal; capturas claro/oscuro con `E2E_QA_DIR`.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const MISMATCH =
  'El diente 55 es temporal, pero la posición 15 está en dentición permanente. Cambia la dentición de esa posición (mixta o temporal) antes de marcarlo como realizado.';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

// El navegador en otra zona que la sede (Caracas): la carta y el historial a
// una fecha tienen que salir del día de la SEDE, el que corta el servidor.
test.use({ timezoneId: 'Asia/Tokyo' });

async function seed(
  request: APIRequestContext,
  origin: string,
  accessToken: string,
  tag: string,
  today: string,
): Promise<{ patientId: string; catalogLabel: string }> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  async function call<T>(method: 'post' | 'patch', path: string, data: object): Promise<T> {
    const res = await request[method](`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const catalogLabel = `Sellante-${tag}`;
  const catalog = await call<{ id: string }>('post', '/catalog/items', {
    code: `sellante-${tag}`,
    kind: 'PROCEDURE',
    labelEs: catalogLabel,
    color: '#3366CC',
    defaultPrice: 25,
  });
  const patient = await call<{ id: string }>('post', '/patients', {
    firstName: 'Valentina',
    lastName: `Bordes${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `BO${tag}`.slice(0, 20),
    sex: 'F',
    birthDate: birthDateTurnedLastMonth(7, today),
  });
  // El plan se presupuestó con el 55 aún en la boca.
  const plan = await call<{ id: string }>('post', `/patients/${patient.id}/treatment-plans`, {
    currency: E2E_REGION.currency,
  });
  await call('post', `/treatment-plans/${plan.id}/items`, { toothNumber: '55', catalogItemId: catalog.id });
  await call('patch', `/treatment-plans/${plan.id}`, { status: 'ACCEPTED' });
  // Luego el 55 se exfolió: la posición 15 pasa a permanente.
  await call('post', `/patients/${patient.id}/dentition-events`, {
    positions: ['15'],
    dentition: 'PERMANENT',
    reason: 'EXFOLIATION',
  });
  return { patientId: patient.id, catalogLabel };
}

for (const viewport of VIEWPORTS) {
  test(`DX-132: dentición del plan, rótulo, teclado, fecha futura, historial a una fecha y errores separados (${viewport.name})`, async ({
    page,
  }) => {
    test.setTimeout(150_000);
    // «Hoy» de la sede en el reloj real (el de la API), una sola vez; el
    // navegador a las 23:30 de la sede (en Tokio ya es el día siguiente).
    const today = sedeDayFromToday(0);
    await page.clock.install({ time: atSede(today, LATE_BROWSER_TIME) });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-edges-${tag}`,
      clinicName: `Clinica Bordes ${tag}`,
      fullName: 'Dra. Bordes',
      email: `test.user.edges.${tag}@example.com`,
      password,
    });
    const { patientId } = await seed(page.request, origin, await accessTokenOf(page), tag, today);

    // --- Plan: «Realizado» en el 55 → 422 explicado en el modal ---
    await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans`);
    const status = page.getByLabel('Estado del ítem del diente 55').locator('visible=true');
    await expect(status).toHaveValue('ACCEPTED', { timeout: 15_000 });
    await status.selectOption({ label: 'Realizado' });
    const doneDialog = page.getByRole('dialog', { name: 'Marcar como realizado' });
    await expect(doneDialog).toBeVisible();
    await expect(doneDialog.getByLabel('Profesional que lo realizó')).not.toHaveValue('', { timeout: 10_000 });
    const patch = page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && /\/treatment-plans\/[^/]+\/items\//.test(r.url()),
    );
    await doneDialog.getByRole('button', { name: 'Marcar realizado' }).click();
    const patchResponse = await patch;
    expect(patchResponse.status()).toBe(422);
    expect(((await patchResponse.json()) as { code: string }).code).toBe('TOOTH_DENTITION_MISMATCH');
    await expect(doneDialog.getByText(MISMATCH)).toBeVisible();
    await expect(doneDialog.getByText(/el procedimiento sigue sin marcar/i)).toBeVisible();
    const toChart = doneDialog.getByRole('link', { name: 'Abrir el diente 55 en el odontograma' });
    await expect(toChart).toBeVisible();
    await expectDialogInsideViewport(page, doneDialog);
    await expectNoHorizontalScroll(page);
    await shot(page, 'plan-dentition-422', viewport.width);

    await toChart.click();
    const chart = page.getByRole('group', { name: 'Odontograma', exact: true });
    await expect(chart).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('heading', { name: 'Diente 55' })).toBeVisible();

    // --- Rótulo: la 15 se cambió a mano, el resto sigue por la edad ---
    const basis = page.getByTestId('odo-dentition-basis');
    await expect(basis).toHaveText('Ajustada a mano en parte; el resto, por la edad (7 años)');

    // --- Conmutador con el teclado: Mixta → (←) Permanente → Enter confirma ---
    const radios = page.getByRole('radiogroup', { name: 'Dentición de la carta' });
    const mixed = radios.getByRole('radio', { name: 'Mixta' });
    const permanent = radios.getByRole('radio', { name: 'Permanente' });
    const primary = radios.getByRole('radio', { name: 'Temporal' });
    await expect(mixed).toHaveAttribute('aria-checked', 'true');
    await expect(mixed).toHaveAttribute('tabindex', '0');
    await expect(permanent).toHaveAttribute('tabindex', '-1');
    await mixed.focus();
    await page.keyboard.press('ArrowRight');
    await expect(primary).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(permanent).toBeFocused();
    await page.keyboard.press('End');
    await expect(primary).toBeFocused();
    await page.keyboard.press('Home');
    await expect(permanent).toBeFocused();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.keyboard.press('Enter');
    const preset = page.getByRole('dialog', { name: 'Pasar la carta a dentición permanente' });
    await expect(preset).toBeVisible();
    await expectDialogInsideViewport(page, preset);
    await preset.getByRole('button', { name: 'Cambiar la carta' }).click();
    await expect(preset).toBeHidden({ timeout: 10_000 });
    await expect(permanent).toHaveAttribute('aria-checked', 'true', { timeout: 10_000 });
    await expect(basis).toHaveText('Ajustada a mano', { timeout: 10_000 });
    await expect(page.getByText(/según la edad/i)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shot(page, 'odontogram-manual', viewport.width);

    // --- Fecha futura en el día de la sede: 400 en español, sin «Reintentar» ---
    const future = page.waitForResponse((r) => /\/odontogram\?asOf=/.test(r.url()));
    await fillDate(page, 'Ver la carta al', addDays(today, 1));
    const futureResponse = await future;
    expect(futureResponse.status()).toBe(400);
    expect(((await futureResponse.json()) as { code: string }).code).toBe('ODONTOGRAM_AS_OF_FUTURE');
    const futureError = page.getByText('La fecha de la carta no puede ser futura');
    await expect(futureError).toBeVisible();
    await expect(page.getByRole('button', { name: /reintentar/i })).toHaveCount(0);
    await expect(page.getByText('No pudimos actualizar el odontograma.')).toHaveCount(0);
    // Sigue la carta de hoy, editable.
    await expect(page.getByText(/· solo lectura/)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await shot(page, 'odontogram-future-date', viewport.width);

    // --- Carta a una fecha: el historial pide el mismo asOf y la misma sede ---
    const yesterday = addDays(today, -1);
    const chartRequest = page.waitForRequest((r) => r.url().includes(`/odontogram?asOf=${yesterday}`));
    const historyRequest = page.waitForRequest((r) => r.url().includes(`/teeth/55/history?asOf=${yesterday}`));
    await fillDate(page, 'Ver la carta al', yesterday);
    const [chartReq, historyReq] = await Promise.all([chartRequest, historyRequest]);
    const sedeOf = async (r: typeof chartReq) => (await r.allHeaders())['x-location-id'] ?? null;
    expect(await sedeOf(historyReq)).toBe(await sedeOf(chartReq));
    await expect(futureError).toHaveCount(0);
    await expect(page.getByText(/· solo lectura/)).toBeVisible({ timeout: 10_000 });
    // Ayer la carta seguía mixta por la edad, con el 55 todavía en la boca.
    await expect(basis).toHaveText('Según la edad (7 años)');
    await expect(chart.getByRole('group', { name: 'Diente 55 (temporal), sano' })).toBeVisible();
    await expect(page.getByText(/este diente no tenía registros al/i)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Volver a hoy' }).click();
    await expect(page.getByText(/· solo lectura/)).toHaveCount(0);

    // --- Solo falla la carta: el mensaje no culpa al catálogo ---
    await page.route(/\/api\/v1\/patients\/[^/]+\/odontogram(\?|$)/, (route) =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"statusCode":500}' }),
    );
    await page.goto(`${origin}/patients/${patientId}?tab=odontogram`);
    const failure = page.getByRole('alert').filter({ hasText: 'No pudimos cargar el odontograma.' });
    await expect(failure).toBeVisible({ timeout: 15_000 });
    await expect(failure).not.toContainText(/catálogo/i);
    await expectNoHorizontalScroll(page);
    await shot(page, 'odontogram-chart-error', viewport.width);
    await page.unroute(/\/api\/v1\/patients\/[^/]+\/odontogram(\?|$)/);
  });
}
