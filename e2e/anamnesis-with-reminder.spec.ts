import { test, expect, type Page } from './support/test';
import { fillDate } from './support/dates';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { atSede, sedeDayFromToday } from './support/clock';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-290: «Enviar la anamnesis con el recordatorio». El ADMIN lo enciende
 * en Ajustes → Recordatorios (la fila lo dice); recepción genera el enlace de
 * confirmación de la cita de un paciente NUEVO y el mensaje de WhatsApp lleva
 * también el del cuestionario de salud (solo el enlace); el detalle de la cita
 * dice «Anamnesis enviada por recepción» y que sigue sin responder. Un
 * paciente con la anamnesis vigente no lo lleva. A 1440 y a 390 px.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `anam-rec-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = {
  fullName: 'Ana Titular',
  email: `ana.anrec.${suffix}@example.com`,
};
const reception = {
  fullName: 'Rita Recepción',
  email: `rita.anrec.${suffix}@example.com`,
};
const newLastName = `Nueva${suffix}`.slice(0, 40);
const currentLastName = `Vigente${suffix}`.slice(0, 40);

const POLICY = {
  policyText: 'Política de tratamiento de datos de la clínica.',
  generalText: 'Autorizo el tratamiento de mis datos personales.',
  sensitiveHealthText:
    'Autorizo el tratamiento de mis datos sensibles de salud (historia clínica). Finalidad: la atención odontológica.',
  marketingText: 'Autorizo recibir comunicaciones comerciales.',
};

let session: ApiSession;
const day = sedeDayFromToday(4);

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Anamnesis Recordatorio ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, {
    ...reception,
    role: 'RECEPTION',
    password,
  });
  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: session.headers,
    data: { ranges: [] },
  });
  expect(schedule.ok()).toBeTruthy();
  await apiPost(request, session, '/privacy-policies', POLICY);

  const staff = (await (await request.get(`${API_URL}/staff`, { headers: session.headers })).json()) as {
    userId: string;
    fullName: string;
  }[];
  const providerId = staff.find((m) => m.fullName === admin.fullName)!.userId;
  for (const [i, lastName] of [newLastName, currentLastName].entries()) {
    const patient = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Mariana',
      lastName,
      docType: 'NATIONAL_ID',
      docNumber: `AR${i}${suffix}`.slice(0, 20),
      sex: 'F',
      email: `mariana.${i}.${suffix}@example.com`,
      phone: '+584145550101',
    });
    if (lastName === currentLastName) {
      // Anamnesis recién registrada: vigente el día de la cita.
      const saved = await request.put(`${API_URL}/patients/${patient.id}/medical-history`, {
        headers: session.headers,
        data: {
          allergies: [
            {
              alergeno: 'Polen',
              tipo: 'AMBIENTAL',
              severidad: 'LEVE',
              esAlerta: false,
            },
          ],
        },
      });
      expect(saved.ok(), await saved.text()).toBeTruthy();
    }
    const hour = i === 0 ? '10:00' : '11:00';
    await apiPost(request, session, '/appointments', {
      patientId: patient.id,
      providerId,
      start: atSede(day, hour).toISOString(),
      end: atSede(day, hour === '10:00' ? '10:30' : '11:30').toISOString(),
    });
  }
});

async function openAppointment(page: Page, lastName: string, slot: string) {
  await page.goto(`${origin}/agenda`);
  await page.getByRole('button', { name: 'Día', exact: true }).click();
  await page.getByRole('button', { name: 'Lista', exact: true }).click();
  await fillDate(page, 'Fecha', day);
  const row = page.locator('table tr', { hasText: `Mariana ${lastName}` });
  await expect(row).toBeVisible({ timeout: 10_000 });
  await row.getByRole('button', { name: new RegExp(`Detalle de la cita de ${slot}`) }).click();
  return page.getByRole('dialog');
}

test('ADMIN enciende «Enviar la anamnesis con el recordatorio» (1440 px)', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/recordatorios`);
  const table = page.getByRole('table', { name: 'Recordatorios por sede' });
  const row = table.getByRole('row', { name: /Sede principal/ });
  await expect(row).toContainText('Desactivados', { timeout: 15_000 });
  await row
    .getByRole('button', {
      name: 'Configurar los recordatorios de Sede principal',
    })
    .click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Enviar recordatorios por email').check();
  const anamnesis = dialog.getByRole('checkbox', {
    name: 'Enviar la anamnesis con el recordatorio',
  });
  await expect(anamnesis).not.toBeChecked();
  await expect(dialog).toContainText('pacientes nuevos o con la anamnesis caducada el día de la cita');
  await anamnesis.check();
  await dialog.getByRole('button', { name: 'Guardar' }).click();
  await expect(dialog).toBeHidden();
  await expect(row).toContainText('con anamnesis');

  await page.reload();
  await expect(
    page.getByRole('table', { name: 'Recordatorios por sede' }).getByRole('row', { name: /Sede principal/ }),
  ).toContainText('con anamnesis', { timeout: 15_000 });
});

test('recepción: el mensaje de WhatsApp de un paciente nuevo lleva el cuestionario y la cita lo dice (1440 px)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  let sheet = await openAppointment(page, newLastName, '10:00–10:30');
  await sheet.getByRole('button', { name: 'Enviar confirmación' }).click();
  await expect(sheet.getByLabel('Enlace de confirmación')).toHaveValue(/\/confirmar\//, { timeout: 10_000 });
  await expect(sheet.getByTestId('confirmation-anamnesis-note')).toContainText('cuestionario de salud');
  const href = (await sheet.getByRole('link', { name: /Abrir WhatsApp/ }).getAttribute('href')) ?? '';
  const message = decodeURIComponent(href.split('?text=')[1] ?? '');
  expect(message).toMatch(
    /Antes de la cita, responde el cuestionario de salud: https?:\/\/[^ ]+\/anamnesis\/[A-Za-z0-9_-]{43}$/,
  );
  // Solo el enlace: nada clínico en el mensaje.
  expect(message).not.toMatch(/alerg|medicament|caducad/i);

  await page.keyboard.press('Escape');
  sheet = await openAppointment(page, newLastName, '10:00–10:30');
  const indicator = sheet.getByTestId('appointment-anamnesis');
  await expect(indicator).toContainText('Anamnesis enviada por recepción', {
    timeout: 10_000,
  });
  await expect(indicator).toContainText('Sin responder todavía');
});

test('con la anamnesis vigente, el mensaje no lleva el cuestionario', async ({ page }) => {
  await loginAs(page, origin, reception.email, password);
  const sheet = await openAppointment(page, currentLastName, '11:00–11:30');
  await sheet.getByRole('button', { name: 'Enviar confirmación' }).click();
  await expect(sheet.getByLabel('Enlace de confirmación')).toHaveValue(/\/confirmar\//, { timeout: 10_000 });
  await expect(sheet.getByTestId('confirmation-anamnesis-note')).toHaveCount(0);
  const href = (await sheet.getByRole('link', { name: /Abrir WhatsApp/ }).getAttribute('href')) ?? '';
  expect(decodeURIComponent(href)).not.toContain('cuestionario');
});

test('móvil (390 px): el ajuste y el indicador de la cita caben sin scroll horizontal', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/settings/recordatorios`);
  const cards = page.getByRole('list', { name: 'Recordatorios por sede' });
  await expect(cards.getByRole('listitem').first()).toContainText('con anamnesis', { timeout: 15_000 });
  await expectNoHorizontalScroll(page);
  await cards
    .getByRole('button', {
      name: 'Configurar los recordatorios de Sede principal',
    })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('checkbox', {
      name: 'Enviar la anamnesis con el recordatorio',
    }),
  ).toBeChecked();
  await expectDialogInsideViewport(page, dialog);
  await expectNoHorizontalScroll(page);
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(dialog).toBeHidden();
});
