import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { registerClinicViaApi } from './support/api';
import { loginAs } from './support/auth';
import { shot } from './support/qa-shot';
import { tenantOrigin } from './support/urls';

/**
 * e2e DX-546 · FE-110: al terminar «Guardar» o «Descartar», la SaveBar se va
 * y el foco no cae en `<body>`: vuelve al formulario y el resultado se anuncia.
 * En el router real de Next, a 1440 px y a 390 px, sin errores de consola.
 *
 * Una clínica nueva por corrida: el ADMIN cambia su nombre en «Mi perfil»
 * (Guardar con el teclado → «Nombre guardado.») y la validez de la receta en
 * Ajustes › Recetas (Descartar → «Cambios descartados.»).
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const subdomain = `savebar-${suffix}`;
const origin = tenantOrigin(subdomain);
const password = 'Password123!';
const adminEmail = `admin.savebar.${suffix}@example.com`;

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  await registerClinicViaApi(request, {
    subdomain,
    clinicName: `Clínica SaveBar ${suffix}`,
    fullName: 'Sara Barra',
    email: adminEmail,
    password,
  });
});

function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error' && !/Failed to load resource/.test(msg.text())) errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return errors;
}

/** Lo que tiene el foco: etiqueta e id, para que el fallo diga dónde cayó. */
async function focused(page: Page): Promise<{ tag: string; id: string }> {
  return page.evaluate(() => {
    const el = document.activeElement;
    return { tag: el?.tagName.toLowerCase() ?? 'null', id: el?.id ?? '' };
  });
}

for (const width of [1440, 390] as const) {
  test(`Guardar con el teclado y Descartar devuelven el foco al formulario (${width}px)`, async ({ page }) => {
    const errors = watchConsole(page);
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await loginAs(page, origin, adminEmail, password);

    // --- Mi perfil: Guardar (Enter en el botón de la barra) ---
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
    await expect.poll(() => focused(page)).toEqual({ tag: 'form', id: 'profile-name-form' });

    // --- Ajustes › Recetas: Descartar ---
    await page.goto(`${origin}/settings/recetas`);
    const validity = page.getByLabel('Validez (días)');
    await expect(validity).toHaveValue('30', { timeout: 15_000 });
    await validity.fill('45');
    const discard = page.getByRole('button', { name: 'Descartar' });
    await discard.click();
    await expect(discard).toBeHidden();
    await expect(validity).toHaveValue('30');
    await expect(page.getByText('Cambios descartados.')).toBeAttached();
    const after = await focused(page);
    expect(after.tag, 'el foco no cae en <body>').toBe('form');
    // El formulario que tiene el foco es el de la receta.
    await expect(page.locator('form:focus')).toContainText('Validez (días)');

    expect(errors, 'errores de consola').toEqual([]);
  });
}
