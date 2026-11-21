import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { mailFor, mailMark } from './support/mail';
import { shot } from './support/qa-shot';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-053 contra la API real (con su worker): Ajustes › Exportar datos.
 * Vacío con axe limpio a 1440 y 390 px en claro y oscuro; «Exportar todo»
 * pide confirmación, queda en cola y la pantalla pasa sola a «Lista»; el
 * email llega a los DOS administradores sin enlace al fichero; «Descargar»
 * baja un ZIP con un CSV por entidad (BOM, la paciente de ESTA clínica y nada
 * de la otra); la descarga es de un solo uso; y la odontóloga no ve la
 * pantalla.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `exportar-${suffix}`.slice(0, 40);
const otherSubdomain = `exportar-otra-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.exp.${suffix}@example.com` };
const admin2 = { fullName: 'Carlos Mendoza', email: `carlos.exp.${suffix}@example.com` };
const dentist = { fullName: 'Luis Pérez', email: `luis.exp.${suffix}@example.com` };
const PATIENT_LAST_NAME = `Rodríguez${suffix}`.slice(0, 40);
const OTHER_PATIENT_LAST_NAME = `Ajena${suffix}`.slice(0, 40);

let session: ApiSession;
let otherSession: ApiSession;
let mark = 0;

test.describe.configure({ mode: 'serial' });

/** Nombre → contenido de un ZIP (deflate o stored). */
function unzip(zip: Buffer): Map<string, string> {
  const eocd = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(eocd + 10);
  let p = zip.readUInt32LE(eocd + 16);
  const out = new Map<string, string>();
  for (let i = 0; i < count; i++) {
    const method = zip.readUInt16LE(p + 10);
    const size = zip.readUInt32LE(p + 20);
    const nameLength = zip.readUInt16LE(p + 28);
    const offset = zip.readUInt32LE(p + 42);
    const name = zip.subarray(p + 46, p + 46 + nameLength).toString('utf8');
    const start = offset + 30 + zip.readUInt16LE(offset + 26);
    const data = zip.subarray(start, start + size);
    out.set(name, (method === 8 ? inflateRawSync(data) : data).toString('utf8'));
    p += 46 + nameLength;
  }
  return out;
}

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Ávila ${suffix}`.slice(0, 60),
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...admin2, role: 'ADMIN', password });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await apiPost(request, session, '/patients', {
    firstName: 'Ana',
    lastName: PATIENT_LAST_NAME,
    docType: 'NATIONAL_ID',
    docNumber: `EXP${suffix}`.slice(0, 20),
    sex: 'F',
  });
  otherSession = await registerClinicViaApi(request, {
    subdomain: otherSubdomain,
    clinicName: `Clínica Caroní ${suffix}`.slice(0, 60),
    fullName: 'Beatriz Otra',
    email: `beatriz.exp.${suffix}@example.com`,
    password,
  });
  await apiPost(request, otherSession, '/patients', {
    firstName: 'Beatriz',
    lastName: OTHER_PATIENT_LAST_NAME,
    docType: 'NATIONAL_ID',
    docNumber: `EXPB${suffix}`.slice(0, 20),
    sex: 'F',
  });
});

test('ADMIN: vacío a 1440 y 390 px, claro y oscuro, axe limpio', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/exportar-datos`);
  await expect(page.getByRole('heading', { level: 1, name: 'Exportar datos' })).toBeVisible();
  const main = page.getByRole('main');
  await expect(main.getByText('Todavía no has exportado los datos')).toBeVisible();
  await expect(main.getByText('Contiene datos de salud de tus pacientes')).toBeVisible();
  const wide = await axeInBothThemes(page, main);
  expect(wide.light, 'axe en claro').toEqual([]);
  expect(wide.dark, 'axe en oscuro').toEqual([]);
  await shot(page, 'exportar-vacio', 1440);

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  const narrow = await axeInBothThemes(page, main);
  expect(narrow.light, 'axe en claro a 390').toEqual([]);
  expect(narrow.dark, 'axe en oscuro a 390').toEqual([]);
  await shot(page, 'exportar-vacio', 390);
});

test('«Exportar todo»: confirmación, en cola, sola a «Lista» y email a los dos ADMIN sin enlace al fichero', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/exportar-datos`);
  const main = page.getByRole('main');
  mark = mailMark();
  await main.getByRole('button', { name: 'Exportar todo' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('¿Exportar todos los datos de la clínica?')).toBeVisible();
  const confirm = await axeInBothThemes(page, dialog);
  expect(confirm.light, 'axe del diálogo en claro').toEqual([]);
  expect(confirm.dark, 'axe del diálogo en oscuro').toEqual([]);
  await dialog.getByRole('button', { name: 'Exportar todo' }).click();
  await expect(dialog).toBeHidden();

  const table = main.getByRole('table', { name: 'Exportaciones de la clínica' });
  await expect(table.getByText(/En cola|Generándose|Lista/)).toBeVisible();
  // La pantalla vuelve a preguntar sola cada 5 s hasta que el worker termina.
  await expect(table.getByText('Lista', { exact: true })).toBeVisible({ timeout: 120_000 });
  await expect(table.getByText(`por ${admin.fullName}`)).toBeVisible();
  await expect(main.getByRole('button', { name: 'Exportar todo' })).toBeEnabled();
  const ready = await axeInBothThemes(page, main);
  expect(ready.light, 'axe con la lista en claro').toEqual([]);
  expect(ready.dark, 'axe con la lista en oscuro').toEqual([]);
  await shot(page, 'exportar-lista', 1440);

  for (const to of [admin.email, admin2.email]) {
    const email = await mailFor(to, /Exportar datos/, { since: mark });
    expect(email.text).toContain(`${admin.fullName} pidió`);
    expect(email.text).toContain('/settings/exportar-datos');
    expect(email.text).not.toMatch(/\.zip|clinic-exports\/|signature=/);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalScroll(page);
  await shot(page, 'exportar-lista', 390);
});

test('«Descargar»: ZIP con un CSV por entidad, solo de esta clínica, y un solo uso', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin2.email, password);
  await page.goto(`${origin}/settings/exportar-datos`);
  const table = page.getByRole('main').getByRole('table', { name: 'Exportaciones de la clínica' });
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    table.getByRole('button', { name: /Descargar la exportación/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^exportacion-dentalix-\d{4}-\d{2}-\d{2}\.zip$/);
  const files = unzip(await readFile((await download.path())!));
  for (const name of ['pacientes.csv', 'citas.csv', 'pagos.csv', 'odontograma.csv', 'inventario.csv', 'LEEME.txt']) {
    expect(files.has(name), name).toBe(true);
  }
  const patients = files.get('pacientes.csv')!;
  expect(patients.startsWith('﻿"Id","Código","Nombre","Apellidos"')).toBe(true);
  expect(patients).toContain(PATIENT_LAST_NAME);
  const all = [...files.values()].join('\n');
  expect(all).not.toContain(OTHER_PATIENT_LAST_NAME);

  // Un solo uso: la fila pasa a «Descargada» y sin botón; la API responde 410.
  await expect(table.getByText('Descargada', { exact: true })).toBeVisible();
  await expect(table.getByRole('button', { name: /Descargar la exportación/ })).toHaveCount(0);
  const list = await request.get(`${API_URL}/clinic-exports`, { headers: session.headers });
  const [first] = (await list.json()) as { id: string; state: string }[];
  expect(first.state).toBe('DOWNLOADED');
  const again = await request.post(`${API_URL}/clinic-exports/${first.id}/download`, { headers: session.headers });
  expect(again.status()).toBe(410);
  // La otra clínica ni la ve ni la descarga.
  const otherList = await request.get(`${API_URL}/clinic-exports`, { headers: otherSession.headers });
  expect(await otherList.json()).toEqual([]);
  const foreign = await request.post(`${API_URL}/clinic-exports/${first.id}/download`, {
    headers: otherSession.headers,
  });
  expect(foreign.status()).toBe(404);
});

test('odontóloga: sin la entrada en Ajustes ni el botón si abre la ruta', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/settings`);
  await expect(page.getByRole('main').getByRole('link', { name: /Exportar datos/ })).toHaveCount(0);
  await page.goto(`${origin}/settings/exportar-datos`);
  // O el candado de la pantalla, o la guarda de rutas la saca de ahí.
  await expect
    .poll(async () =>
      (await page.getByText('Solo administración puede exportar los datos de la clínica.').isVisible()) ||
      !page.url().includes('/settings/exportar-datos'),
    )
    .toBe(true);
  await expect(page.getByRole('button', { name: 'Exportar todo' })).toHaveCount(0);
});
