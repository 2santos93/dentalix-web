import { test, expect, type Page } from './support/test';
import { loginAs } from './support/auth';
import { tenantOrigin } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';
import { axeViolations } from './support/axe';

/**
 * e2e (DX-439): «Pendiente de cerrar» contra la clínica DEMO sembrada
 * (`npm run seed:demo` en la API), que deja en la sede principal, el último
 * día abierto antes de hoy, una cita CONFIRMED sin desenlace, una atendida sin
 * evolución y una atendida con un tratamiento ligado sin marcar.
 *
 *  1. RECEPTION a 390 px y por teclado: Agenda → «Pendiente de cerrar», ve
 *     solo «Citas sin desenlace», marca «No asistió» en la cita de ayer y la
 *     fila desaparece (y el contador baja); la página no se desplaza de lado
 *     y axe no encuentra violaciones serias.
 *  2. DENTIST a 1440 px: ve «Atendidas sin evolución» y «Tratamiento sin
 *     marcar como hecho» de sus citas, no la sección de recepción.
 */
const DEMO_SUBDOMAIN = process.env.E2E_DEMO_SUBDOMAIN ?? 'demo';
const DEMO_PASSWORD = process.env.E2E_DEMO_PASSWORD ?? 'DemoDentalix2026!';
const RECEPTION_EMAIL = process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app';
const DENTIST_EMAIL = process.env.E2E_DEMO_DENTIST_EMAIL ?? 'dentista@demo.dentalix.app';

const origin = tenantOrigin(DEMO_SUBDOMAIN);
/** Capturas de QA (390 y 1440 px) a DX439_QA_DIR, o a test-results. */
const QA_DIR = process.env.DX439_QA_DIR ?? 'test-results';

async function openFromAgenda(page: Page, email: string): Promise<void> {
  await loginAs(page, origin, email, DEMO_PASSWORD);
  await page.goto(`${origin}/agenda`);
  const link = page.getByRole('main').getByRole('link', { name: /^Pendiente de cerrar/ });
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`${origin}/agenda/pendiente-de-cerrar$`));
  await expect(page.getByRole('heading', { level: 1, name: 'Pendiente de cerrar' })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test('RECEPTION a 390 px: cierra una cita de ayer con «No asistió» y sale de la lista', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openFromAgenda(page, RECEPTION_EMAIL);

  // A 390 px la sección es una lista de tarjetas (DataList), no una tabla.
  const outcome = page.getByRole('list', { name: 'Citas sin desenlace' });
  await expect(outcome).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /Atendidas sin evolución/ })).toHaveCount(0);
  await expectNoHorizontalScroll(page);

  await page.screenshot({ path: `${QA_DIR}/dx439-recepcion-390.png`, fullPage: true });
  const rows = page.getByTestId('closing-row-OUTCOME');
  const before = await rows.count();
  expect(before).toBeGreaterThan(0);
  const counter = page.getByTestId('closing-count-OUTCOME');
  await expect(counter).toHaveText(String(before));
  const first = rows.first();
  const patient = (await first.textContent())?.trim() ?? '';
  expect(patient).not.toBe('');

  // Por teclado: foco en el «⋯» de la primera fila, Enter abre el menú y
  // «No asistió» se elige con las flechas y Enter.
  await outcome.getByRole('button', { name: `Acciones de ${patient}` }).first().focus();
  await page.keyboard.press('Enter');
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  const noShow = menu.getByRole('menuitem', { name: 'No asistió' });
  for (let i = 0; i < 4 && !(await noShow.evaluate((el) => el === document.activeElement)); i += 1) {
    await page.keyboard.press('ArrowDown');
  }
  await expect(noShow).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByText(`${patient}: No asistió.`)).toBeVisible();
  await expect(rows).toHaveCount(before - 1);
  // La última de la sección: la recepción ya no tiene nada → «Todo cerrado».
  if (before === 1) await expect(page.getByText('Todo cerrado')).toBeVisible();
  else await expect(counter).toHaveText(String(before - 1));

  const violations = (await axeViolations(page, page.getByRole('main'))).filter(
    (v) => v.impact === 'serious' || v.impact === 'critical',
  );
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
});

test('DENTIST a 1440 px: evolución y tratamiento de sus citas, sin la sección de recepción', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await openFromAgenda(page, DENTIST_EMAIL);
  await expect(page.getByRole('heading', { name: /Atendidas sin evolución/ })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /Tratamiento sin marcar como hecho/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /Citas sin desenlace/ })).toHaveCount(0);
  await page.screenshot({ path: `${QA_DIR}/dx439-dentista-1440.png`, fullPage: true });
});
