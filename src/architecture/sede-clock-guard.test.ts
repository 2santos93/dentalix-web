import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * DX-378 (FE-076, FE-078): la hora, las fechas y los números se pintan con la
 * zona y el formato de la sede (`RegionalFormat`, `SedeClock`), nunca con los
 * del navegador ni con un idioma fijo. Dos reglas para todo `src/` salvo
 * `lib/format/**` (donde viven los helpers), los tests, `lib/test/**` y
 * `schema.d.ts`:
 *
 * 1. Nadie importa de `@/lib/format/date` los helpers sin sede
 *    (`SEDELESS_HELPERS`: zona del navegador y 24 h fijas, la zona sin el
 *    reloj, o `formatCivilDate`, que compone `dd/mm/yyyy` a mano), salvo las
 *    pantallas que aún no se migraron, listadas una a una en `PENDING` con su
 *    motivo (y, solo para `formatCivilDate`, en `CIVIL_PENDING`, DX-354b W4).
 *    Una pantalla nueva no entra en las listas: usa `useSedeStamp`/
 *    `useSedeClock`/`useSedeFormat`. Las listas solo encogen: una entrada que
 *    ya no los importa hace fallar la prueba hasta que se quita, y
 *    `MAX_PENDING`/`MAX_CIVIL_PENDING` impiden añadir entradas aunque la lista
 *    «solo encoja» en este comentario.
 * 2. Nadie llama a `Intl.*Format`/`Intl.PluralRules` ni a
 *    `toLocale(Date|Time)?String` con un locale literal (`'es'`, `"en-US"`…):
 *    el formato lo da la sede; las palabras, `UI_LANGUAGE` dentro de
 *    `lib/format`.
 * 3. Nadie pinta un importe con `RegionalFormat.money` (`fmt.money(…)`): da el
 *    símbolo local («$», «US$», «Bs.S»), ambiguo en un producto bimonetario.
 *    Los importes con el formato de la sede llevan siempre el código ISO:
 *    `sedeMoney`/`moneyWithCode` de `@/lib/format/sede-number`.
 */
const SRC = join(__dirname, '..');
const FORMAT_DATE_MODULES = new Set(['@/lib/format/date']);
const SEDELESS_HELPERS = new Set([
  'formatTime',
  'formatDate',
  'formatDateTime',
  'formatTimeInZone',
  'formatDateTimeInZone',
  'formatDateLabel',
  // DX-354b: el mismo defecto (`dd/mm/yyyy` fijo, ajeno al locale de la sede).
  'formatCivilDate',
]);

const ZONE_24H = 'Ya usa la zona de la sede, pero con 24 h fijas: falta pasar a fmt.dateTime/fmt.time.';
const STAMP = 'Fecha de registro (createdAt, firmas, envíos) en la hora del navegador: pendiente de migrar a la sede.';

/** Pantallas aún sin migrar (DX-378, pendiente). Solo puede encoger. */
const PENDING: Readonly<Record<string, string>> = {
  'components/cash-sessions/cash-shifts-view.tsx': ZONE_24H,
  'lib/clinical/medical-alerts.ts': ZONE_24H,
  'components/collections/patient-collections-section.tsx': STAMP,
  'components/discounts/discount-policy-manager.tsx': STAMP,
  'components/domains/domains-manager.tsx': STAMP,
  'components/expenses/expense-detail-modal.tsx': STAMP,
  'components/implants/patient-implants-tab.tsx': STAMP,
  'components/inventory/inventory-item-detail.tsx': STAMP,
  'components/inventory/inventory-view.tsx': STAMP,
  'components/locations/cancellation-policy-settings.tsx': STAMP,
  'components/odontogram/tooth-timeline.tsx': STAMP,
  'components/patient-imports/import-history.tsx': STAMP,
  'components/patients/clinical-entries-list.tsx': STAMP,
  'components/patients/medical-history-panel.tsx': STAMP,
  'components/patients/patient-agreement-section.tsx': STAMP,
  'components/patients/patient-communication-section.tsx': STAMP,
  'components/patients/patient-opt-out-warnings.tsx': STAMP,
  'components/payments/cash-register-view.tsx': STAMP,
  'components/platform/platform-mfa-card.tsx': STAMP,
  'components/postop/patient-postop-deliveries.tsx': STAMP,
  'components/postop/postop-templates-manager.tsx': STAMP,
  'components/prescriptions/patient-prescriptions-tab.tsx': STAMP,
  'components/prescriptions/prescription-templates-manager.tsx': STAMP,
  'components/receivables/debtor-parts.tsx': STAMP,
  'components/support-accesses/support-accesses-view.tsx': STAMP,
  'components/treatment-plans/pending-follow-up-view.tsx': STAMP,
  'components/treatment-plans/plan-options-panel.tsx': STAMP,
  'components/treatment-plans/plan-quote-actions.tsx': STAMP,
  'components/treatment-plans/treatment-plans-tab-copy.ts': STAMP,
  'lib/patients/member-number.ts': STAMP,
  'lib/treatment-plans/item-attribution.ts': STAMP,
  'lib/treatment-plans/plan-options.ts': STAMP,
};

/**
 * Aserción del máximo (DX-354b, M2): nadie añade entradas a `PENDING` aunque el
 * comentario diga que «solo encoge». Cada PR de DX-354b baja la constante; al
 * cierre, `PENDING` desaparece.
 */
const MAX_PENDING = 32;

const CIVIL_W4 = 'Día civil en `dd/mm/yyyy` fijo: se migra a `fmt.civilDate`/`stamp.civilDate` en DX-354b W4.';

/**
 * Ficheros que solo importan `formatCivilDate` (sin ningún otro ayudante sin
 * sede, que irían en `PENDING`). Solo puede encoger; se vacía en DX-354b W4.
 */
const CIVIL_PENDING: Readonly<Record<string, string>> = {
  'components/account-statement/account-statement-view.tsx': CIVIL_W4,
  'components/clinical/anamnesis-review-line.tsx': CIVIL_W4,
  'components/consents/new-consent-modal.tsx': CIVIL_W4,
  'components/implants/implant-lot-search.tsx': CIVIL_W4,
  'components/odontogram/odontogram-tab.tsx': CIVIL_W4,
  'components/patient-credit/credit-refund-modal.tsx': CIVIL_W4,
  'components/patients/patient-data-panel.tsx': CIVIL_W4,
  'components/payments/reallocate-payment-modal.tsx': CIVIL_W4,
  'components/perio/perio-exam-editor.tsx': CIVIL_W4,
  'components/perio/perio-tab.tsx': CIVIL_W4,
  'components/recall/patient-recall-section.tsx': CIVIL_W4,
  'components/recall/recall-view.tsx': CIVIL_W4,
  'components/signature-requests/send-to-sign-modal.tsx': CIVIL_W4,
  'components/treatment-plans/accept-plan-modal.tsx': CIVIL_W4,
  'components/treatment-plans/payment-plan-section.tsx': CIVIL_W4,
  'components/treatment-plans/plan-visits-board.tsx': CIVIL_W4,
  'lib/patients/agreement-presentation.ts': CIVIL_W4,
  'lib/patients/coverage-presentation.ts': CIVIL_W4,
};
const MAX_CIVIL_PENDING = 18;

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

/** Los helpers sin sede que importa el fichero (o `*` si importa el módulo entero). */
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
        if (SEDELESS_HELPERS.has(name)) found.push(name);
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
      node.expression.name.text === 'money'
    ) {
      const { line } = source.getLineAndCharacterOfPosition(node.getStart(source));
      found.push(`${line + 1}: ${node.getText(source).split('\n')[0]}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return found;
}

/** Regla 1: ficheros que importan un ayudante sin sede sin estar en las listas (`formatCivilDate` solo se tolera en `civilPending`). */
function rule1Offenders(
  scannedFiles: readonly { rel: string; source: ts.SourceFile }[],
  pending: Readonly<Record<string, string>>,
  civilPending: Readonly<Record<string, string>>,
): string[] {
  return scannedFiles
    .filter(({ rel }) => !(rel in pending))
    .map(({ rel, source }) => ({
      rel,
      used: sedelessImports(source).filter((name) => !(name === 'formatCivilDate' && rel in civilPending)),
    }))
    .filter(({ used }) => used.length > 0)
    .map(({ rel, used }) => `${rel}: ${used.join(', ')}`);
}

const files = sourceFiles(SRC)
  .map((path) => ({ path, rel: relOf(path) }))
  .filter(({ rel }) => scanned(rel))
  .map(({ path, rel }) => ({ rel, source: parse(path, readFileSync(path, 'utf8')) }));

describe('arquitectura: hora, fechas y números con la sede (DX-378)', () => {
  it('no file imports the sede-less date helpers outside the pending lists', () => {
    expect(rule1Offenders(files, PENDING, CIVIL_PENDING)).toEqual([]);
  });

  it('every pending entry still exists and still needs the exception (the list only shrinks)', () => {
    const stale = Object.keys(PENDING).filter((rel) => {
      const file = files.find((f) => f.rel === rel);
      return !file || sedelessImports(file.source).length === 0;
    });
    expect(stale).toEqual([]);
  });

  it('every civil-pending entry still imports formatCivilDate and is not also in PENDING (the list only shrinks)', () => {
    const stale = Object.keys(CIVIL_PENDING).filter((rel) => {
      const file = files.find((f) => f.rel === rel);
      return !file || !sedelessImports(file.source).includes('formatCivilDate') || rel in PENDING;
    });
    expect(stale).toEqual([]);
  });

  it('the pending lists never grow beyond their maximum (DX-354b)', () => {
    expect(Object.keys(PENDING).length).toBeLessThanOrEqual(MAX_PENDING);
    expect(Object.keys(CIVIL_PENDING).length).toBeLessThanOrEqual(MAX_CIVIL_PENDING);
  });

  it('the agenda and the FE-078 screens are migrated and cannot return to the list', () => {
    for (const rel of MIGRATED) {
      expect([rel, existsSync(join(SRC, rel))]).toEqual([rel, true]);
      expect([rel, rel in PENDING]).toEqual([rel, false]);
      expect([rel, rel in CIVIL_PENDING]).toEqual([rel, false]);
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

    // Mutaciones (DX-354b): una entrada de más hace fallar el máximo; un fichero nuevo
    // que importa `formatCivilDate` fuera de las listas hace fallar la regla 1.
    const grown = { ...PENDING, 'components/nueva/pantalla.tsx': STAMP };
    expect(Object.keys(grown).length <= MAX_PENDING).toBe(false);
    const fresh = [
      { rel: 'components/nueva/pantalla.tsx', source: parse('x.tsx', "import { formatCivilDate } from '@/lib/format/date';") },
    ];
    expect(rule1Offenders(fresh, PENDING, CIVIL_PENDING)).toEqual(['components/nueva/pantalla.tsx: formatCivilDate']);
    expect(rule1Offenders(fresh, PENDING, { 'components/nueva/pantalla.tsx': CIVIL_W4 })).toEqual([]);
    const both = [
      { rel: 'components/nueva/pantalla.tsx', source: parse('x.tsx', "import { formatCivilDate, formatDate } from '@/lib/format/date';") },
    ];
    expect(rule1Offenders(both, PENDING, { 'components/nueva/pantalla.tsx': CIVIL_W4 })).toEqual([
      'components/nueva/pantalla.tsx: formatDate',
    ]);

    const money = (code: string) => symbolMoneyCalls(parse('x.tsx', code)).length;
    expect(money('fmt.money(1, "USD"); clock.fmt.money(1, c);')).toBe(2);
    expect(money('sedeMoney(1, "USD", fmt); moneyWithCode(1, c, fmt); formatCurrency(1, c);')).toBe(0);

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
