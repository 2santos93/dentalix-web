// Test-only browser CSS resolver: consumes rendered component HTML, never live data.
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
  const page = await browser.newPage();
  const results = [];
  for (const { html, dark } of snapshots) {
    await page.setContent(`<html class="${dark ? 'dark' : ''}"><head><style>${css.css}</style></head><body>${html}</body></html>`);
    results.push(await page.evaluate(() => {
      const policy = document.querySelector('button[aria-expanded]');
      const label = document.querySelector('input[type=radio]:checked')?.closest('label');
      const unselected = document.querySelector('input[type=radio]:not(:checked)')?.closest('label');
      const style = (element) => element ? getComputedStyle(element) : null;
      const background = (element) => {
        // Resolve modern CSS color syntax and composite translucent fills over
        // their real ancestors. A /10 tint alone is not its visible background.
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const context = canvas.getContext('2d');
        const layers = [];
        for (let el = element; el; el = el.parentElement) {
          context.clearRect(0, 0, 1, 1);
          context.fillStyle = getComputedStyle(el).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          layers.push([...context.getImageData(0, 0, 1, 1).data]);
        }
        let rgb = [255, 255, 255];
        for (const [r, g, b, a] of layers.reverse()) {
          const alpha = a / 255;
          rgb = rgb.map((channel, i) => [r, g, b][i] * alpha + channel * (1 - alpha));
        }
        return `rgb(${rgb.map(Math.round).join(', ')})`;
      };
      return {
        policy: policy && { color: style(policy).color, background: background(policy) },
        selected: label && { color: style(label).color, background: background(label), weight: style(label).fontWeight,
          icon: label.querySelector('svg') && style(label.querySelector('svg')).color },
        unselectedWeight: unselected && style(unselected).fontWeight,
        fieldsetBorders: [...document.querySelectorAll('fieldset')].map(el => style(el).borderTopWidth),
      };
    }));
  }
  process.stdout.write(JSON.stringify(results));
} finally { await browser.close(); }
