import { randomUUID } from 'node:crypto';
import type { APIRequestContext, Locator, Page } from '@playwright/test';
import { test, expect } from './support/test';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { sedeDayFromToday } from './support/clock';
import { expectNoHorizontalScroll } from './support/layout';
import { MAIL_DIR, linkFromMail, mailMark } from './support/mail';
import { E2E_BROWSER_LOCALE } from './support/regional';
import { axeInBothThemes } from './support/axe';
import { shot } from './support/qa-shot';
import { API_URL } from './support/urls';

/**
 * e2e DX-560: presentar el plan al paciente.
 *
 *   1. Clínica nueva por la API (idiomas es y en, tasa manual de VES de hoy),
 *      una paciente que prefiere inglés con email, dos procedimientos y un
 *      plan USD presentado en dos visitas, más su alternativa «Opción B».
 *   2. El ADMIN escribe la descripción para el paciente de un procedimiento
 *      en Catálogo (es y en); un enlace da el error junto al campo.
 *   3. «Presentar» desde la ficha: las tres vistas (Clínica sin importes,
 *      Económica sin dientes ni odontograma), el texto en inglés con su
 *      `lang`, la segunda moneda orientativa y Escape de vuelta a la ficha.
 *   4. 390, 768 y 1440 px sin scroll horizontal, en claro y oscuro (capturas
 *      `qa-shot` y axe), e impresión de una sola hoja.
 *   5. Alternativas lado a lado: «Elegir Opción B» vuelve a la ficha con la
 *      aceptación de esa opción abierta.
 *   6. Envío a distancia con la segunda moneda: la página pública enseña las
 *      visitas, el odontograma, el texto para el paciente y el total en VES.
 *
 * Estado: crea su propia clínica (no toca la demo). En serie.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinic = {
  subdomain: `test-presentar-${suffix}`.slice(0, 40),
  clinicName: `Clínica Presentar ${suffix}`,
  fullName: 'Dra. Presentación',
  email: `presentar.${suffix}@example.com`,
  password: 'Password123!',
};
const PATIENT_EMAIL = `grace.${suffix}@example.com`.slice(0, 60);
const CLEANING = `Raspado ${suffix}`.slice(0, 40);
const IMPLANT = `Implante ${suffix}`.slice(0, 40);
const EN_TEXT = 'Deep cleaning of the gums to stop the inflammation.';
const ES_TEXT = 'Limpieza profunda de las encías para frenar la inflamación.';

let admin: ApiSession;
let origin = '';
let patientId = '';
let planId = '';
let alternativeId = '';
let cleaningId = '';

const norm = (value: string | null) => (value ?? '').replace(/\s+/g, ' ').trim();

async function put(request: APIRequestContext, session: ApiSession, path: string, data: object): Promise<void> {
  const res = await request.put(`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `PUT ${path} falló: ${await res.text()}`).toBeTruthy();
}

async function patch(request: APIRequestContext, session: ApiSession, path: string, data: object): Promise<void> {
  const res = await request.patch(`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `PATCH ${path} falló: ${await res.text()}`).toBeTruthy();
}

const presentHref = () => `${origin}/presentar/patients/${patientId}/treatment-plans/${planId}`;

async function openPresentation(page: Page, query = ''): Promise<Locator> {
  await page.goto(`${presentHref()}${query}`);
  const article = page.getByTestId('plan-presentation');
  await expect(article).toBeVisible({ timeout: 15_000 });
  return article;
}

test.describe.configure({ mode: 'serial' });

test.describe('Presentar el plan al paciente (DX-560)', () => {
  test.beforeAll(async ({ request }) => {
    admin = await registerClinicViaApi(request, clinic);
    origin = admin.origin;
    await put(request, admin, '/patients/languages', { languages: ['es', 'en'] });
    await put(request, admin, '/exchange/settings', { source: 'MANUAL' });
    await apiPost(request, admin, '/exchange/manual-rates', { date: sedeDayFromToday(0), currency: 'VES', rate: 40 });
    ({ id: cleaningId } = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `ras-${suffix}`.slice(0, 30),
      kind: 'PROCEDURE',
      labelEs: CLEANING,
      color: '#3366CC',
      defaultPrice: 100,
    }));
    const implant = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
      code: `imp-${suffix}`.slice(0, 30),
      kind: 'PROCEDURE',
      labelEs: IMPLANT,
      color: '#7C3AED',
      defaultPrice: 900,
    });
    ({ id: patientId } = await apiPost<{ id: string }>(request, admin, '/patients', {
      firstName: 'Grace',
      lastName: `Present${suffix}`.slice(0, 40),
      docType: 'NATIONAL_ID',
      docNumber: `DX560${suffix}`.slice(0, 20),
      sex: 'F',
      email: PATIENT_EMAIL,
      birthDate: '1990-04-12',
      preferredLanguage: 'en',
    }));
    ({ id: planId } = await apiPost<{ id: string }>(request, admin, `/patients/${patientId}/treatment-plans`, {
      currency: 'USD',
    }));
    const first = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${planId}/items`, {
      toothNumber: '16',
      surfaces: ['OCCLUSAL'],
      catalogItemId: cleaningId,
    });
    const second = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${planId}/items`, {
      toothNumber: '26',
      catalogItemId: implant.id,
    });
    await patch(request, admin, `/treatment-plans/${planId}/visits`, {
      items: [
        { itemId: first.id, visit: 1 },
        { itemId: second.id, visit: 2, visitLabel: 'Cirugía' },
      ],
      visitIntervals: { '2': 15 },
    });
    await apiPost(request, admin, `/treatment-plans/${planId}/present`, {});
    ({ id: alternativeId } = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${planId}/alternatives`, {
      optionLabel: 'Opción B',
    }));
  });

  test('el ADMIN escribe la descripción para el paciente en es y en; un enlace da el error junto al campo', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, clinic.email, clinic.password);
    await page.goto(`${origin}/catalog?item=${cleaningId}`);
    const dialog = page.getByRole('dialog', { name: 'Editar ítem' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    const group = dialog.getByRole('group', { name: /Descripción para el paciente/ });
    await expect(group).toContainText('Texto claro para el paciente, sin datos de nadie, sin enlaces ni HTML');
    const es = group.getByLabel('Español (es)', { exact: true });
    const en = group.getByLabel('English (en)', { exact: true });
    await expect(en).toBeVisible({ timeout: 15_000 });
    await es.fill(ES_TEXT);
    await en.fill('Read more on example.com');
    await dialog.getByRole('button', { name: /Guardar/ }).click();
    await expect(
      dialog.getByText('La descripción para el paciente no admite enlaces ni HTML: escríbela como texto.'),
    ).toBeVisible();
    await expect(en).toHaveAttribute('aria-invalid', 'true');
    await en.fill(EN_TEXT);
    await expect(group).toContainText(`${EN_TEXT.length}/300`);
    await dialog.getByRole('button', { name: /Guardar/ }).click();
    await expect(dialog).toBeHidden();
  });

  test('«Presentar» desde la ficha: tres vistas, texto en inglés, segunda moneda y Escape de vuelta', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, clinic.email, clinic.password);
    await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans&planId=${planId}`);
    await page.getByRole('link', { name: 'Presentar' }).click({ timeout: 15_000 });
    await expect(page).toHaveURL(new RegExp(`/presentar/patients/${patientId}/treatment-plans/${planId}`));
    const title = page.getByRole('heading', { level: 1, name: 'Plan de tratamiento' });
    await expect(title).toBeFocused({ timeout: 15_000 });
    const article = page.getByTestId('plan-presentation');
    await expect(article.getByRole('heading', { level: 2, name: 'Visita 1' })).toBeVisible();
    await expect(article.getByRole('heading', { level: 2, name: 'Visita 2 · Cirugía' })).toBeVisible();
    await expect(article.getByText(EN_TEXT)).toHaveAttribute('lang', 'en');
    // Sin descripción, el nombre del catálogo; nunca un código ni un id.
    await expect(article).toContainText(IMPLANT);
    await expect(article).not.toContainText(cleaningId);
    await expect(article.getByRole('img', { name: 'Dientes de esta visita: 16' })).toBeVisible();
    await expect(article.getByTestId('presentation-plan-total')).toContainText('Total del plan (USD)');

    // Segunda moneda orientativa con la tasa de hoy.
    await page.getByLabel('Segunda moneda').selectOption('VES');
    await expect(article.getByTestId('presentation-second-total')).toContainText('Total orientativo (VES)');
    await expect(article.getByTestId('presentation-plan-total')).toContainText(/Tasa de hoy:\s1\sUSD\s=\sVES\s40,00\s\(manual/);

    await page.getByRole('radio', { name: 'Clínica' }).click();
    await expect(page).toHaveURL(/vista=clinica/);
    await expect(article.getByRole('heading', { level: 2, name: 'Visita 1' })).toBeVisible();
    expect(norm(await article.textContent())).not.toMatch(/USD|VES|Total/);
    await expect(article.getByRole('img', { name: /Dientes de esta visita/ })).toHaveCount(2);

    await page.getByRole('radio', { name: 'Económica' }).click();
    await expect(page).toHaveURL(/vista=economica/);
    await expect(article.getByTestId('presentation-plan-total')).toContainText('USD');
    await expect(article.getByRole('img')).toHaveCount(0);
    expect(norm(await article.textContent())).not.toMatch(/Diente|Oclusal/);

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(new RegExp(`/patients/${patientId}\\?tab=treatment-plans&planId=${planId}`));
  });

  test('390, 768 y 1440 px sin scroll horizontal, claro y oscuro con axe limpio; imprime una hoja', async ({ page }) => {
    await loginAs(page, origin, clinic.email, clinic.password);
    for (const mode of ['completa', 'clinica', 'economica'] as const) {
      for (const width of [390, 768, 1440]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
        await openPresentation(page, mode === 'completa' ? '' : `?vista=${mode}`);
        await expectNoHorizontalScroll(page);
        await shot(page, `dx560-presentar-${mode}`, width);
        const violations = await axeInBothThemes(page, page.locator('.presentation-print-page'));
        expect(violations.light, `axe en claro (${mode}, ${width})`).toEqual([]);
        expect(violations.dark, `axe en oscuro (${mode}, ${width})`).toEqual([]);
      }
      // Una hoja por vista; la barra no sale en el papel.
      await page.emulateMedia({ media: 'print' });
      await expect(page.getByRole('toolbar', { name: 'Acciones de la presentación' })).toBeHidden();
      const pdf = await page.pdf({ format: 'A4', preferCSSPageSize: true });
      const pageCount = (pdf.toString('latin1').match(/\/Type\s*\/Page(?![s\w])/g) ?? []).length;
      expect(pageCount, `hojas de la vista ${mode}`).toBe(1);
      await page.emulateMedia({ media: 'screen' });
    }
  });

  test('alternativas lado a lado: «Elegir Opción B» abre su aceptación en la ficha', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, clinic.email, clinic.password);
    await openPresentation(page);
    await page.getByRole('button', { name: 'Ver alternativas' }).click();
    const list = page.getByTestId('presentation-alternatives');
    await expect(list.getByRole('listitem')).toHaveCount(2, { timeout: 15_000 });
    const boxes = await Promise.all(
      (await list.getByRole('listitem').all()).map(async (card) => (await card.boundingBox())!),
    );
    // Lado a lado: misma fila.
    expect(Math.abs(boxes[0].y - boxes[1].y)).toBeLessThan(2);
    await shot(page, 'dx560-presentar-alternativas', 1440);
    await list.getByRole('link', { name: 'Elegir Opción B' }).click();
    await expect(page).toHaveURL(new RegExp(`planId=${alternativeId}`));
    await expect(page.getByRole('dialog', { name: 'Aceptar presupuesto con firma' })).toBeVisible({ timeout: 15_000 });
    // El parámetro se quita: recargar no vuelve a abrirla.
    await expect(page).not.toHaveURL(/aceptar=1/);
  });

  test('envío a distancia con segunda moneda: la página pública enseña la presentación (390 px)', async ({
    page,
    browser,
  }) => {
    test.skip(!MAIL_DIR, 'E2E_MAIL_DIR no definido: no se puede leer el email (usa scripts/e2e-ci.sh)');
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, origin, clinic.email, clinic.password);
    await page.goto(`${origin}/patients/${patientId}?tab=treatment-plans&planId=${planId}`);
    await page.getByRole('button', { name: 'Enviar a aceptar' }).click({ timeout: 15_000 });
    const dialog = page.getByRole('dialog', { name: 'Enviar a aceptar' });
    await dialog.getByLabel('Segunda moneda en el enlace (opcional)').selectOption('VES');
    const sentSince = mailMark();
    await dialog.getByRole('button', { name: 'Enviar a aceptar' }).click();
    await expect(dialog).toBeHidden();
    const link = await linkFromMail(PATIENT_EMAIL, /(https?:\/\/\S+\/firmar\/[A-Za-z0-9_-]{43})/, { since: sentSince });

    const context = await browser.newContext({
      locale: E2E_BROWSER_LOCALE,
      timezoneId: 'America/Caracas',
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const publicPage = await context.newPage();
    try {
      await publicPage.goto(link);
      const codeSince = mailMark();
      await publicPage.getByRole('button', { name: 'Enviarme el código' }).click({ timeout: 15_000 });
      const code = await linkFromMail(PATIENT_EMAIL, /Tu código de verificación es: (\d{6})/, { since: codeSince });
      await publicPage.getByLabel('Código de 6 dígitos').fill(code);
      await publicPage.getByRole('button', { name: 'Ver el presupuesto' }).click();
      const budget = publicPage.getByRole('article', { name: 'Presupuesto y condiciones' });
      await expect(budget.getByRole('heading', { name: 'Visita 1' })).toBeVisible({ timeout: 15_000 });
      await expect(budget.getByRole('heading', { name: 'Visita 2 · Cirugía' })).toBeVisible();
      await expect(budget.getByText(EN_TEXT)).toHaveAttribute('lang', 'en');
      await expect(budget.getByRole('img', { name: 'Dientes de esta visita: 26' })).toBeVisible();
      await expect(budget).toContainText('Total (USD)');
      await expect(budget.getByTestId('public-budget-second-total')).toContainText('Total orientativo (VES)');
      await expect(budget.getByTestId('public-budget-second-note')).toContainText(/1\sUSD\s=\sVES\s40,00/);
      await expectNoHorizontalScroll(publicPage);
      await shot(publicPage, 'dx560-firmar-presentacion', 390);
      const violations = await axeInBothThemes(publicPage, budget);
      expect(violations.light).toEqual([]);
      expect(violations.dark).toEqual([]);
    } finally {
      await context.close();
    }
  });
});
