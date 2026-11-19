import { apiFetch } from '@/lib/api/client';
import type { components } from '@/lib/api/schema';
import { uploadImportFile } from '@/lib/patient-imports/import-upload';
import type { BankStatementStep } from '@/lib/patient-imports/import-upload-routes';
import type { ClinicRole } from '@/lib/me/me-api';

type Schemas = components['schemas'];

// DX-571: conciliación de transferencias y pagos móviles contra el extracto del banco.
export type BankAccount = Schemas['BankAccountDto'];
export type BankAccountMethod = Schemas['BankAccountMethodDto'];
export type CreateBankAccountInput = Schemas['CreateBankAccountDto'];
export type UpdateBankAccountInput = Schemas['UpdateBankAccountDto'];
export type BankStatementImport = Schemas['BankStatementImportDto'];
export type BankStatementMapping = Schemas['BankStatementMappingDto'];
export type DateOrder = BankStatementMapping['dateOrder'];
export type DecimalSeparator = BankStatementMapping['decimalSeparator'];
export type BankStatementInspect = Schemas['BankStatementInspectDto'];
export type BankStatementPreview = Schemas['BankStatementPreviewDto'];
export type BankStatementIssue = Schemas['BankStatementIssueDto'];
export type BankStatementConfirm = Schemas['BankStatementConfirmDto'];
export type ReconciliationSummary = Schemas['ReconciliationSummaryDto'];
export type ReconciliationCounts = Schemas['ReconciliationCountsDto'];
export type ReconciliationStatus = Schemas['ReconciliationItemDto']['status'];
export type ReconciliationItem = Schemas['ReconciliationItemDto'];
export type ReconciliationItems = Schemas['ReconciliationItemsDto'];
export type ReconciliationPayment = Schemas['ReconciliationPaymentDto'];
export type BankMovement = Schemas['BankMovementDto'];
export type MovementCandidates = Schemas['MovementCandidatesDto'];
export type CandidatePayment = Schemas['CandidatePaymentDto'];
export type CandidateReport = Schemas['CandidateReportDto'];
export type BankMatch = Schemas['BankMatchDto'];
export type AutoMatchResult = Schemas['AutoMatchResultDto'];

/** Las cuatro listas, en el orden en que se enseñan. */
export const RECONCILIATION_STATUSES: readonly ReconciliationStatus[] = [
  'CONCILIADO',
  'IMPORTE_DISTINTO',
  'MOVIMIENTO_SIN_ABONO',
  'SIN_MOVIMIENTO',
];

/** Códigos estables de los 409 de la API (su `message` ya va en español). */
export const BANK_STATEMENT_CHANGED = 'BANK_STATEMENT_CHANGED';

/** Formatos que admite el extracto (los mismos que la importación de pacientes). */
export const STATEMENT_ACCEPT = '.csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Solo ADMIN concilia (BANK_RECONCILIATION_ROLES de la API). */
export function canReconcile(role: ClinicRole | null): boolean {
  return role === 'ADMIN';
}

const accountPath = (id: string) => `/bank-reconciliation/accounts/${encodeURIComponent(id)}`;

export function listBankAccounts(token: string): Promise<BankAccount[]> {
  return apiFetch<BankAccount[]>('/bank-reconciliation/accounts', { token });
}

export function createBankAccount(token: string, input: CreateBankAccountInput): Promise<BankAccount> {
  return apiFetch<BankAccount>('/bank-reconciliation/accounts', { method: 'POST', body: input, token });
}

export function updateBankAccount(token: string, id: string, input: UpdateBankAccountInput): Promise<BankAccount> {
  return apiFetch<BankAccount>(accountPath(id), { method: 'PATCH', body: input, token });
}

export function listStatementImports(token: string, accountId: string): Promise<BankStatementImport[]> {
  return apiFetch<BankStatementImport[]>(`${accountPath(accountId)}/statements`, { token });
}

function statementForm(file: File, fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  form.append('file', file);
  return form;
}

function uploadStatement<T>(
  token: string,
  accountId: string,
  step: BankStatementStep,
  form: FormData,
  onProgress?: (fraction: number) => void,
): Promise<T> {
  // Hasta 5 MB: por la ruta de subida de la web, no por el proxy `/api/v1` (1 MB, DX-259).
  return uploadImportFile<T>({ bankStatement: { accountId, step } }, form, { token, onProgress });
}

/** Paso 1: cabeceras, mapeo sugerido (o el guardado de la cuenta) y primeras filas. No escribe. */
export function inspectStatement(
  token: string,
  accountId: string,
  file: File,
  onProgress?: (fraction: number) => void,
): Promise<BankStatementInspect> {
  return uploadStatement(token, accountId, 'inspect', statementForm(file), onProgress);
}

/** Paso 2: vista previa con el mapeo elegido. No escribe. */
export function previewStatement(
  token: string,
  accountId: string,
  file: File,
  mapping: BankStatementMapping,
  onProgress?: (fraction: number) => void,
): Promise<BankStatementPreview> {
  return uploadStatement(
    token,
    accountId,
    'preview',
    statementForm(file, { mapping: JSON.stringify(mapping) }),
    onProgress,
  );
}

/**
 * Paso 3: importar. Se vuelve a subir el MISMO archivo con el SHA-256 de la
 * vista previa (la API no guarda la vista previa): si cambió, 409
 * `BANK_STATEMENT_CHANGED`.
 */
export function confirmStatement(
  token: string,
  accountId: string,
  file: File,
  mapping: BankStatementMapping,
  fileSha256: string,
  onProgress?: (fraction: number) => void,
): Promise<BankStatementConfirm> {
  return uploadStatement(
    token,
    accountId,
    'confirm',
    statementForm(file, { mapping: JSON.stringify(mapping), fileSha256 }),
    onProgress,
  );
}

export interface ReconciliationPeriod {
  from: string;
  to: string;
}

const periodQuery = (period: ReconciliationPeriod) => new URLSearchParams({ from: period.from, to: period.to });

export function getReconciliationSummary(
  token: string,
  accountId: string,
  period: ReconciliationPeriod,
): Promise<ReconciliationSummary> {
  return apiFetch<ReconciliationSummary>(`${accountPath(accountId)}/summary?${periodQuery(period)}`, { token });
}

export function listReconciliationItems(
  token: string,
  accountId: string,
  query: ReconciliationPeriod & { status: ReconciliationStatus; page?: number; pageSize?: number },
): Promise<ReconciliationItems> {
  const params = periodQuery(query);
  params.set('status', query.status);
  if (query.page) params.set('page', String(query.page));
  if (query.pageSize) params.set('pageSize', String(query.pageSize));
  return apiFetch<ReconciliationItems>(`${accountPath(accountId)}/items?${params}`, { token });
}

/** «Volver a emparejar» el período: los abonos registrados después de importar. */
export function autoMatchPeriod(
  token: string,
  accountId: string,
  period: ReconciliationPeriod,
): Promise<AutoMatchResult> {
  return apiFetch<AutoMatchResult>(`${accountPath(accountId)}/auto-match`, {
    method: 'POST',
    body: { from: period.from, to: period.to },
    token,
  });
}

export function getMovementCandidates(token: string, movementId: string): Promise<MovementCandidates> {
  return apiFetch<MovementCandidates>(`/bank-reconciliation/movements/${encodeURIComponent(movementId)}/candidates`, {
    token,
  });
}

export function matchMovement(token: string, movementId: string, paymentId: string): Promise<BankMatch> {
  return apiFetch<BankMatch>('/bank-reconciliation/matches', {
    method: 'POST',
    body: { movementId, paymentId },
    token,
  });
}

export function unmatchMovement(token: string, matchId: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/bank-reconciliation/matches/${encodeURIComponent(matchId)}`, {
    method: 'DELETE',
    token,
  });
}

/**
 * El período por defecto: el de la última importación de la cuenta; sin
 * ninguna, el mes en curso de la sede (`today` = hoy en su zona).
 */
export function defaultPeriod(account: BankAccount | null, today: string): ReconciliationPeriod {
  const last = account?.lastImport;
  if (last?.periodFrom && last.periodTo) return { from: last.periodFrom, to: last.periodTo };
  const month = today.slice(0, 7);
  const [year, mm] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, mm, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

/** Mapeo vacío de partida (sin cabeceras elegidas). */
export const EMPTY_MAPPING: BankStatementMapping = { dateOrder: 'DMY', decimalSeparator: ',' };

/** Lo mínimo para pedir la vista previa: fecha, referencia y un importe (con signo o crédito). */
export function mappingComplete(mapping: BankStatementMapping): boolean {
  return Boolean(mapping.date && mapping.reference && (mapping.amount || mapping.credit));
}
