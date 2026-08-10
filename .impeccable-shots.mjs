import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const ORIGIN = 'http://demo.localhost:3001';
const OUT = process.argv[2] ?? 'before';
const DIR = `/private/tmp/claude-501/-Users-ncaicedo-Desktop-dentalix/2792c18f-32d3-42cf-9329-62bdb0b571be/scratchpad/${OUT}`;
mkdirSync(DIR, { recursive: true });

const ROUTES = [
  ['patients', '/patients'],
  ['catalog', '/catalog'],
  ['inventory', '/inventory'],
  ['staff', '/staff'],
  ['agenda', '/agenda'],
  ['dashboard', '/dashboard'],
];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${ORIGIN}/login`);
await page.getByLabel('Correo electrónico').fill('admin@demo.com');
await page.getByLabel('Contraseña', { exact: true }).fill('Demo1234!');
await page.getByRole('button', { name: /Entrar|Iniciar/i }).click();
await page.waitForURL(/\/(dashboard|patients)/, { timeout: 20000 });

for (const [name, path] of ROUTES) {
  await page.goto(`${ORIGIN}${path}`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${DIR}/${name}-desktop.png` });
}

await page.setViewportSize({ width: 390, height: 844 });
for (const [name, path] of [ROUTES[0], ROUTES[1], ROUTES[3]]) {
  await page.goto(`${ORIGIN}${path}`);
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${DIR}/${name}-mobile.png` });
}

await browser.close();
console.log('done ->', DIR);
