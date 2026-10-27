import { test, expect, type APIRequestContext } from './support/test';
import { randomUUID } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import type { AxeResults } from 'axe-core';

const evidence = '.planning/backlog-wave-2026-10-27/DX344';
const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
import { accessTokenOf, registerAndLogin } from './support/auth';
import { API_URL } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';

/**
 * e2e (DX-300): receta segura. Paciente con warfarina en la medicación
 * habitual; al recetar ibuprofeno el modal enseña el aviso bloqueante que
 * calcula el servidor, con el descargo de «no sustituye el juicio clínico».
 * A 390 y 1440 px, en claro y en oscuro: sin scroll horizontal y con el aviso
 * visible. Se emite solo con confirmación y motivo, que quedan en la receta.
 */
const suffix = (process.env.E2E_RUN_SUFFIX ?? randomUUID()).replace(/[^a-z0-9]/gi, '').toLowerCase();
const subdomain = `test-clinic-rxs-${suffix}`;

function api(request: APIRequestContext, origin: string, token: string) {
  const headers = { 'X-Tenant-Host': new URL(origin).host, Authorization: `Bearer ${token}` };
  return {
    async post<T>(path: string, data: object): Promise<T> {
      const res = await request.post(`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `POST ${path} falló: ${await res.text()}`).toBeTruthy();
      return (await res.json()) as T;
    },
    async put(path: string, data: object): Promise<void> {
      const res = await request.put(`${API_URL}${path}`, { headers, data });
      expect(res.ok(), `PUT ${path} falló: ${await res.text()}`).toBeTruthy();
    },
    get: (path: string) => request.get(`${API_URL}${path}`, { headers }),
  };
}

test('receta con aviso bloqueante (warfarina + ibuprofeno): 390/1440, claro/oscuro, emite con motivo', async ({
  page,
}) => {
  test.setTimeout(120_000);
  const origin = await registerAndLogin(page, {
    subdomain,
    clinicName: `Clinica Receta Segura ${suffix}`,
    fullName: 'Dra Segura',
    email: `test.user.rxs.${suffix}@example.com`,
    password: 'Password123!',
  });
  const token = await accessTokenOf(page);
  const admin = api(page.request, origin, token);
  const patient = await admin.post<{ id: string }>('/patients', {
    firstName: 'Wanda',
    lastName: `Segura${suffix}`.slice(0, 40),
    docType: 'CC',
    docNumber: `RXS${suffix}`.slice(0, 20),
    birthDate: '1970-01-01',
    sex: 'F',
  });
  await admin.put(`/patients/${patient.id}/medical-history`, {
    medications: [{ nombre: 'Warfarina 5 mg', esAlerta: true }],
  });

  await page.goto(`${origin}/patients/${patient.id}?tab=prescriptions`);
  const panel = page.locator('#tabpanel-prescriptions');
  await expect(panel.getByText('Este paciente no tiene recetas.')).toBeVisible({ timeout: 15_000 });
  await panel.getByRole('button', { name: 'Nueva receta' }).click();
  const dialog = page.getByRole('dialog', { name: 'Nueva receta' });
  await expect(dialog.getByText(/Se emite desde/)).toBeVisible();
  await dialog.getByLabel('Tu registro profesional').fill('TP-300');
  await dialog.getByLabel('Principio activo (DCI)').fill('Ibuprofeno');
  await dialog.getByLabel('Concentración').fill('400 mg');
  await dialog.getByLabel('Forma farmacéutica').fill('Comprimido');
  await dialog.getByLabel('Vía de administración').fill('Oral');
  await dialog.getByLabel('Dosis').fill('1 comprimido');
  await dialog.getByLabel('Frecuencia').fill('Cada 8 horas');
  await dialog.getByLabel('Duración (días)').fill('2');
  await dialog.getByLabel('Cantidad total').fill('6');
  await dialog.getByLabel('Unidad').fill('comprimidos');

  const blocking = dialog.getByText('Requieren confirmación (1)');
  await expect(blocking).toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator('li').getByText(/Interacción grave: el paciente toma Warfarina 5 mg/)).toBeVisible();
  await expect(dialog.getByText(/no sustituye tu juicio clínico/)).toBeVisible();
  const submit = dialog.getByRole('button', { name: 'Emitir receta' });
  await expect(submit).toBeDisabled();

  const checkbox = dialog.getByRole('checkbox', { name: /Confirmo que conozco los avisos/ });
  const reason = dialog.getByLabel('Motivo para emitir pese a los avisos');
  await expect(submit).toHaveAccessibleDescription('Confirma los avisos de seguridad para emitir.');
  await checkbox.check();
  await expect(submit).toBeDisabled();
  await expect(submit).toHaveAccessibleDescription('Escribe el motivo para emitir pese a los avisos.');
  await expect(reason).toHaveAccessibleDescription('Queda en la receta y no se puede cambiar.');
  await reason.fill('INR estable; pauta de 2 días');
  await expect(submit).toBeEnabled();

  // API real: solo retenemos su respuesta para poder observar el estado pendiente.
  for (const focus of [reason, checkbox]) {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let requested!: () => void;
    const requestSeen = new Promise<void>((resolve) => { requested = resolve; });
    await page.route('**/prescriptions/safety-check', async (route) => {
      const response = await route.fetch();
      requested();
      await gate;
      await route.fulfill({ response });
    });
    const node = await focus.elementHandle();
    await page.evaluate(() => {
      const status = document.querySelector('[aria-label="Resultado de seguridad"]')!;
      const observed = window as unknown as { safetyMutations: number; safetyObserver: MutationObserver };
      observed.safetyMutations = 0;
      observed.safetyObserver = new MutationObserver(() => { observed.safetyMutations++; });
      observed.safetyObserver.observe(status, { childList: true, characterData: true, subtree: true });
    });
    const dose = dialog.getByLabel('Dosis', { exact: true });
    await dose.fill((await dose.inputValue()) === '1 comprimido' ? '2 comprimidos' : '1 comprimido');
    await focus.focus();
    const before = await focus.boundingBox();
    await expect(submit).toBeDisabled();
    await requestSeen;
    await expect(dialog.getByText('Comprobando avisos de seguridad')).toBeVisible();
    await expect(focus).toBeFocused();
    expect(await node!.evaluate((element) => element === document.activeElement)).toBeTruthy();
    expect(await focus.boundingBox()).toEqual(before);
    await expect(checkbox).toBeChecked();
    await expect(reason).toHaveValue('INR estable; pauta de 2 días');
    release();
    await expect(submit).toBeEnabled();
    await expect(focus).toBeFocused();
    expect(await page.evaluate(() => {
      const observed = window as unknown as { safetyMutations: number; safetyObserver: MutationObserver };
      observed.safetyObserver.disconnect();
      return observed.safetyMutations;
    })).toBe(0);
    await page.unroute('**/prescriptions/safety-check');
  }
  mkdirSync(evidence, { recursive: true });
  for (const width of [390, 1440]) {
    for (const colorScheme of ['light', 'dark'] as const) {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme });
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains('dark'))).toBe(colorScheme === 'dark');
      // Espera el fin de las transiciones de color antes de medir contraste.
      await dialog.evaluate(async (element) => {
        await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => {})));
      });
      await blocking.scrollIntoViewIfNeeded();
      await expect(blocking).toBeVisible();
      await expectNoHorizontalScroll(page);
      const box = await dialog.boundingBox();
      expect(box, `${width}/${colorScheme}: diálogo`).not.toBeNull();
      expect(box!.x + box!.width, `${width}/${colorScheme}: borde derecho`).toBeLessThanOrEqual(width);
      await page.evaluate(axeSource);
      const results = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: { run: (context: string) => Promise<AxeResults> } }).axe;
        return axe.run('[role="dialog"]');
      });
      writeFileSync(`${evidence}/axe-${width}-${colorScheme}.json`, JSON.stringify({
        violations: results.violations.map(({ id, impact, description, nodes }) => ({ id, impact, description, targets: nodes.map((node) => node.target) })),
        passes: results.passes.length,
      }, null, 2));
      expect(results.violations).toEqual([]);
      await page.screenshot({ path: `${evidence}/receta-segura-${width}-${colorScheme}.png` });
      await checkbox.uncheck();
      await expect(submit).toHaveAccessibleDescription('Confirma los avisos de seguridad para emitir.');
      await expect(submit).toBeDisabled();
      await submit.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${evidence}/emitir-bloqueado-${width}-${colorScheme}.png` });
      await checkbox.check();
    }
  }
  await page.emulateMedia({ colorScheme: 'light' });

  await submit.click();
  await expect(dialog).toBeHidden();
  await expect(panel.getByText('Ibuprofeno 400 mg · 6 comprimidos').first()).toBeVisible();

  const list = await admin.get(`/patients/${patient.id}/prescriptions`);
  const [rx] = (await list.json()) as {
    safetyOverrideReason: string | null;
    safetyAlerts: { code: string; severity: string }[];
  }[];
  expect(rx.safetyOverrideReason).toBe('INR estable; pauta de 2 días');
  expect(rx.safetyAlerts).toEqual([
    expect.objectContaining({ code: 'INTERACTION_ANTICOAGULANT_NSAID', severity: 'BLOCKING' }),
  ]);
});
