import { test, expect, type Locator, type Page } from './support/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { AxeResults } from 'axe-core';
import { accessTokenOf, registerAndLogin } from './support/auth';
import { apiPost, type ApiSession } from './support/api';
import { API_URL } from './support/urls';
import { expectNoHorizontalScroll } from './support/layout';

const axeSource = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

/** Measure browser-resolved CSS (including color-mix), composited over every ancestor. */
async function contrast(locator: Locator) {
  return locator.evaluate((element) => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    function rgba(css: string) {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = css;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
      return [r, g, b, a / 255];
    }
    function over(front: number[], back: number[]) {
      return [0, 1, 2].map((i) => front[i] * front[3] + back[i] * (1 - front[3])).concat(1);
    }
    const ancestors: string[] = [];
    const backgrounds: number[][] = [];
    for (let el: Element | null = element; el; el = el.parentElement) {
      const style = getComputedStyle(el);
      if (style.opacity !== '1' || style.backgroundImage !== 'none') {
        throw new Error('Contrast measurement requires flat backgrounds and full element opacity');
      }
      ancestors.push(style.backgroundColor);
      backgrounds.push(rgba(style.backgroundColor));
    }
    let background = [255, 255, 255, 1];
    for (const layer of backgrounds.reverse()) background = over(layer, background);
    const style = getComputedStyle(element);
    const foreground = over(rgba(style.color), background);
    const luminance = (rgb: number[]) => rgb.slice(0, 3).map((c) => {
      const s = c / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
    const a = luminance(foreground), b = luminance(background);
    return { text: element.textContent, cssColor: style.color, cssBackgrounds: ancestors,
      foreground, background, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
  });
}

async function audit(page: Page, scope: Locator, evidence: string, label: string) {
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.getAnimations().forEach((a) => { if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish(); }));
  await scope.evaluate((el) => el.setAttribute('data-dx346-audit', ''));
  await page.evaluate(axeSource);
  const result = await page.evaluate(async () => {
    const axe = (window as unknown as { axe: { run: (ctx: string) => Promise<AxeResults> } }).axe;
    return axe.run('[data-dx346-audit]');
  });
  await scope.evaluate((el) => el.removeAttribute('data-dx346-audit'));
  writeFileSync(path.join(evidence, `axe-${label}.json`), JSON.stringify(result.violations, null, 2));
  await page.screenshot({ path: path.join(evidence, `${label}.png`), fullPage: true });
  // Historical DX051 exclusions retained only for warning/danger; success is always audited.
  const violations = result.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))
    .map((v) => ({ id: v.id, nodes: v.nodes.filter((n) => !(v.id === 'color-contrast' &&
      /class="[^"]*\bbg-(warning|danger)\/15\b/.test(n.html))).map((n) => n.target) }))
    .filter((v) => v.nodes.length);
  expect.soft(violations, label).toEqual([]);
}

test('DX346: success badges and covered items meet AA on cash shifts, plan and statement, 390/1440 light/dark', async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const evidence = process.env.DX346_QA_DIR ?? testInfo.outputPath('qa');
  mkdirSync(evidence, { recursive: true });
  const tag = randomUUID().replaceAll('-', '').slice(0, 10);
  const origin = await registerAndLogin(page, { subdomain: `test-clinic-dx346-${tag}`,
    clinicName: 'Contraste DX346', fullName: 'Ada Admin', email: `test.user.dx346.${tag}@example.com`, password: 'Password123!' });
  const session: ApiSession = { origin, headers: { Authorization: `Bearer ${await accessTokenOf(page)}`,
    'X-Tenant-Host': new URL(origin).host } };
  await apiPost(page.request, session, '/cash-sessions/open', { floats: [] });
  const patient = await apiPost<{ id: string }>(page.request, session, '/patients', {
    firstName: 'Irene', lastName: `Contraste${tag}`, docType: 'NATIONAL_ID', docNumber: `C${tag}`, sex: 'F' });
  const plan = await apiPost<{ id: string }>(page.request, session, `/patients/${patient.id}/treatment-plans`, { currency: 'USD' });
  const catalog = await apiPost<{ id: string }>(page.request, session, '/catalog/items', {
    code: `contrast-${tag}`, kind: 'PROCEDURE', labelEs: `Corona${tag}`, color: '#3366CC', defaultPrice: 100 });
  const item = await apiPost<{ id: string }>(page.request, session, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '11', catalogItemId: catalog.id });
  const done = await page.request.patch(`${API_URL}/treatment-plans/${plan.id}/items/${item.id}`, {
    headers: session.headers, data: { status: 'DONE' } });
  expect(done.ok(), await done.text()).toBeTruthy();
  await apiPost(page.request, session, `/treatment-plans/${plan.id}/payments`, {
    amount: 100, currency: 'USD', paidAt: new Date().toISOString(), method: 'CASH' });
  const measurements = [];
  for (const width of [390, 1440]) for (const colorScheme of ['light', 'dark'] as const) {
    await page.setViewportSize({ width, height: width === 390 ? 844 : 900 });
    await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' });
    for (const surface of ['cash', 'plan', 'statement'] as const) {
      const route = surface === 'cash' ? '/caja?tab=turnos' : `/patients/${patient.id}?tab=${surface === 'plan' ? 'treatment-plans' : 'account-statement'}`;
      await page.goto(`${origin}${route}`);
      await expect(page.locator('html')).toHaveClass(colorScheme === 'dark' ? /dark/ : /light/);
      const scope = surface === 'cash' ? page.locator('main') : page.locator(`#tabpanel-${surface === 'plan' ? 'treatment-plans' : 'account-statement'}`);
      if (surface === 'statement') {
        await scope.getByRole('button', { name: /^Ver por ítem/ }).click();
        await expect(scope.getByRole('table', { name: 'Cobrado por ítem del plan' })).toBeVisible();
      }
      const texts = surface === 'cash' ? ['Abierta'] : surface === 'plan' ? ['Realizado', 'Cubierto'] : ['Realizado', 'Efectivo', 'Cubierto'];
      for (const text of texts) {
        // En el teléfono los movimientos son tarjetas de DataList (B): el medio de
        // pago va como texto en la línea 2 («Plan … · Efectivo · Sede …»), no
        // como chip; se mide esa línea, que también debe llegar a AA.
        const phoneMethod = surface === 'statement' && text === 'Efectivo' && width < 640;
        const badge = (phoneMethod
          ? scope.getByRole('list', { name: 'Movimientos (abonos)' }).getByText(/(^| · )Efectivo( · |$)/)
          : scope.getByText(text, { exact: true })
        ).locator('visible=true').first();
        await expect(badge).toBeVisible({ timeout: 15_000 });
        await badge.scrollIntoViewIfNeeded();
        await page.evaluate(() => document.getAnimations().forEach((a) => { if (a.effect?.getComputedTiming().iterations !== Infinity) a.finish(); }));
        const measured = await contrast(badge);
        measurements.push({ surface, width, colorScheme, ...measured });
        writeFileSync(path.join(evidence, 'contrast.json'), JSON.stringify(measurements, null, 2));
        expect.soft(measured.ratio, `${surface} ${text} ${width} ${colorScheme}`).toBeGreaterThanOrEqual(4.5);
      }
      await expectNoHorizontalScroll(page);
      await audit(page, scope, evidence, `${surface}-${width}-${colorScheme}`);
    }
  }
  writeFileSync(path.join(evidence, 'contrast.json'), JSON.stringify(measurements, null, 2));
});
