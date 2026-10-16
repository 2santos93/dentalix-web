import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';

/**
 * e2e (DX-007): periodontograma.
 *
 *   1. Ficha → «Periodontograma» (vacío) → «Nuevo examen» → editor en borrador.
 *   2. Captura rápida por teclado (un dígito salta al sitio siguiente),
 *      sangrado con «B», recesión; ≥4 mm en rojo; NIC = sondaje + recesión.
 *   3. «Guardar» → recargar → los valores siguen ahí y el histórico muestra
 *      los índices.
 *   4. «Finalizar examen» (confirmación) → solo lectura.
 *   5. A 390px la rejilla se desplaza dentro de su contenedor, sin scroll
 *      horizontal de página.
 *
 * Requiere API y web levantadas (ver playwright.config.ts y support/urls.ts).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase();
const clinicName = `Clinica Perio ${suffix}`;
const subdomain = `test-clinic-perio-${suffix}`;
const email = `test.user.perio.${suffix}@example.com`;
const password = 'Password123!';
const ownerName = 'Dra Perio';

async function seedPatient(
  request: APIRequestContext,
  origin: string,
  accessToken: string,
): Promise<string> {
  const res = await request.post(`${API_URL}/patients`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'X-Tenant-Host': new URL(origin).host },
    data: {
      firstName: 'Pablo',
      lastName: `Periodontal${suffix}`,
      docType: 'CC',
      docNumber: `PE${suffix}`.slice(0, 20),
      sex: 'M',
    },
  });
  expect(res.ok(), `POST /patients falló: ${await res.text()}`).toBeTruthy();
  return ((await res.json()) as { id: string }).id;
}

test('crear examen, cargar con teclado, guardar, recargar y finalizar', async ({ page }) => {
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName,
    fullName: ownerName,
    email,
    password,
  });
  const accessToken = await accessTokenOf(page);
  expect(accessToken).toBeTruthy();
  const patientId = await seedPatient(page.request, origin, accessToken);

  // --- 1. Pestaña vacía → nuevo examen ---
  await page.goto(`${origin}/patients/${patientId}?tab=perio`);
  const panel = page.locator('#tabpanel-perio');
  await expect(panel.getByText('Este paciente no tiene exámenes periodontales.')).toBeVisible({
    timeout: 15_000,
  });
  await panel.getByRole('button', { name: 'Nuevo examen' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nuevo examen periodontal' });
  await dialog.getByRole('button', { name: 'Crear examen' }).click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByText('Borrador', { exact: true })).toBeVisible();

  // --- 2. Captura rápida ---
  const upper = panel.getByRole('table', { name: 'Arcada superior' });
  await upper.getByRole('textbox', { name: 'Sondaje 16 DB' }).click();
  await page.keyboard.type('536');
  await expect(upper.getByRole('textbox', { name: 'Sondaje 16 DB' })).toHaveValue('5');
  await expect(upper.getByRole('textbox', { name: 'Sondaje 16 B' })).toHaveValue('3');
  await expect(upper.getByRole('textbox', { name: 'Sondaje 16 MB' })).toHaveValue('6');
  await expect(upper.getByRole('textbox', { name: 'Sondaje 15 DB' })).toBeFocused();
  // Volver al 16 MB y marcar sangrado con «B».
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('b');
  await expect(upper.getByRole('button', { name: 'Sangrado 16 MB' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  // Recesión del 16 DB.
  await upper.getByRole('textbox', { name: 'Recesión 16 DB' }).click();
  await page.keyboard.type('2');
  // ≥4 mm en rojo.
  await expect(upper.getByRole('textbox', { name: 'Sondaje 16 DB' })).toHaveAttribute(
    'data-danger',
    'true',
  );
  await expect(upper.getByRole('textbox', { name: 'Sondaje 16 B' })).not.toHaveAttribute(
    'data-danger',
  );
  await expect(panel.getByText('Tienes cambios sin guardar.')).toBeVisible();

  // --- 3. Guardar y recargar ---
  await panel.getByRole('button', { name: 'Guardar' }).click();
  await expect(panel.getByText('Cambios guardados')).toBeVisible();

  await page.reload();
  const table = panel.getByRole('table', { name: 'Histórico de exámenes periodontales' });
  await expect(table).toBeVisible({ timeout: 15_000 });
  // 3 sitios examinados, 1 con sangrado → 33,3 %; dos ≥4 mm y uno ≥6 mm.
  await expect(table).toContainText('33,3 %');
  await expect(table).toContainText('2 / 1');
  await table.getByRole('button', { name: /Abrir examen del/ }).click();
  const reopened = panel.getByRole('table', { name: 'Arcada superior' });
  await expect(reopened.getByRole('textbox', { name: 'Sondaje 16 DB' })).toHaveValue('5');
  await expect(reopened.getByRole('textbox', { name: 'Recesión 16 DB' })).toHaveValue('2');
  // NIC del 16 DB = 5 + 2.
  await expect(reopened.getByRole('row').filter({ hasText: /^NIC/ }).first()).toContainText('7');

  // --- 4. Finalizar → solo lectura ---
  await panel.getByRole('button', { name: 'Finalizar examen' }).click();
  const confirm = page.getByRole('dialog', { name: '¿Finalizar el examen?' });
  await confirm.getByRole('button', { name: 'Finalizar' }).click();
  await expect(panel.getByText(/Examen finalizado: solo lectura/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Guardar' })).toHaveCount(0);
  await expect(reopened.getByRole('textbox', { name: 'Sondaje 16 DB' })).toHaveAttribute(
    'readonly',
    '',
  );

  // --- 5. Móvil 390px: sin scroll horizontal de página ---
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(reopened).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
