import { test, expect, type BrowserContext, type Locator, type Page } from './support/test';
import { fillDate } from './support/dates';
import { randomUUID } from 'node:crypto';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { disableBusinessHours } from './support/business-hours';
import { expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR } from './support/mail';
import { atSede, sedeDate, sedeDayFromToday } from './support/clock';
import { API_URL } from './support/urls';
import { E2E_BROWSER_LOCALE } from './support/regional';

/**
 * e2e (DX-222): indicaciones postoperatorias de punta a punta, en escritorio
 * (1440) y móvil (390).
 *
 *   1. Ajustes › Sedes: el ADMIN pone el teléfono de la sede.
 *   2. Ajustes › Indicaciones: estado vacío; crea «POI-EXO» vinculada al tipo
 *      de cita «Cirugía oral».
 *   3. Agenda → detalle de una cita de hoy (mañana cerca de medianoche) de ese tipo: el panel
 *      «Indicaciones» propone POI-EXO. «Imprimir» abre la vista imprimible
 *      (con `window.print` interceptado), «Enviar por email» confirma el
 *      destinatario y «Abrir WhatsApp» abre `wa.me` con un texto SIN el
 *      procedimiento. Las tres quedan en «Entregadas en esta cita».
 *   4. La página pública del enlace de WhatsApp se abre sin sesión a 390 px;
 *      un token inventado muestra «Enlace no válido».
 *   5. Editar la plantilla sube la versión a 2; en la ficha › «Historia
 *      clínica» las tres entregas siguen en v1 (la de WhatsApp, «Abierto») y
 *      la vista imprimible de la entrega conserva el texto de la v1.
 *
 * Con E2E_QA_DIR definido guarda capturas en claro y oscuro de cada pantalla.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const ownerName = 'Dra. Paula Indicaciones';
const QA_DIR = process.env.E2E_QA_DIR;

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

const SEDE_PHONE = '+57 601 555 0101';
const TITLE = 'Exodoncia simple: cuidados en casa';
const BODY_V1 =
  'Hola {{paciente}}: muerde la gasa 30 minutos y no escupas hoy. Si sangra mucho, llama a {{clinica}} al {{telefono_sede}}.';
const BODY_V2 = `${BODY_V1} Toma solo la medicación indicada.`;
const TYPE_NAME = 'Cirugía oral';

const HALF_HOUR = 30 * 60_000;

const hhmm = (d: Date) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone: 'America/Bogota',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(d);

/**
 * Cita de 30 min HOY en la sede, en la primera media hora en punto que empiece
 * dentro de al menos 15 min. Cerca de medianoche ya no cabe hoy: entonces va
 * mañana a las 10:00 (la entrega de indicaciones no depende de la fecha).
 */
function appointmentSlot(): { start: Date; end: Date; day: string; label: string } {
  let start = new Date(Math.ceil((Date.now() + 15 * 60_000) / HALF_HOUR) * HALF_HOUR);
  let day = sedeDate(new Date());
  if (sedeDate(new Date(start.getTime() + HALF_HOUR - 1)) !== day) {
    day = sedeDayFromToday(1);
    start = atSede(day, '10:00');
  }
  const end = new Date(start.getTime() + HALF_HOUR);
  return { start, end, day, label: `${hhmm(start)}–${hhmm(end)}` };
}

async function api(page: Page, origin: string) {
  const headers = {
    Authorization: `Bearer ${await accessTokenOf(page)}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  return async function call<T>(method: 'post' | 'get', path: string, data?: object) {
    const res = await page.request[method](`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  };
}

/** Captura en claro y en oscuro (solo con E2E_QA_DIR). Deja la página en claro. */
async function shoot(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  await mkdir(QA_DIR, { recursive: true });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    // next-themes cambia la clase `dark` al recibir el cambio de la media query.
    await expect(page.locator('html')).toHaveClass(scheme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
    // Solo para la captura: deja terminar los `transition-colors` del cambio de tema.
    await page.waitForTimeout(400);
    await page.screenshot({ path: join(QA_DIR, `${name}-${scheme}.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

/** Página pública sin `next-themes`: la captura solo cambia la media query. */
async function shootPlain(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  await mkdir(QA_DIR, { recursive: true });
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    await page.screenshot({ path: join(QA_DIR, `${name}-${scheme}.png`), fullPage: true });
  }
  await page.emulateMedia({ colorScheme: 'light' });
}

/** El contenido del diálogo no es más ancho que el propio diálogo. */
async function expectDialogContentFits(dialog: Locator): Promise<void> {
  const overflow = await dialog.evaluate((d) => d.scrollWidth - d.clientWidth);
  expect(overflow, 'scroll horizontal dentro del diálogo').toBeLessThanOrEqual(0);
}

/** Último email guardado por el FileMailer para `to`. */
async function lastMailTo(to: string): Promise<{ subject: string; text: string }> {
  let found: { subject: string; text: string } | null = null;
  await expect
    .poll(
      async () => {
        const files = (await readdir(MAIL_DIR!).catch(() => [] as string[])).sort().reverse();
        for (const file of files) {
          const email = await readFile(join(MAIL_DIR!, file), 'utf8')
            .then((raw) => JSON.parse(raw) as { to: string; subject: string; text: string })
            .catch(() => null);
          if (email?.to === to) {
            found = email;
            return true;
          }
        }
        return false;
      },
      { timeout: 20_000, message: `no llegó ningún email a ${to}` },
    )
    .toBe(true);
  return found!;
}

/** `wa.me` no se visita de verdad: devuelve una página vacía. */
async function stubWhatsApp(context: BrowserContext): Promise<void> {
  await context.route('https://wa.me/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>wa</title>' }),
  );
}

for (const viewport of VIEWPORTS) {
  test(`indicaciones postoperatorias: plantilla, entrega desde la cita, HC y página pública (${viewport.name})`, async ({
    page,
    browser,
  }) => {
    test.setTimeout(180_000);
    const slot = appointmentSlot();

    const vw = viewport.width;
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.emulateMedia({ colorScheme: 'light' });
    const tag = `${suffix}${vw}`;
    const clinicName = `Clinica Indicaciones ${tag}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-postop-${tag}`,
      clinicName,
      fullName: ownerName,
      email: `test.user.postop.${tag}@example.com`,
      password,
    });
    await disableBusinessHours(page, origin);
    const call = await api(page, origin);
    const type = await call<{ id: string }>('post', '/appointment-types', {
      name: TYPE_NAME,
      durationMinutes: 30,
      color: '#7C3AED',
    });

    // --- 1. Ajustes › Sedes › la sede: su teléfono (B6: en «Editar sede») ------
    await page.goto(`${origin}/settings/sedes`);
    await page.getByRole('link', { name: /^Abrir / }).first().click();
    const editSede = page.getByRole('button', { name: /^(?:Editar|Revisar) / });
    await expect(editSede).toBeVisible({ timeout: 15_000 });
    await editSede.click();
    const sedeDialog = page.getByRole('dialog', { name: /^(?:Editar|Revisar) sede/ });
    const phone = sedeDialog.getByLabel('Teléfono', { exact: true });
    await phone.fill(SEDE_PHONE);
    await sedeDialog.getByRole('button', { name: 'Guardar sede' }).click();
    await expect(sedeDialog).toBeHidden();
    await expect(page.getByRole('region', { name: 'Datos de la sede' })).toContainText(SEDE_PHONE.slice(-4));
    await expectNoHorizontalScroll(page);

    // --- 2. Ajustes › Indicaciones: crear POI-EXO -------------------------------
    await page.goto(`${origin}/settings/indicaciones`);
    await expect(page.getByRole('heading', { name: 'Indicaciones postoperatorias' })).toBeVisible();
    await expect(page.getByText('Aún no hay indicaciones')).toBeVisible({ timeout: 15_000 });
    await shoot(page, `settings-vacio-${vw}`);

    await page.getByRole('button', { name: 'Nueva plantilla' }).click();
    const form = page.getByRole('dialog', { name: 'Nueva plantilla de indicaciones' });
    await expect(form.getByLabel('Código')).toHaveAccessibleDescription('Corto y único, p. ej. EXO o CIR-3M. No se puede cambiar después.');
    await form.getByLabel('Código').fill('POI-EXO');
    await form.getByLabel('Título').fill(TITLE);
    await form.getByLabel('Indicaciones', { exact: true }).fill(BODY_V1);
    await form.getByRole('checkbox', { name: TYPE_NAME }).check();
    await expectNoHorizontalScroll(page);
    // El contenido del diálogo cabe en él: nada se corta por la derecha a 390.
    await expectDialogContentFits(form);
    await shoot(page, `settings-nueva-plantilla-${vw}`);
    await form.getByRole('button', { name: 'Crear plantilla' }).click();
    await expect(form).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText('1 plantilla', { exact: true })).toBeVisible();
    await expect(page.getByText('1 tipo de cita').locator('visible=true').first()).toBeVisible();
    await expectNoHorizontalScroll(page);
    await shoot(page, `settings-lista-${vw}`);

    // --- 3. Paciente y cita de hoy por API; panel en el detalle -----------------
    const patientEmail = `paciente.postop.${tag}@example.com`;
    const patient = await call<{ id: string }>('post', '/patients', {
      firstName: 'Lucía',
      lastName: `Indicaciones${tag}`,
      docType: 'NATIONAL_ID',
      docNumber: `PO${tag}`.slice(0, 20),
      sex: 'F',
      email: patientEmail,
      phone: '+57 310 555 0101',
    });
    const me = await call<{ id: string }>('get', '/me');
    await call('post', '/appointments', {
      patientId: patient.id,
      providerId: me.id,
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      appointmentTypeId: type.id,
    });

    await page.goto(`${origin}/agenda`);
    await page.getByRole('button', { name: /^Día$/ }).click();
    await fillDate(page, 'Fecha', slot.day);
    await page
      .getByRole('button', { name: new RegExp(`Detalle de la cita de ${slot.label}`) })
      .locator('visible=true')
      .first()
      .click();

    const panel = page.getByRole('region', { name: 'Indicaciones', exact: true });
    const suggested = panel.getByRole('radio', { name: new RegExp(TITLE) });
    await expect(suggested).toBeChecked({ timeout: 15_000 });
    await expect(panel.getByText('POI-EXO v1')).toBeVisible();
    await expect(panel.getByText('Aún no se han entregado indicaciones en esta cita.')).toBeVisible();
    await panel.scrollIntoViewIfNeeded();
    await expectNoHorizontalScroll(page);
    await shoot(page, `panel-cita-${vw}`);

    // DX-246: el refetch tras entregar puede fallar sin perder el panel.
    await page.route('**/appointments/*/post-op-instructions', (route) =>
      route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ message: 'Servicio temporalmente no disponible.' }) }),
      { times: 1 },
    );
    // El radio y las acciones siguen el orden visual con teclado.
    await suggested.focus();
    await page.keyboard.press('Tab');
    await expect(panel.getByRole('button', { name: 'Imprimir' })).toBeFocused();

    // «Imprimir»: registra la entrega y abre la vista imprimible.
    await page.context().addInitScript(() => {
      window.print = () => {};
    });
    const [printPage] = await Promise.all([
      page.context().waitForEvent('page'),
      page.keyboard.press('Enter'),
    ]);
    await printPage.waitForURL(new RegExp(`/print/patients/${patient.id}/indicaciones/`));
    await printPage.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(printPage.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 15_000 });
    await expect(printPage.getByText(`Tel. ${SEDE_PHONE}`)).toBeVisible();
    await expect(printPage.getByText(clinicName).first()).toBeVisible();
    await expect(printPage.getByText(/^POI-EXO · v1 · entregada el .+ por /)).toBeVisible();
    await expect(
      printPage.getByText(`Hola Lucía Indicaciones${tag}: muerde la gasa`, { exact: false }),
    ).toBeVisible();
    await expectNoHorizontalScroll(printPage);
    await shoot(printPage, `impresion-${vw}`);
    await printPage.close();
    await expect(panel.getByText(/^POI-EXO v1 · Impresas · /)).toBeVisible({ timeout: 10_000 });

    await expect(panel.getByText(/No pudimos actualizar las indicaciones/)).toBeVisible();
    await expect(suggested).toBeChecked();
    await panel.getByText(/No pudimos actualizar las indicaciones/).scrollIntoViewIfNeeded();
    await shoot(page, `panel-recarga-fallida-${vw}`);
    await panel.getByRole('button', { name: 'Reintentar' }).focus();
    await page.keyboard.press('Enter');
    await expect(panel.getByText(/No pudimos actualizar las indicaciones/)).toHaveCount(0);
    await expect(panel.getByText(/^POI-EXO v1 · Impresas · /)).toBeVisible();

    // «Enviar por email»: confirma el destinatario; el asunto no lleva el procedimiento.
    await panel.getByRole('button', { name: 'Enviar por email' }).click();
    await expect(page.getByText(/^Indicaciones enviadas a .+@example\.com\.$/)).toBeVisible({
      timeout: 10_000,
    });
    await expect(panel.getByText(/^POI-EXO v1 · Email · /)).toBeVisible({ timeout: 10_000 });
    if (MAIL_DIR) {
      const mail = await lastMailTo(patientEmail);
      expect(mail.subject).toContain(clinicName);
      expect(mail.subject).not.toMatch(/exodoncia/i);
      expect(mail.text).toMatch(/\/indicaciones\/[A-Za-z0-9_-]+/);
    }

    // «Abrir WhatsApp»: wa.me con el enlace público y sin el procedimiento.
    await stubWhatsApp(page.context());
    const [waPage] = await Promise.all([
      page.context().waitForEvent('page'),
      panel.getByRole('button', { name: 'Abrir WhatsApp' }).click(),
    ]);
    await waPage.waitForURL(/^https:\/\/wa\.me\//);
    const waUrl = new URL(waPage.url());
    expect(waUrl.pathname).toBe('/573105550101');
    const message = waUrl.searchParams.get('text') ?? '';
    expect(message).toContain(clinicName);
    expect(message).not.toMatch(/exodoncia/i);
    expect(message).not.toContain(TITLE);
    const publicUrl = /(https?:\/\/\S+\/indicaciones\/[A-Za-z0-9_-]+)/.exec(message)?.[1] ?? '';
    expect(publicUrl, `el mensaje no trae el enlace público: ${message}`).not.toBe('');
    expect(new URL(publicUrl).host).toBe(new URL(origin).host);
    await waPage.close();
    await expect(panel.getByText(/^POI-EXO v1 · WhatsApp · /)).toBeVisible({ timeout: 10_000 });
    await expect(panel.getByRole('listitem')).toHaveCount(3);
    await expectNoHorizontalScroll(page);
    // Que los avisos no tapen la lista en la captura.
    await expect(page.locator('[data-sonner-toast]')).toHaveCount(0, { timeout: 20_000 });
    await panel.getByRole('listitem').last().scrollIntoViewIfNeeded();
    await shoot(page, `panel-entregadas-${vw}`);

    // --- 4. Página pública: sin sesión, a 390 px ------------------------------
    const patientContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
      timezoneId: 'America/Bogota',
      locale: E2E_BROWSER_LOCALE,
    });
    const publicPage = await patientContext.newPage();
    await publicPage.goto(publicUrl);
    await expect(publicPage.getByRole('heading', { name: clinicName })).toBeVisible({ timeout: 15_000 });
    await expect(publicPage.getByRole('heading', { name: TITLE })).toBeVisible();
    await expect(publicPage.getByText(/muerde la gasa 30 minutos/)).toBeVisible();
    await expect(publicPage.getByRole('link', { name: SEDE_PHONE })).toHaveAttribute('href', /^tel:/);
    await expect(publicPage.getByText('POI-EXO · v1')).toBeVisible();
    // Nada de la sesión ni de la ficha: ni el id del paciente en la URL ni la página.
    expect(publicUrl).not.toContain(patient.id);
    await expect(publicPage.locator('body')).not.toContainText(patient.id);
    await expectNoHorizontalScroll(publicPage);
    if (vw === 390) await shootPlain(publicPage, 'publica-390');

    await publicPage.goto(`${new URL(publicUrl).origin}/indicaciones/${'x'.repeat(43)}`);
    await expect(publicPage.getByText('Enlace no válido')).toBeVisible({ timeout: 15_000 });
    await expectNoHorizontalScroll(publicPage);
    if (vw === 390) await shootPlain(publicPage, 'publica-enlace-no-valido-390');
    await patientContext.close();

    // --- 5. Editar la plantilla (v2) y la HC conserva la v1 --------------------
    await page.goto(`${origin}/settings/indicaciones`);
    await page
      .getByRole('button', { name: `Acciones de «${TITLE}»` })
      .locator('visible=true')
      .first()
      .click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    const edit = page.getByRole('dialog', { name: 'Editar indicaciones' });
    await edit.getByLabel('Indicaciones', { exact: true }).fill(BODY_V2);
    await edit.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(edit).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText('Guardada. Ahora va por la versión 2.')).toBeVisible();

    // Enlace directo a la pestaña: el spec prueba las entregas, no el cambio
    // de pestaña, y un clic perdido en `router.replace` lo hacía intermitente.
    await page.goto(`${origin}/patients/${patient.id}?tab=clinical-history`);
    await expect(page.getByRole('heading', { name: 'Indicaciones entregadas' })).toBeVisible({
      timeout: 15_000,
    });
    const deliveries = page.getByRole(vw >= 640 ? 'table' : 'list', { name: 'Indicaciones entregadas' });
    await expect(deliveries.getByText('POI-EXO · v1')).toHaveCount(3, { timeout: 15_000 });
    await expect(deliveries.getByText('POI-EXO · v2')).toHaveCount(0);
    for (const channel of ['Impresa', 'Email', 'WhatsApp']) {
      await expect(deliveries.getByText(new RegExp(`\\b${channel}\\b`)).first()).toBeVisible();
    }
    // La apertura del enlace público quedó registrada en la entrega de WhatsApp.
    await expect(deliveries.getByText('Abierto')).toHaveCount(1);
    await expect(deliveries.getByText(ownerName).first()).toBeVisible();
    await deliveries.scrollIntoViewIfNeeded();
    await expectNoHorizontalScroll(page);
    await shoot(page, `hc-entregas-${vw}`);

    // La entrega impresa (la más antigua) sigue mostrando el texto de la v1.
    const [again] = await Promise.all([
      page.context().waitForEvent('page'),
      deliveries.getByRole('link', { name: /Ver e imprimir/ }).last().click(),
    ]);
    await expect(again.getByRole('heading', { name: TITLE })).toBeVisible({ timeout: 15_000 });
    await expect(again.getByText(/^POI-EXO · v1 · /)).toBeVisible();
    await expect(again.getByText(/muerde la gasa/)).toBeVisible();
    await expect(again.getByText(/Toma solo la medicación indicada/)).toHaveCount(0);
    await again.close();
  });
}
