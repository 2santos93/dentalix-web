import { test, expect } from './support/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeViolations } from './support/axe';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-339: «Agenda de contingencia» desde la agenda.
 *
 * Una clínica nueva por corrida (sede en la sede, sin horario restringido) con
 * un odontólogo, recepción y dos pacientes con cita MAÑANA en la sede: la de
 * Sara se queda agendada y la de Tomás se cancela por la API.
 *
 * 1. RECEPTION a 390 px: Agenda → «Agenda de contingencia» → descarga el PDF.
 *    El PDF trae la cita de Sara (con su teléfono y su profesional) y no la
 *    cancelada; el diálogo dice que se descargó, la página no se desplaza de
 *    lado y axe no encuentra violaciones serias.
 * 2. DENTIST a 1440 px: no ve el botón.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `contingencia-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.cont.${suffix}@example.com` };
const dentist = { fullName: 'Luis Contingencia', email: `luis.cont.${suffix}@example.com` };
const reception = { fullName: 'Rita Recepción', email: `rita.cont.${suffix}@example.com` };
const kept = { firstName: 'Sara', lastName: `Viene${suffix.slice(0, 8)}`, phone: '+57 300 1234567' };
const cancelled = { firstName: 'Tomás', lastName: `Cancela${suffix.slice(0, 8)}`, phone: '+57 300 7654321' };
const TOMORROW = sedeDayFromToday(1);
/** Captura de QA a 390 px a DX339_QA_DIR, o a test-results. */
const QA_DIR = process.env.DX339_QA_DIR ?? 'test-results';

let session: ApiSession;

/**
 * Lo que pinta el PDF: pdfkit comprime cada flujo con Flate y escribe el texto
 * de las fuentes estándar en hex de WinAnsi dentro de operadores `TJ`.
 */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString('latin1');
  const lines: string[] = [];
  for (const match of raw.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)) {
    let content: string;
    try {
      content = inflateSync(Buffer.from(match[1], 'latin1')).toString('latin1');
    } catch {
      continue; // un flujo que no es Flate (no lleva texto)
    }
    for (const op of content.matchAll(/\[([^\]]*)\] TJ/g)) {
      lines.push(
        [...op[1].matchAll(/<([0-9a-f]*)>/g)]
          .map((hex) => Buffer.from(hex[1], 'hex').toString('latin1').replace(/\x96/g, '–'))
          .join(''),
      );
    }
  }
  return lines.join('\n');
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Contingencia ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...dentist, role: 'DENTIST', password });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  // La sede no restringe horario: la cita de mañana vale caiga en el día que caiga.
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok(), await schedule.text()).toBeTruthy();
  const staff = await request.get(`${API_URL}/staff`, { headers: session.headers });
  const members = (await staff.json()) as { userId: string; fullName: string }[];
  const providerId = members.find((m) => m.fullName === dentist.fullName)!.userId;

  const book = async (person: typeof kept, hhmm: string, end: string) => {
    const patient = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: person.firstName,
      lastName: person.lastName,
      phone: person.phone,
      docType: 'NATIONAL_ID',
      docNumber: `${person.firstName}${suffix}`.slice(0, 20),
      sex: 'F',
    });
    return apiPost<{ id: string }>(request, session, '/appointments', {
      patientId: patient.id,
      providerId,
      start: atSede(TOMORROW, hhmm).toISOString(),
      end: atSede(TOMORROW, end).toISOString(),
    });
  };
  await book(kept, '10:00', '10:30');
  const toCancel = await book(cancelled, '11:00', '11:30');
  const cancel = await request.patch(`${API_URL}/appointments/${toCancel.id}`, {
    headers: session.headers,
    data: { status: 'CANCELLED', cancelledByKind: 'CLINIC', cancelReasonCode: 'CLINIC_RESCHEDULE' },
  });
  expect(cancel.ok(), await cancel.text()).toBeTruthy();
});

test('RECEPTION a 390 px: descarga la agenda de contingencia; sale la cita agendada y no la cancelada', async ({
  page,
}) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/agenda`);

  await page.getByRole('button', { name: 'Agenda de contingencia' }).click();
  const dialog = page.getByRole('dialog', { name: 'Agenda de contingencia' });
  await expect(dialog).toBeVisible();
  // La clínica tiene una sola sede: la nombra sin selector. Aún no hay copia nocturna.
  await expect(dialog.getByText('Aún no hay copia nocturna de esta sede', { exact: false })).toBeVisible();
  await expectNoHorizontalScroll(page);

  const downloadPromise = page.waitForEvent('download');
  await dialog.getByRole('button', { name: 'Descargar PDF de hoy y mañana' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^agenda-contingencia-.+-\d{4}-\d{2}-\d{2}\.pdf$/);
  await expect(dialog.getByRole('status').filter({ hasText: 'Descargada:' })).toBeVisible();
  await page.screenshot({ path: `${QA_DIR}/dx339-recepcion-390.png`, fullPage: true });

  const pdf = await readFile((await download.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  const text = pdfText(pdf);
  expect(text).toContain(`${kept.firstName} ${kept.lastName}`);
  expect(text).toContain('+57 300 1234567');
  expect(text).toContain(dentist.fullName);
  expect(text).toContain('10:00 – 10:30');
  expect(text).not.toContain(cancelled.lastName);

  const violations = (await axeViolations(page, dialog)).filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('DENTIST a 1440 px: no ve «Agenda de contingencia»', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, dentist.email, password);
  await page.goto(`${origin}/agenda`);
  await expect(page.getByRole('button', { name: 'Nueva cita' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Agenda de contingencia' })).toHaveCount(0);
});
