import { randomUUID } from 'node:crypto';
import { test, expect, type Page } from './support/test';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { shot } from './support/qa-shot';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-556 · Prospectos.
 *
 * Una clínica nueva por corrida (sede de la API, prefijo +58) con recepción.
 *  1. 1440 px: alta en el diálogo de 4 campos (foco en el nombre, Enter envía,
 *     WhatsApp por defecto): aparece en «Nuevo»; pasa a «Contactado» desde el
 *     «⋯» del tablero; la ficha lo convierte en paciente (nombre y apellido
 *     prellenados) y enlaza a su ficha. Un teléfono que ya es de un paciente
 *     da el aviso con «Abrir paciente».
 *  2. 390 px: la lista (sin scroll horizontal) abre la ficha y «Marcar como
 *     perdido…» exige el motivo del catálogo de pérdida.
 * Con axe en claro y oscuro en cada pantalla; capturas en E2E_QA_DIR.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID())
  .replace(/[^a-z0-9]/gi, '')
  .toLowerCase()
  .slice(0, 10);
const subdomain = `prospectos-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Andreína Titular', email: `andreina.leads.${suffix}@example.com` };
const reception = { fullName: 'Rosa Mostrador', email: `rosa.leads.${suffix}@example.com` };

const FIRST = { name: 'Yusmary Rondón Pérez', phone: '0412 555 31 41' };
const SECOND = { name: 'Luis Hernández', phone: '+58 414 555 27 18' };
const PATIENT_PHONE = '0424 555 66 10';

let session: ApiSession;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Prospectos ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, session, { ...reception, role: 'RECEPTION', password });
  await apiPost(request, session, '/patients', {
    firstName: 'Carmen',
    lastName: `Prospecto${suffix}`.slice(0, 30),
    docType: 'NATIONAL_ID',
    docNumber: `V${suffix}`.slice(0, 20),
    sex: 'F',
    phone: PATIENT_PHONE,
  });
  await apiPost(request, session, '/leads', { fullName: SECOND.name, phone: SECOND.phone, channel: 'INSTAGRAM' });
});

async function expectAxeClean(page: Page, where: string) {
  const violations = await axeInBothThemes(page, page.locator('main'));
  expect(violations.light, `axe en claro: ${where}`).toEqual([]);
  expect(violations.dark, `axe en oscuro: ${where}`).toEqual([]);
}

test('1440: alta rápida, a «Contactado» desde el tablero y convertir en paciente', async ({ page }) => {
  // Alta, tablero, ficha y conversión con axe en dos temas en cada pantalla.
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/dashboard`);
  // La entrada del menú (Atención) lleva a la bandeja.
  await page.locator('aside').getByRole('link', { name: 'Prospectos' }).click();
  await expect(page).toHaveURL(/\/prospectos$/, { timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Prospectos', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('lead-column-NEW').getByText(SECOND.name)).toBeVisible();

  // Alta: foco en el nombre, WhatsApp por defecto, Enter envía.
  await page.getByRole('button', { name: 'Nuevo prospecto' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo prospecto' });
  await expect(dialog.getByLabel('Nombre')).toBeFocused();
  await expect(dialog.getByLabel('Canal')).toHaveValue('WHATSAPP');
  await expect(dialog).toContainText('Nunca síntomas, diagnósticos ni medicación');
  await shot(page, 'leads-create', 1440);

  // Un teléfono que ya es de un paciente: aviso con «Abrir paciente».
  await dialog.getByLabel('Nombre').fill('Carmen otra vez');
  await dialog.getByLabel('Teléfono').fill(PATIENT_PHONE);
  await dialog.getByLabel('Teléfono').press('Enter');
  await expect(dialog.getByText(/ya es paciente de la clínica/)).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Abrir paciente' })).toBeVisible();

  await dialog.getByLabel('Nombre').fill(FIRST.name);
  await dialog.getByLabel('Teléfono').fill(FIRST.phone);
  await dialog.getByLabel('Motivo de interés').selectOption('Ortodoncia');
  await dialog.getByLabel('Teléfono').press('Enter');
  await expect(dialog).toBeHidden();
  const newColumn = page.getByTestId('lead-column-NEW');
  await expect(newColumn.getByRole('link', { name: FIRST.name })).toBeVisible();
  await expect(newColumn).toContainText('WhatsApp · Ortodoncia');
  await shot(page, 'leads-board', 1440);
  await expectAxeClean(page, 'tablero');

  // A «Contactado» desde el «⋯» de la tarjeta.
  await newColumn.getByRole('button', { name: `Acciones de ${FIRST.name}` }).click();
  await page.getByRole('menuitem', { name: 'Marcar como contactado' }).click();
  await expect(page.getByTestId('lead-column-CONTACTED').getByRole('link', { name: FIRST.name })).toBeVisible();
  await expect(newColumn.getByRole('link', { name: FIRST.name })).toHaveCount(0);

  // La ficha: WhatsApp a wa.me y convertir con nombre y apellido partidos.
  await page.getByTestId('lead-column-CONTACTED').getByRole('link', { name: FIRST.name }).click();
  // En `next dev` la primera visita a la ficha compila la ruta.
  await expect(page.getByRole('heading', { name: FIRST.name, level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('link', { name: /Escribir a .* por WhatsApp/ })).toHaveAttribute(
    'href',
    'https://wa.me/584125553141',
  );
  await expect(page.getByRole('button', { name: 'Agendar primera cita' })).toBeVisible();
  await shot(page, 'leads-detail', 1440);
  await expectAxeClean(page, 'ficha');

  await page.getByRole('button', { name: 'Convertir en paciente' }).click();
  const convert = page.getByRole('dialog', { name: 'Convertir en paciente' });
  await expect(convert.getByLabel('Nombre')).toHaveValue('Yusmary');
  await expect(convert.getByLabel('Apellido')).toHaveValue('Rondón Pérez');
  await convert.getByRole('button', { name: 'Convertir en paciente' }).click();
  await expect(convert).toBeHidden();
  const patientLink = page.getByRole('main').getByRole('link', { name: 'Abrir la ficha del paciente' }).first();
  await expect(patientLink).toBeVisible();
  await expect(page.getByText('Ya es paciente')).toBeVisible();
  await patientLink.click();
  await expect(page).toHaveURL(/\/patients\/[0-9a-f-]+/, { timeout: 30_000 });
});

test('390: la lista abre la ficha y «Perdido» exige el motivo', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAs(page, origin, reception.email, password);
  await page.goto(`${origin}/prospectos?vista=lista`);
  await expect(page.getByRole('heading', { name: 'Prospectos', level: 1 })).toBeVisible({ timeout: 30_000 });
  const list = page.getByRole('list', { name: 'Prospectos' });
  await expect(list.getByText(SECOND.name)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await shot(page, 'leads-list', 390);
  await expectAxeClean(page, 'lista a 390');

  await list.getByRole('link', { name: new RegExp(SECOND.name) }).click();
  await expect(page.getByRole('heading', { name: SECOND.name, level: 1 })).toBeVisible({ timeout: 30_000 });
  await expectNoHorizontalScroll(page);
  await shot(page, 'leads-detail', 390);
  await expectAxeClean(page, 'ficha a 390');

  await page.getByRole('button', { name: 'Marcar como perdido…' }).click();
  const lost = page.getByRole('dialog', { name: 'Marcar como perdido' });
  await lost.getByRole('button', { name: 'Marcar como perdido' }).click();
  await expect(lost.getByText('Elige el motivo de la pérdida.')).toBeVisible();
  await lost.getByLabel('Motivo de pérdida').selectOption('Precio');
  await shot(page, 'leads-lost', 390);
  await lost.getByRole('button', { name: 'Marcar como perdido' }).click();
  await expect(lost).toBeHidden();
  await expect(page.getByRole('main').getByText('Perdido').first()).toBeVisible();
  await expect(page.getByRole('main')).toContainText('Precio');
  await expect(page.getByRole('button', { name: 'Reabrir como contactado' })).toBeVisible();
});

test('1440: el informe cuadra con la lista y Ajustes › Prospectos tiene los catálogos', async ({ page }) => {
  test.setTimeout(150_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, admin.email, password);
  await page.goto(`${origin}/prospectos/informe`);
  await expect(page.getByRole('heading', { name: 'Informe de conversión', level: 1 })).toBeVisible({ timeout: 30_000 });
  // Los dos prospectos se dieron de alta este mes: uno por WhatsApp, otro por Instagram.
  const byChannel = page.getByRole('table', { name: 'Prospectos por canal' });
  await expect(byChannel.getByRole('row', { name: /^Total/ })).toContainText('2');
  await shot(page, 'leads-report', 1440);
  await expectAxeClean(page, 'informe');

  // La cifra de Instagram abre la lista con el mismo filtro y la misma cuenta.
  await byChannel.getByRole('link', { name: /^Instagram, prospectos: 1\./ }).click();
  await expect(page).toHaveURL(/vista=lista.*channel=INSTAGRAM/, { timeout: 30_000 });
  await expect(page.getByText('Lista filtrada desde el informe de conversión.')).toBeVisible();
  await expect(page.getByText('1 prospecto', { exact: true })).toBeVisible();
  await expect(page.getByRole('table', { name: 'Prospectos' })).toContainText(SECOND.name);

  await page.goto(`${origin}/settings/prospectos`);
  await expect(page.getByRole('heading', { name: 'Prospectos', level: 1 })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('list', { name: 'Motivos de pérdida' })).toContainText('Precio');
  await page.getByLabel('Nuevo motivo').first().fill('Diseño de sonrisa');
  await page.getByRole('button', { name: 'Añadir' }).first().click();
  await expect(page.getByText('Motivo «Diseño de sonrisa» añadido.')).toBeVisible();
  await expect(page.getByTestId('lead-retention')).toHaveText('12 meses');
  await shot(page, 'leads-settings', 1440);
  await expectAxeClean(page, 'ajustes');
});
