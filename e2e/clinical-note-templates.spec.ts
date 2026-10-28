import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { disableBusinessHours } from './support/business-hours';
import { LATE_BROWSER_TIME, atSede, lastSlotToday, sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL } from './support/urls';

/**
 * e2e (DX-170): plantillas de evolución con preguntas, ligadas a la cita.
 *
 * El dueño de la clínica (ADMIN, también odontólogo) en escritorio (1440) y
 * móvil (390):
 *   1. Ajustes → Plantillas de evolución: estado vacío «Aún no hay
 *      plantillas»; crea «Resina» con una pregunta ONE (superficie), una
 *      MULTI (material) y una TEXT (observaciones).
 *   2. Agenda → detalle de una cita de HOY → «Registrar evolución»: elige
 *      «Resina», contesta y guarda; la evolución queda ligada a la cita. (La
 *      API no deja agendar en el pasado ni ligar una evolución a una cita de un
 *      día futuro: la cita va HOY a las 23:55–23:59 de la sede, con el reloj
 *      del navegador fijo a las 23:30 de Bogotá; DX-252, TST-030: sin
 *      `test.skip` cerca de medianoche, ver `lastSlotToday`.)
 *   3. Ficha → Historia clínica: la evolución lleva el texto con las
 *      respuestas y «Cita del dd/mm · <profesional>»; desde «Nueva evolución»
 *      usa la plantilla con una pregunta omitida («[sin respuesta]»).
 *   4. «Cargar plantillas de ejemplo» añade las de ejemplo.
 * Sin scroll horizontal a 390 con el formulario de preguntas abierto.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const ownerName = 'Dra. Paula Plantillas';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

const RESIN_BODY = 'Resina en superficie {{Superficie}} con {{Material}}. Observaciones: {{Observaciones}}.';

async function api(page: Page, origin: string) {
  const headers = {
    Authorization: `Bearer ${await accessTokenOf(page)}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  return async function call<T>(method: 'post' | 'patch' | 'get', path: string, data?: object) {
    const res = await page.request[method](`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  };
}

for (const viewport of VIEWPORTS) {
  test(`plantilla «Resina» desde Ajustes, la cita y la ficha (${viewport.name})`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.clock.install({ time: atSede(sedeDayFromToday(0), LATE_BROWSER_TIME) });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-notes-${tag}`,
      clinicName: `Clinica Plantillas ${tag}`,
      fullName: ownerName,
      email: `test.user.notes.${tag}@example.com`,
      password,
    });
    await disableBusinessHours(page, origin);
    const call = await api(page, origin);

    // --- 1. Ajustes → Plantillas de evolución ---------------------------------
    await page.goto(`${origin}/settings/plantillas-de-evolucion`);
    await expect(page.getByRole('heading', { name: 'Plantillas de evolución' })).toBeVisible();
    await expect(page.getByText('Aún no hay plantillas')).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: 'Cargar ejemplos' })).toBeVisible();

    await page.getByRole('button', { name: 'Nueva plantilla' }).click();
    const form = page.getByRole('dialog', { name: 'Nueva plantilla de evolución' });
    await form.getByLabel('Nombre').fill('Resina');
    await form.getByLabel('Carpeta', { exact: true }).fill('Operatoria');
    await form.getByLabel('Texto de la plantilla').fill(RESIN_BODY);
    const addPrompt = form.getByRole('button', { name: 'Añadir pregunta' });
    await addPrompt.click();
    const p1 = form.getByRole('listitem', { name: 'Pregunta 1' });
    await p1.getByLabel('Etiqueta').fill('Superficie');
    await p1.getByLabel('Opciones').fill('O\nM\nD\nV\nL');
    await addPrompt.click();
    const p2 = form.getByRole('listitem', { name: 'Pregunta 2' });
    await p2.getByLabel('Etiqueta').fill('Material');
    await p2.getByLabel('Tipo').selectOption('MULTI');
    await p2.getByLabel('Opciones').fill('Resina A2\nIonómero\nAdhesivo universal');
    await p2.getByLabel('Valor por defecto').selectOption('Resina A2');
    await addPrompt.click();
    const p3 = form.getByRole('listitem', { name: 'Pregunta 3' });
    await p3.getByLabel('Etiqueta').fill('Observaciones');
    await p3.getByLabel('Tipo').selectOption('TEXT');
    await expectNoHorizontalScroll(page);
    await form.getByRole('button', { name: 'Crear plantilla' }).click();
    await expect(form).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText('1 plantilla')).toBeVisible();

    // --- 2. Agenda → cita atendida → «Registrar evolución» ---------------------
    const patient = await call<{ id: string }>('post', '/patients', {
      firstName: 'Lucía',
      lastName: `Plantillas${tag}`,
      docType: 'CC',
      docNumber: `NT${tag}`.slice(0, 20),
      sex: 'F',
    });
    const me = await call<{ id: string }>('get', '/me');
    const slot = lastSlotToday();
    await call<{ id: string }>('post', '/appointments', {
      patientId: patient.id,
      providerId: me.id,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
    });

    // Día · Lista: la franja de 4 min se ve igual de bien en escritorio y en móvil.
    await page.goto(`${origin}/agenda`);
    await page.getByRole('button', { name: /^Día$/ }).click();
    await page.getByRole('button', { name: 'Lista', exact: true }).click();
    await page.getByLabel('Fecha', { exact: true }).fill(slot.day);
    await page
      .getByRole('button', { name: new RegExp(`Detalle de la cita de ${slot.label}`) })
      .locator('visible=true')
      .first()
      .click();
    await page.getByRole('button', { name: 'Registrar evolución' }).click();

    const evolution = page.getByRole('dialog', { name: 'Registrar evolución' });
    await expect(evolution.getByText(new RegExp(`^Cita del \\d{2}/\\d{2} · ${ownerName}$`))).toBeVisible();
    await evolution.getByRole('radio', { name: /Resina/ }).click();
    await evolution.getByRole('radio', { name: 'O', exact: true }).check();
    await evolution.getByRole('checkbox', { name: 'Adhesivo universal' }).check();
    await evolution.getByRole('textbox', { name: 'Observaciones' }).fill('Sin sensibilidad');
    const expected =
      'Resina en superficie O con Resina A2 y Adhesivo universal. Observaciones: Sin sensibilidad.';
    await expect(evolution.getByLabel('Texto de la evolución')).toHaveValue(expected);
    await expectNoHorizontalScroll(page);
    await evolution.getByRole('button', { name: 'Guardar evolución' }).click();
    await expect(evolution).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(/Evolución registrada en la ficha de Lucía/)).toBeVisible();

    // --- 3. Ficha → Historia clínica ------------------------------------------
    await page.goto(`${origin}/patients/${patient.id}?tab=clinical-history`);
    await expect(page.getByText(expected).locator('visible=true')).toBeVisible({ timeout: 15_000 });
    await expect(
      page.getByText(new RegExp(`^Cita del \\d{2}/\\d{2} · ${ownerName}$`)).locator('visible=true'),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Nueva evolución' }).click();
    const fromRecord = page.getByRole('dialog', { name: 'Nueva evolución' });
    await fromRecord.getByRole('searchbox', { name: 'Buscar plantilla' }).fill('operat');
    await fromRecord.getByRole('radio', { name: /Resina/ }).click();
    await fromRecord.getByRole('radio', { name: 'M', exact: true }).check();
    await fromRecord.getByRole('button', { name: 'Omitir «Observaciones»' }).click();
    const withSkip = 'Resina en superficie M con Resina A2. Observaciones: [sin respuesta].';
    await expect(fromRecord.getByLabel('Texto de la evolución')).toHaveValue(withSkip);
    await expectNoHorizontalScroll(page);
    await fromRecord.getByRole('button', { name: 'Guardar evolución' }).click();
    await expect(fromRecord).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(withSkip).locator('visible=true')).toBeVisible();

    // --- 4. Cargar plantillas de ejemplo --------------------------------------
    await page.goto(`${origin}/settings/plantillas-de-evolucion`);
    await page.getByRole('button', { name: 'Cargar plantillas de ejemplo' }).click();
    // «Resina» ya existía: se cargan las otras 5 de ejemplo.
    await expect(page.getByText('6 plantillas')).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalScroll(page);
  });
}
