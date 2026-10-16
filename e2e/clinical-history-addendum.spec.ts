import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';

/**
 * e2e (DX-038): historia clínica inalterable + adendas de corrección.
 *
 * Registra una clínica (su dueño es ADMIN, rol clínico) y, por la API real,
 * crea un paciente con una evolución. En la ficha, pestaña «Historia clínica»:
 *   - la evolución no ofrece editar ni borrar; sí «Añadir adenda»;
 *   - el modal valida el motivo (mínimo 10 caracteres) y el texto;
 *   - al guardar, la adenda aparece debajo del original intacto, con motivo,
 *     autor y fecha, y sigue ahí tras recargar;
 *   - la API responde 405 en español, remitiendo a la adenda, a quien intente
 *     editar la evolución.
 * En escritorio (1440px) y móvil (390px, sin scroll horizontal).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const adminName = 'Ana Adenda';
const ORIGINAL_NOTES = 'Resina oclusal en 46 sin complicaciones';
const ADDENDUM_REASON = 'Pieza dental mal transcrita';
const ADDENDUM_TEXT = 'La resina fue en la 36, no en la 46.';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

interface Seeded {
  patientId: string;
  entryId: string;
  headers: Record<string, string>;
}

async function seed(
  request: APIRequestContext,
  origin: string,
  accessToken: string,
  lastName: string,
  tag: string,
): Promise<Seeded> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Elena',
    lastName,
    docType: 'CC',
    docNumber: `AD${tag}`.slice(0, 20),
    sex: 'F',
  });
  const entry = await post<{ id: string }>(`/patients/${patient.id}/clinical-entries`, {
    reason: 'Operatoria',
    notes: ORIGINAL_NOTES,
  });
  return { patientId: patient.id, entryId: entry.id, headers };
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

for (const viewport of VIEWPORTS) {
  test(`corrige una evolución con una adenda sin tocar el original (${viewport.name})`, async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const lastName = `Adenda${tag}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-addendum-${tag}`,
      clinicName: `Clinica Adendas ${tag}`,
      fullName: adminName,
      email: `test.user.addendum.${tag}@example.com`,
      password,
    });
    const seeded = await seed(page.request, origin, await accessTokenOf(page), lastName, tag);

    // La API no deja editar la evolución: 405 en español que remite a la adenda.
    const patch = await page.request.patch(
      `${API_URL}/patients/${seeded.patientId}/clinical-entries/${seeded.entryId}`,
      { headers: seeded.headers, data: { notes: 'alterado' } },
    );
    expect(patch.status()).toBe(405);
    expect(await patch.text()).toContain('adenda');

    await page.goto(`${origin}/patients/${seeded.patientId}`);
    const tab = page.getByRole('tab', { name: 'Historia clínica' });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');

    const original = page.getByText(ORIGINAL_NOTES).locator('visible=true');
    await expect(original).toBeVisible({ timeout: 15_000 });
    // Ninguna acción de editar o borrar sobre la evolución.
    await expect(
      page.getByRole('button', { name: /editar evolución|borrar|eliminar evolución/i }),
    ).toHaveCount(0);

    const addButton = page
      .getByRole('button', { name: /Añadir adenda a la evolución del/ })
      .locator('visible=true');
    await expect(addButton).toHaveCount(1);
    await addButton.click();

    const dialog = page.getByRole('dialog', { name: 'Añadir adenda' });
    await expect(dialog).toBeVisible();
    // Validación en español, sin llamar a la API.
    await dialog.getByLabel('Motivo de la corrección').fill('corto');
    await dialog.getByRole('button', { name: 'Guardar adenda' }).click();
    await expect(dialog.getByText('El motivo debe tener al menos 10 caracteres.')).toBeVisible();
    await expect(dialog.getByText('Escribe el texto de la adenda.')).toBeVisible();
    await expectNoHorizontalScroll(page);

    await dialog.getByLabel('Motivo de la corrección').fill(ADDENDUM_REASON);
    await dialog.getByLabel('Texto de la adenda').fill(ADDENDUM_TEXT);
    await dialog.getByRole('button', { name: 'Guardar adenda' }).click();
    await expect(dialog).toBeHidden({ timeout: 10_000 });

    const addenda = page
      .getByRole('list', { name: /Adendas de la evolución del/ })
      .locator('visible=true');
    await expect(addenda.getByText(ADDENDUM_TEXT)).toBeVisible();
    await expect(addenda.getByText(`Motivo: ${ADDENDUM_REASON}`)).toBeVisible();
    await expect(addenda.getByText(new RegExp(`^${adminName} · `))).toBeVisible();
    // El original sigue intacto.
    await expect(original).toBeVisible();
    await expectNoHorizontalScroll(page);

    // Persistió en el servidor: tras recargar sigue debajo del original.
    await page.reload();
    await page.getByRole('tab', { name: 'Historia clínica' }).click();
    await expect(
      page
        .getByRole('list', { name: /Adendas de la evolución del/ })
        .locator('visible=true')
        .getByText(ADDENDUM_TEXT),
    ).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(ORIGINAL_NOTES).locator('visible=true')).toBeVisible();
  });
}
