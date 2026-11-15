import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { axeInBothThemes } from './support/axe';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';
import { API_URL } from './support/urls';

/**
 * e2e (DX-468): «Enviar al paciente» una copia informativa de la receta.
 *
 *   1. A 1440 y 390 px: ficha → «Recetas» → «Enviar al paciente» → WhatsApp →
 *      «Enviar copia»: el diálogo dice a quién (enmascarado), ofrece «Abrir
 *      WhatsApp» hacia wa.me con el mensaje prellenado (clínica y enlace, nada
 *      clínico) y el enlace para copiar.
 *   2. El paciente abre el enlace, sin sesión, al mismo ancho: la receta con su
 *      QR de verificación y el pie «Copia para el paciente…», «Imprimir o
 *      guardar como PDF», sin scroll horizontal ni fallos de axe.
 *   3. Por email: «Copia enviada a …» (sin el email entero).
 *   4. Tras anular la receta, el mismo enlace dice «Esta receta fue anulada»,
 *      sin la receta ni nada que descargar.
 *
 * Con E2E_QA_DIR definido guarda capturas.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `test-clinic-rxc-${suffix}`;
const email = `test.user.rxc.${suffix}@example.com`;
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;
const MEDICINE = 'Amoxicilina';
const LICENSE = 'MPPS 45678';
const FOOTER = 'Copia para el paciente. Para retirar el medicamento presente la receta impresa y firmada.';

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

async function shoot(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  await mkdir(QA_DIR, { recursive: true });
  await page.screenshot({ path: join(QA_DIR, `dx468-${name}.png`), fullPage: true });
}

test('copia de la receta: enviar por WhatsApp y email, abrirla a 1440 y 390, anulada después', async ({
  page,
  browser,
}) => {
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName: `Clinica Copia ${suffix}`,
    fullName: 'Dra Andreina Salazar',
    email,
    password,
  });
  const admin = api(page.request, origin, await accessTokenOf(page));
  const patient = await admin.post<{ id: string }>('/patients', {
    firstName: 'Yusmary',
    lastName: `Rondon${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `V${suffix}`.slice(0, 12),
    sex: 'F',
    birthDate: '1985-06-20',
    email: `yusmary.${suffix}@example.com`,
    phone: '+58 412 1234567',
  });
  const rx = await admin.post<{ id: string }>(`/patients/${patient.id}/prescriptions`, {
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
  });

  const visitor = await browser.newContext();
  const pub = await visitor.newPage();
  let lastUrl = '';

  for (const viewport of VIEWPORTS) {
    // --- 1. Enviar por WhatsApp desde la ficha ---
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto(`${origin}/patients/${patient.id}?tab=prescriptions`);
    const panel = page.locator('#tabpanel-prescriptions');
    await panel.getByRole('button', { name: /^Enviar al paciente/ }).click({ timeout: 15_000 });
    const dialog = page.getByRole('dialog', { name: 'Enviar al paciente' });
    await expect(dialog).toBeVisible();
    await expectDialogInsideViewport(page, dialog);
    await expect(dialog.getByRole('radio', { name: 'WhatsApp' })).toBeChecked();
    await dialog.getByRole('button', { name: 'Enviar copia' }).click();
    await expect(dialog.getByText('Enlace listo para ••• 4567')).toBeVisible();
    await expect(dialog.getByText(/El enlace caduca el \d{2}\/\d{2}\/\d{4}\./)).toBeVisible();
    const link = dialog.getByLabel('Enlace de la copia');
    lastUrl = await link.inputValue();
    expect(lastUrl).toMatch(new RegExp(`^${origin}/receta/copia/[A-Za-z0-9_-]{43}$`));
    const wa = dialog.getByRole('link', { name: /Abrir WhatsApp/ });
    const href = (await wa.getAttribute('href')) ?? '';
    expect(href.startsWith('https://wa.me/584121234567?text=')).toBeTruthy();
    const text = decodeURIComponent(href.split('?text=')[1] ?? '');
    expect(text).toContain(`Clinica Copia ${suffix}`);
    expect(text).toContain(lastUrl);
    expect(text).not.toContain(MEDICINE);
    await shoot(page, `enviar-${viewport.name}`);
    await dialog.getByRole('button', { name: 'Cerrar' }).last().click();
    await expect(dialog).toBeHidden();

    // --- 2. El paciente abre la copia, sin sesión, al mismo ancho ---
    await pub.setViewportSize({ width: viewport.width, height: viewport.height });
    const res = await pub.goto(lastUrl);
    expect(res?.headers()['cache-control']).toBe('no-store');
    expect(res?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    await expect(pub.getByRole('heading', { name: 'Receta', exact: true })).toBeVisible({ timeout: 15_000 });
    await expect(pub.getByText(`${MEDICINE} 500 mg`).first()).toBeVisible();
    await expect(pub.getByTestId('prescription-verification-qr')).toBeVisible();
    await expect(pub.getByTestId('prescription-copy-footer')).toHaveText(FOOTER);
    await expect(pub.getByRole('button', { name: 'Imprimir o guardar como PDF' })).toBeVisible();
    await expectNoHorizontalScroll(pub);
    expect(await axeInBothThemes(pub, pub.locator('main'))).toEqual({ light: [], dark: [] });
    await shoot(pub, `copia-${viewport.name}`);
  }

  // --- 3. Por email ---
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${origin}/patients/${patient.id}?tab=prescriptions`);
  const panel = page.locator('#tabpanel-prescriptions');
  await panel.getByRole('button', { name: /^Enviar al paciente/ }).click({ timeout: 15_000 });
  const dialog = page.getByRole('dialog', { name: 'Enviar al paciente' });
  await dialog.getByRole('radio', { name: 'Email' }).click();
  await dialog.getByRole('button', { name: 'Enviar copia' }).click();
  await expect(dialog.getByText('Copia enviada a yu***@example.com')).toBeVisible();
  await dialog.getByRole('button', { name: 'Cerrar' }).last().click();
  // El reenvío por email invalida el enlace de WhatsApp anterior.
  await pub.goto(lastUrl);
  await expect(pub.getByRole('heading', { level: 1, name: 'Este enlace no es válido' })).toBeVisible({
    timeout: 15_000,
  });

  // --- 4. Anulada después del envío ---
  await panel.getByRole('button', { name: /^Enviar al paciente/ }).click();
  await dialog.getByRole('button', { name: 'Enviar copia' }).click();
  lastUrl = await dialog.getByLabel('Enlace de la copia').inputValue();
  await dialog.getByRole('button', { name: 'Cerrar' }).last().click();
  await admin.post(`/prescriptions/${rx.id}/void`, { reason: 'Dosis equivocada' });
  for (const viewport of VIEWPORTS) {
    await pub.setViewportSize({ width: viewport.width, height: viewport.height });
    await pub.goto(lastUrl);
    await expect(pub.getByRole('heading', { level: 1, name: 'Esta receta fue anulada' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(pub.getByRole('button', { name: 'Imprimir o guardar como PDF' })).toHaveCount(0);
    expect(await pub.locator('body').innerText()).not.toContain(MEDICINE);
    await expectNoHorizontalScroll(pub);
    await shoot(pub, `anulada-${viewport.name}`);
  }
  // Anulada: la ficha ya no ofrece enviarla.
  await page.reload();
  await expect(panel.getByText('Anulada').first()).toBeVisible({ timeout: 15_000 });
  await expect(panel.getByRole('button', { name: /^Enviar al paciente/ })).toHaveCount(0);
  await visitor.close();
});
