import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { expectDialogInsideViewport, expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-456): «Copia de la historia clínica» desde la ficha, a 1440 y 390 px.
 *
 *   1. Siembra por la API una evolución de hoy con dos adendas.
 *   2. Historia clínica → «Copia de la historia clínica» → período por
 *      defecto (1 de enero a hoy), todas las secciones y «Entregado a» →
 *      «Generar e imprimir».
 *   3. La vista imprimible: cabecera con clínica, sede, paciente, período y
 *      fecha de generación; la evolución con sus adendas en orden; ningún id
 *      interno; en `media: print` solo el documento, «Página X de Y» en la
 *      regla `@page` y el PDF en A4 y en Carta.
 *   4. De vuelta en la ficha, la generación aparece en el listado con
 *      «Entregada a …» y «Volver a imprimir».
 *
 * `window.print` se neutraliza: el diálogo del navegador no se abre en CI.
 * Con E2E_QA_DIR definido guarda capturas.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const QA_DIR = process.env.E2E_QA_DIR;
const NOTES = 'Exodoncia del 38 sin complicaciones';
const ADDENDUM_1 = 'Se indica control a los siete días.';
const ADDENDUM_2 = 'El paciente refiere evolución favorable.';
const DELIVERED_TO = 'Carmen Rondón (madre)';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'movil', width: 390, height: 844 },
];

async function shoot(page: Page, name: string): Promise<void> {
  if (!QA_DIR) return;
  await mkdir(QA_DIR, { recursive: true });
  await page.screenshot({ path: join(QA_DIR, `dx456-${name}.png`), fullPage: true });
}

async function seed(request: APIRequestContext, origin: string, accessToken: string, tag: string) {
  const headers = { Authorization: `Bearer ${accessToken}`, 'X-Tenant-Host': new URL(origin).host };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Mariela',
    lastName: `Rondon${tag}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `V${tag}`.slice(0, 12),
    sex: 'F',
    birthDate: '1985-06-20',
  });
  const entry = await post<{ id: string }>(`/patients/${patient.id}/clinical-entries`, {
    reason: 'Dolor en el 38',
    notes: NOTES,
  });
  for (const text of [ADDENDUM_1, ADDENDUM_2]) {
    await post(`/patients/${patient.id}/clinical-entries/${entry.id}/addenda`, {
      reason: 'Seguimiento de la exodoncia',
      text,
    });
  }
  return { patientId: patient.id, entryId: entry.id };
}

for (const viewport of VIEWPORTS) {
  test(`copia de la historia clínica: generar, imprimir y verla en el listado (${viewport.name})`, async ({
    page,
    context,
  }) => {
    test.setTimeout(150_000);
    await context.addInitScript(() => {
      window.print = () => undefined;
    });
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-copy-${tag}`,
      clinicName: `Clinica Copias ${tag}`,
      fullName: 'Andreina Salazar',
      email: `test.user.copy.${tag}@example.com`,
      password,
    });
    const seeded = await seed(page.request, origin, await accessTokenOf(page), tag);

    // --- 1. Ficha → historia clínica → diálogo ---
    await page.goto(`${origin}/patients/${seeded.patientId}?tab=clinical-history`);
    const section = page.getByRole('region', { name: 'Copias de la historia clínica' });
    await expect(section.getByText('Aún no se ha generado ninguna copia')).toBeVisible({ timeout: 20_000 });
    await section.getByRole('button', { name: 'Copia de la historia clínica' }).click();
    const dialog = page.getByRole('dialog', { name: 'Copia de la historia clínica' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('checkbox', { name: 'Todas las secciones' })).toBeChecked();
    await expectDialogInsideViewport(page, dialog);
    await dialog.getByLabel('Entregado a (opcional)').fill(DELIVERED_TO);
    await shoot(page, `dialogo-${viewport.name}`);
    await dialog.getByRole('button', { name: 'Generar e imprimir' }).click();

    // --- 2. Vista imprimible ---
    await expect(page).toHaveURL(new RegExp(`/print/patients/${seeded.patientId}/clinical-record-copies/[0-9a-f-]{36}$`), {
      timeout: 20_000,
    });
    const copyId = page.url().split('/').pop()!;
    const header = page.getByTestId('copy-header');
    await expect(header).toBeVisible({ timeout: 20_000 });
    await expect(header).toContainText(`Clinica Copias ${tag}`);
    await expect(header).toContainText('Sede');
    await expect(page.getByTestId('copy-patient')).toContainText('Mariela');
    await expect(page.getByTestId('copy-period')).toContainText(/01\/01\/\d{4} al \d{2}\/\d{2}\/\d{4}/);
    await expect(page.getByTestId('copy-generated')).not.toHaveText('—');
    await expect(header).toContainText(DELIVERED_TO);
    const evolution = page.getByTestId('copy-evolution');
    await expect(evolution).toHaveCount(1);
    await expect(evolution).toContainText(NOTES);
    const addenda = evolution.getByTestId('copy-addendum');
    await expect(addenda).toHaveCount(2);
    await expect(addenda.nth(0)).toContainText(ADDENDUM_1);
    await expect(addenda.nth(1)).toContainText(ADDENDUM_2);
    // Las secciones elegidas sin registros lo dicen.
    await expect(page.getByTestId('copy-section-PRESCRIPTIONS')).toContainText('Sin registros en el período.');
    // Ningún id interno en el documento.
    const body = (await page.locator('.clinical-record-print-root').textContent()) ?? '';
    for (const id of [seeded.patientId, seeded.entryId, copyId]) expect(body).not.toContain(id);
    if (viewport.width === 390) await expectNoHorizontalScroll(page);
    await shoot(page, `vista-${viewport.name}`);

    // En papel: solo el documento, la página con nombre y «Página X de Y».
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('toolbar', { name: 'Acciones de la copia' })).toBeHidden();
    const pageRule = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('page').trim());
    expect(pageRule).toBe('clinical-record');
    const pageStyle = (await page.getByTestId('copy-page-style').textContent()) ?? '';
    expect(pageStyle).toContain('counter(pages)');
    expect(pageStyle).toContain('Mariela');
    if (viewport.width === 1440) {
      for (const format of ['A4', 'Letter'] as const) {
        const pdf = await page.pdf({ format, preferCSSPageSize: true });
        expect(pdf.byteLength).toBeGreaterThan(1_000);
      }
    }
    await page.emulateMedia({ media: 'screen' });

    // --- 3. De vuelta en la ficha: la generación en el listado ---
    await page.getByRole('link', { name: 'Volver a la ficha' }).click();
    await expect(page).toHaveURL(new RegExp(`/patients/${seeded.patientId}\\?tab=clinical-history`));
    const row = page.getByRole('region', { name: 'Copias de la historia clínica' }).getByTestId('clinical-record-copy');
    await expect(row).toHaveCount(1, { timeout: 20_000 });
    await expect(row).toContainText('Todas las secciones');
    await expect(row).toContainText(`Entregada a ${DELIVERED_TO}`);
    await expect(row).toContainText('Andreina Salazar');
    await expect(row.getByRole('link', { name: /Volver a imprimir/ })).toHaveAttribute(
      'href',
      `/print/patients/${seeded.patientId}/clinical-record-copies/${copyId}`,
    );
    await expectNoHorizontalScroll(page);
    await shoot(page, `listado-${viewport.name}`);
  });
}
