// Browser audit of HTML captured from real React components in their rendered tests.
// Synthetic data only; this process never navigates to an application or API.
import { readFileSync } from 'node:fs';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { chromium } from '@playwright/test';
const snapshots = JSON.parse(readFileSync(0, 'utf8'));
const css = await postcss([tailwind()]).process(readFileSync('src/app/globals.css', 'utf8'), {
  from: 'src/app/globals.css',
});
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const reports = [];
  for (const { html, selector } of snapshots) {
    await page.setContent(`<html lang="es"><head><title>Component audit</title><style>${css.css}</style></head><body class="bg-surface text-ink"><main>${html}</main></body></html>`);
    await page.addScriptTag({ content: readFileSync(new URL(import.meta.resolve('axe-core/axe.min.js')), 'utf8') });
    const controls = page.locator(`${selector}:visible`);
    const count = await controls.count();
    if (!count) throw new Error(`No rendered controls match ${selector}`);
    for (let i = 0; i < count; i++) {
      const control = controls.nth(i);
      await control.scrollIntoViewIfNeeded();
      // Audit all default rules on the actual control, without disabled rules or exclusions.
      reports.push(await control.evaluate(async element => {
        const result = await window.axe.run(element);
        return { version: result.testEngine.version, html: element.outerHTML,
          violations: result.violations.map(v => ({ id: v.id, impact: v.impact,
            nodes: v.nodes.map(n => ({ html: n.html, summary: n.failureSummary })) })) };
      }));
    }
  }
  process.stdout.write(JSON.stringify(reports));
} finally { await browser.close(); }
