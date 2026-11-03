import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiPost, createLocationViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import type { RegionalSettings } from './support/regional';
import { API_URL } from './support/urls';
import { NO_CURRENCY_TEXTS } from '../src/lib/format/currency-text';
import { regionalFormat } from '../src/lib/format/regional-format';
import { moneyWithCode } from '../src/lib/format/sede-number';

/**
 * e2e G1-C (DX-354): los impresos y las páginas del paciente salen con el
 * formato y el reloj de la sede DEL DOCUMENTO, no con los del navegador ni los
 * de la sede activa.
 *
 * Una clínica nueva por corrida con dos sedes creadas por la API:
 * - US: `en-US` / `America/New_York` / USD / 12 h;
 * - DE: `de-DE` / `Europe/Berlin` / EUR / 24 h.
 * En cada una se siembra por la API un paciente con un abono, un presupuesto,
 * un consentimiento firmado, un implante, un saldo a favor devuelto y la caja
 * abierta. Cada test abre el impreso de un documento en cada sede (la sede
 * activa vive en localStorage) y comprueba la hora, la fecha y el importe con
 * el código ISO calculados con `regionalFormat` (no literales) a partir del
 * dato del propio documento, y que la API devuelve la región de la sede.
 *
 * Capturas a 390 y 1440 px, claro y oscuro, en E2E_QA_DIR si está definido
 * (`.planning/clickup-handoff-audit/qa/DX-354/`).
 *
 * El caso de una sede sin formato se prueba interceptando la respuesta del
 * documento con `regional: null` (la API no deja crear una sede sin reloj): sin
 * BD y sin saltos.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `g1c-${suffix}`;
const password = 'Password123!';
const adminEmail = `admin.g1c.${suffix}@example.com`;
const QA_DIR = process.env.E2E_QA_DIR;

type Sede = { name: string } & RegionalSettings;
type Key = 'us' | 'de';

const SEDES: Record<Key, Sede> = {
  us: { name: 'Sede US', country: 'US', currency: 'USD', timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' },
  de: { name: 'Sede DE', country: 'DE', currency: 'EUR', timeZone: 'Europe/Berlin', locale: 'de-DE', hourCycle: 'h23' },
};
const KEYS: readonly Key[] = ['us', 'de'];
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;

/** Abono del presupuesto, con decimales para ver los separadores de cada sede. */
const PAYMENT = 1234.5;
/** Abono del plan que se cancela para tener saldo a favor, y lo que se devuelve. */
const CREDIT_PAYMENT = 300;
const REFUND = 120.5;
/** Un PNG de 1×1: la firma de los dos firmantes del consentimiento. */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

interface SedeData {
  patientId: string;
  planId: string;
  paymentId: string;
  consentId: string;
  implantDate: string;
  refundId: string;
  cashSessionId: string;
}

let session: ApiSession;
let origin = '';
const ids = {} as Record<Key, string>;
const data = {} as Record<Key, SedeData>;

/** Las llamadas de la sesión en una sede (`X-Location-Id`). */
function at(key: Key): ApiSession {
  return { ...session, headers: { ...session.headers, 'X-Location-Id': ids[key] } };
}

async function apiGet<T>(request: APIRequestContext, s: ApiSession, path: string): Promise<T> {
  const res = await request.get(`${API_URL}${path}`, { headers: s.headers });
  expect(res.ok(), `GET ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

async function apiPatch(request: APIRequestContext, s: ApiSession, path: string, body: object): Promise<void> {
  const res = await request.patch(`${API_URL}${path}`, { headers: s.headers, data: body });
  expect(res.ok(), `PATCH ${path} falló: ${await res.text()}`).toBeTruthy();
}

const fmtOf = (s: Sede) => regionalFormat({ locale: s.locale, hourCycle: s.hourCycle });
const money = (s: Sede, amount: number, currency = s.currency) => moneyWithCode(amount, currency, fmtOf(s), NO_CURRENCY_TEXTS);
const dateTime = (s: Sede, iso: string) => fmtOf(s).dateTime(new Date(iso), s.timeZone);
const day = (s: Sede, iso: string) => fmtOf(s).date(new Date(iso), s.timeZone);
/** `Intl` separa con espacios duros: se compara con espacios normales. */
const norm = (text: string) => text.replace(/\s+/g, ' ').trim();

/** El texto del bloque contiene lo esperado (espacios normalizados, sin esperas de más). */
async function expectContains(locator: Locator, expected: string): Promise<void> {
  await expect.poll(async () => norm((await locator.textContent()) ?? ''), { timeout: 15_000 }).toContain(norm(expected));
}

/** La región que manda la API en el documento es la de la sede, no otra. */
function expectRegional(regional: unknown, s: Sede): void {
  expect(regional).toEqual({ timeZone: s.timeZone, locale: s.locale, hourCycle: s.hourCycle });
}

/** La sede activa de la sesión vive en localStorage. */
async function activate(page: Page, key: Key): Promise<void> {
  await page.evaluate((id) => window.localStorage.setItem('dentalix.activeLocationId', id), ids[key]);
}

async function loginAdmin(page: Page): Promise<void> {
  // El diálogo de impresión se abre solo al cargar un impreso: aquí no hace nada.
  await page.addInitScript(() => {
    window.print = () => undefined;
  });
  await loginAs(page, origin, adminEmail, password);
}

/** Captura a 390 y 1440 px, en claro y oscuro, sin scroll horizontal (E2E_QA_DIR). */
async function shoot(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalScroll(page);
    await page.mouse.move(0, 0);
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished.catch(() => undefined))));
      await page.screenshot({ path: `${QA_DIR}/${name}-${viewport.width}-${scheme}.png`, fullPage: false });
    }
    await page.emulateMedia({ colorScheme: 'light' });
  }
  await page.setViewportSize(VIEWPORTS[0]);
}

/** Siembra por la API todo lo que imprime una sede. */
async function seedSede(request: APIRequestContext, key: Key, catalogId: string, templateId: string): Promise<SedeData> {
  const sede = SEDES[key];
  const s = at(key);
  const patient = await apiPost<{ id: string }>(request, s, '/patients', {
    firstName: `Paciente${key.toUpperCase()}`,
    lastName: `Impreso${suffix}`.slice(0, 40),
    docType: 'PASSPORT',
    docNumber: `G1C${key}${suffix}`.slice(0, 20),
    sex: 'F',
  });
  async function plan(): Promise<{ id: string; itemId: string }> {
    const created = await apiPost<{ id: string }>(request, s, `/patients/${patient.id}/treatment-plans`, {
      currency: sede.currency,
    });
    const item = await apiPost<{ id: string }>(request, s, `/treatment-plans/${created.id}/items`, {
      toothNumber: '36',
      catalogItemId: catalogId,
    });
    await apiPatch(request, s, `/treatment-plans/${created.id}/items/${item.id}`, { status: 'ACCEPTED' });
    return { id: created.id, itemId: item.id };
  }
  const pay = (planId: string, amount: number) =>
    apiPost<{ id: string }>(request, s, `/treatment-plans/${planId}/payments`, {
      amount,
      currency: sede.currency,
      paidAt: new Date().toISOString(),
      method: 'CASH',
    });

  // La caja de la sede se abre antes de cobrar: el efectivo entra en ella y la devolución sale de ella.
  const cash = await apiPost<{ id: string }>(request, s, '/cash-sessions/open', { floats: [] });
  const main = await plan();
  const payment = await pay(main.id, PAYMENT);

  // Saldo a favor: un plan con un abono que se cancela, y se devuelve una parte.
  const credit = await plan();
  const creditPayment = await pay(credit.id, CREDIT_PAYMENT);
  await apiPatch(request, s, `/treatment-plans/${credit.id}`, { status: 'CANCELLED' });
  const refund = await apiPost<{ id: string }>(request, s, `/treatment-plans/${credit.id}/credit-refunds`, {
    amount: REFUND,
    currency: sede.currency,
    method: 'CASH',
    reason: 'Devolución de prueba',
    paymentIds: [creditPayment.id],
  });

  const consent = await apiPost<{ id: string }>(request, s, `/patients/${patient.id}/consents`, {
    templateId,
    templateVersion: 1,
    treatmentPlanId: main.id,
    signerType: 'PATIENT',
    patientSignature: PNG,
    professionalSignature: PNG,
  });

  await apiPost(request, s, `/patients/${patient.id}/implants`, {
    toothNumber: '36',
    kind: 'IMPLANT',
    manufacturer: 'Straumann',
    reference: '021.5310',
    lot: `LOT-${suffix}${key}`.slice(0, 40).toUpperCase(),
    diameterMm: 4.1,
    lengthMm: 10,
  });
  const implants = await apiGet<{ placedOn: string }[]>(request, s, `/patients/${patient.id}/implants`);

  return {
    patientId: patient.id,
    planId: main.id,
    paymentId: payment.id,
    consentId: consent.id,
    implantDate: implants[0].placedOn,
    refundId: refund.id,
    cashSessionId: cash.id,
  };
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(240_000);
  const request = await playwright.request.newContext();
  try {
    session = await registerClinicViaApi(request, {
      subdomain,
      clinicName: `Clínica Impresos ${suffix}`,
      fullName: 'Ana Titular',
      email: adminEmail,
      password,
    });
    origin = session.origin;
    ids.us = await createLocationViaApi(request, session, SEDES.us);
    ids.de = await createLocationViaApi(request, session, SEDES.de);
    const catalog = await apiPost<{ id: string }>(request, session, '/catalog/items', {
      code: `g1c-${suffix}`.slice(0, 20),
      kind: 'PROCEDURE',
      labelEs: `Corona ${suffix.slice(0, 6)}`,
      color: '#3366CC',
      defaultPrice: 5000,
    });
    const template = await apiPost<{ id: string }>(request, session, '/consent-templates', {
      title: `Consentimiento ${suffix}`,
      body: 'Yo, {{paciente}}, autorizo a {{profesional}} de {{clinica}} a realizar: {{tratamiento}}.',
    });
    for (const key of KEYS) data[key] = await seedSede(request, key, catalog.id, template.id);
  } finally {
    await request.dispose();
  }
});

test('recibo de caja: la hora y el importe con el reloj y el formato de su sede (12 h en US, 24 h en DE)', async ({ page, request }) => {
  await loginAdmin(page);
  for (const key of KEYS) {
    const sede = SEDES[key];
    const receipt = await apiGet<{ issuedAt: string; regional: unknown }>(request, at(key), `/payments/${data[key].paymentId}/receipt`);
    expectRegional(receipt.regional, sede);
    await activate(page, key);
    await page.goto(`${origin}/print/payments/${data[key].paymentId}/receipt`);
    const doc = page.getByTestId('receipt-document');
    await expect(doc).toBeVisible({ timeout: 15_000 });
    await expectContains(doc, dateTime(sede, receipt.issuedAt));
    await expectContains(doc, money(sede, PAYMENT));
    expect(norm((await doc.textContent()) ?? '')).not.toMatch(sede.hourCycle === 'h12' ? /\b\d{2}\.\d{2}\.\d{4}/ : /[ap]\. m\./);
    await shoot(page, `recibo-${key}`);
  }
});

test('estado de cuenta: la emisión, la fecha del abono y el importe con la sede del documento', async ({ page, request }) => {
  await loginAdmin(page);
  for (const key of KEYS) {
    const sede = SEDES[key];
    const statement = await apiGet<{ regional: unknown; movements: { paidOn: string }[] }>(
      request,
      at(key),
      `/patients/${data[key].patientId}/account-statement`,
    );
    expectRegional(statement.regional, sede);
    await activate(page, key);
    await page.goto(`${origin}/print/patients/${data[key].patientId}/account-statement`);
    const header = page.getByTestId('statement-header');
    await expect(header).toBeVisible({ timeout: 15_000 });
    // La emisión es «ahora»: se acepta el minuto anterior y el siguiente.
    const stamps = [-1, 0, 1].map((m) => dateTime(sede, new Date(Date.now() + m * 60_000).toISOString()));
    await expect
      .poll(async () => {
        const text = norm((await header.textContent()) ?? '');
        return stamps.some((stamp) => text.includes(norm(stamp)));
      }, { timeout: 15_000 })
      .toBe(true);
    const paper = page.locator('.statement-print-root');
    await expectContains(paper, money(sede, PAYMENT));
    await expectContains(paper, fmtOf(sede).civilDate(statement.movements[0].paidOn));
    await shoot(page, `estado-cuenta-${key}`);
  }
});

test('presupuesto: las fechas y el total con el código ISO de la sede', async ({ page, request }) => {
  await loginAdmin(page);
  for (const key of KEYS) {
    const sede = SEDES[key];
    const quote = await apiGet<{
      regional: unknown;
      issuedOn: string;
      validUntil: string;
      currency: string;
      totals: { net: number }[];
    }>(request, at(key), `/patients/${data[key].patientId}/treatment-plans/${data[key].planId}/quote`);
    expectRegional(quote.regional, sede);
    await activate(page, key);
    await page.goto(`${origin}/print/patients/${data[key].patientId}/treatment-plans/${data[key].planId}`);
    const header = page.getByTestId('quote-header');
    await expect(header).toBeVisible({ timeout: 15_000 });
    await expectContains(header, fmtOf(sede).civilDate(quote.issuedOn));
    await expectContains(header, fmtOf(sede).civilDate(quote.validUntil));
    await expectContains(page.getByTestId(`quote-total-${quote.currency}`), money(sede, quote.totals[0].net, quote.currency));
    await shoot(page, `presupuesto-${key}`);
  }
});

test('consentimiento: la hora de la firma con el reloj de la sede', async ({ page, request }) => {
  await loginAdmin(page);
  for (const key of KEYS) {
    const sede = SEDES[key];
    const consent = await apiGet<{ signedAt: string; regional: unknown }>(
      request,
      at(key),
      `/patients/${data[key].patientId}/consents/${data[key].consentId}`,
    );
    expectRegional(consent.regional, sede);
    await activate(page, key);
    await page.goto(`${origin}/print/patients/${data[key].patientId}/consents/${data[key].consentId}`);
    const header = page.getByTestId('consent-header');
    await expect(header).toBeVisible({ timeout: 15_000 });
    await expectContains(header, dateTime(sede, consent.signedAt));
    await shoot(page, `consentimiento-${key}`);
  }
});

test('tarjeta de implante: el tamaño y la fecha con la misma sede, la del implante y no la activa', async ({ page, request }) => {
  await loginAdmin(page);
  // La sede ACTIVA es la otra: la tarjeta usa la de sus implantes.
  const other: Record<Key, Key> = { us: 'de', de: 'us' };
  for (const key of KEYS) {
    const sede = SEDES[key];
    const card = await apiGet<{ regional: unknown }>(
      request,
      at(key),
      `/patients/${data[key].patientId}/implant-card?date=${data[key].implantDate}`,
    );
    expectRegional(card.regional, sede);
    await activate(page, other[key]);
    await page.goto(`${origin}/print/patients/${data[key].patientId}/implant-card?date=${data[key].implantDate}`);
    const article = page.getByRole('article');
    await expect(article).toBeVisible({ timeout: 15_000 });
    const fmt = fmtOf(sede);
    await expectContains(article, `${fmt.number(4.1, { max: 2 })} × ${fmt.number(10, { max: 2 })} mm`);
    await expectContains(article, fmt.civilDate(data[key].implantDate));
    await shoot(page, `tarjeta-implante-${key}`);
  }
});

test('reembolso de saldo a favor: la fecha y el importe con el código ISO de la sede', async ({ page, request }) => {
  await loginAdmin(page);
  for (const key of KEYS) {
    const sede = SEDES[key];
    const refund = await apiGet<{ regional: unknown; snapshot: { issuedAt: string } }>(
      request,
      at(key),
      `/credit-refunds/${data[key].refundId}`,
    );
    expectRegional(refund.regional, sede);
    await activate(page, key);
    await page.goto(`${origin}/print/credit-refunds/${data[key].refundId}`);
    const doc = page.getByTestId('refund-document');
    await expect(doc).toBeVisible({ timeout: 15_000 });
    await expectContains(doc, day(sede, refund.snapshot.issuedAt));
    await expectContains(doc, money(sede, REFUND));
    await shoot(page, `reembolso-${key}`);
  }
});

test('cierre de caja: la apertura y los cobros con el reloj, el formato y el código ISO de la sede', async ({ page, request }) => {
  await loginAdmin(page);
  for (const key of KEYS) {
    const sede = SEDES[key];
    const report = await apiGet<{ openedAt: string; regional: unknown }>(request, at(key), `/cash-sessions/${data[key].cashSessionId}`);
    expectRegional(report.regional, sede);
    await activate(page, key);
    await page.goto(`${origin}/print/cash-sessions/${data[key].cashSessionId}`);
    const doc = page.getByTestId('cash-session-report');
    await expect(doc).toBeVisible({ timeout: 15_000 });
    await expectContains(doc, dateTime(sede, report.openedAt));
    await expectContains(doc, money(sede, PAYMENT));
    await shoot(page, `cierre-caja-${key}`);
  }
});

test('un documento cuya sede no tiene formato (región nula): «—» y el aviso de la sede, nunca otro formato', async ({ page }) => {
  await loginAdmin(page);
  await activate(page, 'us');
  // La API responde `regional: null` cuando a la sede le falta algo; aquí se simula en la respuesta.
  // Solo la petición a la API: el mismo patrón sin `API_URL` atrapa también la página /print/….
  await page.route(`${API_URL}/patients/*/account-statement*`, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, json: { ...(await res.json()), regional: null } });
  });
  await page.goto(`${origin}/print/patients/${data.us.patientId}/account-statement`);
  const header = page.getByTestId('statement-header');
  await expect(header).toBeVisible({ timeout: 15_000 });
  // dt y dd van pegados en el textContent: «Fecha de emisión—».
  await expect(header).toHaveText(/Fecha de emisión\s*—/);
  await expect(page.getByText(/No se pudo saber el formato regional o el reloj de la sede/)).toBeVisible();
  const text = norm((await page.locator('.statement-print-root').textContent()) ?? '');
  expect(text).not.toMatch(/\d{1,2}[/.]\d{1,2}[/.]\d{4}/);
  expect(text).not.toMatch(/\d[.,]\d{2}/);
  await shoot(page, 'aviso-sede-sin-reloj');
});
