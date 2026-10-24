import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-300): receta segura. Paciente con warfarina en la medicación
 * habitual; al recetar ibuprofeno el modal enseña el aviso bloqueante que
 * calcula el servidor, con el descargo de «no sustituye el juicio clínico».
 * A 390 y 1440 px, en claro y en oscuro: sin scroll horizontal y con el aviso
 * visible. Se emite solo con confirmación y motivo, que quedan en la receta.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `test-clinic-rxs-${suffix}`;

function api(request: APIRequestContext, origin: string, token: string) {
  const headers = { 'X-Tenant-Host': new URL(origin).host, Authorization: `Bearer ${token}` };
  return {
    async post<T>(path: string, data: object): Promise<T> {
      const res = await request.post(`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
    async put(path: string, data: object): Promise<void> {
      const res = await request.put(`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `PUT ${path} falló: ${await res.text()}`).toBeTruthy();
    },
    get: (path: string) => request.get(`${API_URL}${path}`, { headers }),
  };
}

test('receta con aviso bloqueante (warfarina + ibuprofeno): 390/1440, claro/oscuro, emite con motivo', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName: `Clinica Receta Segura ${suffix}`,
    fullName: 'Dra Segura',
    email: `test.user.rxs.${suffix}@example.com`,
    password: 'Password123!',
  });
  const token = await accessTokenOf(page);
  const admin = api(page.request, origin, token);
  const patient = await admin.post<{ id: string }>('/patients', {
    firstName: 'Wanda',
    lastName: `Segura${suffix}`.slice(0, 40),
    docType: 'CC',
    docNumber: `RXS${suffix}`.slice(0, 20),
    birthDate: '1970-01-01',
    sex: 'F',
  });
  await admin.put(`/patients/${patient.id}/medical-history`, {
    medications: [{ nombre: 'Warfarina 5 mg', esAlerta: true }],
  });

  await page.goto(`${origin}/patients/${patient.id}?tab=prescriptions`);
  const panel = page.locator('#tabpanel-prescriptions');
  await expect(panel.getByText('Este paciente no tiene recetas.')).toBeVisible({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'Nueva receta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva receta' });
  await expect(dialog.getByText(/Se emite desde/)).toBeVisible();
  await dialog.getByLabel('Tu registro profesional').fill('TP-300');
  await dialog.getByLabel('Principio activo (DCI)').fill('Ibuprofeno');
  await dialog.getByLabel('Concentración').fill('400 mg');
  await dialog.getByLabel('Forma farmacéutica').fill('Comprimido');
  await dialog.getByLabel('Vía de administración').fill('Oral');
  await dialog.getByLabel('Dosis').fill('1 comprimido');
  await dialog.getByLabel('Frecuencia').fill('Cada 8 horas');
  await dialog.getByLabel('Duración (días)').fill('2');
  await dialog.getByLabel('Cantidad total').fill('6');
  await dialog.getByLabel('Unidad').fill('comprimidos');

  const blocking = dialog.getByText('Requieren confirmación (1)');
  await expect(blocking).toBeVisible({ timeout: 15_000 });
  await expect(dialog.getByText(/Interacción grave: el paciente toma Warfarina 5 mg/)).toBeVisible();
  await expect(dialog.getByText(/no sustituye tu juicio clínico/)).toBeVisible();
  const submit = dialog.getByRole('button', { name: 'Emitir receta' });
  await expect(submit).toBeDisabled();

  for (const width of [390, 1440]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await blocking.scrollIntoViewIfNeeded();
      await expect(blocking).toBeVisible();
      await expectNoHorizontalScroll(page);
      const box = await dialog.boundingBox();
      expect(box, `${width}/${colorScheme}: diálogo`).not.toBeNull();
      expect(box!.x + box!.width, `${width}/${colorScheme}: borde derecho`).toBeLessThanOrEqual(width);
      await page.screenshot({ path: test.info().outputPath(`receta-segura-${width}-${colorScheme}.png`) });
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });

  await dialog.getByRole('checkbox', { name: /Confirmo que conozco los avisos/ }).check();
  await dialog.getByLabel('Motivo para emitir pese a los avisos').fill('INR estable; pauta de 2 días');
  await submit.click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByText('Ibuprofeno 400 mg · 6 comprimidos').first()).toBeVisible();

  const list = await admin.get(`/patients/${patient.id}/prescriptions`);
  const [rx] = (await list.json()) as {
    safetyOverrideReason: string | null;
    safetyAlerts: { code: string; severity: string }[];
  }[];
  expect(rx.safetyOverrideReason).toBe('INR estable; pauta de 2 días');
  expect(rx.safetyAlerts).toEqual([
    expect.objectContaining({ code: 'INTERACTION_ANTICOAGULANT_NSAID', severity: 'BLOCKING' }),
  ]);
});
