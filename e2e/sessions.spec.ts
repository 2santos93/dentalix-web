import { randomUUID } from 'node:crypto';
import { test, expect } from './support/test';
import { loginAs } from './support/auth';
import { registerClinicViaApi, type ApiSession } from './support/api';
import { API_URL } from './support/urls';
import { E2E_BROWSER_LOCALE } from './support/regional';
import { axeInBothThemes } from './support/axe';
import { shot } from './support/qa-shot';

/**
 * DX-137: «Mi perfil › Sesiones» y el cierre de sesión por inactividad.
 *
 *   1. Con la sesión abierta en dos navegadores, «Sesiones» lista ambos con
 *      «Este dispositivo» marcado; cerrar el otro lo saca en su siguiente
 *      renovación. Sin IP completa en pantalla. axe en claro y oscuro.
 *   2. Con la inactividad de la clínica en 15 min (reloj simulado), una pestaña
 *      sin uso vuelve al login con «Sesión cerrada por inactividad» y sin los
 *      datos que mostraba.
 * Las dos, en escritorio (1440) y en un móvil (390).
 */
const PASSWORD = 'Caracas-2026!';
const FIREFOX_LINUX = 'Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0';

async function newClinic(
  playwright: { request: { newContext: () => Promise<import('@playwright/test').APIRequestContext> } },
  prefix: string,
) {
  const suffix = randomUUID().slice(0, 8);
  const clinic = {
    subdomain: `${prefix}-${suffix}`,
    clinicName: `Odontología Chacao ${suffix}`,
    fullName: 'Dra. María Pérez',
    email: `${prefix}.${suffix}@example.com`,
    password: PASSWORD,
  };
  const api = await playwright.request.newContext();
  const session = await registerClinicViaApi(api, clinic);
  return { clinic, session, api };
}

async function setIdleMinutes(api: import('@playwright/test').APIRequestContext, session: ApiSession, minutes: number) {
  const res = await api.put(`${API_URL}/security-policy`, {
    headers: session.headers,
    data: { requireAdminMfa: false, sessionIdleMinutes: minutes },
  });
  expect(res.ok(), `PUT /security-policy falló: ${await res.text()}`).toBeTruthy();
}

for (const width of [1440, 390] as const) {
  test.describe(`a ${width} px`, () => {
    test.use({ viewport: { width, height: width === 390 ? 844 : 900 } });

    test('«Sesiones» lista los dos navegadores y cerrar el otro lo saca', async ({ page, browser, playwright }) => {
      const { clinic, session, api } = await newClinic(playwright, `sesiones${width}`);
      await api.dispose();
      await loginAs(page, session.origin, clinic.email, PASSWORD);

      const otherContext = await browser.newContext({
        locale: E2E_BROWSER_LOCALE,
        timezoneId: 'America/Caracas',
        userAgent: FIREFOX_LINUX,
      });
      try {
        const other = await otherContext.newPage();
        await loginAs(other, session.origin, clinic.email, PASSWORD);

        await page.goto(`${session.origin}/settings/profile`);
        const section = page.getByRole('region', { name: 'Sesiones' });
        await expect(section.getByText('Este dispositivo')).toBeVisible({ timeout: 15_000 });
        await expect(section.getByText('Firefox en Linux')).toBeVisible();
        await expect(section.getByText(/Red \S+\/(24|48)\b/).first()).toBeVisible();
        // Nunca la IP completa.
        await expect(section).not.toContainText(/\b\d+\.\d+\.\d+\.(?!0\/24)\d+\b/);
        // A 390 px la página no se desborda a lo ancho.
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(overflow).toBeLessThanOrEqual(0);

        const axe = await axeInBothThemes(page, section);
        expect(axe.light, 'axe en claro').toEqual([]);
        expect(axe.dark, 'axe en oscuro').toEqual([]);
        await section.scrollIntoViewIfNeeded();
        await shot(page, 'dx137-sessions', width);

        await section.getByRole('button', { name: 'Cerrar la sesión de Firefox en Linux' }).click();
        await expect(section.getByText('Firefox en Linux')).toBeHidden({ timeout: 10_000 });

        // El otro navegador cae en su siguiente renovación (al recargar).
        await other.goto(`${session.origin}/patients`);
        await expect(other).toHaveURL(`${session.origin}/login`, { timeout: 15_000 });
        // Y este sigue dentro.
        await page.goto(`${session.origin}/patients`);
        await expect(page.getByRole('heading', { name: 'Pacientes', level: 1 })).toBeVisible({ timeout: 15_000 });
      } finally {
        await otherContext.close();
      }
    });

    test('con la inactividad en 15 min, una pestaña sin uso vuelve al login sin datos en pantalla', async ({
      page,
      playwright,
    }) => {
      const { clinic, session, api } = await newClinic(playwright, `inactiva${width}`);
      await setIdleMinutes(api, session, 15);
      await api.dispose();

      await page.clock.install();
      await loginAs(page, session.origin, clinic.email, PASSWORD);
      // Los 15 min de la clínica llegan con `/me`: se espera su respuesta
      // (registrada ANTES de navegar) antes de mover el reloj; si no, el
      // umbral podía seguir en los 60 por defecto al avanzar (DX-574).
      const me = page.waitForResponse(
        (res) => new URL(res.url()).pathname.endsWith('/api/v1/me') && res.request().method() === 'GET' && res.ok(),
      );
      await page.goto(`${session.origin}/patients`);
      await me;
      const heading = page.getByRole('heading', { name: 'Pacientes', level: 1 });
      await expect(heading).toBeVisible({ timeout: 15_000 });

      // 14 minutos: aún dentro.
      await page.clock.fastForward('14:00');
      await expect(heading).toBeVisible();

      // Pasa de 15 sin tocar nada: al login, con el motivo.
      await page.clock.fastForward('01:30');
      await expect(page).toHaveURL(`${session.origin}/login?motivo=inactividad`, { timeout: 15_000 });
      await expect(page.getByText('Sesión cerrada por inactividad.')).toBeVisible();
      await expect(heading).toBeHidden();
      await shot(page, 'dx137-idle-login', width);

      // Y la sesión ya no se recupera recargando.
      await page.goto(`${session.origin}/patients`);
      await expect(page).toHaveURL(new RegExp(`${session.origin}/login`), { timeout: 15_000 });
    });
  });
}
