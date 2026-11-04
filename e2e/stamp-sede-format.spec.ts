import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiPost, createLocationViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import type { RegionalSettings } from './support/regional';
import { API_URL } from './support/urls';
import { initialFormState, questionKeys, toSubmitBody, type QuestionnaireShape } from '../src/lib/anamnesis/anamnesis-form';
import { regionalFormat } from '../src/lib/format/regional-format';
import { civilDateLabel } from '../src/lib/format/date';

/**
 * e2e DX-354b (W1): las listas de personal pintan cada FILA con el reloj de SU
 * sede, no con el de la pantalla ni con el del navegador.
 *
 * Una clínica nueva por corrida con tres sedes creadas por la API:
 * - CCS (la principal, la de la pantalla en «Todas las sedes»):
 *   `America/Caracas` / `es-VE` / USD / 12 h;
 * - US: `America/New_York` / `en-US` / USD / 12 h;
 * - DE: `Europe/Berlin` / `de-DE` / EUR / 24 h.
 * El navegador está en `Asia/Tokyo` (`test.use`): nada coincide por casualidad.
 * En «Todas las sedes» (sin sede activa) se abren la bandeja de anamnesis y la
 * pestaña de recetas con una fila por sede; cada fila debe decir la hora de su
 * sede, calculada con `regionalFormat` a partir del dato de la propia API.
 *
 * Capturas a 390 y 1440 px, claro y oscuro, en E2E_QA_DIR si está definido
 * (`.planning/clickup-handoff-audit/qa/DX-354b/`), sin scroll horizontal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `stamp-${suffix}`;
const password = 'Password123!';
const adminEmail = `admin.stamp.${suffix}@example.com`;
const QA_DIR = process.env.E2E_QA_DIR;

type Sede = { name: string } & RegionalSettings;
type Key = 'us' | 'de';

const MAIN: Partial<RegionalSettings> = {
  country: 'VE',
  currency: 'USD',
  timeZone: 'America/Caracas',
  locale: 'es-VE',
  hourCycle: 'h12',
};
const SEDES: Record<Key, Sede> = {
  us: { name: 'Sede US', country: 'US', currency: 'USD', timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' },
  de: { name: 'Sede DE', country: 'DE', currency: 'EUR', timeZone: 'Europe/Berlin', locale: 'de-DE', hourCycle: 'h23' },
};
const KEYS: readonly Key[] = ['us', 'de'];
const VIEWPORTS = [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
] as const;
/** La API no emite un enlace de anamnesis sin política publicada, y el envío público exige la autorización. */
const POLICY = {
  policyText: 'Política de tratamiento de datos de la clínica.',
  generalText: 'Autorizo el tratamiento de mis datos personales.',
  sensitiveHealthText:
    'Autorizo el tratamiento de mis datos sensibles de salud (historia clínica). No está obligado a autorizarlo. Finalidad: la atención odontológica.',
  marketingText: 'Autorizo recibir comunicaciones comerciales.',
};
const MEDICATION: Record<Key, string> = { us: 'Paracetamol', de: 'Amoxicilina' };

test.use({ timezoneId: 'Asia/Tokyo' });
test.describe.configure({ mode: 'serial' });

interface Submission {
  id: string;
  patient: { id: string; fullName: string };
  location: { id: string; name: string };
  submittedAt: string;
}
interface Rx {
  id: string;
  locationId: string;
  issuedAt: string;
  items: { activeIngredient: string }[];
}

let session: ApiSession;
let origin = '';
const ids = {} as Record<Key, string>;
const lastName = `Sede${suffix}`.slice(0, 30);
let rxPatientId = '';

function at(key: Key): ApiSession {
  return { ...session, headers: { ...session.headers, 'X-Location-Id': ids[key] } };
}

const fmtOf = (s: Sede) => regionalFormat({ locale: s.locale, hourCycle: s.hourCycle });
const dateTime = (s: Sede, iso: string) => fmtOf(s).dateTime(new Date(iso), s.timeZone);
/** `Intl` separa con espacios duros: se compara con espacios normales. */
const norm = (text: string) => text.replace(/\s+/g, ' ').trim();

async function expectContains(locator: Locator, expected: string): Promise<void> {
  await expect.poll(async () => norm((await locator.textContent()) ?? ''), { timeout: 15_000 }).toContain(norm(expected));
}

/** Captura a 390 y 1440 px, en claro y oscuro, sin scroll horizontal (E2E_QA_DIR). */
async function shoot(page: Page, name: string): Promise<void> {
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize(viewport);
    await expectNoHorizontalScroll(page);
    if (!QA_DIR) continue;
    mkdirSync(QA_DIR, { recursive: true });
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

async function apiGet<T>(request: APIRequestContext, s: ApiSession, path: string): Promise<T> {
  const res = await request.get(`${API_URL}${path}`, { headers: s.headers });
  expect(res.ok(), `GET ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

/** La paciente responde "No" a todo por el enlace público (sin sesión, la clínica sale del host). */
async function submitAnamnesis(request: APIRequestContext, url: string): Promise<void> {
  const linkToken = url.split('/').pop() as string;
  const headers = { 'X-Tenant-Host': new URL(origin).host };
  const res = await request.get(`${API_URL}/public/medical-history/${linkToken}`, { headers });
  expect(res.ok(), `GET del enlace público falló: ${await res.text()}`).toBeTruthy();
  const { questionnaire, consent } = (await res.json()) as {
    questionnaire: QuestionnaireShape;
    consent: { required: boolean; policy: { id: string } | null };
  };
  expect(consent.required, 'la política publicada exige la autorización').toBe(true);
  const state = initialFormState();
  state.answers = Object.fromEntries(questionKeys(questionnaire).map((key) => [key, 'NO' as const]));
  state.declaration = true;
  const post = await request.post(`${API_URL}/public/medical-history/${linkToken}`, {
    headers,
    data: toSubmitBody(state, questionnaire, consent.policy!.id),
  });
  expect(post.ok(), `POST del enlace público falló: ${await post.text()}`).toBeTruthy();
}

test.beforeAll(async ({ playwright }) => {
  test.setTimeout(240_000);
  const request = await playwright.request.newContext();
  try {
    session = await registerClinicViaApi(request, {
      subdomain,
      clinicName: `Clínica Sellos ${suffix}`,
      fullName: 'Ana Titular',
      email: adminEmail,
      password,
      location: MAIN,
    });
    origin = session.origin;
    ids.us = await createLocationViaApi(request, session, SEDES.us);
    ids.de = await createLocationViaApi(request, session, SEDES.de);
    await apiPost(request, session, '/privacy-policies', POLICY);

    // Una solicitud de anamnesis enviada en cada sede (una paciente por sede).
    for (const key of KEYS) {
      const patient = await apiPost<{ id: string }>(request, at(key), '/patients', {
        firstName: `Paciente${key.toUpperCase()}`,
        lastName,
        docType: 'PASSPORT',
        docNumber: `ST${key}${suffix}`.slice(0, 20),
        sex: 'F',
      });
      const created = await apiPost<{ url: string }>(request, at(key), `/patients/${patient.id}/medical-history/requests`, {});
      await submitAnamnesis(request, created.url);
    }

    // Una receta emitida en cada sede para la misma paciente.
    const patient = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Receta',
      lastName,
      docType: 'PASSPORT',
      docNumber: `STRX${suffix}`.slice(0, 20),
      sex: 'F',
    });
    rxPatientId = patient.id;
    for (const key of KEYS) {
      await apiPost(request, at(key), `/patients/${patient.id}/prescriptions`, {
        professionalLicense: 'TP-12345',
        items: [
          {
            activeIngredient: MEDICATION[key],
            concentration: '500 mg',
            pharmaceuticalForm: 'Comprimido',
            route: 'Oral',
            dose: '1 comprimido',
            frequency: 'Cada 8 horas',
            durationDays: 3,
            totalQuantity: 9,
            quantityUnit: 'comprimidos',
          },
        ],
      });
    }
  } finally {
    await request.dispose();
  }
});

test('«Todas las sedes»: la bandeja de anamnesis dice la hora de la sede de cada solicitud', async ({ page, request }) => {
  await loginAs(page, origin, adminEmail, password);
  // Sin sede activa: la pantalla es la principal (Caracas) y las filas traen la suya.
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  const rows = await apiGet<Submission[]>(request, session, '/medical-history/submissions?status=SUBMITTED');
  expect(rows).toHaveLength(2);

  await page.goto(`${origin}/anamnesis-por-revisar`);
  await expect(page.getByRole('heading', { level: 1, name: 'Anamnesis por revisar' })).toBeVisible({ timeout: 15_000 });
  for (const key of KEYS) {
    const sede = SEDES[key];
    const row = rows.find((r) => r.location.id === ids[key]);
    expect(row, `solicitud de la sede ${key}`).toBeTruthy();
    const line = page.getByRole('row').filter({ hasText: `Paciente${key.toUpperCase()}` });
    await expectContains(line, dateTime(sede, row!.submittedAt));
    const otherKey: Key = key === 'us' ? 'de' : 'us';
    expect(norm((await line.textContent()) ?? '')).not.toContain(norm(dateTime(SEDES[otherKey], row!.submittedAt)));
    await expectContains(line, sede.name);
  }
  // La hora de una sede no es la de la otra ni la del navegador (Tokio).
  const us = rows.find((r) => r.location.id === ids.us)!;
  const tokyo = regionalFormat({ locale: 'es', hourCycle: 'h23' }).dateTime(new Date(us.submittedAt), 'Asia/Tokyo');
  expect(norm((await page.getByRole('row').filter({ hasText: 'PacienteUS' }).textContent()) ?? '')).not.toContain(norm(tokyo));
  await expect(page.getByText(/No se pudo saber el formato regional/)).toHaveCount(0);
  await shoot(page, 'bandeja-anamnesis');
});

test('«Todas las sedes»: la pestaña de recetas dice la hora de la sede de cada receta', async ({ page, request }) => {
  await loginAs(page, origin, adminEmail, password);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  const list = await apiGet<Rx[]>(request, session, `/patients/${rxPatientId}/prescriptions`);
  expect(list).toHaveLength(2);

  await page.goto(`${origin}/patients/${rxPatientId}?tab=prescriptions`);
  const table = page.getByRole('table', { name: 'Recetas del paciente' });
  await expect(table).toBeVisible({ timeout: 15_000 });
  for (const key of KEYS) {
    const sede = SEDES[key];
    const rx = list.find((r) => r.locationId === ids[key]);
    expect(rx, `receta de la sede ${key}`).toBeTruthy();
    const line = table.getByRole('row').filter({ hasText: MEDICATION[key] });
    await expectContains(line, dateTime(sede, rx!.issuedAt));
    const otherKey: Key = key === 'us' ? 'de' : 'us';
    expect(norm((await line.textContent()) ?? '')).not.toContain(norm(dateTime(SEDES[otherKey], rx!.issuedAt)));
  }
  await expect(page.getByText(/No se pudo saber el formato regional/)).toHaveCount(0);
  await shoot(page, 'recetas');
});

/**
 * DX-354b (T24, E9): la semana del cuadrante es la del «hoy» de la SEDE, no la
 * del navegador. El reloj del navegador (Tokio, 13 h por delante de Caracas) se
 * fija a las 22:30 de ayer en la sede, que en Tokio ya es otro día: el día
 * resaltado como «hoy» tiene que ser el de la sede.
 */
test('Cuadrante: el día de hoy es el de la sede aunque el navegador (Tokio) ya esté en el día siguiente', async ({ page }) => {
  const day = sedeDayFromToday(-1);
  await page.clock.setFixedTime(atSede(day, '22:30'));
  await loginAs(page, origin, adminEmail, password);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await page.goto(`${origin}/settings/horarios?tab=cuadrante`);
  const label = (iso: string) => civilDateLabel(iso, { weekday: 'long', day: 'numeric', month: 'long' });
  const sedeDay = page.getByRole('group', { name: label(day) }).first();
  await expect(sedeDay).toBeVisible({ timeout: 15_000 });
  await expect(sedeDay).toHaveClass(/bg-primary-subtle/);
  // El día siguiente (el de Tokio) se ve en la semana o no, pero nunca está resaltado como hoy.
  const next = new Date(`${day}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const nextCell = page.getByRole('group', { name: label(next.toISOString().slice(0, 10)) }).first();
  if (await nextCell.count()) await expect(nextCell).not.toHaveClass(/bg-primary-subtle/);
});

/**
 * DX-354b (criterio 9): `axe` limpio en las pantallas con «—» y el aviso de la
 * sede. `GET /locations` se intercepta y devuelve las sedes SIN `hourCycle`
 * (la zona sigue válida): las fechas salen «—» («Sin dato» para un lector de
 * pantalla) y cada pantalla muestra UN aviso con «Reintentar». La región
 * `role="status"` existe antes y después de que el aviso se rellene.
 */
const NOTE = /No se pudo saber el formato regional o el reloj de la sede/;
async function withoutHourCycle(page: Page): Promise<void> {
  await page.route('**/locations', async (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    const sedes = (await response.json()) as Record<string, unknown>[];
    await route.fulfill({ response, json: sedes.map((sede) => ({ ...sede, hourCycle: null })) });
  });
}
async function expectNoViolations(page: Page, scope: Locator, name: string): Promise<void> {
  const violations = await axeInBothThemes(page, scope);
  expect.soft(violations.light, `${name} claro`).toEqual([]);
  expect.soft(violations.dark, `${name} oscuro`).toEqual([]);
}

test('a11y: la bandeja de anamnesis con «Sin dato» y el aviso, axe limpio en claro y oscuro', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await page.goto(`${origin}/anamnesis-por-revisar`);
  await expect(page.getByRole('heading', { level: 1, name: 'Anamnesis por revisar' })).toBeVisible({ timeout: 15_000 });
  // Con formato: la región de estado ya existe y está vacía (no hay aviso).
  await expect(page.getByRole('row').filter({ hasText: 'PacienteUS' })).toBeVisible();
  await expect(page.getByText(NOTE)).toHaveCount(0);
  expect(await page.getByRole('status').count()).toBeGreaterThan(0);

  await withoutHourCycle(page);
  await page.reload();
  await expect(page.getByRole('row').filter({ hasText: 'PacienteUS' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(NOTE)).toHaveCount(1);
  await expect(page.getByText('Sin dato').first()).toBeAttached();
  await expectNoViolations(page, page.getByRole('main'), 'bandeja de anamnesis');

  // Reintentar con el formato bueno: el aviso se va y la región de estado sigue ahí.
  await page.unroute('**/locations');
  await page.getByRole('button', { name: 'Reintentar' }).click();
  await expect(page.getByText(NOTE)).toHaveCount(0);
  expect(await page.getByRole('status').count()).toBeGreaterThan(0);
});

test('a11y: la caja con el aviso de la sede, axe limpio en claro y oscuro', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await withoutHourCycle(page);
  await page.goto(`${origin}/caja`);
  await expect(page.getByRole('heading', { level: 1, name: 'Caja' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(NOTE)).toHaveCount(1);
  await expectNoViolations(page, page.getByRole('main'), 'caja');
});

test('a11y: el panel «Hoy» con el aviso de la sede, axe limpio en claro y oscuro', async ({ page }) => {
  await loginAs(page, origin, adminEmail, password);
  await page.evaluate(() => window.localStorage.removeItem('dentalix.activeLocationId'));
  await withoutHourCycle(page);
  await page.goto(`${origin}/dashboard`);
  const today = page.getByRole('region', { name: 'Hoy' });
  await expect(today).toBeVisible({ timeout: 15_000 });
  await expect(today.getByText(NOTE)).toHaveCount(1);
  await expectNoViolations(page, today, 'panel Hoy');
});
