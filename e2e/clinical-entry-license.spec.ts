import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { API_URL } from './support/urls';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { openPatientTab } from './support/patient-tabs';
import { axeViolations } from './support/axe';
import { expectDialogInsideViewport, expectNoHorizontalOverflowInDialog } from './support/layout';

/**
 * DX-540: aviso de registro profesional al firmar una evolución.
 *
 * Con la API y la base reales: el ADMIN (sin registro) activa el aviso en
 * Ajustes › Historia clínica; «Nueva evolución» lo avisa ANTES de guardar
 * (con enlace a su ficha de Personal) y, al guardar, el toast trae el aviso
 * del servidor. Con registro ya no hay aviso y la evolución muestra
 * «Reg. prof.». A 390 px y a 1440 px el aviso cabe sin desbordar el modal.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinic = {
  clinicName: `Clinica Registro ${suffix}`,
  subdomain: `test-dx540-${suffix}`.slice(0, 40),
  fullName: 'Dra. Registro',
  email: `admin.dx540.${suffix}@example.com`,
  password: 'Password123!',
};
const license = `RP-${suffix.slice(0, 8).toUpperCase()}`;

function userIdOf(session: ApiSession): string {
  const token = session.headers.Authorization.replace('Bearer ', '');
  return (JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as { sub: string }).sub;
}

async function openNewEvolution(page: Page) {
  const evolutions = page.locator('section', { hasText: 'Evoluciones' });
  await evolutions.getByRole('button', { name: 'Nueva evolución' }).first().click();
  const dialog = page.getByRole('dialog', { name: 'Nueva evolución' });
  await expect(dialog).toBeVisible();
  // Las plantillas cargan; el texto libre ya se puede escribir.
  await expect(dialog.getByRole('status', { name: 'Cargando plantillas' })).toHaveCount(0, { timeout: 10_000 });
  return dialog;
}

test('aviso de registro profesional: antes y después de firmar, y «Reg. prof.» con registro', async ({
  page,
  request,
}) => {
  const session = await registerClinicViaApi(request, clinic);
  const patient = await apiPost<{ id: string }>(request, session, '/patients', {
    firstName: 'Lucía',
    lastName: `Registro${suffix}`.slice(0, 40),
    docType: 'NATIONAL_ID',
    docNumber: `DX540${suffix}`.slice(0, 20),
    sex: 'F',
  });

  await loginAs(page, session.origin, clinic.email, clinic.password);

  // --- El ADMIN activa el aviso (de fábrica está desactivado) ---
  await page.goto(`${session.origin}/settings/historia-clinica`);
  const toggle = page.getByRole('switch', { name: /avisar al firmar una evolución sin registro profesional/i });
  await expect(toggle).not.toBeChecked();
  await toggle.click();
  await expect(page.getByText('Aviso de registro profesional activado.')).toBeVisible();
  await expect(toggle).toBeChecked();

  // --- Sin registro: aviso previo en el modal (390 px) ---
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${session.origin}/patients/${patient.id}`);
  await openPatientTab(page, 'Historia clínica');
  let dialog = await openNewEvolution(page);
  const notice = dialog.getByRole('status').filter({ hasText: 'Vas a firmar sin registro profesional' });
  await expect(notice).toBeVisible();
  const link = notice.getByRole('link', { name: /cargar mi registro en personal/i });
  await expect(link).toHaveAttribute('href', `/staff/${userIdOf(session)}`);
  await expect(link).toHaveAttribute('target', '_blank');
  await expectDialogInsideViewport(page, dialog);
  await expectNoHorizontalOverflowInDialog(dialog);
  expect(await axeViolations(page, notice)).toEqual([]);

  // Guardar no se bloquea; el aviso del servidor llega en un toast.
  await dialog.getByLabel('Texto de la evolución').fill(`Sin registro ${suffix}`);
  await dialog.getByRole('button', { name: 'Guardar evolución' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('Evolución guardada sin registro profesional')).toBeVisible();
  // A 390 px se ve la tarjeta de móvil (la tabla está oculta).
  await expect(page.getByText(`Sin registro ${suffix}`).filter({ visible: true })).toBeVisible();

  // --- Con registro (lo carga el ADMIN en Personal): sin aviso y «Reg. prof.» (1440 px) ---
  const patch = await request.patch(`${API_URL}/staff/${userIdOf(session)}`, {
    headers: session.headers,
    data: { professionalLicense: license },
  });
  expect(patch.ok(), await patch.text()).toBeTruthy();

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await openPatientTab(page, 'Historia clínica');
  dialog = await openNewEvolution(page);
  await expect(dialog.getByText('Vas a firmar sin registro profesional')).toHaveCount(0);
  await expectDialogInsideViewport(page, dialog);
  await dialog.getByLabel('Texto de la evolución').fill(`Con registro ${suffix}`);
  await dialog.getByRole('button', { name: 'Guardar evolución' }).click();
  await expect(dialog).toBeHidden();

  const table = page.getByRole('table', { name: 'Evoluciones del paciente' });
  const signedRow = table.getByRole('row').filter({ hasText: `Con registro ${suffix}` });
  await expect(signedRow.getByText(`Reg. prof. ${license}`)).toBeVisible();
  // La evolución firmada antes sigue sin registro: la foto es la del momento de firmar.
  const earlierRow = table.getByRole('row').filter({ hasText: `Sin registro ${suffix}` });
  await expect(earlierRow.getByText(/Reg\. prof\./)).toHaveCount(0);
});
