import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { registerClinicViaApi } from './support/api';
import { API_URL } from './support/urls';
import { loginAs } from './support/auth';
import { shot } from './support/qa-shot';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-546 · FE-110: al terminar «Guardar» o «Descartar», la SaveBar se va
 * y el foco no cae en `<body>` ni en un contenedor sin nombre: va al título de
 * su sección (o de la página) o, tras guardar, al aviso de la pantalla. El
 * resultado se anuncia. En el router real de Next, a 1440 px y a 390 px, sin
 * errores de consola.
 *
 * Una clínica nueva por corrida: «Mi perfil» (Guardar con el teclado →
 * «Nombre guardado.»), Recetas (Descartar → «Cambios descartados.»; Guardar →
 * el aviso), Datos de la clínica, Caja › Recibo y el calendario de la sede.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `savebar-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.savebar.${suffix}@example.com`;

test.describe.configure({ mode: 'serial' });

let sedeId = '';

test.beforeAll(async ({ request }) => {
  const session = await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica SaveBar ${suffix}`,
    fullName: 'Sara Barra',
    email: adminEmail,
    password,
  });
  const locations = await request.get(`${API_URL}/locations`, { headers: session.headers });
  sedeId = ((await locations.json()) as { id: string }[])[0].id;
});

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Lo que tiene el foco: etiqueta, rol y nombre (para que el fallo diga dónde cayó). */
async function focused(page: Page): Promise<{ tag: string; text: string }> {
  return page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName.toLowerCase() ?? 'null', text: el?.textContent?.trim() ?? '' };
  });
}

/** El foco está en un título con ese texto (nunca en <body> ni en un <form>). */
async function expectFocusOnHeading(page: Page, tag: 'h1' | 'h2' | 'h3', text: string): Promise<void> {
  await expect.poll(() => focused(page)).toEqual({ tag, text });
}

for (const width of [1440, 390] as const) {
  test(`Guardar con el teclado y Descartar devuelven el foco al formulario (${width}px)`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await loginAs(page, origin, adminEmail, password);

    // --- Mi perfil: Guardar (Enter en el botón de la barra) → título «Nombre» ---
    await page.goto(`${origin}/settings/profile`);
    const name = page.getByLabel('Nombre completo');
    await expect(name).toBeVisible({ timeout: 15_000 });
    await name.fill(`Sara Barra ${width}`);
    const save = page.getByRole('button', { name: 'Guardar el nombre' });
    await expect(save).toBeVisible();
    await shot(page, 'DX-546-savebar-perfil', width);
    await save.focus();
    await page.keyboard.press('Enter');
    await expect(save).toBeHidden({ timeout: 10_000 });
    await expect(page.getByText('Nombre guardado.')).toBeAttached();
    await expectFocusOnHeading(page, 'h2', 'Nombre');

    // --- Recetas: Descartar → título de la sección; Guardar → el aviso ---
    await page.goto(`${origin}/settings/recetas`);
    const validity = page.getByLabel('Validez (días)');
    await expect(validity).toHaveValue('30', { timeout: 15_000 });
    await validity.fill('45');
    await page.getByRole('button', { name: 'Descartar' }).click();
    await expect(validity).toHaveValue('30');
    await expect(page.getByText('Cambios descartados.')).toBeAttached();
    await expectFocusOnHeading(page, 'h2', 'Datos de la receta');
    await validity.fill('31');
    await page.getByRole('button', { name: 'Guardar' }).click();
    const notice = page.getByRole('status').filter({ hasText: 'Ajustes de la receta guardados.' });
    await expect(notice).toBeFocused({ timeout: 10_000 });
    await validity.fill('30');
    await page.getByRole('button', { name: 'Guardar' }).click();
    await expect(notice).toBeFocused({ timeout: 10_000 });

    // --- Datos de la clínica: Descartar → título de la página ---
    await page.goto(`${origin}/settings/clinica`);
    const taxId = page.getByLabel('Nombre del identificador fiscal');
    await expect(taxId).toBeVisible({ timeout: 15_000 });
    await taxId.fill('Id. de prueba');
    await page.getByRole('button', { name: 'Descartar' }).click();
    await expectFocusOnHeading(page, 'h1', 'Datos de la clínica');

    // --- Caja › Recibo de caja: Descartar → título «Recibo de caja» ---
    await page.goto(`${origin}/settings/caja`);
    const receiptTitle = page.getByRole('textbox', { name: 'Título del recibo' });
    await expect(receiptTitle).toBeVisible({ timeout: 15_000 });
    await receiptTitle.fill('Recibo de prueba');
    await page.getByRole('button', { name: 'Descartar' }).click();
    await expectFocusOnHeading(page, 'h2', 'Recibo de caja');

    // --- Calendario de la sede: Descartar → título «Días hábiles» ---
    await page.goto(`${origin}/settings/calendario?sede=${sedeId}`);
    const saturday = page.getByRole('checkbox', { name: 'Sábado', exact: true });
    await expect(saturday).toBeVisible({ timeout: 15_000 });
    await saturday.click();
    await page.getByRole('button', { name: 'Descartar' }).click();
    await expectFocusOnHeading(page, 'h2', 'Días hábiles');

    expect(errors, 'errores de consola').toEqual([]);
  });
}
