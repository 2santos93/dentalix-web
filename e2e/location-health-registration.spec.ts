import { test, expect, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';

/**
 * e2e (DX-319): nº de registro sanitario de la sede en Ajustes › Sedes.
 *
 * Una clínica nueva: la tarjeta ya no habla del REPS; el ADMIN escribe un nº
 * libre (sin formato por país), activa «Mostrar en los documentos» y guarda;
 * al recargar sigue ahí y la API lo devuelve. Un fallo del guardado deja el
 * error junto al campo con el foco en él. En escritorio (1440px) y móvil
 * (390px), sin scroll horizontal ni errores en la consola.
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

for (const viewport of VIEWPORTS) {
  test(`ADMIN edita el nº de registro sanitario de la sede (${viewport.name})`, async ({ page }) => {
    test.setTimeout(90_000);
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });
    page.on('pageerror', (err) => consoleErrors.push(err.message));

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-nrs-${tag}`,
      clinicName: `Clinica NRS ${tag}`,
      fullName: 'Nora Registro',
      email: `test.user.nrs.${tag}@example.com`,
      password,
    });

    await page.goto(`${origin}/settings/sedes`);
    const section = page.getByRole('region', { name: 'Nº de registro sanitario' });
    const field = section.getByLabel(/Nº de registro sanitario · Sede principal/);
    await expect(field).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(/REPS/)).toHaveCount(0);
    await expect(field).toHaveAttribute('maxlength', '64');
    const toggle = section.getByRole('checkbox', { name: /Mostrar en los documentos · Sede principal/ });
    await expect(toggle).not.toBeChecked();
    const save = section.getByRole('button', { name: 'Guardar el nº de registro sanitario de Sede principal' });
    await expect(save).toBeDisabled();
    await expectNoHorizontalScroll(page);

    // Un fallo del guardado: error junto al campo y el foco en él.
    await page.route('**/locations/*', (route) =>
      route.request().method() === 'PATCH'
        ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"QA"}' })
        : route.fallback(),
    );
    await field.fill('NRS 28/1234-AB');
    await save.click();
    await expect(section.getByRole('alert')).toBeVisible();
    await expect(field).toHaveAttribute('aria-invalid', 'true');
    await expect(field).toBeFocused();
    await page.unroute('**/locations/*');

    // Guardar de verdad, con «Mostrar en los documentos».
    await toggle.check();
    await save.click();
    await expect(section.getByRole('status').filter({ hasText: 'Guardado' })).toBeVisible();
    await expect(save).toBeDisabled();
    await expectNoHorizontalScroll(page);

    await page.reload();
    await expect(field).toHaveValue('NRS 28/1234-AB', { timeout: 15_000 });
    await expect(toggle).toBeChecked();

    const token = await accessTokenOf(page);
    const res = await page.request.get(`${API_URL}/locations`, {
      headers: { Authorization: `Bearer ${token}`, 'X-Tenant-Host': new URL(origin).host },
    });
    const [principal] = (await res.json()) as Array<Record<string, unknown>>;
    expect(principal).toMatchObject({
      healthRegistrationNumber: 'NRS 28/1234-AB',
      showHealthRegistrationNumber: true,
    });
    expect(principal).not.toHaveProperty('repsHabilitationCode');

    // El 503 simulado deja su error en la consola; nada más.
    expect(consoleErrors.filter((e) => !/503|Service Unavailable/.test(e))).toEqual([]);
  });
}
