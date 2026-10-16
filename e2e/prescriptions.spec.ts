import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin, sessionCookie } from './support/auth';
import { API_URL } from './support/urls';

/**
 * e2e (DX-013): recetas.
 *
 *   1. Ficha → «Recetas» (vacía) → «Nueva receta»: el ADMIN aún no tiene
 *      registro profesional y lo introduce en el modal; el paciente es alérgico
 *      a la penicilina y se prescribe amoxicilina → alerta bloqueante hasta
 *      confirmar → emitir.
 *   2. «Ver e imprimir» abre la vista A4 en otra pestaña con los campos
 *      legales; el PDF sale en UNA sola hoja.
 *   3. «Anular» con motivo → la fila queda tachada con quién/cuándo/motivo.
 *   4. A 390px no hay scroll horizontal de página.
 *   5. Recepción no ve la pestaña y la API le responde 403.
 *
 * Requiere API y web levantadas (ver playwright.config.ts y support/urls.ts).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `test-clinic-rx-${suffix}`;
const email = `test.user.rx.${suffix}@example.com`;
const receptionEmail = `test.reception.rx.${suffix}@example.com`;
const password = 'Password123!';

function api(request: APIRequestContext, origin: string, token?: string) {
  const headers: Record<string, string> = { 'X-Tenant-Host': new URL(origin).host };
  if (token) headers.Authorization = `Bearer ${token}`;
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

test('emitir con alerta de alergia, imprimir en A4, anular; recepción sin pestaña', async ({
  page,
  browser,
}) => {
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName: `Clinica Recetas ${suffix}`,
    fullName: 'Dra Recetas',
    email,
    password,
  });
  const token = await accessTokenOf(page);
  const admin = api(page.request, origin, token);
  const patient = await admin.post<{ id: string }>('/patients', {
    firstName: 'Rosa',
    lastName: `Receta${suffix}`.slice(0, 40),
    docType: 'CC',
    docNumber: `RX${suffix}`.slice(0, 20),
    sex: 'F',
  });
  await admin.put(`/patients/${patient.id}/medical-history`, {
    allergies: [
      { alergeno: 'Penicilina', tipo: 'MEDICAMENTO', severidad: 'ANAFILAXIA', esAlerta: true },
    ],
  });

  // --- 1. Emitir con alerta de alergia ---
  await page.goto(`${origin}/patients/${patient.id}?tab=prescriptions`);
  const panel = page.locator('#tabpanel-prescriptions');
  await expect(panel.getByText('Este paciente no tiene recetas.')).toBeVisible({
    timeout: 15_000,
  });
  await panel.getByRole('button', { name: 'Nueva receta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva receta' });
  await expect(dialog.getByText(/Se emite desde .* \(Colombia\)/)).toBeVisible();
  await dialog.getByLabel('Tu registro profesional').fill('TP-12345');
  await dialog.getByLabel('Principio activo (DCI)').fill('Amoxicilina');
  await dialog.getByLabel('Concentración').fill('500 mg');
  await dialog.getByLabel('Forma farmacéutica').fill('Cápsula');
  await dialog.getByLabel('Vía de administración').fill('Oral');
  await dialog.getByLabel('Dosis').fill('1 cápsula');
  await dialog.getByLabel('Frecuencia').fill('Cada 8 horas');
  await dialog.getByLabel('Duración (días)').fill('7');
  await dialog.getByLabel('Cantidad total').fill('21');
  await dialog.getByLabel('Unidad').fill('cápsulas');

  await expect(dialog.getByText('Alergia registrada en la anamnesis: Penicilina.')).toBeVisible();
  const submit = dialog.getByRole('button', { name: 'Emitir receta' });
  await expect(submit).toBeDisabled();
  await dialog.getByRole('checkbox', { name: /Confirmo que conozco la alergia/ }).check();
  await expect(submit).toBeEnabled();
  await submit.click();
  await expect(dialog).toBeHidden();

  const table = panel.getByRole('table', { name: 'Recetas del paciente' });
  await expect(table).toContainText('Amoxicilina 500 mg · 21 cápsulas');
  await expect(table).toContainText('Alergia confirmada');

  // --- 2. Imprimir: vista A4 en otra pestaña, una sola hoja ---
  await page.context().addInitScript(() => {
    window.print = () => {};
  });
  const [printPage] = await Promise.all([
    page.context().waitForEvent('page'),
    table.getByRole('link', { name: /Ver e imprimir/ }).click(),
  ]);
  await expect(printPage.getByRole('heading', { name: 'Fórmula médica' })).toBeVisible({
    timeout: 15_000,
  });
  await expect(printPage.getByText('21 (veintiuno) cápsulas')).toBeVisible();
  await expect(printPage.getByText('TP-12345')).toBeVisible();
  await expect(printPage.getByText(`RX${suffix}`.slice(0, 20)).first()).toBeVisible();
  await expect(printPage.getByText(/alergia registrada a: Penicilina/)).toBeVisible();
  await printPage.emulateMedia({ media: 'print' });
  await expect(printPage.getByRole('toolbar', { name: 'Acciones de la receta' })).toBeHidden();
  const pdf = (await printPage.pdf({ preferCSSPageSize: true })).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)?.length).toBe(1);
  await printPage.close();

  // --- 3. Anular con motivo ---
  await table.getByRole('button', { name: /^Anular/ }).click();
  const voidDialog = page.getByRole('dialog', { name: 'Anular receta' });
  await voidDialog.getByLabel('Motivo de la anulación').fill('Cambio a clindamicina');
  await voidDialog.getByRole('button', { name: 'Anular receta' }).click();
  await expect(voidDialog).toBeHidden();
  const row = table.locator('tr[data-status="VOIDED"]');
  await expect(row).toContainText('Anulada');
  await expect(row).toContainText('Motivo: Cambio a clindamicina');
  await expect(row.locator('ul.line-through')).toBeVisible();
  await expect(table.getByRole('button', { name: /^Anular/ })).toHaveCount(0);

  // --- 4. Móvil 390px: tarjetas y sin scroll horizontal de página ---
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(panel.getByRole('list', { name: 'Recetas del paciente' })).toBeVisible();
  await panel.getByRole('button', { name: 'Nueva receta' }).click();
  await expect(page.getByRole('dialog', { name: 'Nueva receta' })).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  await page.keyboard.press('Escape');

  // --- 5. Recepción: ni pestaña ni API ---
  const invitation = await admin.post<{ token: string }>('/staff/invitations', {
    fullName: 'Recepción Recetas',
    email: receptionEmail,
    role: 'RECEPTION',
  });
  await api(page.request, origin).post(`/public/invitations/${invitation.token}/accept`, {
    password,
  });
  const receptionContext = await browser.newContext();
  const reception = await receptionContext.newPage();
  await reception.goto(`${origin}/login`);
  await reception.getByLabel('Correo electrónico').fill(receptionEmail);
  await reception.getByLabel('Contraseña', { exact: true }).fill(password);
  await reception.getByRole('button', { name: 'Iniciar sesión' }).click();
  // Desde DX-062 la sesión no deja nada en localStorage: el refresh vive en la
  // cookie HttpOnly del host de la clínica.
  await expect
    .poll(async () => Boolean((await sessionCookie(reception, origin))?.httpOnly), {
      timeout: 15_000,
    })
    .toBe(true);
  await reception.waitForURL(/\/patients$/, { timeout: 15_000 });
  await reception.goto(`${origin}/patients/${patient.id}?tab=prescriptions`);
  await expect(reception.getByRole('tab', { name: 'Datos' })).toHaveAttribute(
    'aria-selected',
    'true',
    { timeout: 15_000 },
  );
  await expect(reception.getByRole('tab', { name: 'Recetas' })).toHaveCount(0);
  const receptionToken = await accessTokenOf(reception);
  const forbidden = await api(reception.request, origin, receptionToken).get(
    `/patients/${patient.id}/prescriptions`,
  );
  expect(forbidden.status()).toBe(403);
  await receptionContext.close();
});
