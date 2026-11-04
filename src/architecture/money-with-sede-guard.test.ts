import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import ts from 'typescript';

/**
 * DX-522: en las vistas, un importe se pinta con el formato de la sede y el
 * código ISO de su moneda (`sedeMoney`/`moneyWithCode` de
 * `@/lib/format/sede-number`, Code Rule de DESIGN.md), nunca con
 * `formatCurrency`, que no conoce la sede (idioma fijo y símbolo «US$»).
 * Mientras la sede carga o no tiene formato se pinta `NO_SEDE_FORMAT`.
 *
 * Sin lista de excepciones (DX-354b, W4): las 24 pantallas pendientes de DX-522 se
 * migraron en W2 y W3 y `PENDING` desapareció. Ningún fichero de `components/`,
 * `app/` ni `lib/` importa `formatCurrency` (DX-354 amplía la guarda a `lib/`,
 * salvo `lib/format/**`, donde vive el formateador, `lib/test/**` y
 * `schema.d.ts`). `formatCurrency` se queda exportado en `lib/format/currency.ts`
 * para `moneyWithCode` y el CSV. `MIGRATED` fija que los documentos, los
 * ayudantes y las 24 pantallas migradas siguen existiendo y no vuelven a
 * importarlo.
 */
const SRC = join(__dirname, '..');
const CURRENCY_MODULE = '@/lib/format/currency';

/**
 * DX-354: documentos y ayudantes que ya pintan sus importes con `moneyWithCode`
 * (`sedeMoney`/`documentTexts`): no pueden volver a `formatCurrency`.
 */
const MIGRATED = [
  'components/account-statement/account-statement-document.tsx',
  'components/account-statement/family-account-statement-document.tsx',
  'components/consents/consent-document.tsx',
  'components/implants/implant-card-document.tsx',
  'components/postop/postop-document.tsx',
  'components/treatment-plans/plan-quote-document.tsx',
  'lib/account-statement/presentation.ts',
  'components/appointments/public-confirmation-view.tsx',
  'components/cash-sessions/cash-session-report.tsx',
  'components/patient-credit/credit-refund-document.tsx',
  'components/payments/use-void-payment.ts',
  'lib/collections/presentation.ts',
  'lib/cash-sessions/presentation.ts',
  'lib/treatment-plans/list-price.ts',
  'components/payments/payment-receipt-document.tsx',
  // DX-354b W2: caja, cobros, cartera, gastos, saldo a favor, catálogo e importaciones con el `money` de la sede.
  'components/appointments/cancellation-fee-panel.tsx',
  'components/catalog/catalog-view.tsx',
  'components/collections/patient-collections-section.tsx',
  'components/currency-texts/currency-texts-form.tsx',
  'components/dashboard/period-results-section.tsx',
  'components/expenses/expense-detail-modal.tsx',
  'components/expenses/expense-form-modal.tsx',
  'components/expenses/expense-payment-modal.tsx',
  'components/locations/cancellation-policy-settings.tsx',
  'components/patient-credit/credit-balance-section.tsx',
  'components/patient-credit/credit-refund-modal.tsx',
  'components/patient-credit/credit-transfer-modal.tsx',
  'components/patient-imports/balances-step.tsx',
  'components/patient-imports/import-progress.tsx',
  'components/patient-imports/patient-import-wizard.tsx',
  'components/payment-plans/create-payment-plan-modal.tsx',
  'components/payments/billable-plan-field.tsx',
  'components/payments/payment-adjustments-preview.tsx',
  'components/payments/reallocate-payment-modal.tsx',
  'components/receivables/aging-summary.tsx',
  'components/receivables/debtor-parts.tsx',
  'components/shared/money-input.tsx',
  'lib/payments/billable-plans-api.ts',
  'lib/payments/payment-adjustments.ts',
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

/** ¿Importa el fichero `formatCurrency` de `@/lib/format/currency`? */
function importsFormatCurrency(source: ts.SourceFile): boolean {
  return source.statements.some((statement) => {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) return false;
    if (statement.moduleSpecifier.text !== CURRENCY_MODULE) return false;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamespaceImport(bindings)) return true;
    return !!bindings && ts.isNamedImports(bindings) && bindings.elements.some((e) => (e.propertyName ?? e.name).text === 'formatCurrency');
  });
}

/** Los ficheros que la guarda mira: `components/`, `app/` y `lib/` salvo lo que no es una vista ni un ayudante de pintura. */
function scanned(rel: string): boolean {
  if (/\.test\./.test(rel)) return false;
  if (rel.startsWith('lib/format/') || rel.startsWith('lib/test/')) return false;
  return rel !== 'lib/api/schema.d.ts';
}

function parse(fileName: string, text: string): ts.SourceFile {
  return ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}

const views = ['components', 'app', 'lib']
  .flatMap((dir) => sourceFiles(join(SRC, dir)))
  .map((path) => ({ rel: relative(SRC, path).split(sep).join('/'), path }))
  .filter(({ rel }) => scanned(rel))
  .map(({ rel, path }) => ({ rel, uses: importsFormatCurrency(parse(path, readFileSync(path, 'utf8'))) }));

describe('arquitectura: importes con la sede (DX-522)', () => {
  it('no file imports formatCurrency (there is no pending list)', () => {
    expect(views.filter(({ uses }) => uses).map(({ rel }) => rel)).toEqual([]);
  });

  it('the migrated documents, helpers and screens exist and cannot return to formatCurrency', () => {
    for (const rel of MIGRATED) {
      const file = views.find((v) => v.rel === rel);
      expect([rel, file !== undefined]).toEqual([rel, true]);
      expect([rel, file?.uses]).toEqual([rel, false]);
    }
  });

  it('scans lib/ too, and skips lib/format, lib/test, schema.d.ts and tests', () => {
    expect(views.some((v) => v.rel.startsWith('lib/'))).toBe(true);
    expect(views.some((v) => v.rel.startsWith('lib/format/') || v.rel.startsWith('lib/test/'))).toBe(false);
    expect(views.some((v) => v.rel === 'lib/api/schema.d.ts' || /\.test\./.test(v.rel))).toBe(false);
    expect(scanned('lib/collections/presentation.ts')).toBe(true);
    expect(scanned('lib/format/currency.ts')).toBe(false);
    expect(scanned('lib/test/payment-receipt.ts')).toBe(false);
  });

  it('catches an import of formatCurrency in lib/ and lets other imports through', () => {
    const imports = (code: string) => importsFormatCurrency(parse('lib/x/presentation.ts', code));
    expect(imports("import { formatCurrency } from '@/lib/format/currency';")).toBe(true);
    expect(imports("import { formatCurrency as fc } from '@/lib/format/currency';")).toBe(true);
    expect(imports("import * as currency from '@/lib/format/currency';")).toBe(true);
    expect(imports("import { formatAmount } from '@/lib/format/currency';")).toBe(false);
    expect(imports("import { sedeMoney } from '@/lib/format/sede-number';")).toBe(false);
  });
});
