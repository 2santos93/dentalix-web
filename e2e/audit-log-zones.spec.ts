import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { apiPost, createLocationViaApi, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll, expectNoHorizontalScrollIn } from './support/layout';
import type { RegionalSettings } from './support/regional';
import { API_URL, tenantOrigin } from './support/urls';
import { regionalFormat } from '../src/lib/format/regional-format';
import { utcOffsetLabel } from '../src/lib/format/zone';
import { addCivilDays, wallDay } from '../src/lib/time/wall-clock';

/**
 * e2e DX-362: el registro de auditoría de una clínica con sedes en tres zonas
 * (Bogotá UTC−5, Berlín UTC+1/+2 y Nueva York UTC−4/−5), con el navegador en
 * una cuarta (Tokio), a 1440 y 390 px:
 *  1. Junto a los filtros se dice la zona con la que se leen las horas y los
 *     días (la de la sede de la pantalla) y el orden.
 *  2. Cada hora va en esa zona con su desfase; la lista se lee cronológica.
 *     Un evento de Berlín o de Nueva York añade la hora de su sede, con su
 *     formato y su desfase; el de Bogotá y el inicio de sesión, no.
 *  3. El filtro por día cuenta el día en esa zona: el día de los eventos los
 *     muestra y el siguiente sale vacío.
 *  4. Con Berlín como sede activa, todo pasa a Berlín y el evento de Bogotá
 *     añade la hora de Bogotá.
 * Capturas a 390 y 1440 px en E2E_QA_DIR si está definido.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `zonas-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.zonas.${suffix}@example.com`;
const QA_DIR = process.env.E2E_QA_DIR;

type Sede = { name: string } & RegionalSettings;
const BOGOTA: Sede = {
  name: 'Bogotá',
  country: 'CO',
  currency: 'COP',
  timeZone: 'America/Bogota',
  locale: 'es-CO',
  hourCycle: 'h12',
};
const BERLIN: Sede = {
  name: 'Berlín',
  country: 'DE',
  currency: 'EUR',
  timeZone: 'Europe/Berlin',
  locale: 'es-ES',
  hourCycle: 'h23',
};
const NEW_YORK: Sede = {
  name: 'Nueva York',
  country: 'US',
  currency: 'USD',
  timeZone: 'America/New_York',
  locale: 'en-US',
  hourCycle: 'h12',
};
const fmtOf = (sede: Sede) => regionalFormat({ locale: sede.locale, hourCycle: sede.hourCycle });
const when = (iso: string, sede: Sede) => fmtOf(sede).dateTime(new Date(iso), sede.timeZone);
const offset = (iso: string, sede: Sede) => utcOffsetLabel(new Date(iso), sede.timeZone);

const VIEWPORTS = [
  { name: '1440', width: 1440, height: 900 },
  { name: '390', width: 390, height: 844 },
] as const;

// El navegador en una zona que no es la de ninguna sede.
test.use({ timezoneId: 'Asia/Tokyo' });
test.describe.configure({ mode: 'serial' });

let session: ApiSession;
const ids: Record<string, string> = {};
/** Instante de la consulta de la historia clínica hecha desde cada sede. */
const viewedAt: Record<string, string> = {};

interface ApiAuditEvent {
  occurredAt: string;
  action: string;
  resourceType: string;
  locationId: string | null;
}

async function auditEvents(request: APIRequestContext): Promise<ApiAuditEvent[]> {
  const res = await request.get(`${API_URL}/audit-events?resourceType=MEDICAL_HISTORY&action=VIEW`, {
    headers: session.headers,
  });
  expect(res.ok(), await res.text()).toBeTruthy();
  return ((await res.json()) as { items: ApiAuditEvent[] }).items;
}

async function shoot(page: Page, name: string, width: number): Promise<void> {
  if (!QA_DIR) return;
  mkdirSync(QA_DIR, { recursive: true });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: `${QA_DIR}/${name}-${width}.png`, fullPage: true });
}

test.beforeAll(async ({ request }) => {
  test.setTimeout(120_000);
  const { name: _bogota, ...firstRegion } = BOGOTA;
  void _bogota;
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Zonas ${suffix}`,
    fullName: 'Ada Auditora',
    email: adminEmail,
    password,
    location: firstRegion,
  });
  const locations = (await (await request.get(`${API_URL}/locations`, { headers: session.headers })).json()) as {
    id: string;
  }[];
  ids[BOGOTA.name] = locations[0]!.id;
  // La primera sede se llama como la clínica: se le pone el nombre de su ciudad.
  const rename = await request.patch(`${API_URL}/locations/${ids[BOGOTA.name]}`, {
    headers: session.headers,
    data: { name: BOGOTA.name },
  });
  expect(rename.ok(), await rename.text()).toBeTruthy();
  ids[BERLIN.name] = await createLocationViaApi(request, session, BERLIN);
  ids[NEW_YORK.name] = await createLocationViaApi(request, session, NEW_YORK);

  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Zoe',
    lastName: `Zonas${suffix}`,
    docType: 'PASSPORT',
    docNumber: `Z${suffix}`.slice(0, 20),
    sex: 'F',
  });
  // Una consulta de la historia clínica desde cada sede: un evento de cada zona.
  for (const sede of [BOGOTA, BERLIN, NEW_YORK]) {
    const res = await request.get(`${API_URL}/patients/${patient.id}/medical-history`, {
      headers: { ...session.headers, 'X-Location-Id': ids[sede.name]! },
    });
    expect(res.ok(), await res.text()).toBeTruthy();
  }
  for (const event of await auditEvents(request)) {
    const sede = [BOGOTA, BERLIN, NEW_YORK].find((s) => ids[s.name] === event.locationId);
    if (sede) viewedAt[sede.name] = event.occurredAt;
  }
  expect(Object.keys(viewedAt).sort()).toEqual([BERLIN.name, BOGOTA.name, NEW_YORK.name].sort());
});

test('cada hora dice su zona, la lista se lee cronológica y el filtro por día usa la misma zona', async ({ page }) => {
  test.setTimeout(150_000);
  await loginAs(page, origin, adminEmail, password);
  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${origin}/settings/auditoria`);
    const table = page.getByRole('table', { name: 'Registro de auditoría' });
    await expect(table).toBeVisible({ timeout: 15_000 });

    // 1. La zona de la pantalla (en «Todas las sedes», la principal), junto a los filtros.
    const now = new Date().toISOString();
    await expect(
      page.getByText(
        `Horas y días en la hora de Bogotá (America/Bogota, ${offset(now, BOGOTA)}). Lo más reciente, arriba.`,
        { exact: true },
      ),
    ).toBeVisible();

    // 2. Cronológica: los instantes de las filas, de más reciente a más antiguo.
    const instants = await table.locator('tbody time').evaluateAll((els) => els.map((el) => el.getAttribute('datetime')!));
    expect(instants.length).toBeGreaterThanOrEqual(4);
    expect([...instants].sort().reverse()).toEqual(instants);

    // Solo las consultas de la historia clínica: una por sede.
    await page.getByLabel('Recurso').selectOption({ label: 'Historia clínica' });
    await expect(table.locator('tbody tr')).toHaveCount(3, { timeout: 10_000 });
    for (const sede of [BOGOTA, BERLIN, NEW_YORK]) {
      const iso = viewedAt[sede.name]!;
      const row = table.locator('tbody tr').filter({ has: page.locator(`time[datetime="${iso}"]`) });
      await expect(row.locator('time')).toHaveText(when(iso, BOGOTA));
      await expect(row).toContainText(offset(iso, BOGOTA));
      if (sede === BOGOTA) {
        await expect(row.getByText(/^En /)).toHaveCount(0);
      } else {
        await expect(row.getByText(`En ${sede.name}: ${when(iso, sede)} ${offset(iso, sede)}`, { exact: true })).toBeVisible();
      }
    }
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page);
    await shoot(page, 'auditoria-zonas-bogota', viewport.width);

    // 3. El día de los eventos, contado en Bogotá, los muestra; el siguiente, vacío.
    const day = wallDay(viewedAt[BOGOTA.name]!, BOGOTA.timeZone);
    await page.getByLabel('Desde').fill(day);
    await page.getByLabel('Hasta').fill(day);
    await expect(table.locator('tbody tr')).toHaveCount(3, { timeout: 10_000 });
    const next = addCivilDays(day, 1);
    await page.getByLabel('Hasta').fill(next);
    await page.getByLabel('Desde').fill(next);
    await expect(page.getByText('No hay eventos con estos filtros.')).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalScroll(page);
    await page.getByRole('button', { name: 'Limpiar filtros' }).click();
    await expect(table).toBeVisible();

    // 4. Berlín como sede activa: horas y días en Berlín; el evento de Bogotá añade la suya.
    await page.getByLabel('Sede', { exact: true }).locator('visible=true').first().selectOption({ label: BERLIN.name });
    await expect(
      page.getByText(`Horas y días en la hora de Berlín (Europe/Berlin, ${offset(now, BERLIN)}). Lo más reciente, arriba.`, {
        exact: true,
      }),
    ).toBeVisible({ timeout: 10_000 });
    await page.getByLabel('Recurso').selectOption({ label: 'Historia clínica' });
    await expect(table.locator('tbody tr')).toHaveCount(3, { timeout: 10_000 });
    const bogotaIso = viewedAt[BOGOTA.name]!;
    const bogotaRow = table.locator('tbody tr').filter({ has: page.locator(`time[datetime="${bogotaIso}"]`) });
    await expect(bogotaRow.locator('time')).toHaveText(when(bogotaIso, BERLIN));
    await expect(
      bogotaRow.getByText(`En Bogotá: ${when(bogotaIso, BOGOTA)} ${offset(bogotaIso, BOGOTA)}`, { exact: true }),
    ).toBeVisible();
    const berlinRow = table.locator('tbody tr').filter({ has: page.locator(`time[datetime="${viewedAt[BERLIN.name]}"]`) });
    await expect(berlinRow.getByText(/^En /)).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectNoHorizontalScrollIn(page);
    await shoot(page, 'auditoria-zonas-berlin', viewport.width);

    // De vuelta a «Todas las sedes» para la siguiente anchura.
    await page.getByLabel('Sede', { exact: true }).locator('visible=true').first().selectOption({ label: 'Todas las sedes' });
  }
});
