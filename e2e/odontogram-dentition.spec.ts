import { test, expect, type APIRequestContext, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';

/**
 * e2e (DX-120): odontograma fase 2 contra la API y la base reales.
 *
 * Registra una clínica (su dueño es ADMIN) y, por la API, un ítem del
 * catálogo y una paciente de 7 años. En la pestaña «Odontograma»:
 *   - la carta abre en dentición MIXTA por la edad: el 11 y el 51 a la vez,
 *     el 55 (temporal) en vez del 15;
 *   - «Cambiar dentición» exfolia el 55: la posición 15 pasa a permanente;
 *   - registra en el 64 con origen «Otro profesional»: se pinta rayado y la
 *     leyenda explica los tres orígenes;
 *   - «Anular» pide el motivo, el registro deja de pintarse y queda tachado
 *     con motivo y autor en el historial;
 *   - «Ver la carta al» de ayer: solo lectura, con aviso, y la carta de ayer
 *     (sin el 64 y con el 55 todavía en la boca).
 * En escritorio (1440px) y móvil (390px, sin scroll horizontal de la página y
 * con los diálogos dentro de la pantalla).
 */
const rawSuffix = process.env.E2E_RUN_SUFFIX ?? randomUUID();
const suffix = rawSuffix.replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const VOID_REASON = 'Registrado en el diente equivocado';

const VIEWPORTS = [
  { name: 'escritorio', width: 1440, height: 900 },
  { name: 'móvil', width: 390, height: 844 },
];

function day(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fecha de nacimiento de alguien que cumplió 7 años hace un mes. */
function sevenYearsOld(): string {
  const [y, m, d] = day(-31).split('-');
  return `${Number(y) - 7}-${m}-${d}`;
}

async function seed(
  request: APIRequestContext,
  origin: string,
  accessToken: string,
  tag: string,
): Promise<{ patientId: string; catalogLabel: string }> {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'X-Tenant-Host': new URL(origin).host,
  };
  async function post<T>(path: string, data: object): Promise<T> {
    const res = await request.post(`${API_URL}${path}`, { headers, data });
    expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
    return (await res.json()) as T;
  }
  const catalogLabel = `Resina-${tag}`;
  await post('/catalog/items', {
    code: `resina-${tag}`,
    kind: 'PROCEDURE',
    labelEs: catalogLabel,
    color: '#3366CC',
  });
  const patient = await post<{ id: string }>('/patients', {
    firstName: 'Sofía',
    lastName: `Dentición${tag}`,
    docType: 'TI',
    docNumber: `DT${tag}`.slice(0, 20),
    sex: 'F',
    birthDate: sevenYearsOld(),
  });
  return { patientId: patient.id, catalogLabel };
}

async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

async function expectInsideViewport(page: Page, locator: ReturnType<Page['getByRole']>): Promise<void> {
  const box = await locator.boundingBox();
  const width = page.viewportSize()?.width ?? 0;
  expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(width);
}

for (const viewport of VIEWPORTS) {
  test(`dentición mixta, exfoliar, origen, anular y carta a una fecha (${viewport.name})`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    const tag = `${suffix}${viewport.width}`;
    const origin = await registerAndLogin(page, {
      subdomain: `test-clinic-dent-${tag}`,
      clinicName: `Clinica Dentición ${tag}`,
      fullName: 'Dra. Odontopediatra',
      email: `test.user.dent.${tag}@example.com`,
      password,
    });
    const { patientId, catalogLabel } = await seed(page.request, origin, await accessTokenOf(page), tag);

    await page.goto(`${origin}/patients/${patientId}?tab=odontogram`);
    const chart = page.getByRole('group', { name: 'Odontograma', exact: true });
    await expect(chart).toBeVisible({ timeout: 15_000 });

    // --- Carta mixta por la edad ---
    await expect(page.getByRole('radio', { name: 'Mixta' })).toHaveAttribute('aria-checked', 'true');
    await expect(chart.getByRole('group', { name: 'Diente 11, sano' })).toBeVisible();
    await expect(chart.getByRole('group', { name: 'Diente 51 (temporal), sano' })).toBeVisible();
    await expect(chart.getByRole('group', { name: 'Diente 55 (temporal), sano' })).toBeVisible();
    await expect(chart.getByRole('group', { name: /^Diente 15,/ })).toHaveCount(0);
    await expect(page.getByText(/no aparecen en el mapa/)).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    // --- Exfoliar el 55: la posición 15 pasa a permanente ---
    await chart.getByRole('button', { name: '55', exact: true }).click();
    await page.getByRole('button', { name: 'Cambiar dentición' }).first().click();
    const dentitionDialog = page.getByRole('dialog', { name: 'Cambiar dentición' });
    await expect(dentitionDialog).toBeVisible();
    await expect(dentitionDialog.getByRole('checkbox', { name: /^Posición 15,/ })).toBeChecked();
    await dentitionDialog.getByLabel('Motivo').selectOption('EXFOLIATION');
    await expectInsideViewport(page, dentitionDialog);
    await expectNoHorizontalScroll(page);
    await dentitionDialog.getByRole('button', { name: 'Guardar dentición' }).click();
    await expect(dentitionDialog).toBeHidden({ timeout: 10_000 });
    await expect(chart.getByRole('group', { name: 'Diente 15, sano' })).toBeVisible({ timeout: 10_000 });
    await expect(chart.getByRole('group', { name: /^Diente 55 / })).toHaveCount(0);

    // --- Registrar en el 64 con origen «Otro profesional» ---
    const tooth64 = chart.getByRole('group', { name: /^Diente 64 \(temporal\),/ });
    await tooth64.locator('[data-surface="OCCLUSAL"]').click();
    const form = page.getByRole('form', { name: 'Registrar en el diente 64' });
    await expect(form).toBeVisible({ timeout: 10_000 });
    await form.getByLabel(catalogLabel).check();
    await form.getByLabel('Origen').selectOption('OTHER_PROVIDER');
    await form.getByRole('button', { name: 'Guardar' }).click();
    const recorded = chart.getByRole('group', {
      name: 'Diente 64 (temporal), 1 registro, cara oclusal, otro profesional',
    });
    await expect(recorded).toBeVisible({ timeout: 10_000 });
    await expect(recorded.locator('[data-origin="OTHER_PROVIDER"]')).toHaveCount(1);
    const legend = page.getByRole('list', { name: 'Origen de los registros' });
    await expect(legend.getByText('Hecho en la clínica')).toBeVisible();
    await expect(legend.getByText('Ya presente')).toBeVisible();
    await expect(legend.getByText('Otro profesional')).toBeVisible();

    // --- Anular con motivo ---
    const timeline = page.getByRole('list', { name: 'Historial del diente 64' });
    await timeline.getByRole('button', { name: new RegExp(`^Anular ${catalogLabel}`) }).click();
    const voidDialog = page.getByRole('dialog', { name: 'Anular registro' });
    await expect(voidDialog).toBeVisible();
    await voidDialog.getByRole('button', { name: 'Anular registro' }).click();
    await expect(voidDialog.getByText('Escribe el motivo de la anulación.')).toBeVisible();
    await expectInsideViewport(page, voidDialog);
    await expectNoHorizontalScroll(page);
    await voidDialog.getByLabel('Motivo').fill(VOID_REASON);
    await voidDialog.getByRole('button', { name: 'Anular registro' }).click();
    await expect(voidDialog).toBeHidden({ timeout: 10_000 });

    const voidedItem = timeline.locator('li[data-voided="true"]');
    await expect(voidedItem).toBeVisible({ timeout: 10_000 });
    await expect(voidedItem.getByText(catalogLabel)).toHaveCSS('text-decoration-line', 'line-through');
    await expect(voidedItem).toContainText(`Anulado por Dra. Odontopediatra`);
    await expect(voidedItem).toContainText(VOID_REASON);
    await expect(chart.getByRole('group', { name: 'Diente 64 (temporal), sano' })).toBeVisible({ timeout: 10_000 });

    // --- La carta de ayer: solo lectura, sin el 64 y con el 55 en la boca ---
    await page.getByLabel('Ver la carta al').fill(day(-1));
    await expect(page.getByText(/· solo lectura/)).toBeVisible({ timeout: 10_000 });
    await expect(chart.getByRole('group', { name: 'Diente 55 (temporal), sano' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Cambiar dentición' })).toHaveCount(0);
    await expect(page.getByRole('form', { name: /Registrar en el diente/ })).toHaveCount(0);
    await expect(timeline.getByRole('button', { name: /^Anular/ })).toHaveCount(0);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Volver a hoy' }).click();
    await expect(page.getByText(/· solo lectura/)).toHaveCount(0);
    await expect(chart.getByRole('group', { name: 'Diente 15, sano' })).toBeVisible({ timeout: 10_000 });
  });
}
