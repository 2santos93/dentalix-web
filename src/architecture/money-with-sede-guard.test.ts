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
 * Plan, presupuesto, listas de precios, caja y estado de cuenta ya cumplen.
 * Ninguna vista de `components/` ni de `app/` importa `formatCurrency` salvo
 * las de `PENDING`, cada una con su motivo. La lista solo encoge: una entrada
 * que ya no lo importa hace fallar la prueba hasta que se quita, y una vista
 * nueva no entra en ella.
 */
const SRC = join(__dirname, '..');
const CURRENCY_MODULE = '@/lib/format/currency';

const PRINTED = 'Impreso o documento A4/PDF: sin formato de sede hasta G1-C (DX-354), con la sede del documento.';
const PUBLIC_PAGE = 'Página pública: la API no manda la zona ni el formato de la sede (ver PUBLIC_PAGE en sede-clock-guard).';
const FLOW = 'Diálogo o ayudante compartido con pantallas aún sin migrar: pasa con ellas, con el `money` inyectado.';
const OTHER = 'Pantalla fuera de las cinco superficies de DX-522: pendiente de migrar a sedeMoney.';

/** Vistas que aún importan `formatCurrency`. Solo puede encoger. */
const PENDING: Readonly<Record<string, string>> = {
  'components/account-statement/account-statement-document.tsx': PRINTED,
  'components/account-statement/family-account-statement-document.tsx': PRINTED,
  'components/appointments/cancellation-fee-panel.tsx': OTHER,
  'components/appointments/public-confirmation-view.tsx': PUBLIC_PAGE,
  'components/cash-sessions/cash-session-report.tsx': PRINTED,
  'components/catalog/catalog-view.tsx': OTHER,
  'components/collections/patient-collections-section.tsx': OTHER,
  'components/currency-texts/currency-texts-form.tsx': OTHER,
  'components/dashboard/period-results-section.tsx': OTHER,
  'components/expenses/expense-detail-modal.tsx': OTHER,
  'components/expenses/expense-form-modal.tsx': OTHER,
  'components/expenses/expense-payment-modal.tsx': OTHER,
  'components/locations/cancellation-policy-settings.tsx': OTHER,
  'components/patient-credit/credit-balance-section.tsx': OTHER,
  'components/patient-credit/credit-refund-document.tsx': PRINTED,
  'components/patient-credit/credit-refund-modal.tsx': OTHER,
  'components/patient-credit/credit-transfer-modal.tsx': OTHER,
  'components/patient-imports/balances-step.tsx': OTHER,
  'components/patient-imports/import-progress.tsx': OTHER,
  'components/patient-imports/patient-import-wizard.tsx': OTHER,
  'components/payment-plans/create-payment-plan-modal.tsx': FLOW,
  'components/payments/billable-plan-field.tsx': FLOW,
  'components/payments/payment-adjustments-preview.tsx': FLOW,
  'components/payments/payment-receipt-document.tsx': PRINTED,
  'components/payments/reallocate-payment-modal.tsx': FLOW,
  'components/payments/use-void-payment.ts': FLOW,
  'components/receivables/aging-summary.tsx': OTHER,
  'components/receivables/debtor-parts.tsx': OTHER,
  'components/shared/money-input.tsx': FLOW,
  'components/treatment-plans/plan-quote-document.tsx': PRINTED,
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

const views = ['components', 'app']
  .flatMap((dir) => sourceFiles(join(SRC, dir)))
  .map((path) => ({
    rel: relative(SRC, path).split(sep).join('/'),
    uses: importsFormatCurrency(ts.createSourceFile(path, readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)),
  }));

describe('arquitectura: importes con la sede (DX-522)', () => {
  it('no view imports formatCurrency outside the pending list', () => {
    expect(views.filter(({ rel, uses }) => uses && !(rel in PENDING)).map(({ rel }) => rel)).toEqual([]);
  });

  it('every pending entry still imports formatCurrency (the list only shrinks)', () => {
    const stale = Object.keys(PENDING).filter((rel) => !views.find((v) => v.rel === rel)?.uses);
    expect(stale).toEqual([]);
  });
});
