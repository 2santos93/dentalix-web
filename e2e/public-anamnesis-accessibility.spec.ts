import { writeFileSync } from 'node:fs';
import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { publicAnamnesisFixture } from './support/public-anamnesis-fixture';

test.use({ viewport: { width: 390, height: 844 } });

const endpoint = '**/api/v1/public/medical-history/*';

async function fixture(page: Page, color = '#0E7490') {
  await page.route(endpoint, route => route.fulfill({ json: route.request().method() === 'POST'
    ? { submittedAt: '2026-10-30T12:00:00.000Z' } : publicAnamnesisFixture(color) }));
}

async function continueForm(page: Page) {
  await page.getByRole('checkbox', { name: /Autorizo el tratamiento/ }).check();
  await page.getByRole('button', { name: 'Continuar' }).click();
}

test('Spanish render boundary retries /anamnesis/x without exposing the error', async ({ page }) => {
  let broken = true;
  await page.route(endpoint, route => {
    const data = publicAnamnesisFixture();
    return route.fulfill({ json: broken
      ? { ...data, consent: { required: false, policy: null }, questionnaire: { ...data.questionnaire, sections: null } }
      : data });
  });
  await page.goto('/anamnesis/x');
  await expect(page.getByRole('button', { name: 'Reintentar', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Algo salió mal' })).toBeVisible();
  await expect(page.locator('main')).not.toContainText('TypeError');
  broken = false;
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeVisible();
});

test('an actual unmatched URL has a Spanish 404', async ({ page }) => {
  const response = await page.goto('/no-existe');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { level: 1, name: 'Página no encontrada' })).toBeVisible();
  await expect(page.locator('main')).toContainText('No encontramos esta página');
});

for (const color of ['#0E7490', '#38BDF8', '#1E3A8A']) {
  for (const theme of ['light', 'dark'] as const) {
    test(`${color} ${theme}: contrast, native keyboard, focus and axe at 390px`, async ({ page }, testInfo) => {
      await page.emulateMedia({ colorScheme: theme });
      await fixture(page, color);
      const response = await page.goto('/anamnesis/synthetic-dx297');
      const headers = response!.headers();
      expect(headers['referrer-policy']).toBe('no-referrer');
      expect(headers['cache-control']).toContain('no-store');
      expect(headers['x-robots-tag']).toContain('noindex');
      const csp = headers['content-security-policy'];
      const nonce = csp.match(/'nonce-([^']+)'/)?.[1];
      expect(nonce).toBeTruthy();
      expect(await page.locator('script[nonce]').first().evaluate(el => (el as HTMLScriptElement).nonce)).toBe(nonce);
      await expect(page).toHaveTitle('Cuestionario de salud');
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /dark/ : /light/);
      await page.getByRole('button', { name: 'Leer la política completa' }).click();
      await expect(page.getByText('Política sintética de tratamiento de datos.')).toBeVisible();
      const policy = await page.getByRole('button', { name: 'Leer la política completa' }).evaluate(el => {
        return { text: getComputedStyle(el).color, background: getComputedStyle(el.closest('section')!).backgroundColor };
      });
      if (color === '#0E7490') {
        const consentAxe = await new AxeBuilder({ page }).analyze();
        expect(consentAxe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
        writeFileSync(testInfo.outputPath('axe-consent.json'), JSON.stringify(consentAxe, null, 2));
      }
      await continueForm(page);
      await expect(page.getByRole('heading', { level: 1, name: 'Cuestionario de salud' })).toBeFocused();
      await expect(page.getByText('No cierre esta página hasta enviar.')).toBeVisible();
      await page.keyboard.press('Tab');
      const first = page.getByRole('radiogroup', { name: '¿Tiene alguna alergia?' });
      await expect(first.getByRole('radio', { name: 'Sí', exact: true })).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(first.getByRole('radio', { name: 'No', exact: true })).toBeChecked();
      await expect(first.getByRole('radio', { name: 'No', exact: true })).toBeFocused();
      const label = first.locator('label').filter({ has: page.getByRole('radio', { checked: true }) });
      await expect(label.locator('svg[aria-hidden=true]')).toBeVisible();
      // Wait for transition-colors to finish; sampling mid-transition can falsely
      // report the previous neutral colors as a passing selected contrast.
      const fills: Record<string, string> = { '#0E7490': 'rgb(14, 116, 144)', '#38BDF8': 'rgb(56, 189, 248)', '#1E3A8A': 'rgb(30, 58, 138)' };
      await expect(label).toHaveCSS('background-color', fills[color]);
      const selected = await label.evaluate(el => {
        const style = getComputedStyle(el);
        return { text: style.color, background: style.backgroundColor,
          icon: getComputedStyle(el.querySelector('svg')!).color, weight: style.fontWeight,
          outline: style.outlineColor, outlineWidth: style.outlineWidth };
      });
      const otherWeight = await first.locator('label').first().evaluate(el => getComputedStyle(el).fontWeight);
      expect(Number(selected.weight)).toBeGreaterThan(Number(otherWeight));
      expect(selected.outlineWidth).toBe('2px');
      const borders = await page.locator('fieldset').evaluateAll(els => els.map(el => getComputedStyle(el).borderTopWidth));
      expect(borders.every(width => width === '0px')).toBe(true);
      const hex = (rgb: string) => '#' + rgb.match(/[\d.]+/g)!.slice(0, 3).map(n => Math.round(Number(n)).toString(16).padStart(2, '0')).join('');
      const { contrastRatio } = await import('../src/lib/color/contrast');
      const ratios = { selectedText: contrastRatio(hex(selected.text), hex(selected.background)),
        selectedIcon: contrastRatio(hex(selected.icon), hex(selected.background)),
        policy: contrastRatio(hex(policy.text), hex(policy.background)) };
      expect(ratios.selectedText).toBeGreaterThanOrEqual(4.5);
      expect(ratios.selectedIcon).toBeGreaterThanOrEqual(3);
      expect(ratios.policy).toBeGreaterThanOrEqual(4.5);
      writeFileSync(testInfo.outputPath('computed-contrast.json'), JSON.stringify({ color, theme, policy, selected, ratios }, null, 2));
      // Keep focus visible for the screenshots; audit the questionnaire too.
      if (color === '#0E7490') {
        const axe = await new AxeBuilder({ page }).analyze();
        expect(axe.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
        writeFileSync(testInfo.outputPath('axe-questionnaire.json'), JSON.stringify(axe, null, 2));
      }
      await page.screenshot({ path: testInfo.outputPath('questionnaire-390.png'), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.screenshot({ path: testInfo.outputPath('questionnaire-1440.png'), fullPage: true });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.getByRole('button', { name: 'Enviar respuestas' }).click();
      await expect(page.getByRole('group', { name: '¿Tiene diabetes?' }).locator('legend')).toBeFocused();
      await page.getByRole('radiogroup', { name: '¿Tiene diabetes?' }).getByText('No', { exact: true }).click();
      await page.getByRole('checkbox', { name: /verdadera/ }).check();
      await page.getByRole('button', { name: 'Enviar respuestas' }).click();
      await expect(page.getByRole('heading', { level: 1, name: '¡Gracias! Recibimos sus respuestas' })).toBeFocused();
    });
  }
}

for (const status of [404, 410]) {
  test(`unavailable link ${status} has one h1`, async ({ page }) => {
    await page.route(endpoint, route => route.fulfill({ status, json: { message: 'synthetic unavailable' } }));
    await page.goto('/anamnesis/synthetic-unavailable');
    await expect(page.getByRole('heading', { level: 1, name: 'Este enlace ya no es válido' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  });
}
