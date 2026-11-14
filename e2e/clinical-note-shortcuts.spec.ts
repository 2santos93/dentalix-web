import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { expectNoHorizontalScroll } from './support/layout';
import { E2E_REGION } from './support/regional';
import { API_URL } from './support/urls';

/**
 * e2e (DX-455): atajos de plantilla y plantilla por procedimiento.
 *
 * El dueño de la clínica (ADMIN, que también atiende), a 1440 px y a 390 px:
 *   1. Por la API: la plantilla «Resina» (una pregunta ONE) recibe el atajo
 *      `#resina` (PATCH) y queda ligada al procedimiento «Resina compuesta»;
 *      un plan aceptado con ese procedimiento en el 16.
 *   2. Ajustes → Plantillas de evolución: la lista enseña `#resina`; en
 *      «Profilaxis», `#RESINA` (repetido sin distinguir mayúsculas) y `#re`
 *      (prefijo) dan el 409 de la API junto al campo «Atajo».
 *   3. Ficha → Historia clínica → «Nueva evolución»: teclear `#resina ` abre
 *      las preguntas de la plantilla y «Insertar en el texto» pone el texto
 *      compuesto en lugar del atajo.
 *   4. Ficha → Plan: marcar «Realizado» el ítem abre «Nueva evolución» con
 *      «Resina» ya elegida (sugerida por el procedimiento) y se guarda.
 * Sin scroll horizontal en ninguna de las pantallas. Cada test siembra su
 * propia clínica: no depende de los demás.
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

interface Seeded {
  patientId: string;
  procedureName: string;
}

async function call<T>(
  request: APIRequestContext,
  session: ApiSession,
  method: 'get' | 'patch',
  path: string,
  data?: object,
): Promise<T> {
  const res = await request[method](`${API_URL}${path}`, { headers: session.headers, data });
  expect(res.ok(), `${method.toUpperCase()} ${path} falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as T;
}

async function seed(request: APIRequestContext, admin: ApiSession, tag: string): Promise<Seeded> {
  const resin = await apiPost<{ id: string; version: number }>(request, admin, '/clinical-note-templates', {
    name: 'Resina',
    category: 'Operatoria',
    body: 'Resina en superficie {{Superficie}}.',
    prompts: [{ label: 'Superficie', type: 'ONE', options: ['O', 'M', 'D'] }],
  });
  const withShortcut = await call<{ shortcut: string | null }>(
    request,
    admin,
    'patch',
    `/clinical-note-templates/${resin.id}`,
    { version: resin.version, shortcut: '#resina' },
  );
  expect(withShortcut.shortcut).toBe('#resina');
  await apiPost(request, admin, '/clinical-note-templates', {
    name: 'Profilaxis',
    body: 'Profilaxis con ultrasonido.',
    prompts: [],
  });

  const procedureName = `Resina compuesta ${tag}`;
  const procedure = await apiPost<{ id: string; suggestedClinicalNoteTemplateId: string | null }>(
    request,
    admin,
    '/catalog/items',
    {
      code: `RC${tag}`.slice(0, 20),
      kind: 'PROCEDURE',
      labelEs: procedureName,
      color: '#3366CC',
      defaultPrice: 100,
      clinicalNoteTemplateId: resin.id,
    },
  );
  expect(procedure.suggestedClinicalNoteTemplateId).toBe(resin.id);

  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Atajo',
    lastName: `Paciente${tag}`,
    docType: 'NATIONAL_ID',
    docNumber: `AT${tag}`.slice(0, 20),
    sex: 'F',
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: E2E_REGION.currency,
  });
  await apiPost(request, admin, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: procedure.id,
  });
  await call(request, admin, 'patch', `/treatment-plans/${plan.id}`, { status: 'ACCEPTED' });
  return { patientId: patient.id, procedureName };
}

for (const viewport of VIEWPORTS) {
  test(`atajo #resina y plantilla sugerida al marcar hecho (${viewport.name})`, async ({ page }) => {
    test.setTimeout(150_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const email = `test.user.shortcuts.${tag}@example.com`;
    const admin = await registerClinicViaApi(page.request, {
      subdomain: `test-clinic-shortcuts-${tag}`,
      clinicName: `Clinica Atajos ${tag}`,
      fullName: 'Dra. Ana Atajos',
      email,
      password,
    });
    const data = await seed(page.request, admin, tag);
    await loginAs(page, admin.origin, email, password);

    // --- 2. Ajustes: el atajo en la lista y los 409 junto al campo -----------
    await page.goto(`${admin.origin}/settings/plantillas-de-evolucion`);
    await expect(page.getByText('#resina').locator('visible=true').first()).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Acciones de Profilaxis' }).click();
    await page.getByRole('menuitem', { name: 'Editar' }).click();
    const form = page.getByRole('dialog', { name: 'Editar plantilla de evolución' });
    const shortcut = form.getByLabel('Atajo');
    await expect(form.getByText('Opcional. Empieza por #, sin espacios. Ej.: #resina')).toBeVisible();

    await shortcut.fill('#RESINA');
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(form.getByText('El atajo #RESINA ya lo usa la plantilla «Resina».')).toBeVisible();
    await expect(shortcut).toHaveAttribute('aria-invalid', 'true');
    await expect(shortcut).toBeFocused();

    await shortcut.fill('#re');
    await form.getByRole('button', { name: 'Guardar cambios' }).click();
    await expect(form.getByText(/El atajo #re choca con #resina/)).toBeVisible();
    await expectNoHorizontalScroll(page);
    await form.getByRole('button', { name: 'Cancelar' }).click();
    await expect(form).toBeHidden();

    // --- 3. Ficha → Historia clínica: `#resina ` en una evolución nueva -------
    await page.goto(`${admin.origin}/patients/${data.patientId}?tab=clinical-history`);
    await page.getByRole('button', { name: 'Nueva evolución' }).click();
    const fromRecord = page.getByRole('dialog', { name: 'Nueva evolución' });
    await expect(fromRecord.getByRole('radio', { name: /Resina/ })).toBeVisible({ timeout: 15_000 });
    const notes = fromRecord.getByLabel('Texto de la evolución');
    await notes.pressSequentially('Pieza 16: #resina ');
    const questions = fromRecord.getByRole('group', { name: 'Preguntas de «Resina»' });
    await expect(questions).toBeVisible();
    await questions.getByRole('radio', { name: 'O', exact: true }).check();
    await expectNoHorizontalScroll(page);
    await questions.getByRole('button', { name: 'Insertar en el texto' }).click();
    const inserted = 'Pieza 16: Resina en superficie O.';
    await expect(notes).toHaveValue(inserted);
    await expect(questions).toBeHidden();
    await fromRecord.getByRole('button', { name: 'Guardar evolución' }).click();
    await expect(fromRecord).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText(inserted).locator('visible=true')).toBeVisible();

    // --- 4. Ficha → Plan: marcar realizado abre la evolución con la plantilla --
    await page.goto(`${admin.origin}/patients/${data.patientId}?tab=treatment-plans`);
    const status = page.getByLabel('Estado del ítem del diente 16').locator('visible=true');
    await expect(status).toHaveValue('ACCEPTED', { timeout: 15_000 });
    await status.selectOption({ label: 'Realizado' });
    const markDone = page.getByRole('dialog', { name: 'Marcar como realizado' });
    // La única que atiende es la dueña: viene elegida.
    await expect(markDone.getByLabel('Profesional que lo realizó')).not.toHaveValue('');
    await markDone.getByRole('button', { name: 'Marcar realizado' }).click();
    await expect(markDone).toBeHidden({ timeout: 10_000 });

    const suggested = page.getByRole('dialog', { name: 'Nueva evolución' });
    await expect(suggested.getByRole('button', { name: 'Cambiar la plantilla «Resina»' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(suggested.getByText(`Sugerida por el procedimiento «${data.procedureName}».`, { exact: false })).toBeVisible();
    await suggested.getByRole('radio', { name: 'M', exact: true }).check();
    await expect(suggested.getByLabel('Texto de la evolución')).toHaveValue('Resina en superficie M.');
    await expectNoHorizontalScroll(page);
    await suggested.getByRole('button', { name: 'Guardar evolución' }).click();
    await expect(suggested).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText('Evolución guardada en la historia clínica.')).toBeVisible();
    await expect(status).toHaveValue('DONE');
  });
}
