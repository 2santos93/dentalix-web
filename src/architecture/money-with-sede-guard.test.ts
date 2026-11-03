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
 * Plan, presupuesto, listas de precios, caja, estado de cuenta e impresos ya
 * cumplen. Ningún fichero de `components/`, `app/` ni `lib/` importa
 * `formatCurrency` salvo los de `PENDING`, cada uno con su motivo (DX-354 amplía
 * la guarda a `lib/`, salvo `lib/format/**`, donde vive el formateador,
 * `lib/test/**` y `schema.d.ts`). La lista solo encoge: una entrada que ya no
 * lo importa hace fallar la prueba hasta que se quita, y un fichero nuevo no
 * entra en ella.
 */
const SRC = join(__dirname, '..');
const CURRENCY_MODULE = '@/lib/format/currency';

const FLOW = 'Diálogo o ayudante compartido con pantallas aún sin migrar: pasa con ellas, con el `money` inyectado.';
const OTHER = 'Pantalla fuera de las cinco superficies de DX-522: pendiente de migrar a sedeMoney.';
const LIB_FLOW = 'Ayudante de lib/ con el `money` inyectado y `formatCurrency` por defecto: se migra con sus pantallas (DX-354b).';

/** Ficheros que aún importan `formatCurrency`. Solo puede encoger. */
const PENDING: Readonly<Record<string, string>> = {
  'components/appointments/cancellation-fee-panel.tsx': OTHER,
  'components/catalog/catalog-view.tsx': OTHER,
  'components/collections/patient-collections-section.tsx': OTHER,
  'components/currency-texts/currency-texts-form.tsx': OTHER,
  'components/dashboard/period-results-section.tsx': OTHER,
  'components/expenses/expense-detail-modal.tsx': OTHER,
  'components/expenses/expense-form-modal.tsx': OTHER,
  'components/expenses/expense-payment-modal.tsx': OTHER,
  'components/locations/cancellation-policy-settings.tsx': OTHER,
  'components/patient-credit/credit-balance-section.tsx': OTHER,
  'components/patient-credit/credit-refund-modal.tsx': OTHER,
  'components/patient-credit/credit-transfer-modal.tsx': OTHER,
  'components/patient-imports/balances-step.tsx': OTHER,
  'components/patient-imports/import-progress.tsx': OTHER,
  'components/patient-imports/patient-import-wizard.tsx': OTHER,
  'components/payment-plans/create-payment-plan-modal.tsx': FLOW,
  'components/payments/billable-plan-field.tsx': FLOW,
  'components/payments/payment-adjustments-preview.tsx': FLOW,
  'components/payments/reallocate-payment-modal.tsx': FLOW,
  'components/receivables/aging-summary.tsx': OTHER,
  'components/receivables/debtor-parts.tsx': OTHER,
  'components/shared/money-input.tsx': FLOW,
  'lib/payments/billable-plans-api.ts': LIB_FLOW,
  'lib/payments/payment-adjustments.ts': LIB_FLOW,
};

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
  it('no file imports formatCurrency outside the pending list', () => {
    expect(views.filter(({ rel, uses }) => uses && !(rel in PENDING)).map(({ rel }) => rel)).toEqual([]);
  });

  it('every pending entry still imports formatCurrency (the list only shrinks)', () => {
    const stale = Object.keys(PENDING).filter((rel) => !views.find((v) => v.rel === rel)?.uses);
    expect(stale).toEqual([]);
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
