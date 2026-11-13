import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL } from './support/urls';

/**
 * e2e (DX-467): receta verificable.
 *
 *   1. La vista imprimible de una receta emitida lleva en el pie el código de
 *      verificación agrupado y un QR hacia `/receta/<código>` en el host de la
 *      clínica; la receta sigue cabiendo en UNA hoja.
 *   2. La página pública, sin sesión, a 390 y 1440 px: «Receta válida» con
 *      fecha, profesional y su registro, clínica e iniciales; ni
 *      medicamentos ni documento. Sin scroll horizontal y sin fallos de axe.
 *   3. Tras anular, la MISMA URL dice «Receta anulada el …» (sin motivo) en la
 *      carga siguiente: nada se queda en caché.
 *   4. Un código inexistente muestra la página genérica.
 *
 * Con E2E_QA_DIR definido guarda capturas de la página pública.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `test-clinic-rxv-${suffix}`;
const email = `test.user.rxv.${suffix}@example.com`;
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;
const LICENSE = 'MPPS 45678';
const MEDICINE = 'Amoxicilina';
const DOC_NUMBER = `V${suffix}`.slice(0, 12);
const VOID_REASON = 'Dosis equivocada en la indicación';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'movil', width: 390, height: 844 },
];

function api(request: APIRequestContext, origin: string, token: string) {
  const headers = { 'X-Tenant-Host': new URL(origin).host, Authorization: `Bearer ${token}` };
  return {
    async post<T>(path: string, data: object): Promise<T> {
      const res = await request.post(`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
  };
}

const grouped = (code: string) => code.replace(/(.{4})(?=.)/g, '$1-');

async function shoot(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  await mkdir(QA_DIR, { recursive: true });
  await page.screenshot({ path: join(QA_DIR, `dx467-${name}.png`), fullPage: true });
}

test('receta verificable: código y QR impresos, página pública válida → anulada, código inexistente', async ({
  page,
  browser,
}) => {
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName: `Clinica Verifica ${suffix}`,
    fullName: 'Dra Andreina Salazar',
    email,
    password,
  });
  const admin = api(page.request, origin, await accessTokenOf(page));
  const patient = await admin.post<{ id: string }>('/patients', {
    firstName: 'María José',
    lastName: `Pérez Rosa${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: DOC_NUMBER,
    sex: 'F',
  });
  const rx = await admin.post<{ id: string; verificationCode: string }>(
    `/patients/${patient.id}/prescriptions`,
    {
      professionalLicense: LICENSE,
      items: [
        {
          activeIngredient: MEDICINE,
          concentration: '500 mg',
          pharmaceuticalForm: 'Cápsula',
          route: 'Oral',
          dose: '1 cápsula',
          frequency: 'Cada 8 horas',
          durationDays: 7,
          totalQuantity: 21,
          quantityUnit: 'cápsulas',
        },
      ],
    },
  );
  const code = rx.verificationCode;
  expect(code).toMatch(/^[2-9A-HJKMNP-Z]{12}$/);
  const verifyUrl = `${origin}/receta/${code}`;

  // --- 1. Impresión: código agrupado y QR hacia la página pública ---
  await page.context().addInitScript(() => {
    window.print = () => {};
  });
  await page.goto(`${origin}/print/patients/${patient.id}/prescriptions/${rx.id}`);
  const stamp = page.getByRole('region', { name: 'Verificar esta receta' });
  await expect(stamp).toBeVisible({ timeout: 15_000 });
  await expect(stamp).toContainText(`Código: ${grouped(code)}`);
  await expect(stamp).toContainText(verifyUrl.replace(/^https?:\/\//, ''));
  await expect(page.getByTestId('prescription-verification-qr')).toHaveAttribute('data-value', verifyUrl);
  await page.emulateMedia({ media: 'print' });
  await expect(stamp).toBeVisible();
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(1);
  await page.emulateMedia({ media: 'screen' });

  // --- 2. Página pública sin sesión, a 1440 y 390 ---
  const visitor = await browser.newContext();
  const pub = await visitor.newPage();
  for (const viewport of VIEWPORTS) {
    await pub.setViewportSize({ width: viewport.width, height: viewport.height });
    const res = await pub.goto(verifyUrl);
    expect(res?.headers()['cache-control']).toBe('no-store');
    expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(pub.getByRole('heading', { level: 1, name: 'Receta válida' })).toBeVisible({ timeout: 15_000 });
    const verdict = pub.getByTestId('rx-verification');
    await expect(verdict).toContainText('Dra Andreina Salazar');
    await expect(verdict).toContainText(LICENSE);
    await expect(verdict).toContainText(`Clinica Verifica ${suffix}`);
    await expect(verdict).toContainText('M. J. P. R.');
    await expect(verdict).toContainText(/Fecha de emisión\s*\d{2}[/.]\d{2}[/.]\d{4}/);
    await expect(pub.getByText(grouped(code))).toBeVisible();
    const text = await pub.locator('body').innerText();
    expect(text).not.toContain(MEDICINE);
    expect(text).not.toContain(DOC_NUMBER);
    expect(text).not.toContain('María José');
    await expectNoHorizontalScroll(pub);
    expect(await axeInBothThemes(pub, pub.locator('main'))).toEqual({ light: [], dark: [] });
    await shoot(pub, `valida-${viewport.name}`);
  }

  // --- 3. Anulada: la misma URL, en la carga siguiente ---
  await admin.post(`/prescriptions/${rx.id}/void`, { reason: VOID_REASON });
  for (const viewport of VIEWPORTS) {
    await pub.setViewportSize({ width: viewport.width, height: viewport.height });
    await pub.goto(verifyUrl);
    await expect(
      pub.getByRole('heading', { level: 1, name: /^Receta anulada el \d{2}[/.]\d{2}[/.]\d{4}$/ }),
    ).toBeVisible({ timeout: 15_000 });
    await expect(pub.getByText('No es válida para dispensar.')).toBeVisible();
    const text = await pub.locator('body').innerText();
    expect(text).not.toContain(VOID_REASON);
    expect(text).not.toContain(LICENSE);
    await expectNoHorizontalScroll(pub);
    await shoot(pub, `anulada-${viewport.name}`);
  }

  // --- 4. Código inexistente: la página genérica ---
  await pub.setViewportSize({ width: 390, height: 844 });
  await pub.goto(`${origin}/receta/ABCDEFGHJKMN`);
  await expect(pub.getByRole('heading', { level: 1, name: 'No encontramos esta receta' })).toBeVisible({
    timeout: 15_000,
  });
  await expectNoHorizontalScroll(pub);
  await shoot(pub, 'inexistente-movil');
  await visitor.close();
});
