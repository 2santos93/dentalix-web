import { test, expect, type APIRequestContext, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { loginAs } from './support/auth';
import { apiPost, registerClinicViaApi, type ApiSession } from './support/api';
import { API_URL } from './support/urls';
import { axeInBothThemes } from './support/axe';
import {
  expectDialogInsideViewport,
  expectNoHorizontalOverflowInDialog,
  expectNoHorizontalScroll,
} from './support/layout';

/**
 * e2e (DX-559): plantillas de plan de tratamiento.
 *
 * En una clínica nueva por ancho (390 y 1440 px), con tres procedimientos en
 * el catálogo (USD) y un paciente con un plan en borrador en USD:
 *   1. Ajustes › Plantillas de plan: vacío; el ADMIN crea «Endodoncia +
 *      corona» en 3 visitas (la 2.ª pide superficies y va 7 días después).
 *      axe limpio en claro y oscuro en la página y en el modal, sin scroll
 *      horizontal.
 *   2. Ficha › Plan: «Añadir desde plantilla», elige la plantilla, la vista
 *      previa enseña el total; con un diente común se aplica. axe limpio en el
 *      modal y sin desbordar.
 *   3. El plan queda con un ítem en cada visita 1, 2 y 3, el total de la
 *      vista previa y el intervalo de la plantilla.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 10);
const password = 'Password123!';
const TEMPLATE = 'Endodoncia + corona';

const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 1440, height: 900 },
] as const;

const PROCEDURES = [
  { key: 'endo', label: 'Endodoncia unirradicular', price: 120 },
  { key: 'post', label: 'Poste de fibra', price: 60 },
  { key: 'crown', label: 'Corona de zirconio', price: 250 },
] as const;

interface StoredPlan {
  total: number;
  visitIntervals: Record<string, number>;
  items: { catalogItemId: string; toothNumber: string | null; visit: number | null; surfaces?: string[] }[];
}

async function storedPlan(request: APIRequestContext, s: ApiSession, planId: string): Promise<StoredPlan> {
  const res = await request.get(`${API_URL}/treatment-plans/${planId}`, { headers: s.headers });
  expect(res.ok(), `GET del plan falló: ${await res.text()}`).toBeTruthy();
  return (await res.json()) as StoredPlan;
}

async function expectAxeClean(page: Page, scope: Locator, what: string): Promise<void> {
  const found = await axeInBothThemes(page, scope);
  expect(found.light, `axe de ${what} (claro)`).toEqual([]);
  expect(found.dark, `axe de ${what} (oscuro)`).toEqual([]);
}

for (const viewport of VIEWPORTS) {
  test(`plantilla «${TEMPLATE}»: se crea en Ajustes y se aplica al plan (${viewport.width} px)`, async ({
    page,
    request,
  }) => {
    test.setTimeout(150_000);
    const tag = `${suffix}${viewport.width}`;
    const clinic = {
      subdomain: `test-clinic-plantplan-${tag}`,
      clinicName: `Clínica Plantillas de plan ${tag}`,
      fullName: 'Dra. Plantillas de plan',
      email: `plantillas.plan.${tag}@example.com`,
      password,
    };
    const admin = await registerClinicViaApi(request, clinic);
    const catalog: Record<string, { id: string; code: string; label: string; price: number }> = {};
    for (const p of PROCEDURES) {
      const code = `${p.key}-${tag}`.slice(0, 30);
      const item = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
        code,
        kind: 'PROCEDURE',
        labelEs: p.label,
        color: '#3366CC',
        defaultPrice: p.price,
      });
      catalog[p.key] = { id: item.id, code, label: p.label, price: p.price };
    }
    const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
      firstName: 'Valentina',
      lastName: `Plantilla${tag}`,
      docType: 'NATIONAL_ID',
      docNumber: `DX559${tag}`.slice(0, 20),
      sex: 'F',
    });
    const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
      currency: 'USD',
    });

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await loginAs(page, admin.origin, clinic.email, clinic.password);

    // --- 1. Ajustes › Plantillas de plan -------------------------------------
    await page.goto(`${admin.origin}/settings/plantillas-de-plan`);
    await expect(page.getByRole('heading', { level: 1, name: 'Plantillas de plan' })).toBeVisible();
    await expect(page.getByText('Aún no hay plantillas de plan')).toBeVisible({ timeout: 15_000 });
    await expectAxeClean(page, page.locator('main'), `Ajustes vacío a ${viewport.width} px`);
    await expectNoHorizontalScroll(page);

    await page.getByRole('button', { name: 'Nueva plantilla' }).click();
    const form = page.getByRole('dialog', { name: 'Nueva plantilla de plan' });
    await expect(form).toBeVisible();
    await form.getByLabel('Nombre').fill(TEMPLATE);
    const line = (n: number) => form.getByRole('listitem', { name: `Procedimiento ${n}` });
    const option = (key: string) => `${catalog[key].code} · ${catalog[key].label}`;
    await line(1).getByLabel('Procedimiento').selectOption({ label: option('endo') });
    await form.getByRole('button', { name: 'Añadir procedimiento' }).click();
    await line(2).getByLabel('Procedimiento').selectOption({ label: option('post') });
    await line(2).getByLabel('Visita', { exact: true }).fill('2');
    await line(2).getByLabel('Pide superficies').check();
    await form.getByRole('button', { name: 'Añadir procedimiento' }).click();
    await line(3).getByLabel('Procedimiento').selectOption({ label: option('crown') });
    await line(3).getByLabel('Visita', { exact: true }).fill('3');
    await form.getByRole('listitem', { name: 'Visita 1' }).getByLabel('Etiqueta').fill('Conductometría');
    await form
      .getByRole('listitem', { name: 'Visita 2' })
      .getByLabel('Días desde la visita anterior')
      .fill('7');
    await expectAxeClean(page, form, `el modal de la plantilla a ${viewport.width} px`);
    await expectNoHorizontalOverflowInDialog(form);
    await expectDialogInsideViewport(page, form);
    await form.getByRole('button', { name: 'Crear plantilla' }).click();
    await expect(form).toBeHidden();
    await expect(page.getByText('1 plantilla', { exact: true })).toBeVisible();
    await expect(page.getByText(TEMPLATE).first()).toBeVisible();
    await expectAxeClean(page, page.locator('main'), `Ajustes con la plantilla a ${viewport.width} px`);
    await expectNoHorizontalScroll(page);

    // --- 2. Ficha › Plan › «Añadir desde plantilla» ---------------------------
    await page.goto(`${admin.origin}/patients/${patient.id}?tab=treatment-plans`);
    await page.getByRole('button', { name: 'Añadir desde plantilla' }).click();
    const apply = page.getByRole('dialog', { name: 'Añadir desde plantilla' });
    await expect(apply).toBeVisible();
    await apply.getByLabel('Plantilla').selectOption({ label: TEMPLATE });
    await expect(apply.getByRole('heading', { name: 'Procedimientos que se añadirán' })).toBeVisible({
      timeout: 15_000,
    });
    await expect(apply.getByRole('listitem', { name: catalog.endo.label })).toContainText('Visita 1 · Conductometría');
    await expect(apply.getByRole('listitem', { name: catalog.crown.label })).toContainText('Visita 3');
    const submit = apply.getByRole('button', { name: 'Añadir al plan' });
    await expect(submit).toBeDisabled();
    await apply.getByLabel('Código FDI').fill('36');
    await apply
      .getByRole('listitem', { name: catalog.post.label })
      .getByLabel('Oclusal')
      .check();
    await expect(submit).toBeEnabled();
    await expectAxeClean(page, apply, `el modal de aplicar a ${viewport.width} px`);
    await expectNoHorizontalOverflowInDialog(apply);
    await expectDialogInsideViewport(page, apply);
    await submit.click();
    await expect(apply).toBeHidden();
    await expect(page.getByText('Se añadieron 3 procedimientos')).toBeVisible();
    await expectNoHorizontalScroll(page);

    // --- 3. El plan: un ítem por visita, el total y el intervalo --------------
    const board = page.getByRole('region', { name: 'Plan por visitas' });
    await expect(board).toBeVisible();
    for (const n of [1, 2, 3]) {
      await expect(board.getByRole('heading', { name: new RegExp(`^Visita ${n}\\b`) })).toBeVisible();
    }
    const stored = await storedPlan(request, admin, plan.id);
    const byCatalog = new Map(stored.items.map((i) => [i.catalogItemId, i]));
    expect(byCatalog.get(catalog.endo.id)).toMatchObject({ toothNumber: '36', visit: 1 });
    expect(byCatalog.get(catalog.post.id)).toMatchObject({ toothNumber: '36', visit: 2 });
    expect(byCatalog.get(catalog.crown.id)).toMatchObject({ toothNumber: '36', visit: 3 });
    expect(stored.items).toHaveLength(3);
    expect(Number(stored.total)).toBe(120 + 60 + 250);
    expect(stored.visitIntervals).toMatchObject({ '2': 7 });
  });
}
