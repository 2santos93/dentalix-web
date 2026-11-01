import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';

/**
 * e2e (DX-039): retención de la historia clínica.
 *
 * Registra una clínica (su dueño es ADMIN) y, por la API real, crea un
 * paciente con una evolución (queda en retención 15 años) y otro sin
 * atenciones. En la ficha:
 *   - el badge «Historia en retención hasta DD/MM/AAAA» con la fecha que
 *     calcula la API;
 *   - «Archivar paciente» responde 409 y el modal lo dice en español;
 *   - el paciente sin atenciones se archiva y la app vuelve al listado;
 *   - DX-461: antes, el diálogo avisa «Se anulará 1 enlace enviado» (su
 *     anamnesis) y, archivado, el enlace público responde 410.
 * En escritorio (1440px) y móvil (390px, sin scroll horizontal).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

function ddmmyyyy(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
}

/** «Archivar paciente» está en el menú «⋯» («Más acciones») de la cabecera de la ficha. */
async function openArchive(page: Page) {
  await page.getByRole('button', { name: 'Más acciones' }).click();
  await page.getByRole('menuitem', { name: 'Archivar paciente' }).click();
}

for (const viewport of VIEWPORTS) {
  test(`retención: badge, 409 en español al archivar y archivo sin atenciones (${viewport.name})`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-retention-${tag}`,
      clinicName: `Clinica Retencion ${tag}`,
      fullName: 'Rita Retención',
      email: `test.user.retention.${tag}@example.com`,
      password,
    });
    const headers = {
      Authorization: `Bearer ${await accessTokenOf(page)}`,
      'X-Tenant-Host': new URL(origin).host,
    };
    async function post<T>(path: string, data: object): Promise<T> {
      const res = await page.request.post(`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    }
    const retained = await post<{ id: string }>('/patients', {
      firstName: 'Rosa',
      lastName: `Retenida${tag}`,
      docType: 'NATIONAL_ID',
      docNumber: `RT${tag}`.slice(0, 20),
      sex: 'F',
    });
    await post(`/patients/${retained.id}/clinical-entries`, { notes: 'Control semestral' });
    const free = await post<{ id: string }>('/patients', {
      firstName: 'Duplicado',
      lastName: `Libre${tag}`,
      docType: 'NATIONAL_ID',
      docNumber: `LB${tag}`.slice(0, 20),
      sex: 'M',
    });
    const detail = await page.request.get(`${API_URL}/patients/${retained.id}`, { headers });
    const { retentionUntil } = (await detail.json()) as { retentionUntil: string };
    const until = ddmmyyyy(retentionUntil);

    await page.goto(`${origin}/patients/${retained.id}`);
    const section = page.getByRole('region', {
      name: 'Retención de la historia clínica',
    });
    await expect(section.getByText(`Historia en retención hasta ${until}`)).toBeVisible({
      timeout: 15_000,
    });
    await expectNoHorizontalScroll(page);

    // Las acciones de ADMIN viven en el menú «⋯» de la cabecera (UX v2 · K3).
    await openArchive(page);
    const dialog = page.getByRole('dialog', { name: 'Archivar paciente' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Archivar' }).click();
    await expect(
      dialog.getByText(`está en retención hasta el ${until}`, { exact: false }),
    ).toBeVisible({ timeout: 10_000 });
    await expectNoHorizontalScroll(page);
    await dialog.getByRole('button', { name: 'Cancelar' }).click();
    await expect(dialog).toBeHidden();

    // DX-461: con un enlace enviado (la anamnesis), el diálogo avisa de que
    // se anulará; al archivar, la ruta pública ya no lo acepta.
    // El enlace de anamnesis exige la política de datos publicada.
    await post('/privacy-policies', {
      policyText: 'Política de tratamiento de datos de la clínica.',
      generalText: 'Autorizo el tratamiento de mis datos personales.',
      sensitiveHealthText:
        'Autorizo el tratamiento de mis datos sensibles de salud (historia clínica). No está obligado a autorizarlo. Finalidad: la atención odontológica.',
      marketingText: 'Autorizo recibir comunicaciones comerciales.',
    });
    const sent = await post<{ url: string }>(`/patients/${free.id}/medical-history/requests`, {});
    const anamnesisToken = new URL(sent.url).pathname.split('/').pop() ?? '';

    // Sin atenciones clínicas: se archiva como siempre y vuelve al listado.
    await page.goto(`${origin}/patients/${free.id}`);
    await expect(
      section.getByText('Sin atenciones clínicas: sin retención'),
    ).toBeVisible({ timeout: 15_000 });
    await openArchive(page);
    const archiveDialog = page.getByRole('dialog', { name: 'Archivar paciente' });
    await expect(archiveDialog.getByText('Se anulará 1 enlace enviado')).toBeVisible({
      timeout: 10_000,
    });
    await expect(archiveDialog.getByText('1 cuestionario de salud')).toBeVisible();
    await expectNoHorizontalScroll(page);
    await archiveDialog.screenshot({
      path: test.info().outputPath(`dx461-archivar-${viewport.width}.png`),
    });
    await archiveDialog.getByRole('button', { name: 'Archivar' }).click();
    await expect(page).toHaveURL(/\/patients$/, { timeout: 10_000 });
    const gone = await page.request.get(`${API_URL}/patients/${free.id}`, { headers });
    expect(gone.status()).toBe(404);
    const link = await page.request.get(`${API_URL}/public/medical-history/${anamnesisToken}`, {
      headers: { 'X-Tenant-Host': headers['X-Tenant-Host'] },
    });
    expect(link.status()).toBe(410);
  });
}
