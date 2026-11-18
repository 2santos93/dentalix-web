import { test, expect, type APIRequestContext, type BrowserContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { addStaffViaApi, apiLogin, apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { loginAs } from './support/auth';
import { axeViolations } from './support/axe';
import { expectNoHorizontalScroll } from './support/layout';
import { API_URL, tenantOrigin } from './support/urls';

/**
 * e2e DX-574: borradores que sobreviven a un corte de luz o de internet en los
 * cuatro formularios clínicos (evolución, anamnesis, ítem del plan y receta).
 *
 * Una clínica nueva por corrida, con un odontólogo y un paciente por
 * formulario (los recuentos de la API son de ese formulario solo). En cada uno:
 *
 * 1. Sin red: se escribe, `context.setOffline(true)`, «Guardar» → el
 *    formulario sigue abierto con «Sin conexión; se guardó en este
 *    dispositivo»; la API no tiene nada. `setOffline(false)` → se guarda
 *    UNA sola vez (la misma Idempotency-Key): la API cuenta 1 y sigue en 1.
 * 2. Tras recargar: se escribe, se espera al debounce, `page.reload()` →
 *    «Recuperar borrador de las HH:MM»; «Recuperar» rellena y NO crea nada
 *    hasta pulsar «Guardar». El texto nunca está en localStorage ni en
 *    sessionStorage.
 *
 * El aviso sin conexión se revisa con axe a 1440 y 390 px, en claro y en oscuro.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `borradores-${suffix}`.slice(0, 40);
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const admin = { fullName: 'Ana Titular', email: `ana.borradores.${suffix}@example.com` };
const dentist = { fullName: 'Luis Borrador', email: `luis.borradores.${suffix}@example.com` };
const procedureLabel = `Resina DX574 ${suffix}`.slice(0, 40);
const OFFLINE_SAVED = 'Sin conexión; se guardó en este dispositivo.';
const RECOVER = /Recuperar borrador de las \d{2}:\d{2}/;
/** `aria-label` del formulario «Agregar ítem» (`copy.addItemHeading`). */
const ADD_ITEM_HEADING = 'Agregar ítem';
/** Debounce del borrador (800 ms) con margen. */
const AFTER_DEBOUNCE_MS = 1_500;

let session: ApiSession;
const patients: Record<'evolution' | 'anamnesis' | 'plan' | 'prescription', string> = {
  evolution: '',
  anamnesis: '',
  plan: '',
  prescription: '',
};
let planId = '';

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  const owner = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica Borradores ${suffix}`,
    fullName: admin.fullName,
    email: admin.email,
    password,
  });
  await addStaffViaApi(request, owner, { ...dentist, role: 'DENTIST', password });
  session = await apiLogin(request, origin, admin.email, password);
  await apiPost(request, session, '/catalog/items', {
    code: `dx574-${suffix}`.slice(0, 30),
    kind: 'PROCEDURE',
    labelEs: procedureLabel,
    color: '#3366CC',
    defaultPrice: 40,
  });
  for (const key of Object.keys(patients) as (keyof typeof patients)[]) {
    const created = await apiPost<{ id: string }>(request, session, '/patients', {
      firstName: 'Marisol',
      lastName: `Borrador${key}${suffix}`.slice(0, 40),
      docType: 'NATIONAL_ID',
      docNumber: `B${key.slice(0, 3)}${suffix}`.slice(0, 20),
      birthDate: '1985-03-14',
      sex: 'F',
    });
    patients[key] = created.id;
  }
  ({ id: planId } = await apiPost<{ id: string }>(request, session, `/patients/${patients.plan}/treatment-plans`, {
    currency: 'USD',
  }));
});

async function apiGetJson<T>(request: APIRequestContext, path: string): Promise<T | null> {
  const res = await request.get(`${API_URL}${path}`, { headers: session.headers });
  expect(res.ok(), `GET ${path} falló: ${await res.text()}`).toBeTruthy();
  const text = await res.text();
  return text ? (JSON.parse(text) as T) : null;
}

/** Recuentos por la API (no los afecta `context.setOffline`: es otra petición). */
const counts = {
  evolution: async (request: APIRequestContext) =>
    ((await apiGetJson<unknown[]>(request, `/patients/${patients.evolution}/clinical-entries`)) ?? []).length,
  anamnesis: async (request: APIRequestContext) =>
    (await apiGetJson<{ version: number }>(request, `/patients/${patients.anamnesis}/medical-history`))?.version ?? 0,
  plan: async (request: APIRequestContext) =>
    ((await apiGetJson<{ items?: unknown[] }>(request, `/treatment-plans/${planId}`))?.items ?? []).length,
  prescription: async (request: APIRequestContext) =>
    ((await apiGetJson<unknown[]>(request, `/patients/${patients.prescription}/prescriptions`)) ?? []).length,
};

/** Ni localStorage ni sessionStorage guardan nada de lo escrito. */
async function expectNotInWebStorage(page: Page, text: string): Promise<void> {
  const storages = await page.evaluate(() => {
    const dump = (s: Storage) =>
      Array.from({ length: s.length }, (_, i) => `${s.key(i)}=${s.getItem(s.key(i) ?? '')}`).join('\n');
    return `${dump(window.localStorage)}\n${dump(window.sessionStorage)}`;
  });
  expect(storages).not.toContain(text);
}

/** El aviso sin conexión, sin violaciones de axe y sin scroll horizontal, en claro y oscuro. */
async function auditOfflineNotice(page: Page, scope: Locator): Promise<void> {
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme });
    expect(await axeViolations(page, scope)).toEqual([]);
  }
  await page.emulateMedia({ colorScheme: 'light' });
  await expectNoHorizontalScroll(page);
}

/**
 * Sin red: «Guardar» no cierra ni pierde nada; al volver la red se guarda una
 * sola vez. `form` es el diálogo o la sección del formulario.
 */
async function saveWhileOffline(
  page: Page,
  context: BrowserContext,
  opts: { form: Locator; save: () => Promise<void>; count: () => Promise<number>; before: number; audit?: boolean },
): Promise<void> {
  await context.setOffline(true);
  await opts.save();
  const notice = opts.form.getByRole('status').filter({ hasText: OFFLINE_SAVED });
  await expect(notice).toBeVisible({ timeout: 10_000 });
  await expect(notice).toContainText('Se enviará al volver la conexión.');
  await expect(opts.form).toBeVisible();
  await expect(opts.form.getByText(/No pudimos guardar|No pudimos emitir|No pudimos agregar/)).toHaveCount(0);
  expect(await opts.count()).toBe(opts.before);
  if (opts.audit) await auditOfflineNotice(page, opts.form);

  await context.setOffline(false);
  await expect.poll(opts.count, { timeout: 30_000 }).toBe(opts.before + 1);
  // Una sola vez: no hay un segundo envío después.
  await page.waitForTimeout(2_000);
  expect(await opts.count()).toBe(opts.before + 1);
}

/** Tras recargar se ofrece el borrador; «Recuperar» rellena y no guarda nada hasta «Guardar». */
async function recoverAfterReload(
  page: Page,
  opts: {
    open: () => Promise<Locator>;
    field: (form: Locator) => Locator;
    text: string;
    save: (form: Locator) => Promise<void>;
    count: () => Promise<number>;
    before: number;
  },
): Promise<void> {
  let form = await opts.open();
  await opts.field(form).fill(opts.text);
  await page.waitForTimeout(AFTER_DEBOUNCE_MS);
  await expectNotInWebStorage(page, opts.text);
  await page.reload();
  form = await opts.open();
  await expect(form.getByText(RECOVER)).toBeVisible({ timeout: 15_000 });
  await expect(opts.field(form)).not.toHaveValue(opts.text);
  await form.getByRole('button', { name: 'Recuperar', exact: true }).click();
  await expect(opts.field(form)).toHaveValue(opts.text);
  await expect(form.getByText(RECOVER)).toHaveCount(0);
  await page.waitForTimeout(AFTER_DEBOUNCE_MS);
  expect(await opts.count(), 'recuperar no guarda nada en la historia').toBe(opts.before);
  await expectNotInWebStorage(page, opts.text);
  await opts.save(form);
  await expect.poll(opts.count, { timeout: 15_000 }).toBe(opts.before + 1);
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await loginAs(page, origin, dentist.email, password);
});

test('evolución: sin red no se pierde y se guarda una vez; tras recargar se ofrece recuperar', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(150_000);
  const open = async () => {
    await page.goto(`${origin}/patients/${patients.evolution}?tab=clinical-history`);
    const section = page.locator('section', { hasText: 'Evoluciones' });
    await section.getByRole('button', { name: 'Nueva evolución' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nueva evolución' });
    await expect(dialog).toBeVisible({ timeout: 15_000 });
    return dialog;
  };
  const field = (dialog: Locator) => dialog.getByLabel('Texto de la evolución');
  const save = (dialog: Locator) => dialog.getByRole('button', { name: 'Guardar evolución' }).click();
  const count = () => counts.evolution(request);

  const dialog = await open();
  await field(dialog).fill(`Control sin red ${suffix}`);
  await saveWhileOffline(page, context, { form: dialog, save: () => save(dialog), count, before: 0, audit: true });
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  // A 390 px el aviso tampoco desborda.
  await page.setViewportSize({ width: 390, height: 844 });
  const narrow = await open();
  await field(narrow).fill(`Control móvil ${suffix}`);
  await saveWhileOffline(page, context, { form: narrow, save: () => save(narrow), count, before: 1, audit: true });
  await page.setViewportSize({ width: 1440, height: 900 });

  await recoverAfterReload(page, {
    open,
    field,
    text: `Exodoncia del 48 recuperada ${suffix}`,
    save,
    count,
    before: 2,
  });
});

test('anamnesis: sin red no se pierde y crea una sola versión; tras recargar se ofrece recuperar', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(120_000);
  const section = page.getByRole('region', { name: 'Anamnesis', exact: true });
  const open = async () => {
    await page.goto(`${origin}/patients/${patients.anamnesis}?tab=clinical-history`);
    await section.getByRole('button', { name: /^(Registrar|Actualizar) anamnesis$/ }).click();
    await expect(section.getByLabel('Notas')).toBeVisible({ timeout: 15_000 });
    return section;
  };
  const field = (form: Locator) => form.getByLabel('Notas');
  const save = (form: Locator) => form.getByRole('button', { name: /^Guardar (anamnesis|nueva versión)$/ }).click();
  const count = () => counts.anamnesis(request);

  const form = await open();
  await field(form).fill(`Hipertensa, toma losartán ${suffix}`);
  await saveWhileOffline(page, context, { form, save: () => save(form), count, before: 0 });
  await expect(section.getByText('Versión 1')).toBeVisible({ timeout: 10_000 });

  await recoverAfterReload(page, { open, field, text: `Alergia a sulfas ${suffix}`, save, count, before: 1 });
});

test('ítem del plan: sin red no se pierde y se agrega una vez; tras recargar se ofrece recuperar', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(120_000);
  const panel = page.locator('#tabpanel-treatment-plans');
  const open = async () => {
    await page.goto(`${origin}/patients/${patients.plan}?tab=treatment-plans`);
    await expect(panel.getByRole('heading', { name: 'Detalle del plan' })).toBeVisible({ timeout: 15_000 });
    return panel.getByRole('form', { name: ADD_ITEM_HEADING });
  };
  const fillItem = async (form: Locator, notes: string) => {
    await form.getByLabel('Código FDI').fill('16');
    await form.getByLabel('Buscar en el catálogo').fill(procedureLabel);
    await form.getByRole('radio', { name: procedureLabel }).check();
    await expect(form.getByLabel('Precio', { exact: true })).toHaveValue('40', { timeout: 10_000 });
    await form.getByLabel('Notas').fill(notes);
  };
  const field = (form: Locator) => form.getByLabel('Notas');
  const save = (form: Locator) => form.getByRole('button', { name: 'Agregar ítem' }).click();
  const count = () => counts.plan(request);

  const form = await open();
  await fillItem(form, `Resina oclusal sin red ${suffix}`);
  await saveWhileOffline(page, context, { form, save: () => save(form), count, before: 0 });

  // Recuperación: el ítem completo vuelve (diente y prestación incluidos).
  const text = `Resina recuperada ${suffix}`;
  let again = await open();
  await fillItem(again, text);
  await page.waitForTimeout(AFTER_DEBOUNCE_MS);
  await expectNotInWebStorage(page, text);
  await page.reload();
  again = await open();
  await expect(again.getByText(RECOVER)).toBeVisible({ timeout: 15_000 });
  await again.getByRole('button', { name: 'Recuperar', exact: true }).click();
  await expect(field(again)).toHaveValue(text);
  await expect(again.getByLabel('Código FDI')).toHaveValue('16');
  await page.waitForTimeout(AFTER_DEBOUNCE_MS);
  expect(await count()).toBe(1);
  await save(again);
  await expect.poll(count, { timeout: 15_000 }).toBe(2);
});

test('receta: sin red no se pierde y se emite una vez; tras recargar se ofrece recuperar', async ({
  page,
  context,
  request,
}) => {
  test.setTimeout(120_000);
  const open = async () => {
    await page.goto(`${origin}/patients/${patients.prescription}?tab=prescriptions`);
    const panel = page.locator('#tabpanel-prescriptions');
    await panel.getByRole('button', { name: 'Nueva receta' }).first().click({ timeout: 15_000 });
    const dialog = page.getByRole('dialog', { name: 'Nueva receta' });
    await expect(dialog.getByText(/Se emite desde/)).toBeVisible({ timeout: 15_000 });
    return dialog;
  };
  const fillRx = async (dialog: Locator, activeIngredient: string) => {
    const license = dialog.getByLabel('Tu nº de registro profesional');
    if (await license.isVisible()) await license.fill('MPPS-57401');
    await dialog.getByLabel('Principio activo (DCI)').fill(activeIngredient);
    await dialog.getByLabel('Concentración').fill('500 mg');
    await dialog.getByLabel('Forma farmacéutica').fill('Cápsula');
    await dialog.getByLabel('Vía de administración').fill('Oral');
    await dialog.getByLabel('Dosis').fill('1 cápsula');
    await dialog.getByLabel('Frecuencia').fill('Cada 8 horas');
    await dialog.getByLabel('Duración (días)').fill('7');
    await dialog.getByLabel('Cantidad total').fill('21');
    await dialog.getByLabel('Unidad').fill('cápsulas');
  };
  const submit = (dialog: Locator) => dialog.getByRole('button', { name: 'Emitir receta' });
  const count = () => counts.prescription(request);

  const dialog = await open();
  await fillRx(dialog, 'Amoxicilina');
  // La comprobación de seguridad la hace el servidor: con red, antes del corte.
  await expect(submit(dialog)).toBeEnabled({ timeout: 15_000 });
  await saveWhileOffline(page, context, {
    form: dialog,
    save: () => submit(dialog).click(),
    count,
    before: 0,
  });
  await expect(dialog).toBeHidden({ timeout: 10_000 });

  const notes = `Tomar con comida ${suffix}`;
  await recoverAfterReload(page, {
    open,
    field: (d) => d.getByLabel('Indicaciones generales (opcional)'),
    text: notes,
    save: async (d) => {
      // Lo recuperado son solo las indicaciones: se completa el medicamento y se emite.
      await fillRx(d, 'Ibuprofeno');
      await expect(submit(d)).toBeEnabled({ timeout: 15_000 });
      await submit(d).click();
    },
    count,
    before: 1,
  });
});
