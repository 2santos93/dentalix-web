import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { ClinicRole } from '@/lib/me/me-api';
import { EXTRA_PERMISSIONS, type ExtraPermission } from '@/lib/auth/permissions';
import { ALL_NAV_ITEMS, ANAMNESIS_HREF, CLOSING_QUEUE_HREF, canSee } from '@/components/layouts/nav-config';
import { LEADS_HREF } from '@/lib/leads/leads-api';
import { REPORT_TABS, canSeeReportTab } from '@/components/reports/reports-tabs';
import { SETTINGS_SECTIONS } from '@/components/settings/settings-sections';
import { INICIO_BLOCKS, canSeeBlock, type InicioBlock } from '@/components/dashboard/inicio-roles';
import { canHandlePaymentLinks } from '@/lib/payment-links/payment-links-api';
import { canReconcile } from '@/lib/bank-reconciliation/bank-reconciliation-api';
import { canManageRecall } from '@/lib/recall/presentation';
import { canReviewMajority } from '@/lib/patients/majority-review-api';
import { canManageDuplicates } from '@/lib/patients/patient-merge-api';
import { canReadExternalOrders } from '@/lib/external-orders/external-orders-api';
import { canReadLabOrders } from '@/lib/lab-orders/lab-orders-roles';
import { canViewCommissions } from '@/lib/commissions/commissions-api';
import { canReviewOnlineRequests } from '@/lib/online-booking/online-booking-api';

/**
 * DX-208 (TST-023): lo que la web ENSEÑA a cada rol coincide con lo que la API
 * le DEJA leer (`test/support/route-access-matrix.ts` en dentalix-api).
 *
 * Cada entrada visible por rol de la web (menú, paleta ⌘K, índice de Ajustes,
 * pestañas de Reportes y de la Caja, bloques de Inicio) se ata a la ruta de la
 * API que decide si se puede abrir (`gate`). Para cada «persona» posible —los
 * 4 roles × cada combinación de permisos extra CONCEDIDOS (DX-090)— la web
 * debe enseñarla si y solo si la API la deja pasar:
 *
 *   web:  canSee(rol, effectivePermissions)   (lo de serie del rol + lo concedido, `GET /me`)
 *   API:  rol ∈ @Roles  o  concedido ∩ @AllowPermissions ≠ ∅   (lo de serie NO abre rutas)
 *
 * Así un permiso de serie (RECEPTION ya «tiene» PAYMENT_REGISTER) no se
 * confunde con uno concedido, sin falsos positivos ni negativos.
 *
 * - `gate` es una lista: la entrada se abre si se abre CUALQUIERA (una pantalla
 *   con pestañas por rol, como Reportes, es la unión de sus pestañas).
 * - `alsoReads`: otras lecturas sin las que la pantalla no carga. Quien ve la
 *   entrada debe poder hacerlas todas (si no, 403 en una pantalla ofrecida).
 * - `narrowerOnPurpose`: la web la enseña a MENOS gente que la API a propósito
 *   (decisión de producto, con su motivo); entonces solo se exige que no la
 *   enseñe a nadie a quien la API diría 403.
 * - `gate: []` con `noApi`: la entrada no lee nada propio (p. ej. el índice de
 *   Ajustes); debe ser de los cuatro roles.
 *
 * Datos: sin `ROUTE_ACCESS_JSON`, el test lee `route-access.snapshot.json`
 * (solo las rutas de este mapa, para el job de jest, que no tiene la API). En
 * la E2E (`scripts/e2e-ci.sh contract`) `ROUTE_ACCESS_JSON` apunta al export de
 * la API de ese run (`npm run matrix:export`): el contrato corre contra la
 * matriz real y además exige que la copia sea la de la API. Para regenerarla:
 *
 *   (cd ../dentalix-api && npm run matrix:export -- /tmp/route-access.json)
 *   ROUTE_ACCESS_JSON=/tmp/route-access.json ROUTE_ACCESS_UPDATE=1 npx jest src/lib/auth/nav-roles-contract.test.ts
 */

type ExportedAccess =
  | { kind: 'public'; tenantScoped: boolean }
  | { kind: 'authenticated' }
  | { kind: 'platform' }
  | { kind: 'roles'; roles: ClinicRole[]; permissions: ExtraPermission[] };

interface RouteAccessExport {
  format: number;
  source: string;
  roles: ClinicRole[];
  extraPermissions: ExtraPermission[];
  roleBasePermissions: Record<ClinicRole, ExtraPermission[]>;
  routes: Record<string, ExportedAccess>;
}

interface Contract {
  /** Rutas (`MÉTODO /ruta`, sin `api/v1`) que deciden si se abre: basta una. */
  gate: readonly string[];
  alsoReads?: readonly string[];
  narrowerOnPurpose?: string;
  /** Solo con `gate: []`: por qué no hay ruta. */
  noApi?: string;
}

interface Checked extends Contract {
  /** `menú /caja`, `ajustes /settings/recall`… (en los mensajes). */
  where: string;
  visible: (role: ClinicRole, permissions: readonly ExtraPermission[]) => boolean;
}

const g = (...gate: string[]): Contract => ({ gate });

// --- Menú (nav-config): NAV.href → ruta que lee la pantalla ---------------
const NAV_CONTRACT: Record<string, Contract> = {
  // Inicio de los 4 roles (I1): la lista de pendientes (DX-503) la reparte la
  // API; los demás bloques van aparte (INICIO_CONTRACT).
  '/dashboard': g('GET /work-queues/summary'),
  '/agenda': g('GET /appointments'),
  '/patients': g('GET /patients'),
  [CLOSING_QUEUE_HREF]: g('GET /closing-queue'),
  '/presupuestos': g('GET /treatment-plans/pending-follow-up'),
  [LEADS_HREF]: g('GET /leads'),
  [ANAMNESIS_HREF]: g('GET /medical-history/submissions'),
  // Abonos (pestaña por defecto) y Turnos: los dos con PAYMENT_REGISTER y
  // FINANCIAL_REPORTS_VIEW. Por confirmar y Conciliación: CASH_TABS_CONTRACT.
  '/caja': { gate: ['GET /payments'], alsoReads: ['GET /cash-sessions'] },
  '/caja/cartera': g('GET /receivables/aging'),
  '/caja/gastos': g('GET /expenses'),
  // La unión de sus pestañas (cada una, en REPORT_TABS_CONTRACT).
  '/reportes': g(
    'GET /reports/locations-comparison',
    'GET /reports/profitability',
    'GET /reports/production-by-procedure',
    'GET /reports/quote-funnel',
    'GET /reports/scheduled-production',
    'GET /reports/professional-productivity',
    'GET /reports/no-shows',
    'GET /reports/acquisition',
    'GET /reports/retention',
    'GET /reports/unallocated-payments',
    'GET /reports/recovered-slots',
    'GET /reports/chair-occupancy',
    'GET /reports/patient-links',
  ),
  '/catalog': g('GET /catalog/items'),
  '/inventory': g('GET /inventory/items'),
  '/staff': g('GET /staff/directory'),
  '/settings': { gate: [], noApi: 'El índice de Ajustes no lee nada: cada entrada tiene la suya (SETTINGS_CONTRACT).' },
};

// --- Pestañas de Reportes (reports-tabs) -----------------------------------
const REPORT_TABS_CONTRACT: Record<string, Contract> = {
  'comparar-sedes': g('GET /reports/locations-comparison'),
  rentabilidad: g('GET /reports/profitability'),
  produccion: g('GET /reports/production-by-procedure'),
  presupuestos: g('GET /reports/quote-funnel'),
  prevision: g('GET /reports/scheduled-production'),
  profesionales: g('GET /reports/professional-productivity'),
  inasistencias: g('GET /reports/no-shows'),
  cartera: {
    gate: ['GET /receivables/aging/summary'],
    narrowerOnPurpose:
      'DX-304: en Reportes, la cartera es la mirada del dueño; recepción la trabaja en Caja › Cartera.',
  },
  captacion: g('GET /reports/acquisition'),
  retencion: g('GET /reports/retention'),
  'sin-imputar': g('GET /reports/unallocated-payments'),
  'huecos-recuperados': g('GET /reports/recovered-slots'),
  'ocupacion-sillones': g('GET /reports/chair-occupancy'),
  'enlaces-paciente': g('GET /reports/patient-links'),
};

// --- Pestañas de la Caja que dependen del rol (caja/page.tsx) --------------
const CASH_TABS_CONTRACT: Record<string, Contract & { visible: (role: ClinicRole) => boolean }> = {
  'por-confirmar': { ...g('GET /payment-reports'), visible: canHandlePaymentLinks },
  conciliacion: { ...g('GET /bank-reconciliation/accounts'), visible: canReconcile },
};

// --- Destinos de la paleta ⌘K sin entrada en el menú (command-palette) -----
const PALETTE_CONTRACT: Record<string, Contract & { visible: (role: ClinicRole) => boolean }> = {
  '/recall': { ...g('GET /recall/due'), visible: canManageRecall },
  '/patients/mayoria-de-edad': { ...g('GET /patients/coming-of-age'), visible: canReviewMajority },
  '/patients/duplicados': { ...g('GET /patient-duplicates'), visible: canManageDuplicates },
  '/ordenes-sin-resultado': { ...g('GET /external-orders/pending'), visible: canReadExternalOrders },
  '/laboratorio': { ...g('GET /lab-orders'), visible: canReadLabOrders },
  '/honorarios': { ...g('GET /commissions/settlements'), visible: canViewCommissions },
  '/caja/descuentos': { ...g('GET /reports/discounts'), visible: (role) => role === 'ADMIN' },
  '/solicitudes-online': {
    gate: ['GET /online-booking/requests'],
    narrowerOnPurpose: 'DX-016: la API la deja leer a los 4 roles, pero la bandeja la atiende el mostrador.',
    visible: canReviewOnlineRequests,
  },
};

// --- Índice de Ajustes (settings-sections) ---------------------------------
// Las entradas «solo ADMIN» son pantallas para CAMBIAR un ajuste: las decide la
// ruta de escritura (`gate`), y su lectura va en `alsoReads`. Las de todos
// (Sedes, Horarios, Presupuestos, Privacidad, Mi perfil) las decide la lectura.
const w = (gate: string, ...alsoReads: string[]): Contract => ({ gate: [gate], alsoReads });
const SETTINGS_CONTRACT: Record<string, Contract> = {
  '/settings/profile': g('GET /me'),
  '/settings/clinica': w('PATCH /clinic/settings', 'GET /clinic/settings'),
  '/settings/sedes': g('GET /locations'),
  '/settings/calendario': w('PUT /locations/:id/calendar/working-weekdays', 'GET /locations/:id/calendar'),
  '/settings/mayoria-de-edad': w('PUT /patients/settings', 'GET /patients/settings'),
  '/settings/tipos-de-documento': w('PUT /patients/document-type-names', 'GET /patients/document-type-names'),
  '/settings/idiomas-de-pacientes': w('PUT /patients/languages', 'GET /patients/languages'),
  '/settings/mensajes': w('POST /message-templates/:key/:channel/:language/preview', 'GET /message-templates'),
  '/settings/resumen-semanal': w('PUT /clinic/weekly-digest-settings', 'GET /clinic/weekly-digest-settings'),
  '/settings/horarios': g('GET /locations/schedule'),
  '/settings/tipos-de-cita': w('POST /appointment-types', 'GET /appointment-types'),
  '/settings/sillones': w('POST /chairs', 'GET /chairs'),
  '/settings/pantallas-de-sala': w('POST /waiting-room-screens', 'GET /waiting-room-screens'),
  '/settings/exportar-datos': w('POST /clinic-exports', 'GET /clinic-exports'),
  '/settings/equipos': w('POST /equipment', 'GET /equipment'),
  '/settings/ofertas-de-hueco': w('PUT /slot-offer-settings', 'GET /slot-offer-settings'),
  '/settings/reserva-online': w('PUT /online-booking/settings', 'GET /online-booking/settings'),
  '/settings/prospectos': w('PUT /leads/settings', 'GET /leads/settings'),
  '/settings/origen-de-pacientes': w('POST /patient-sources', 'GET /patient-sources'),
  '/settings/recordatorios': w('PUT /reminder-settings/:locationId', 'GET /reminder-settings'),
  '/settings/recall': w('POST /recall-types', 'GET /recall-types'),
  '/settings/caja': w('PUT /cash-sessions/settings', 'GET /cash-sessions/settings'),
  '/settings/tasa-de-cambio': w('PUT /exchange/settings', 'GET /exchange/settings'),
  '/settings/monedas': w('PUT /exchange/currency-texts', 'GET /exchange/currency-texts'),
  '/settings/descuentos': w('PUT /discount-policy', 'GET /discount-policy'),
  // POST /payers es también de recepción (crea el pagador desde la ficha); la
  // pantalla de Ajustes edita y desactiva: PATCH, solo ADMIN.
  '/settings/pagadores': w('PATCH /payers/:id', 'GET /payers'),
  '/settings/convenios': w('POST /agreements', 'GET /agreements'),
  '/settings/listas-de-precios': w('POST /price-lists', 'GET /price-lists'),
  '/settings/presupuestos': g('GET /treatment-plan-settings'),
  '/settings/historia-clinica': w('PUT /medical-history/settings', 'GET /medical-history/settings'),
  '/settings/plantillas-de-evolucion': w('POST /clinical-note-templates', 'GET /clinical-note-templates'),
  '/settings/ortodoncia': w('PUT /ortho/settings', 'GET /ortho/settings'),
  '/settings/plantillas-de-plan': w('POST /treatment-plan-templates', 'GET /treatment-plan-templates'),
  '/settings/consentimientos': w('POST /consent-templates', 'GET /consent-templates'),
  '/settings/recetas': w('PUT /prescriptions/settings', 'GET /prescriptions/settings'),
  '/settings/anestesicos': w('POST /anesthetics', 'GET /anesthetics'),
  '/settings/certificados': w('PUT /certificates/settings', 'GET /certificates/settings'),
  '/settings/ordenes-externas': w('PUT /external-orders/settings', 'GET /external-orders/settings'),
  '/settings/honorarios': w('PUT /commissions/rules/:userId', 'GET /commissions/rules'),
  '/settings/laboratorios': w('POST /dental-labs', 'GET /dental-labs'),
  '/settings/indicaciones': w('POST /post-op-templates', 'GET /post-op-templates'),
  '/settings/privacidad': g('GET /privacy-policies'),
  '/settings/seguridad': w('PUT /security-policy', 'GET /security-policy'),
  '/settings/dominios': w('POST /domains', 'GET /domains'),
  '/settings/importar-pacientes': w('POST /patient-imports/inspect', 'GET /patient-imports'),
  '/settings/implantes': g('GET /implants/search'),
  '/settings/accesos-de-soporte': g('GET /support-accesses'),
  '/settings/auditoria': g('GET /audit-events'),
};

// --- Bloques de Inicio (components/dashboard/inicio-roles) -----------------
const DESK = 'Lo agenda el mostrador: la API lo deja leer a los 4 roles, Inicio solo lo pinta a ADMIN y recepción.';
const INICIO_CONTRACT: Record<InicioBlock, Contract> = {
  today: g('GET /appointments'),
  closingQueue: g('GET /closing-queue/count'),
  anamnesis: g('GET /medical-history/submissions/summary'),
  postOpChecks: g('GET /post-op-checks/count'),
  followUp: g('GET /treatment-plans/pending-follow-up/count'),
  unscheduled: { gate: ['GET /treatment-plans/unscheduled/count'], narrowerOnPurpose: DESK },
  waitlist: { gate: ['GET /waitlist'], narrowerOnPurpose: DESK },
  recall: g('GET /recall/due/count'),
  cash: {
    gate: ['GET /cash-sessions/current'],
    // DX-208: decisión pendiente del dueño (ver .planning/DX-208/PROGRESS.md):
    // la API deja leer la caja de hoy a quien tenga PAYMENT_REGISTER o
    // FINANCIAL_REPORTS_VIEW concedido, pero el bloque solo sale por rol, y para
    // quien solo LEE (FINANCIAL_REPORTS_VIEW) sus botones de abrir/cerrar darían 403.
    narrowerOnPurpose: 'Por rol (ADMIN y recepción); con permiso extra concedido, pendiente de decisión (DX-208).',
  },
  receivables: g('GET /receivables/aging/summary'),
  paymentReports: g('GET /payment-reports/count'),
  onlineRequests: { gate: ['GET /online-booking/requests/pending-count'], narrowerOnPurpose: DESK },
  lowStock: g('GET /inventory/items'),
  lowStockList: {
    gate: ['GET /inventory/items'],
    narrowerOnPurpose: 'La lista «Por reponer» es de la asistente; ADMIN ve el conteo (lowStock).',
  },
  periodResults: { gate: ['GET /dashboard'], alsoReads: ['GET /reports/locations-comparison'] },
  aging: {
    gate: ['GET /receivables/aging/summary'],
    narrowerOnPurpose: 'La cartera en detalle es la mirada de gestión; recepción ve la fila de pendientes.',
  },
  equipmentMaintenance: g('GET /equipment/maintenance-due'),
  myProduction: {
    gate: ['GET /reports/production-by-procedure'],
    narrowerOnPurpose: 'Inicio pinta al odontólogo SU producción; ADMIN la ve en Reportes y en el período.',
  },
};

// ---------------------------------------------------------------------------

const SNAPSHOT_PATH = path.join(__dirname, 'route-access.snapshot.json');
const LIVE_PATH = process.env.ROUTE_ACCESS_JSON;
const snapshot = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')) as RouteAccessExport;
const access: RouteAccessExport = LIVE_PATH
  ? (JSON.parse(readFileSync(LIVE_PATH, 'utf8')) as RouteAccessExport)
  : snapshot;

const settingsEntries = SETTINGS_SECTIONS.flatMap((s) => s.entries);

const CHECKED: Checked[] = [
  ...ALL_NAV_ITEMS.map((item) => ({
    ...NAV_CONTRACT[item.href],
    where: `menú ${item.href}`,
    visible: (role: ClinicRole, permissions: readonly ExtraPermission[]) => canSee(item, role, permissions),
  })),
  ...REPORT_TABS.map((tab) => ({
    ...REPORT_TABS_CONTRACT[tab.key],
    where: `pestaña de Reportes «${tab.label}»`,
    visible: (role: ClinicRole, permissions: readonly ExtraPermission[]) => canSeeReportTab(tab, role, permissions),
  })),
  ...Object.entries(CASH_TABS_CONTRACT).map(([key, c]) => ({
    ...c,
    where: `pestaña de la Caja ${key}`,
    visible: (role: ClinicRole) => c.visible(role),
  })),
  ...Object.entries(PALETTE_CONTRACT).map(([href, c]) => ({
    ...c,
    where: `paleta ⌘K ${href}`,
    visible: (role: ClinicRole) => c.visible(role),
  })),
  ...settingsEntries.map((entry) => ({
    ...SETTINGS_CONTRACT[entry.href],
    where: `ajustes ${entry.href}`,
    visible: (role: ClinicRole) => !entry.visible || entry.visible(role),
  })),
  ...INICIO_BLOCKS.map((block) => ({
    ...INICIO_CONTRACT[block],
    where: `bloque de Inicio ${block}`,
    visible: (role: ClinicRole) => canSeeBlock(block, role),
  })),
];

/** Todas las rutas que nombra el mapa (las del snapshot). */
function mappedRoutes(): string[] {
  const all = [
    ...Object.values(NAV_CONTRACT),
    ...Object.values(REPORT_TABS_CONTRACT),
    ...Object.values(CASH_TABS_CONTRACT),
    ...Object.values(PALETTE_CONTRACT),
    ...Object.values(SETTINGS_CONTRACT),
    ...Object.values(INICIO_CONTRACT),
  ].flatMap((c) => [...c.gate, ...(c.alsoReads ?? [])]);
  return [...new Set(all)].sort();
}

/** Cada combinación de permisos extra concedidos (la vacía incluida). */
function grantSubsets(catalog: readonly ExtraPermission[]): ExtraPermission[][] {
  return catalog.reduce<ExtraPermission[][]>((acc, p) => acc.flatMap((s) => [s, [...s, p]]), [[]]);
}

/** ¿Deja pasar la API a `role` con `granted` concedidos? (RolesGuard, DX-090) */
function apiAllows(route: ExportedAccess, role: ClinicRole, granted: readonly ExtraPermission[]): boolean {
  switch (route.kind) {
    case 'public':
    case 'authenticated':
      return true;
    case 'platform':
      return false;
    case 'roles':
      return route.roles.includes(role) || route.permissions.some((p) => granted.includes(p));
  }
}

/** `GET /me`: lo de serie del rol más lo concedido, en el orden del catálogo. */
function effectiveFor(role: ClinicRole, granted: readonly ExtraPermission[]): ExtraPermission[] {
  const held = new Set([...access.roleBasePermissions[role], ...granted]);
  return access.extraPermissions.filter((p) => held.has(p));
}

function persona(role: ClinicRole, granted: readonly ExtraPermission[]): string {
  return granted.length > 0 ? `${role} con ${granted.join('+')} concedido` : role;
}

describe('Contrato de roles web ↔ API (DX-208)', () => {
  describe('el mapa cubre todo lo que se enseña por rol, y nada más', () => {
    const keysMatch = (label: string, sourceKeys: readonly string[], mapKeys: readonly string[]) => {
      const missing = sourceKeys.filter((k) => !mapKeys.includes(k));
      const stale = mapKeys.filter((k) => !sourceKeys.includes(k));
      expect({ label, sinRutaApiEnElMapa: missing, sobranEnElMapa: stale }).toEqual({
        label,
        sinRutaApiEnElMapa: [],
        sobranEnElMapa: [],
      });
    };

    it('cada entrada del menú tiene su ruta de la API', () => {
      keysMatch(
        'menú (NAV)',
        ALL_NAV_ITEMS.map((i) => i.href),
        Object.keys(NAV_CONTRACT),
      );
    });
    it('cada pestaña de Reportes tiene su ruta', () => {
      keysMatch(
        'Reportes',
        REPORT_TABS.map((t) => t.key),
        Object.keys(REPORT_TABS_CONTRACT),
      );
    });
    it('cada entrada de Ajustes tiene su ruta', () => {
      keysMatch(
        'Ajustes',
        settingsEntries.map((e) => e.href),
        Object.keys(SETTINGS_CONTRACT),
      );
    });
    it('cada bloque de Inicio tiene su ruta', () => {
      keysMatch('Inicio', INICIO_BLOCKS, Object.keys(INICIO_CONTRACT));
    });
    it('las entradas sin ruta lo dicen y son de los cuatro roles', () => {
      for (const c of CHECKED.filter((x) => x.gate.length === 0)) {
        expect({ where: c.where, noApi: !!c.noApi }).toEqual({ where: c.where, noApi: true });
        for (const role of access.roles)
          expect({ where: c.where, role, visible: c.visible(role, []) }).toEqual({
            where: c.where,
            role,
            visible: true,
          });
      }
    });
  });

  it('el catálogo de permisos extra de la web es el de la API', () => {
    expect([...EXTRA_PERMISSIONS]).toEqual(access.extraPermissions);
  });

  it('toda ruta del mapa existe en la matriz de la API', () => {
    const unknown = mappedRoutes().filter((r) => !(r in access.routes));
    expect({ rutasQueLaApiNoTiene: unknown }).toEqual({ rutasQueLaApiNoTiene: [] });
  });

  it('cada rol ve exactamente lo que la API le deja abrir (con y sin permisos extra)', () => {
    const problems: string[] = [];
    for (const c of CHECKED) {
      if (c.gate.length === 0) continue;
      for (const role of access.roles) {
        for (const granted of grantSubsets(access.extraPermissions)) {
          const shown = c.visible(role, effectiveFor(role, granted));
          const allowed = c.gate.some((r) => access.routes[r] && apiAllows(access.routes[r], role, granted));
          const who = persona(role, granted);
          if (shown && !allowed) {
            problems.push(`${c.where}: la web la enseña a ${who}, pero la API le da 403 (${c.gate.join(' | ')})`);
          } else if (!shown && allowed && !c.narrowerOnPurpose) {
            problems.push(
              `${c.where}: la API deja a ${who} (${c.gate.join(' | ')}), pero la web se la oculta` +
                ' (si es a propósito, dilo con `narrowerOnPurpose`)',
            );
          }
          if (!shown) continue;
          for (const read of c.alsoReads ?? []) {
            const route = access.routes[read];
            if (route && !apiAllows(route, role, granted)) {
              problems.push(`${c.where}: la web la enseña a ${who}, pero ${read} le da 403`);
            }
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('`narrowerOnPurpose` solo donde de verdad se oculta algo permitido', () => {
    const idle: string[] = [];
    for (const c of CHECKED.filter((x) => x.narrowerOnPurpose)) {
      const hides = access.roles.some((role) =>
        grantSubsets(access.extraPermissions).some(
          (granted) =>
            !c.visible(role, effectiveFor(role, granted)) &&
            c.gate.some((r) => access.routes[r] && apiAllows(access.routes[r], role, granted)),
        ),
      );
      if (!hides) idle.push(c.where);
    }
    expect({ narrowerOnPurposeSobrante: idle }).toEqual({ narrowerOnPurposeSobrante: [] });
  });

  // Sin export de la API (job de jest) solo se comprueba que la copia lleva
  // las rutas del mapa; con él (E2E), que es byte a byte la de la API.
  it('la copia de la web (route-access.snapshot.json) lleva las rutas del mapa y, en la E2E, es la de la API', () => {
    if (!LIVE_PATH) {
      expect(Object.keys(snapshot.routes)).toEqual(mappedRoutes());
      return;
    }
    const routes = Object.fromEntries(
      mappedRoutes()
        .filter((r) => r in access.routes)
        .map((r) => [r, access.routes[r]]),
    );
    const expected: RouteAccessExport = {
      format: access.format,
      source: access.source,
      roles: access.roles,
      extraPermissions: access.extraPermissions,
      roleBasePermissions: access.roleBasePermissions,
      routes,
    };
    const text = `${JSON.stringify(expected, null, 2)}\n`;
    if (process.env.ROUTE_ACCESS_UPDATE === '1') writeFileSync(SNAPSHOT_PATH, text);
    expect(readFileSync(SNAPSHOT_PATH, 'utf8')).toBe(text);
  });
});
