import { randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  devices,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { test, expect, watchCspViolations } from './test';
import { E2E_BROWSER_LOCALE } from './regional';
import { addStaffViaApi, apiPost, registerClinicViaApi, type ApiSession } from './api';
import { loginAs } from './auth';
import { axeViolations } from './axe';
import { atSede, sedeDayFromToday, sedeWeekdayFromToday } from './clock';
import { API_URL } from './urls';
import { ALL_NAV_ITEMS, canSee } from '../../src/components/layouts/nav-config';
import { SETTINGS_SECTIONS } from '../../src/components/settings/settings-sections';
import type { ClinicRole } from '../../src/lib/me/me-api';
import type { ExtraPermission } from '../../src/lib/auth/permissions';
import routeAccess from '../../src/lib/auth/route-access.snapshot.json';

/**
 * DX-587: barrido responsive de TODAS las pantallas, por rol y por ancho.
 *
 * Cada ancho vive en su propio fichero (`e2e/responsive-sweep/*.spec.ts`) para
 * que `--shard` de la CI los reparta: la E2E reparte por fichero (DX-457).
 * Cada fichero siembra su clínica por la API (ADMIN, odontóloga y recepción;
 * paciente con plan aceptado, abono y cita; inventario, prospecto, equipo,
 * lista de precios y turno de caja abierto) y corre un test por rol más uno de
 * páginas públicas. Dentro del test, cada ruta es un `test.step` y sus fallos
 * son `expect.soft`: un barrido dice TODO lo que falla, no solo lo primero.
 *
 * En cada ruta y ancho comprueba (`inspectPage`, en el navegador):
 * (a) ni el documento ni `<main>` se desplazan en horizontal;
 * (b) ningún elemento visible se sale del viewport por los lados, salvo dentro
 *     de un marco que se desplaza en horizontal a propósito (tabla en
 *     `overflow-x-auto`); y ningún texto se sale de su caja: un elemento con
 *     texto propio y `scrollWidth > clientWidth` cuenta si su `overflow-x` es
 *     `visible` (el texto pisa a su vecino) o si recorta (`hidden`/`clip`) sin
 *     `text-overflow: ellipsis` ni `title`/`aria-label` que diga el texto
 *     entero. Los controles de formulario (el valor de un input se desplaza
 *     dentro) y lo `sr-only` no cuentan;
 * (c) el `h1` está en pantalla y nada lo tapa (`elementFromPoint` en su
 *     centro), y la acción principal (`[data-page-primary-action]`: el hueco de
 *     acciones de `PageHeader` y el de `ListToolbar`), llevada a la vista,
 *     tampoco está tapada por la barra inferior ni por cabeceras fijas;
 * (d) en los anchos táctiles, cada control visible mide ≥ 44×44 (su caja, la
 *     de su `<label>` o la de su `::before/::after` absoluto que amplía el
 *     área); los enlaces en línea dentro de un párrafo quedan fuera (WCAG
 *     2.5.8, excepción «inline»);
 * (e) axe sin violaciones en toda la página, sin reglas desactivadas (como el
 *     resto de la suite: ningún spec excluye nada).
 *
 * Capturas: con `E2E_SWEEP_SHOTS_DIR` (local) una por ruta y ancho; en la CI
 * solo la de cada ruta que falla, adjunta al test (va al artefacto del shard).
 */

export const PASSWORD = 'Password123!';

export type SweepRole = Extract<ClinicRole, 'ADMIN' | 'DENTIST' | 'RECEPTION'>;
export const SWEEP_ROLES: readonly SweepRole[] = ['ADMIN', 'DENTIST', 'RECEPTION'];

export interface SweepSize {
  id: string;
  width: number;
  height: number;
  touch: boolean;
}

/** Los siete tamaños de DESIGN.md → «Anchos soportados y cómo se prueban». */
export const SWEEP_SIZES = {
  '320': { id: '320', width: 320, height: 640, touch: false },
  '360': { id: '360', width: 360, height: 740, touch: false },
  '390': { id: '390', width: 390, height: 844, touch: true },
  '768': { id: '768', width: 768, height: 1024, touch: true },
  '1024': { id: '1024', width: 1024, height: 768, touch: false },
  '1440': { id: '1440', width: 1440, height: 900, touch: false },
  '844x390': { id: '844x390', width: 844, height: 390, touch: true },
} as const satisfies Record<string, SweepSize>;

/** Lo que la siembra deja para las rutas con parámetro y las públicas. */
export interface SweepSeed {
  origin: string;
  emails: Record<SweepRole, string>;
  ids: Record<string, string>;
}

const PIXEL = devices['Pixel 7'];

/** Las opciones de `test.use` de un tamaño: viewport y, si es táctil, el dedo. */
export function contextOptionsFor(size: SweepSize) {
  const viewport = { width: size.width, height: size.height };
  if (!size.touch) return { viewport };
  return {
    viewport,
    userAgent: PIXEL.userAgent,
    deviceScaleFactor: PIXEL.deviceScaleFactor,
    isMobile: true,
    hasTouch: true,
  };
}

async function send<T>(
  request: APIRequestContext,
  session: ApiSession,
  method: 'get' | 'put' | 'patch',
  route: string,
  data?: object,
): Promise<T> {
  const res = await request[method](`${API_URL}${route}`, { headers: session.headers, data });
  expect(res.ok(), `${method.toUpperCase()} ${route} falló: ${await res.text()}`).toBeTruthy();
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Una clínica con contenido real para cada pantalla (ver la cabecera). */
export async function seedSweepClinic(request: APIRequestContext, sizeId: string): Promise<SweepSeed> {
  const suffix = randomUUID().replace(/-/g, '').slice(0, 10);
  const tag = sizeId.replace(/[^a-z0-9]/gi, '');
  const emails: Record<SweepRole, string> = {
    ADMIN: `barrido.admin.${tag}.${suffix}@example.com`,
    DENTIST: `barrido.odonto.${tag}.${suffix}@example.com`,
    RECEPTION: `barrido.recep.${tag}.${suffix}@example.com`,
  };
  const admin = await registerClinicViaApi(request, {
    subdomain: `barrido-${tag}-${suffix}`.slice(0, 40),
    clinicName: `Clínica Odontológica Los Palos Grandes ${suffix}`,
    fullName: 'María Alejandra Rodríguez Pérez',
    email: emails.ADMIN,
    password: PASSWORD,
  });
  await addStaffViaApi(request, admin, {
    fullName: 'Dra. Valentina Hernández Gutiérrez',
    email: emails.DENTIST,
    role: 'DENTIST',
    password: PASSWORD,
  });
  await addStaffViaApi(request, admin, {
    fullName: 'Carolina Mendoza Briceño',
    email: emails.RECEPTION,
    role: 'RECEPTION',
    password: PASSWORD,
  });

  const directory = await send<{ items?: { id: string; role: string }[] } | { id: string; role: string }[]>(
    request,
    admin,
    'get',
    '/staff/directory',
  );
  const staff = Array.isArray(directory) ? directory : (directory.items ?? []);
  const dentist = staff.find((s) => s.role === 'DENTIST') ?? staff[0];
  const locations = await send<{ id: string }[] | { items: { id: string }[] }>(request, admin, 'get', '/locations');
  const location = (Array.isArray(locations) ? locations : locations.items)[0];

  const schedule = await request.put(`${API_URL}/locations/schedule`, {
    headers: admin.headers,
    data: {
      ranges: [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, startMinute: 480, endMinute: 1080 })),
    },
  });
  expect(schedule.ok(), await schedule.text()).toBeTruthy();

  // Clínica bimoneda (USD y bolívares) con la tasa de hoy: así el indicador de
  // la tasa (DX-584/DX-586) sale en la barra de cada pantalla y entra en el barrido.
  await send(request, admin, 'put', '/exchange/settings', { acceptedCurrencies: ['USD', 'VES'] });
  await send(request, admin, 'put', '/exchange/currency-texts', { entries: [{ currency: 'VES', text: 'Bs.' }] });
  await apiPost(request, admin, '/exchange/manual-rates', { date: sedeDayFromToday(0), currency: 'VES', rate: 36.5 });

  const patient = await apiPost<{ id: string }>(request, admin, '/patients', {
    firstName: 'Ana Gabriela',
    lastName: `Fernández de la Concepción ${suffix}`,
    docType: 'NATIONAL_ID',
    docNumber: `V${suffix}`.slice(0, 20),
    sex: 'F',
    birthDate: '1988-03-14',
    phone: '+58 414 555 0123',
    email: `ana.${suffix}@example.com`,
  });
  const catalog = await apiPost<{ id: string }>(request, admin, '/catalog/items', {
    code: `brr-${suffix}`,
    kind: 'PROCEDURE',
    labelEs: 'Corona de porcelana sobre metal con muñón colado',
    color: '#3366CC',
    defaultPrice: 450,
  });
  const plan = await apiPost<{ id: string }>(request, admin, `/patients/${patient.id}/treatment-plans`, {
    currency: 'USD',
  });
  const item = await apiPost<{ id: string }>(request, admin, `/treatment-plans/${plan.id}/items`, {
    toothNumber: '16',
    catalogItemId: catalog.id,
  });
  await send(request, admin, 'patch', `/treatment-plans/${plan.id}/items/${item.id}`, { status: 'ACCEPTED' });
  await apiPost(request, admin, `/treatment-plans/${plan.id}/payments`, {
    amount: 150,
    currency: 'USD',
    paidAt: new Date().toISOString(),
    method: 'CASH',
  });
  const day = sedeWeekdayFromToday(1);
  const appointment = await apiPost<{ id: string }>(request, admin, '/appointments', {
    patientId: patient.id,
    providerId: dentist.id,
    start: atSede(day, '10:00').toISOString(),
    end: atSede(day, '10:30').toISOString(),
  });
  const confirmation = await apiPost<{ url: string }>(
    request,
    admin,
    `/appointments/${appointment.id}/confirmation-link`,
    {},
  );

  const inventory = await apiPost<{ id: string }>(request, admin, '/inventory/items', {
    name: 'Guantes de nitrilo talla M (caja de 100 unidades)',
    unit: 'caja',
    minStock: 5,
  });
  const lead = await apiPost<{ id: string }>(request, admin, '/leads', {
    fullName: 'José Gregorio Contreras Villalobos',
    phone: '+58 412 555 0199',
    channel: 'INSTAGRAM',
  });
  const equipment = await apiPost<{ id: string }>(request, admin, '/equipment', {
    locationId: location.id,
    name: 'Autoclave clase B de 23 litros',
    category: 'AUTOCLAVE',
  });
  const priceList = await apiPost<{ id: string }>(request, admin, '/price-lists', {
    name: 'Tarifa preferencial convenio empresas',
    currency: 'USD',
    locationId: location.id,
  });
  const cash = await apiPost<{ id: string }>(request, admin, '/cash-sessions/open', {
    floats: [{ currency: 'USD', amount: 50 }],
  });

  // Enlaces públicos con token real: confirmar la cita y el portal del paciente.
  const tokens: Record<string, string> = {
    confirmar: new URL(confirmation.url).pathname.split('/').pop()!,
  };
  const access = await request.post(`${API_URL}/patients/${patient.id}/access-links`, {
    headers: admin.headers,
    data: { scopes: ['APPOINTMENTS', 'PLANS', 'ACCOUNT'], ttlDays: 14 },
  });
  if (access.ok()) {
    const body = (await access.json()) as { url?: string };
    if (body.url) tokens.portal = new URL(body.url).pathname.split('/').pop()!;
  }

  return {
    origin: admin.origin,
    emails,
    ids: {
      patient: patient.id,
      plan: plan.id,
      staff: dentist.id,
      location: location.id,
      inventory: inventory.id,
      lead: lead.id,
      equipment: equipment.id,
      priceList: priceList.id,
      cash: cash.id,
      missing: '00000000-0000-4000-8000-000000000000',
      bogus: 'enlace-de-prueba-no-valido-0000000000000000',
      confirmar: tokens.confirmar,
      portal: tokens.portal ?? 'enlace-de-prueba-no-valido-0000000000000000',
    },
  };
}

const permissionsOf = (role: ClinicRole) =>
  (routeAccess.roleBasePermissions as Record<ClinicRole, ExtraPermission[]>)[role];

/**
 * Las rutas de la app (`src/app/(app)`), como plantillas (`:patient` = el id
 * sembrado: el nombre del test se fija antes de sembrar). `scope`:
 * - `nav`: se decide con el menú (`canSee` de nav-config, contrato DX-208);
 * - `settings`: con `visible` de SETTINGS_SECTIONS (mismo contrato);
 * - `all`: los tres roles (ficha y alta de paciente, subpantallas de agenda);
 * - `admin`: pantallas sin entrada en el menú; las abre ADMIN.
 * `/anamnesis-por-revisar/:missing` es el estado «no encontrada» (no hay
 * anamnesis enviada sin pasar por el enlace público del paciente).
 */
type Scope = 'nav' | 'settings' | 'all' | 'admin';
function appRoutes(): { path: string; scope: Scope }[] {
  const navPaths = ALL_NAV_ITEMS.map((i) => ({ path: i.href, scope: 'nav' as const }));
  const settingsPaths = [
    { path: '/settings', scope: 'all' as const },
    ...SETTINGS_SECTIONS.flatMap((s) => s.entries).map((e) => ({ path: e.href, scope: 'settings' as const })),
  ];
  const all: { path: string; scope: Scope }[] = [
    { path: '/patients/:patient', scope: 'all' },
    { path: '/patients/new', scope: 'all' },
    { path: '/agenda/en-clinica', scope: 'all' },
    { path: '/agenda/controles-postoperatorios', scope: 'all' },
  ];
  const adminOnly: string[] = [
    '/anamnesis-por-revisar/:missing',
    '/ayuda/software-de-imagen',
    '/caja/descuentos',
    '/caja/turnos/:cash',
    '/honorarios',
    '/inventory/:inventory',
    '/laboratorio',
    '/ordenes-sin-resultado',
    '/patients/duplicados',
    '/patients/mayoria-de-edad',
    '/patients/ortodoncia',
    '/prospectos/:lead',
    '/prospectos/informe',
    '/recall',
    '/solicitudes-online',
    '/staff/:staff',
    '/settings/equipos/:equipment',
    '/settings/listas-de-precios/:priceList',
    '/settings/sedes/:location',
    '/settings/presupuestos/seguimiento',
    '/presentar/patients/:patient/treatment-plans/:plan',
  ];
  return [...navPaths, ...all, ...settingsPaths, ...adminOnly.map((p) => ({ path: p, scope: 'admin' as const }))];
}

/** Las rutas (plantillas) que el barrido abre con `role` (ver `appRoutes`). */
export function routesFor(role: SweepRole): string[] {
  const entries = SETTINGS_SECTIONS.flatMap((s) => s.entries);
  const routes = appRoutes().filter(({ path: p, scope }) => {
    if (scope === 'all') return true;
    if (scope === 'admin') return role === 'ADMIN';
    if (scope === 'nav') {
      const item = ALL_NAV_ITEMS.find((i) => i.href === p)!;
      return canSee(item, role, permissionsOf(role));
    }
    const entry = entries.find((e) => e.href === p)!;
    return !entry.visible || entry.visible(role);
  });
  // Sin duplicados: una entrada de Ajustes puede repetir una del menú.
  return [...new Set(routes.map((r) => r.path))];
}

/**
 * Las públicas (`src/app/(auth)` y `src/app/(public)`): las de acceso y las de
 * enlace. Con token real donde la API lo da sin email (confirmar la cita, el
 * portal del paciente); el resto, con un token que no existe: su estado
 * «enlace no válido», que es la misma `PublicPage` que las envuelve.
 */
export const PUBLIC_ROUTES: readonly string[] = [
  '/login',
  '/register',
  '/olvide-contrasena',
  '/restablecer/:bogus',
  '/invitacion/:bogus',
  '/no-fui-yo/:bogus',
  '/register/verificar/:bogus',
  '/reservar',
  '/confirmar/:confirmar',
  '/mi-clinica/:portal',
  '/anamnesis/:bogus',
  '/baja/:bogus',
  '/certificado/copia/:bogus',
  '/conformidad/:bogus',
  '/copia/:bogus',
  '/firmar/:bogus',
  '/hueco/:bogus',
  '/indicaciones/:bogus',
  '/orden/copia/:bogus',
  '/pago/:bogus',
  '/receta/RX-0000-0000',
  '/receta/copia/:bogus',
  '/resumen/baja/:bogus',
  // DX-265: el QR de llegada de la sede (con un token que no existe: «ya no está activo»).
  '/llegada/:bogus',
];

/** La ruta real de una plantilla con los ids sembrados. */
export function resolveRoute(template: string, ids: Record<string, string>): string {
  return template.replace(/:(\w+)/g, (_, key: string) => {
    const value = ids[key];
    if (!value) throw new Error(`la siembra no dejó «${key}» para ${template}`);
    return value;
  });
}

export interface PageProblem {
  check: 'a-scroll' | 'b-desborde' | 'b-texto' | 'c-h1' | 'c-accion' | 'd-tactil' | 'e-axe';
  detail: string;
}

/**
 * Las comprobaciones (a)–(d) en una sola pasada por el DOM (ver la cabecera).
 * Devuelve los problemas; vacío = la ruta pasa.
 */
async function inspectPage(page: Page, touch: boolean): Promise<PageProblem[]> {
  return page.evaluate((touchMode) => {
    const problems: { check: string; detail: string }[] = [];
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const describe = (el: Element) => {
      const id = el.id ? `#${el.id}` : '';
      const testId = el.getAttribute('data-testid');
      const cls = typeof el.className === 'string' ? el.className.split(/\s+/).slice(0, 4).join('.') : '';
      const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 50);
      const name = el.getAttribute('aria-label');
      return `<${el.tagName.toLowerCase()}${id}${testId ? `[data-testid=${testId}]` : ''}${cls ? `.${cls}` : ''}>${name ? ` «${name}»` : ''}${text ? ` "${text}"` : ''}`;
    };

    // (a) El documento y `<main>` sin scroll horizontal.
    const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;
    if (docOverflow > 0)
      problems.push({ check: 'a-scroll', detail: `el documento se desplaza ${docOverflow}px en horizontal` });
    for (const main of Array.from(document.querySelectorAll('main'))) {
      const over = main.scrollWidth - main.clientWidth;
      if (over > 0) problems.push({ check: 'a-scroll', detail: `<main> se desplaza ${over}px en horizontal` });
    }

    const isPageScroller = (el: Element) =>
      el === document.documentElement || el === document.body || el.tagName === 'MAIN';
    const isHidden = (el: Element): boolean => {
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') return true;
      const rect = el.getBoundingClientRect();
      return rect.width <= 1 || rect.height <= 1;
    };
    const isSrOnly = (el: Element): boolean => {
      for (let node: Element | null = el; node && node !== document.body; node = node.parentElement) {
        const s = getComputedStyle(node);
        if (s.clip === 'rect(0px, 0px, 0px, 0px)' || s.clipPath === 'inset(50%)') return true;
        const r = node.getBoundingClientRect();
        if (s.position === 'absolute' && r.width <= 1 && r.height <= 1) return true;
        if (s.opacity === '0' && node !== el) return true;
      }
      return false;
    };
    /** Primer antepasado (no de página) que recorta o desplaza en horizontal. */
    const clippingAncestor = (el: Element): Element | null => {
      for (let node = el.parentElement; node; node = node.parentElement) {
        if (isPageScroller(node)) return null;
        const ox = getComputedStyle(node).overflowX;
        if (ox !== 'visible') return node;
      }
      return null;
    };

    // (b) Nada visible fuera del viewport por los lados; ningún texto fuera de su caja.
    const reported = new Set<Element>();
    const all = Array.from(document.body.querySelectorAll('*'));
    for (const el of all) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
      if (el.closest('[aria-hidden="true"], [inert]')) continue;
      if (isHidden(el)) continue;
      const rect = el.getBoundingClientRect();
      const escapes = rect.right > vw + 1 || rect.left < -1;
      if (escapes && !clippingAncestor(el) && !isSrOnly(el)) {
        // Solo el elemento más externo que se sale (sus hijos se salen con él).
        let parentReported = false;
        for (let p = el.parentElement; p; p = p.parentElement) if (reported.has(p)) parentReported = true;
        reported.add(el);
        if (!parentReported) {
          problems.push({
            check: 'b-desborde',
            detail: `${describe(el)} se sale del viewport (x ${Math.round(rect.left)}→${Math.round(rect.right)}, ancho ${vw})`,
          });
        }
      }
      const ownText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && n.textContent!.trim());
      if (!ownText) continue;
      if (el.matches('input, textarea, select, option, [contenteditable="true"]')) continue;
      const style = getComputedStyle(el);
      if (style.display === 'inline' || style.display === 'contents') continue;
      if (el.scrollWidth - el.clientWidth <= 1) continue;
      if (isSrOnly(el)) continue;
      if (style.overflowX === 'visible') {
        problems.push({
          check: 'b-texto',
          detail: `${describe(el)}: el texto se sale de su caja (${el.scrollWidth} > ${el.clientWidth}px)`,
        });
      } else if (style.overflowX === 'hidden' || style.overflowX === 'clip') {
        const fullText = (el.textContent ?? '').trim();
        const named = (node: Element | null): boolean => {
          // El texto entero en un `title` o nombre accesible del elemento o de su
          // control (hasta 3 niveles): el mismo texto, o la versión larga de una
          // abreviatura («Ana F.» → title «Ana Gabriela Fernández …»).
          const firstWord = fullText.split(/\s+/)[0] ?? '';
          let depth = 0;
          for (let n = node; n && n !== document.body && depth <= 3; n = n.parentElement, depth++) {
            const label = `${n.getAttribute('title') ?? ''} ${n.getAttribute('aria-label') ?? ''}`.trim();
            if (fullText && label.includes(fullText.slice(0, 20))) return true;
            if (firstWord && label.startsWith(firstWord)) return true;
          }
          return false;
        };
        if (style.textOverflow !== 'ellipsis' && !named(el)) {
          problems.push({
            check: 'b-texto',
            detail: `${describe(el)}: texto recortado sin elipsis ni tooltip (${el.scrollWidth} > ${el.clientWidth}px)`,
          });
        } else if (style.textOverflow === 'ellipsis' && !named(el)) {
          problems.push({
            check: 'b-texto',
            detail: `${describe(el)}: texto con elipsis sin nombre accesible ni title con el texto entero`,
          });
        }
      }
    }

    // (c) h1 en pantalla y sin tapar; acción principal sin tapar.
    const covered = (el: Element): string | null => {
      const r = el.getBoundingClientRect();
      const x = Math.min(Math.max(r.left + r.width / 2, 0), vw - 1);
      const y = Math.min(Math.max(r.top + Math.min(r.height / 2, 12), 0), vh - 1);
      const hit = document.elementFromPoint(x, y);
      if (!hit) return 'fuera de la pantalla';
      if (el === hit || el.contains(hit) || hit.contains(el)) return null;
      return `tapado por ${describe(hit)}`;
    };
    const h1s = Array.from(document.querySelectorAll('h1')).filter((h) => !isHidden(h) && !isSrOnly(h));
    if (h1s.length === 0) {
      problems.push({ check: 'c-h1', detail: 'no hay ningún h1 visible' });
    } else {
      const h1 = h1s[0];
      const r = h1.getBoundingClientRect();
      if (r.top < 0 || r.top >= vh)
        problems.push({
          check: 'c-h1',
          detail: `el h1 no está en pantalla al cargar (top ${Math.round(r.top)}, alto ${vh})`,
        });
      else {
        const why = covered(h1);
        if (why) problems.push({ check: 'c-h1', detail: `el h1 está ${why}` });
      }
    }

    // (d) Objetivos táctiles de 44×44.
    if (touchMode) {
      const selector = [
        'a[href]',
        'button',
        'input:not([type=hidden])',
        'select',
        'textarea',
        'summary',
        '[role=button]',
        '[role=link]',
        '[role=tab]',
        '[role=checkbox]',
        '[role=radio]',
        '[role=switch]',
        '[role=menuitem]',
        '[role=combobox]',
      ].join(',');
      const pseudoBox = (el: Element, r: DOMRect) => {
        let box = { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
        for (const pseudo of ['::before', '::after']) {
          const s = getComputedStyle(el, pseudo);
          if (s.content === 'none' || s.position !== 'absolute') continue;
          // El pseudo absoluto se coloca contra su bloque contenedor: el propio
          // control si está posicionado; si no, el antepasado posicionado (el
          // patrón «enlace estirado» `after:absolute after:inset-0` sobre la fila).
          let cb: Element = el;
          if (getComputedStyle(el).position === 'static') {
            let node = el.parentElement;
            while (node && node !== document.body && getComputedStyle(node).position === 'static') {
              node = node.parentElement;
            }
            cb = node ?? document.body;
          }
          const c = cb.getBoundingClientRect();
          const px = (v: string) => (v.endsWith('px') ? parseFloat(v) : null);
          const left = px(s.left);
          const right = px(s.right);
          const top = px(s.top);
          const bottom = px(s.bottom);
          const pw = parseFloat(s.width) || 0;
          const ph = parseFloat(s.height) || 0;
          const pl = left !== null ? c.left + left : right !== null ? c.right - right - pw : r.left;
          const pr = right !== null ? c.right - right : pl + pw;
          const pt = top !== null ? c.top + top : bottom !== null ? c.bottom - bottom - ph : r.top;
          const pb = bottom !== null ? c.bottom - bottom : pt + ph;
          box = {
            left: Math.min(box.left, pl),
            right: Math.max(box.right, pr),
            top: Math.min(box.top, pt),
            bottom: Math.max(box.bottom, pb),
          };
        }
        return box;
      };
      for (const el of Array.from(document.querySelectorAll(selector))) {
        if (el.closest('[aria-hidden="true"], [inert]')) continue;
        if ((el as HTMLElement).matches(':disabled')) continue;
        const style = getComputedStyle(el);
        if (style.visibility === 'hidden' || style.display === 'none' || style.pointerEvents === 'none') continue;
        const r = el.getBoundingClientRect();
        if (r.width <= 1 || r.height <= 1) continue;
        if (isSrOnly(el) && !el.matches('input')) continue;
        // Enlace en línea dentro de un texto: excepción «inline» de WCAG 2.5.8.
        if (el.tagName === 'A' && style.display === 'inline') {
          const block = el.parentElement;
          const blockText = (block?.textContent ?? '').trim();
          if (block && blockText.length > (el.textContent ?? '').trim().length + 1) continue;
        }
        let box = pseudoBox(el, r);
        const label = (el as HTMLInputElement).labels?.[0] ?? el.closest('label');
        if (label) {
          const lr = label.getBoundingClientRect();
          box = {
            left: Math.min(box.left, lr.left),
            right: Math.max(box.right, lr.right),
            top: Math.min(box.top, lr.top),
            bottom: Math.max(box.bottom, lr.bottom),
          };
        }
        // Un input oculto a la vista (opacity 0) bajo su etiqueta: cuenta la etiqueta.
        if (isSrOnly(el) && !label) continue;
        const w = Math.round((box.right - box.left) * 100) / 100;
        const h = Math.round((box.bottom - box.top) * 100) / 100;
        if (w < 44 || h < 44) {
          problems.push({ check: 'd-tactil', detail: `${describe(el)} mide ${w}×${h}px (< 44×44)` });
        }
      }
    }
    return problems as { check: never; detail: string }[];
  }, touch);
}

/** La acción principal (si la hay), llevada a la vista: que nada la tape. */
async function inspectPrimaryAction(page: Page): Promise<PageProblem[]> {
  const action = page.locator('[data-page-primary-action]').locator('a[href], button').locator('visible=true').first();
  if ((await action.count()) === 0) return [];
  await action.scrollIntoViewIfNeeded().catch(() => undefined);
  const why = await action.evaluate((el) => {
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= window.innerHeight) return 'fuera de la pantalla tras desplazarla a la vista';
    const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (!hit) return 'fuera de la pantalla';
    if (el === hit || el.contains(hit)) return null;
    const label = (hit.textContent ?? '').trim().slice(0, 40);
    return `tapada por <${hit.tagName.toLowerCase()}> "${label}"`;
  });
  return why ? [{ check: 'c-accion', detail: `acción principal ${why}` }] : [];
}

/** Espera a que la pantalla haya pintado lo suyo: red quieta, sin esqueletos de carga. */
async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
  await page
    .waitForFunction(() => !document.querySelector('[aria-busy="true"], [data-slot="skeleton"]'), undefined, {
      timeout: 10_000,
    })
    .catch(() => undefined);
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    );
  });
}

function slug(route: string): string {
  return (
    route
      .replace(/^\//, '')
      .replace(/[^a-z0-9]+/gi, '_')
      .slice(0, 80) || 'raiz'
  );
}

/**
 * Abre `route` en `page` (con sesión, o sin ella para las públicas), pasa las
 * cinco comprobaciones y deja sus problemas como `expect.soft`.
 */
async function sweepRoute(
  page: Page,
  origin: string,
  route: string,
  size: SweepSize,
  who: string,
  testInfo: TestInfo,
): Promise<void> {
  const shotsDir = process.env.E2E_SWEEP_SHOTS_DIR;
  await test.step(`${who} ${route} @ ${size.id}`, async () => {
    const response = await page.goto(`${origin}${route}`, { waitUntil: 'domcontentloaded' });
    expect.soft(response?.status() ?? 0, `${who} ${route}: la página responde`).toBeLessThan(500);
    await page
      .locator('h1')
      .first()
      .waitFor({ state: 'visible', timeout: 15_000 })
      .catch(() => undefined);
    await settle(page);
    await page.mouse.move(0, 0);
    const problems = [...(await inspectPage(page, size.touch)), ...(await inspectPrimaryAction(page))];
    // (e) axe en toda la página. Tras llevar la acción a la vista, vuelve arriba.
    await page.evaluate(() => {
      document.querySelector('main')?.scrollTo(0, 0);
      window.scrollTo(0, 0);
    });
    for (const v of await axeViolations(page, page.locator('body'))) {
      problems.push({
        check: 'e-axe',
        detail: `${v.id} (${v.impact}): ${v.nodes
          .slice(0, 3)
          .map((n) => JSON.stringify(n.target))
          .join(', ')}`,
      });
    }
    const name = `${size.id}-${who.toLowerCase()}-${slug(route)}`;
    if (shotsDir) {
      mkdirSync(shotsDir, { recursive: true });
      await page.screenshot({ path: path.join(shotsDir, `${name}.png`) });
    }
    if (problems.length > 0) {
      await testInfo.attach(`${name}.png`, { body: await page.screenshot(), contentType: 'image/png' });
      await testInfo.attach(`${name}.json`, {
        body: JSON.stringify({ route, size, who, problems }, null, 2),
        contentType: 'application/json',
      });
      // Local: un JSONL con todo lo encontrado, para el informe del barrido.
      if (process.env.E2E_SWEEP_REPORT) {
        appendFileSync(process.env.E2E_SWEEP_REPORT, `${JSON.stringify({ size: size.id, who, route, problems })}\n`);
      }
    }
    expect.soft(problems, `${who} ${route} @ ${size.id}`).toEqual([]);
  });
}

/**
 * Rutas por test. La CI reparte los ficheros entre shards por NÚMERO de tests
 * (`--shard`, DX-457): con unas 3 rutas (~3 s) por test, un test del barrido
 * pesa como uno medio de la suite y los shards siguen equilibrados.
 */
const ROUTES_PER_TEST = 3;

function chunks<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * La siembra, una por worker (los ficheros de tamaño comparten clínica): tras
 * un test rojo Playwright reinicia el worker y se vuelve a sembrar.
 */
let seedOnce: Promise<SweepSeed> | null = null;

export interface SweepGroup {
  title: string;
  who: SweepRole | 'PUBLICO';
  routes: string[];
}

/**
 * El barrido de un tamaño. Los `test(...)` y los hooks los declara el fichero
 * de cada tamaño (Playwright atribuye cada test al fichero que llama a `test`, y
 * la CI reparte por fichero): por rol, grupos de `ROUTES_PER_TEST` rutas con la
 * sesión de ese rol abierta una vez por fichero; y los de públicas, sin sesión.
 */
export function sweepSuite(size: SweepSize) {
  let seed: SweepSeed;
  const contexts: BrowserContext[] = [];
  const pages = new Map<SweepRole | 'PUBLICO', Page>();
  const csp: { expectNone(): void }[] = [];

  const groups: SweepGroup[] = [
    ...SWEEP_ROLES.flatMap((role) => chunks(routesFor(role), ROUTES_PER_TEST).map((routes) => ({ who: role, routes }))),
    ...chunks(PUBLIC_ROUTES, ROUTES_PER_TEST).map((routes) => ({ who: 'PUBLICO' as const, routes })),
  ].map((g) => ({ ...g, title: `barrido ${size.id} · ${g.who} · ${g.routes.join(' · ')}` }));

  return {
    groups,
    async beforeAll({
      browser,
      playwright,
    }: {
      browser: Browser;
      playwright: { request: { newContext(): Promise<APIRequestContext> } };
    }) {
      test.setTimeout(240_000);
      if (!seedOnce) {
        seedOnce = (async () => {
          const api = await playwright.request.newContext();
          try {
            return await seedSweepClinic(api, 'brr');
          } finally {
            await api.dispose();
          }
        })();
        seedOnce.catch(() => {
          seedOnce = null;
        });
      }
      seed = await seedOnce;
      for (const who of [...SWEEP_ROLES, 'PUBLICO'] as const) {
        const context = await browser.newContext({
          ...contextOptionsFor(size),
          timezoneId: 'America/Caracas',
          locale: E2E_BROWSER_LOCALE,
          reducedMotion: 'reduce',
        });
        contexts.push(context);
        csp.push(watchCspViolations(context));
        const page = await context.newPage();
        if (who !== 'PUBLICO') await loginAs(page, seed.origin, seed.emails[who], PASSWORD);
        pages.set(who, page);
      }
    },
    async afterAll() {
      for (const context of contexts.splice(0)) await context.close();
    },
    async run(group: SweepGroup, testInfo: TestInfo) {
      test.setTimeout(30_000 + group.routes.length * 30_000);
      const page = pages.get(group.who)!;
      for (const template of group.routes) {
        await sweepRoute(page, seed.origin, resolveRoute(template, seed.ids), size, group.who, testInfo);
      }
      for (const guard of csp) guard.expectNone();
    },
  };
}
