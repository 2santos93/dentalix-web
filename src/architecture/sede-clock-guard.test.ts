import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';
import * as dateModule from '../lib/format/date';

/**
 * DX-378 (FE-076, FE-078): la hora, las fechas y los números se pintan con la
 * zona y el formato de la sede (`RegionalFormat`, `SedeClock`), nunca con los
 * del navegador ni con un idioma fijo. Dos reglas para todo `src/` salvo
 * `lib/format/**` (donde viven los helpers), los tests, `lib/test/**` y
 * `schema.d.ts`:
 *
 * 1. De `@/lib/format/date` solo se importan los neutros de lógica
 *    (`WHITELIST`: `civilDateInZone`, `civilDateLabel`, `firstOfMonth`,
 *    `zonedDayStart`, `zoneCityLabel`). Los siete ayudantes que pintaban sin
 *    la sede (`RETIRED_HELPERS`: zona del navegador y 24 h fijas, la zona sin
 *    el reloj, o `dd/mm/yyyy` a mano) se retiraron en DX-354b (W4) y `date.ts`
 *    ya no los exporta: esta regla impide que vuelvan por otra puerta
 *    (`import *`, un alias, una ruta relativa). No hay lista de excepciones:
 *    una pantalla usa `useSedeStamp`/`useSedeClock`/`useSedeFormat`.
 * 2. Nadie llama a `Intl.*Format`/`Intl.PluralRules` ni a
 *    `toLocale(Date|Time)?String` con un locale literal (`'es'`, `"en-US"`…):
 *    el formato lo da la sede; las palabras, `UI_LANGUAGE` dentro de
 *    `lib/format`.
 * 3. Nadie pinta un importe con `RegionalFormat.money` (`fmt.money(…)`): da el
 *    símbolo local («$», «US$», «Bs.S»), ambiguo en un producto bimonetario.
 *    Los importes con el formato de la sede llevan siempre el código ISO:
 *    `sedeMoney`/`moneyWithCode` de `@/lib/format/sede-number`.
 * 4. `platformInstant` (el instante en UTC de la consola de plataforma, sin
 *    sede, DX-354b E8) solo se importa desde `components/platform/**`: en
 *    cualquier otra pantalla sería «un formato que no es el de la sede».
 */
const SRC = join(__dirname, '..');
const FORMAT_DATE_MODULES = new Set(['@/lib/format/date']);
/** Lo único que se importa de `@/lib/format/date`: lógica de calendario, no pinta nada. */
const WHITELIST: ReadonlySet<string> = new Set([
  'civilDateInZone',
  'civilDateLabel',
  'firstOfMonth',
  'zonedDayStart',
  'zoneCityLabel',
]);
/** Los siete ayudantes retirados: `date.ts` no los exporta (prueba abajo). */
const RETIRED_HELPERS = [
  'formatTime',
  'formatDate',
  'formatDateTime',
  'formatTimeInZone',
  'formatDateTimeInZone',
  'formatDateLabel',
  'formatCivilDate',
] as const;

/** Las pantallas de DX-378 (y las migradas después): no pueden volver a la lista. */
const MIGRATED = [
  'components/appointments/agenda-view.tsx',
  'components/appointments/appointment-display.tsx',
  'components/appointments/appointment-form.tsx',
  'components/appointments/day-agenda.tsx',
  'components/appointments/day-columns.tsx',
  'components/appointments/fill-opening-panel.tsx',
  'components/appointments/month-agenda.tsx',
  'components/appointments/move-appointment-dialog.tsx',
  'components/appointments/openings-dialog.tsx',
  'components/appointments/schedule-block-dialog.tsx',
  'components/appointments/week-time-grid.tsx',
  'components/treatment-plans/schedule-visit-dialog.tsx',
  'components/treatment-plans/unscheduled-plans-view.tsx',
  'components/dashboard/dashboard-view.tsx',
  'components/reports/locations-comparison-view.tsx',
  'components/agreements/agreements-manager.tsx',
  'components/discounts/discount-report-view.tsx',
  'components/expenses/expenses-view.tsx',
  'components/expenses/expenses-summary-view.tsx',
  // DX-362: el registro de auditoría, con la zona de la pantalla y su desfase en cada hora.
  'components/audit/audit-log-view.tsx',
  'components/payments/payment-receipt-document.tsx',
  'components/account-statement/account-statement-document.tsx',
  'components/account-statement/family-account-statement-document.tsx',
  'components/consents/consent-document.tsx',
  'components/implants/implant-card-document.tsx',
  'components/postop/postop-document.tsx',
  'components/treatment-plans/plan-quote-document.tsx',
  'lib/account-statement/presentation.ts',
  'components/anamnesis/public-anamnesis-view.tsx',
  'components/appointments/public-confirmation-view.tsx',
  'components/reminders/public-reminder-opt-out-view.tsx',
  'components/cash-sessions/cash-session-report.tsx',
  'components/patient-documents/patient-documents-tab.tsx',
  'lib/audit/audit-labels.ts',
  // DX-354b W1: cada fila con la sede de su dato (`useSedeStamp`), zona paciente y clínica.
  'components/anamnesis/anamnesis-inbox-view.tsx',
  'components/anamnesis/anamnesis-review-view.tsx',
  'components/anamnesis/patient-anamnesis-section.tsx',
  'components/consents/consent-templates-manager.tsx',
  'components/consents/patient-consents-tab.tsx',
  'components/data-consents/consent-scope-fields.tsx',
  'components/data-consents/data-consents-tab.tsx',
  'components/data-consents/privacy-policy-settings.tsx',
  'lib/clinical/medical-alerts.ts',
  'components/patients/clinical-entries-list.tsx',
  'components/patients/medical-history-panel.tsx',
  'components/patients/patient-agreement-section.tsx',
  'components/patients/patient-communication-section.tsx',
  'components/patients/patient-opt-out-warnings.tsx',
  'components/implants/patient-implants-tab.tsx',
  'components/postop/patient-postop-deliveries.tsx',
  'components/postop/postop-templates-manager.tsx',
  'components/prescriptions/patient-prescriptions-tab.tsx',
  'components/prescriptions/prescription-templates-manager.tsx',
  'lib/patients/member-number.ts',
  'components/clinical/anamnesis-review-line.tsx',
  // DX-354b W2: caja, cobros, cartera, gastos e importaciones: cada fila con la sede de su dato.
  'components/cash-sessions/cash-shifts-view.tsx',
  'components/collections/patient-collections-section.tsx',
  'components/expenses/expense-detail-modal.tsx',
  'components/locations/cancellation-policy-settings.tsx',
  'components/patient-imports/import-history.tsx',
  'components/payments/cash-register-view.tsx',
  'components/receivables/debtor-parts.tsx',
  'components/patient-credit/credit-refund-modal.tsx',
  'components/payments/reallocate-payment-modal.tsx',
  // DX-354b W3: planes de tratamiento, con la sede del dato (o el pintor por parámetro en `lib/**`).
  'components/treatment-plans/pending-follow-up-view.tsx',
  'components/treatment-plans/plan-options-panel.tsx',
  'components/treatment-plans/plan-quote-actions.tsx',
  'components/treatment-plans/treatment-plans-tab-copy.ts',
  'lib/treatment-plans/item-attribution.ts',
  'lib/treatment-plans/plan-options.ts',
  // DX-354b W3: inventario y ajustes de clínica, con la sede de la pantalla (el dato no trae sede).
  'components/discounts/discount-policy-manager.tsx',
  'components/domains/domains-manager.tsx',
  'components/inventory/inventory-item-detail.tsx',
  'components/inventory/inventory-view.tsx',
  'components/support-accesses/support-accesses-view.tsx',
  // DX-354b W3 (E8): la consola de plataforma no tiene sede; escribe el instante en UTC con su zona (`platformInstant`).
  'components/platform/platform-mfa-card.tsx',
  // DX-354b W4: los días civiles (nacimiento, vigencias, vencimientos) con el formato de la sede, sin `formatCivilDate`.
  'components/account-statement/account-statement-view.tsx',
  'components/consents/new-consent-modal.tsx',
  'components/implants/implant-lot-search.tsx',
  'components/odontogram/odontogram-tab.tsx',
  'components/patients/patient-data-panel.tsx',
  'components/perio/perio-exam-editor.tsx',
  'components/perio/perio-tab.tsx',
  'components/recall/patient-recall-section.tsx',
  'components/recall/recall-view.tsx',
  'components/signature-requests/send-to-sign-modal.tsx',
  'components/treatment-plans/accept-plan-modal.tsx',
  'components/treatment-plans/payment-plan-section.tsx',
  'components/treatment-plans/plan-visits-board.tsx',
  'lib/patients/agreement-presentation.ts',
  'lib/patients/coverage-presentation.ts',
  'components/patients/patient-retention-section.tsx',
];

/**
 * DX-386: pantallas de cobro cuyos importes ya van con `sedeMoney` (código
 * ISO y separadores de la sede): no pueden volver a `formatCurrency`
 * (símbolo «US$» e idioma fijo).
 */
const MONEY_WITH_CODE = [
  'components/payments/record-payment-modal.tsx',
  'components/payments/payment-rate-preview.tsx',
  'components/payments/without-rate-notice.tsx',
  'components/treatment-plans/item-paid-cell.tsx',
  'components/account-statement/plan-items-balance.tsx',
  // DX-489: el resto de importes del plan, con el mismo formato que sus abonos.
  'components/treatment-plans/plan-money-summary.tsx',
  'components/treatment-plans/plan-items-table.tsx',
  'components/treatment-plans/plan-item-form.tsx',
  'components/treatment-plans/payment-plan-section.tsx',
  'components/treatment-plans/price-quote-line.tsx',
  'components/discounts/bulk-discount-modal.tsx',
];

/** Los nombres que el fichero importa de `@/lib/format/currency`. */
function currencyImports(source: ts.SourceFile): string[] {
  return source.statements.flatMap((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
    if (statement.moduleSpecifier.text !== '@/lib/format/currency') return [];
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) return ['*'];
    return bindings && ts.isNamedImports(bindings)
      ? bindings.elements.map((element) => (element.propertyName ?? element.name).text)
      : [];
  });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

function relOf(path: string): string {
  return relative(SRC, path).split(sep).join('/');
}

function scanned(rel: string): boolean {
  if (/\.test\./.test(rel)) return false;
  if (rel.startsWith('lib/format/') || rel.startsWith('lib/test/')) return false;
  return rel !== 'lib/api/schema.d.ts';
}

function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

/** `@/lib/format/date`, o el mismo módulo por ruta relativa (`../format/date`). */
function isFormatDateModule(specifier: string, fileName: string): boolean {
  if (FORMAT_DATE_MODULES.has(specifier)) return true;
  if (!specifier.startsWith('.')) return false;
  const resolved = relative(SRC, join(fileName, '..', specifier)).split(sep).join('/');
  return resolved === 'lib/format/date' || resolved === 'lib/format/date.ts';
}

/** Lo que el fichero importa de `@/lib/format/date` fuera de la lista blanca (o `*` si importa el módulo entero). */
function sedelessImports(source: ts.SourceFile): string[] {
  const found: string[] = [];
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    if (!isFormatDateModule(statement.moduleSpecifier.text, source.fileName)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) found.push('*');
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        const name = (element.propertyName ?? element.name).text;
        if (!WHITELIST.has(name)) found.push(name);
      }
    }
  }
  return found;
}

const INTL_FORMATTERS = /^Intl\.(?:NumberFormat|DateTimeFormat|RelativeTimeFormat|ListFormat|PluralRules|DisplayNames)$/;
const TO_LOCALE = /^toLocale(?:Date|Time)?String$/;

/** Llamadas de formato con un locale literal: `Intl.NumberFormat('es')`, `x.toLocaleString("en-US")`. */
function literalLocaleCalls(source: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isCallExpression(node) || ts.isNewExpression(node)) && node.arguments?.length) {
      const callee = node.expression;
      const isIntl = INTL_FORMATTERS.test(callee.getText(source));
      const isToLocale = ts.isPropertyAccessExpression(callee) && TO_LOCALE.test(callee.name.text);
      const [locale] = node.arguments;
      if ((isIntl || isToLocale) && (ts.isStringLiteral(locale) || ts.isNoSubstitutionTemplateLiteral(locale))) {
        const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
        found.push(`${line + 1}: ${node.getText(source).split('\n')[0]}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Importes con el símbolo de la moneda: `fmt.money(…)`, `clock.fmt.money(…)`. */
function symbolMoneyCalls(source: ts.SourceFile): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'money' &&
      // `stamp.money(…)` es el pintor de la sede (`moneyWithCode`, con el código ISO), no `RegionalFormat.money`.
      // Ojo: se salva por el NOMBRE del receptor, no por su tipo; un `RegionalFormat` guardado en una variable
      // llamada `stamp` se saltaría la regla.
      !/(^|\.)stamp$/.test(node.expression.expression.getText(source))
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push(`${line + 1}: ${node.getText(source).split('\n')[0]}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Regla 1: ficheros que importan de `@/lib/format/date` algo que no es un neutro de la lista blanca. */
function rule1Offenders(scannedFiles: readonly { rel: string; source: ts.SourceFile }[]): string[] {
  return scannedFiles
    .map(({ rel, source }) => ({ rel, used: sedelessImports(source) }))
    .filter(({ used }) => used.length > 0)
    .map(({ rel, used }) => `${rel}: ${used.join(', ')}`);
}

/** Regla 4: quien importa `platformInstant` (de `@/lib/format/platform-instant` o por ruta relativa). */
function importsPlatformInstant(source: ts.SourceFile): boolean {
  return source.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    const specifier = statement.moduleSpecifier.text;
    const resolved = specifier.startsWith('.')
      ? relative(SRC, join(source.fileName, '..', specifier)).split(sep).join('/')
      : specifier.replace(/^@\//, '');
    return resolved === 'lib/format/platform-instant';
  });
}

/** Regla 4: los ficheros fuera de `components/platform/**` que importan `platformInstant`. */
function rule4Offenders(scannedFiles: readonly { rel: string; source: ts.SourceFile }[]): string[] {
  return scannedFiles
    .filter(({ rel, source }) => !rel.startsWith('components/platform/') && importsPlatformInstant(source))
    .map(({ rel }) => rel);
}

const files = sourceFiles(SRC)
  .map((path) => ({ path, rel: relOf(path) }))
  .filter(({ rel }) => scanned(rel))
  .map(({ path, rel }) => ({ rel, source: parse(path, readFileSync(path, 'utf8')) }));

describe('arquitectura: hora, fechas y números con la sede (DX-378)', () => {
  it('no file imports anything but the neutral helpers from lib/format/date (no pending list)', () => {
    expect(rule1Offenders(files)).toEqual([]);
  });

  it('date.ts does not export the seven retired sede-less helpers (DX-354b, E6)', () => {
    const exported = Object.keys(dateModule);
    for (const retired of RETIRED_HELPERS) expect(exported).not.toContain(retired);
    // Y lo que sí exporta es exactamente la lista blanca: un ayudante nuevo se añade aquí a propósito.
    expect([...exported].sort()).toEqual([...WHITELIST].sort());
  });

  it('the agenda and the FE-078 screens are migrated and exist (no exceptions list to return to)', () => {
    for (const rel of MIGRATED) {
      expect([rel, existsSync(join(SRC, rel))]).toEqual([rel, true]);
    }
  });

  it('no Intl formatter or toLocale*String gets a literal locale outside lib/format', () => {
    const offenders = files.flatMap(({ rel, source }) => literalLocaleCalls(source).map((hit) => `${rel}:${hit}`));
    expect(offenders).toEqual([]);
  });

  it('no amount is painted with the currency symbol (fmt.money) outside lib/format: always the ISO code', () => {
    const offenders = files.flatMap(({ rel, source }) => symbolMoneyCalls(source).map((hit) => `${rel}:${hit}`));
    expect(offenders).toEqual([]);
  });

  it('platformInstant (UTC, sin sede) solo se importa desde components/platform (DX-354b, E8)', () => {
    expect(rule4Offenders(files)).toEqual([]);
    // La consola lo usa de verdad: la regla no se cumple por falta de uso.
    const card = files.find((f) => f.rel === 'components/platform/platform-mfa-card.tsx');
    expect(card && importsPlatformInstant(card.source)).toBe(true);
  });

  it('the DX-386 payment screens paint amounts with the ISO code and never go back to formatCurrency', () => {
    for (const rel of MONEY_WITH_CODE) {
      const file = files.find((f) => f.rel === rel);
      expect([rel, file !== undefined]).toEqual([rel, true]);
      expect([rel, file ? currencyImports(file.source) : []]).toEqual([rel, []]);
    }
  });

  it('the scan covers components, app and lib, and skips lib/format and tests', () => {
    const rels = files.map((f) => f.rel);
    expect(rels).toEqual(
      expect.arrayContaining([
        'components/appointments/agenda-view.tsx',
        'lib/reports/comparison-table.ts',
        'lib/appointments/calendar-grid.ts',
      ]),
    );
    expect(rels.some((r) => r.startsWith('app/'))).toBe(true);
    expect(rels.some((r) => r.startsWith('lib/format/') || r.includes('.test.'))).toBe(false);
  });

  it('the rules catch every import style and literal locale, and let the sede helpers through', () => {
    const imports = (code: string) => sedelessImports(parse('x.tsx', code));
    expect(imports("import { formatTime } from '@/lib/format/date';")).toEqual(['formatTime']);
    expect(imports("import { formatDate as f, civilDateLabel } from '@/lib/format/date';")).toEqual(['formatDate']);
    expect(imports("import * as dates from '@/lib/format/date';")).toEqual(['*']);
    expect(imports("import { formatCivilDate } from '@/lib/format/date';")).toEqual(['formatCivilDate']);
    expect(imports("import { civilDateLabel, firstOfMonth } from '@/lib/format/date';")).toEqual([]);
    expect(imports("import { sedeTime } from '@/lib/locations/sede-clock';")).toEqual([]);
    const relativeImports = (file: string, code: string) => sedelessImports(parse(join(SRC, file), code));
    expect(relativeImports('lib/appointments/x.ts', "import { formatTime } from '../format/date';")).toEqual(['formatTime']);
    expect(relativeImports('lib/format/x.ts', "import { formatDate } from './date';")).toEqual(['formatDate']);
    expect(relativeImports('lib/appointments/x.ts', "import { formatTime } from './date';")).toEqual([]);

    // Mutación (DX-354b): sin lista de excepciones, cualquier fichero que importe un ayudante retirado,
    // por nombre, con alias o con `import *`, hace fallar la regla 1; un neutro de la lista blanca, no.
    const offender = (code: string) => [{ rel: 'components/nueva/pantalla.tsx', source: parse('x.tsx', code) }];
    expect(rule1Offenders(offender("import { formatCivilDate } from '@/lib/format/date';"))).toEqual([
      'components/nueva/pantalla.tsx: formatCivilDate',
    ]);
    expect(rule1Offenders(offender("import { formatCivilDate, formatDate } from '@/lib/format/date';"))).toEqual([
      'components/nueva/pantalla.tsx: formatCivilDate, formatDate',
    ]);
    expect(rule1Offenders(offender("import * as dates from '@/lib/format/date';"))).toEqual([
      'components/nueva/pantalla.tsx: *',
    ]);
    expect(rule1Offenders(offender("import { civilDateInZone, zoneCityLabel } from '@/lib/format/date';"))).toEqual([]);

    // Mutación de la regla 4: otra carpeta que importe `platformInstant` falla; la consola, no; ni alias ni ruta relativa se escapan.
    const platformImport = "import { platformInstant } from '@/lib/format/platform-instant';";
    const at = (rel: string, code: string) => [{ rel, source: parse(join(SRC, rel), code) }];
    expect(rule4Offenders(at('components/audit/audit-log-view.tsx', platformImport))).toEqual([
      'components/audit/audit-log-view.tsx',
    ]);
    expect(rule4Offenders(at('components/platform/platform-mfa-card.tsx', platformImport))).toEqual([]);
    expect(
      rule4Offenders(
        at('components/audit/audit-log-view.tsx', "import { platformInstant } from '../../lib/format/platform-instant';"),
      ),
    ).toEqual(['components/audit/audit-log-view.tsx']);
    expect(rule4Offenders(at('components/audit/audit-log-view.tsx', "import { sedeTime } from '@/lib/locations/sede-clock';"))).toEqual([]);

    const money = (code: string) => symbolMoneyCalls(parse('x.tsx', code)).length;
    expect(money('fmt.money(1, "USD"); clock.fmt.money(1, c);')).toBe(2);
    expect(money('sedeMoney(1, "USD", fmt); moneyWithCode(1, c, fmt); formatCurrency(1, c);')).toBe(0);
    // El pintor de la sede lleva el código ISO: se permite; el símbolo de `RegionalFormat`, no.
    expect(money('stamp.money(1, "USD"); props.stamp.money(1, c, id);')).toBe(0);
    expect(money('stamp.fmt.money(1, "USD"); fmt.money(1, c);')).toBe(2);

    const locales = (code: string) => literalLocaleCalls(parse('x.tsx', code)).length;
    expect(locales("new Intl.NumberFormat('es', { maximumFractionDigits: 2 });")).toBe(1);
    expect(locales('Intl.DateTimeFormat("en-US").format(d);')).toBe(1);
    expect(locales('n.toLocaleString(`es`, { maximumFractionDigits: 2 });')).toBe(1);
    expect(locales("d.toLocaleDateString('es', { month: 'long' });")).toBe(1);
    expect(locales("d.toLocaleTimeString('es', { hour: '2-digit' });")).toBe(1);
    expect(locales('fmt.number(n); new Intl.NumberFormat(locale); Intl.DateTimeFormat().resolvedOptions();')).toBe(0);
    expect(locales("a.localeCompare(b, 'es');")).toBe(0);
  });
});
