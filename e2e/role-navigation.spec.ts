import { test, expect, type Page } from './support/test';
import { loginAs } from './support/auth';
import { DEMO_ADMIN_EMAIL, DEMO_PASSWORD, DEMO_SUBDOMAIN } from './support/demo';
import { tenantOrigin } from './support/urls';
import { ALL_NAV_ITEMS, bottomTabsFor, canSee } from '../src/components/layouts/nav-config';
import { SETTINGS_SECTIONS } from '../src/components/settings/settings-sections';
import type { ClinicRole } from '../src/lib/me/me-api';
import type { ExtraPermission } from '../src/lib/auth/permissions';
import routeAccess from '../src/lib/auth/route-access.snapshot.json';

/**
 * DX-208 (TST-023): lo que ve cada rol, en la clínica DEMO, a 1440 y 390 px.
 *
 * El contrato de jest (`src/lib/auth/nav-roles-contract.test.ts`) ata cada
 * entrada del menú a la ruta de la API que la decide; aquí se comprueba en la
 * app real, con los cuatro usuarios sembrados por `seed:demo`:
 *
 * - 1440: la barra lateral enseña exactamente las entradas de `canSee` (con los
 *   permisos de serie del rol, sin concesiones); cada entrada visible carga sin
 *   aviso de permiso y SIN ninguna respuesta 403 de la API; cada entrada oculta,
 *   pedida por URL, enseña el aviso en español y ningún botón de escritura
 *   habilitado. Igual con /settings/recordatorios y /settings/tipos-de-cita
 *   (solo ADMIN).
 * - 390: la barra inferior son las 4 pestañas de `bottomTabsFor` y la hoja
 *   «Más» lleva el resto; una entrada oculta por URL también avisa a ese ancho.
 *
 * Una sesión por rol para los dos anchos (se cambia el viewport, no se vuelve a
 * entrar): son 4 tests, no 8, para no alargar el shard. Solo lee: no deja nada
 * en la demo (estado compartido, DX-337).
 */

const ORIGIN = tenantOrigin(DEMO_SUBDOMAIN);
const USERS: Record<ClinicRole, string> = {
  ADMIN: DEMO_ADMIN_EMAIL,
  DENTIST: process.env.E2E_DEMO_DENTIST_EMAIL ?? 'dentista@demo.dentalix.app',
  ASSISTANT: process.env.E2E_DEMO_ASSISTANT_EMAIL ?? 'asistente@demo.dentalix.app',
  RECEPTION: process.env.E2E_DEMO_RECEPTION_EMAIL ?? 'recepcion@demo.dentalix.app',
};

/** Pantallas de Ajustes que el ticket pide recorrer además del menú. */
const EXTRA_SETTINGS = ['/settings/recordatorios', '/settings/tipos-de-cita'];

/**
 * El aviso de «sin permiso» de las pantallas: el de `RouteRoleGate`, el de la
 * escalera de errores para un 403 (`apiErrorMessage`) y los propios de cada
 * vista («Tu rol no tiene acceso…», «Solo administración configura…»).
 */
const FORBIDDEN_NOTICE =
  /no tienes permiso|no tiene acceso|tu rol no puede|sin permiso|pide acceso|pídes[ea]l[ao]|solo (la |el )?administra(ción|dor)|solo para/i;

/** Botones que cambian algo: ninguno puede quedar habilitado en una pantalla sin permiso. */
const WRITE_BUTTON =
  /^(nuev[oa]|añadir|agregar|registrar|crear|guardar|editar|eliminar|borrar|anular|abrir (la )?caja|cerrar (la )?caja|cobrar|importar|subir|enviar|invitar|configurar|asignar|aceptar|rechazar|conciliar|publicar|desactivar|activar)\b/i;

const permissionsOf = (role: ClinicRole) =>
  (routeAccess.roleBasePermissions as Record<ClinicRole, ExtraPermission[]>)[role];
const settingsVisible = (href: string, role: ClinicRole) => {
  const entry = SETTINGS_SECTIONS.flatMap((s) => s.entries).find((e) => e.href === href);
  if (!entry) throw new Error(`${href} no está en SETTINGS_SECTIONS`);
  return !entry.visible || entry.visible(role);
};

/** Respuestas 403 de la API mientras corre `action` (las de la pantalla abierta). */
async function forbiddenResponsesDuring(page: Page, action: () => Promise<void>): Promise<string[]> {
  const seen: string[] = [];
  const onResponse = (res: { status(): number; url(): string; request(): { method(): string } }) => {
    if (res.status() === 403 && res.url().includes('/api/v1/')) {
      seen.push(`${res.request().method()} ${new URL(res.url()).pathname}`);
    }
  };
  page.on('response', onResponse);
  try {
    await action();
  } finally {
    page.off('response', onResponse);
  }
  return seen;
}

/** Abre `href` y espera a que la pantalla haya pedido lo suyo. */
async function openAndSettle(page: Page, href: string): Promise<void> {
  await page.goto(`${ORIGIN}${href}`);
  await expect(page.locator('#contenido h1').first(), `${href}: título de la pantalla`).toBeVisible({
    timeout: 15_000,
  });
  // Sin `networkidle` no se sabría si llegó un 403 tarde; algunos contadores
  // sondean, así que es una espera acotada y no un requisito.
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => {});
}

async function expectAllowed(page: Page, href: string): Promise<void> {
  const forbidden = await forbiddenResponsesDuring(page, () => openAndSettle(page, href));
  expect(forbidden, `${href}: ninguna petición de la pantalla da 403`).toEqual([]);
  await expect(page.locator('#contenido').getByText(FORBIDDEN_NOTICE), `${href}: sin aviso de permiso`).toHaveCount(0);
}

async function expectForbidden(page: Page, href: string): Promise<void> {
  await page.goto(`${ORIGIN}${href}`);
  const main = page.locator('#contenido');
  await expect(main.getByText(FORBIDDEN_NOTICE).first(), `${href}: aviso en español`).toBeVisible({
    timeout: 15_000,
  });
  // Un permiso no se arregla reintentando: el aviso no ofrece «Reintentar».
  await expect(
    main.getByRole('button', { name: 'Reintentar' }),
    `${href}: el aviso de permiso no ofrece reintentar`,
  ).toHaveCount(0);
  const enabledWrites: string[] = [];
  for (const button of await main.getByRole('button').all()) {
    const name = ((await button.getAttribute('aria-label')) ?? (await button.innerText())).trim();
    if (WRITE_BUTTON.test(name) && (await button.isVisible()) && (await button.isEnabled())) enabledWrites.push(name);
  }
  expect(enabledWrites, `${href}: ningún botón de escritura habilitado`).toEqual([]);
}

const NAV_HREFS = new Set(ALL_NAV_ITEMS.map((i) => i.href.split('?')[0]));

/**
 * Los destinos del menú que enlaza `scope`. Solo cuentan los de NAV: la barra
 * también puede llevar atajos que no son entradas (p. ej. «en clínica» junto a
 * la Agenda cuando hay pacientes esperando).
 */
async function linkHrefs(scope: ReturnType<Page['locator']>): Promise<string[]> {
  const hrefs = await scope.locator('a[href]').evaluateAll((links) => links.map((a) => a.getAttribute('href') ?? ''));
  return [...new Set(hrefs.map((h) => h.split('?')[0]))].filter((h) => NAV_HREFS.has(h)).sort();
}

const navHrefs = (items: readonly { href: string }[]) => [...new Set(items.map((i) => i.href.split('?')[0]))].sort();

test.describe.configure({ mode: 'serial' });

for (const role of ['ADMIN', 'DENTIST', 'ASSISTANT', 'RECEPTION'] as const) {
  test(`${role}: el menú enseña lo que la API le deja abrir, a 1440 y 390`, async ({ page }) => {
    test.setTimeout(240_000);
    const permissions = permissionsOf(role);
    const visible = ALL_NAV_ITEMS.filter((i) => canSee(i, role, permissions));
    const hidden = ALL_NAV_ITEMS.filter((i) => !canSee(i, role, permissions));

    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAs(page, ORIGIN, USERS[role], DEMO_PASSWORD);

    // --- 1440: la barra lateral -----------------------------------------
    await page.goto(`${ORIGIN}/dashboard`);
    const sidebar = page.getByRole('navigation', { name: 'Secciones' });
    // Las entradas por rol salen cuando se conoce el rol (y /me, por los
    // permisos): se espera a que cuadre en vez de leerla una vez.
    await expect.poll(() => linkHrefs(sidebar), { timeout: 15_000 }).toEqual(navHrefs(visible));

    for (const item of visible) await expectAllowed(page, item.href);
    for (const item of hidden) await expectForbidden(page, item.href);
    for (const href of EXTRA_SETTINGS) {
      if (settingsVisible(href, role)) await expectAllowed(page, href);
      else await expectForbidden(page, href);
    }

    // --- 390: barra inferior y hoja «Más» --------------------------------
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${ORIGIN}/dashboard`);
    const bottomBar = page.getByRole('navigation', { name: 'Principal' });
    const tabs = bottomTabsFor(role, permissions);
    await expect.poll(() => linkHrefs(bottomBar), { timeout: 15_000 }).toEqual(navHrefs(tabs));
    await bottomBar.getByRole('button', { name: 'Más', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Más' });
    await expect(sheet).toBeVisible();
    const inSheet = await linkHrefs(sheet.getByRole('navigation', { name: 'Más' }));
    expect([...new Set([...inSheet, ...navHrefs(tabs)])].sort(), 'barra inferior + «Más» = el menú del rol').toEqual(
      navHrefs(visible),
    );
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();

    // Una entrada oculta (o, para ADMIN, una de Ajustes) por URL, a 390.
    const hiddenAt390 = hidden[0]?.href ?? EXTRA_SETTINGS.find((h) => !settingsVisible(h, role));
    if (hiddenAt390) await expectForbidden(page, hiddenAt390);
    else await expectAllowed(page, '/caja/cartera');
  });
}
