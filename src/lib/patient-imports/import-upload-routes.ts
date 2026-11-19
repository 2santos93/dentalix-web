/**
 * Rutas de la subida del archivo de la importación de pacientes (DX-107),
 * compartidas por el navegador (`import-upload.ts`) y la web
 * (`import-upload-proxy.ts`, en `src/app/api/import-upload/*`).
 *
 * DX-259 dejó el proxy `/api/v1` en 1 MB (`API_PROXY_MAX_BODY_BYTES`) y la
 * importación sube hasta 5 MB, así que el multipart NO va por `/api/v1`: va a
 * una ruta propia de la web, fuera del rewrite y del `proxy.ts`, que lo pasa a
 * la API en streaming (Next no copia ese cuerpo en memoria).
 */
export const IMPORT_UPLOAD_ROUTES = {
  /** Paso 1: cabeceras, mapeo sugerido y primeras filas. */
  inspect: { web: '/api/import-upload/inspect', api: '/patient-imports/inspect' },
  /** Paso 2: dry-run con el mapeo elegido. */
  validate: { web: '/api/import-upload/validate', api: '/patient-imports' },
} as const;

export type ImportUploadStep = keyof typeof IMPORT_UPLOAD_ROUTES;

/**
 * Qué se sube: un paso del asistente, la hoja de saldos («Saldo migrado»,
 * DX-262) de un lote validado (`/api/import-upload/balances/:id` →
 * `POST /patient-imports/:id/balances`) o su hoja de citas (DX-263,
 * `/api/import-upload/appointments/:id` → `POST /patient-imports/:id/appointments`).
 */
export type ImportUploadTarget =
  | ImportUploadStep
  | { balancesOf: string }
  | { appointmentsOf: string }
  | { bankStatement: BankStatementUpload };

/**
 * DX-571: los tres pasos del extracto del banco de una cuenta de conciliación
 * (`/api/import-upload/bank-statements/:id/<paso>` →
 * `POST /bank-reconciliation/accounts/:id/statements[/<paso>]`), hasta 5 MB
 * como la importación de pacientes.
 */
export type BankStatementStep = 'inspect' | 'preview' | 'confirm';
export interface BankStatementUpload {
  accountId: string;
  step: BankStatementStep;
}
const BANK_STATEMENT_STEPS: readonly BankStatementStep[] = ['inspect', 'preview', 'confirm'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** El id del lote de la hoja de saldos, solo si es un UUID (nunca un trozo de ruta). */
export function balancesBatchId(target: ImportUploadTarget): string | null {
  if (typeof target === 'string' || !('balancesOf' in target)) return null;
  return UUID.test(target.balancesOf) ? target.balancesOf : null;
}

/** El id del lote de la hoja de citas (DX-263), solo si es un UUID. */
export function appointmentsBatchId(target: ImportUploadTarget): string | null {
  if (typeof target === 'string' || !('appointmentsOf' in target)) return null;
  return UUID.test(target.appointmentsOf) ? target.appointmentsOf : null;
}

/** La cuenta del extracto (DX-571), solo si es un UUID y el paso es uno de los tres. */
export function bankStatementAccountId(target: ImportUploadTarget): string | null {
  if (typeof target === 'string' || !('bankStatement' in target)) return null;
  const { accountId, step } = target.bankStatement;
  return UUID.test(accountId) && BANK_STATEMENT_STEPS.includes(step) ? accountId : null;
}

/** Ruta de la web (navegador) y de la API para lo que se sube. */
export function importUploadPaths(target: ImportUploadTarget): { web: string; api: string } | null {
  if (typeof target === 'string') return IMPORT_UPLOAD_ROUTES[target];
  if ('bankStatement' in target) {
    const accountId = bankStatementAccountId(target);
    if (accountId === null) return null;
    const { step } = target.bankStatement;
    return {
      web: `/api/import-upload/bank-statements/${accountId}/${step}`,
      api: `/bank-reconciliation/accounts/${accountId}/statements${step === 'confirm' ? '' : `/${step}`}`,
    };
  }
  const sheet = 'appointmentsOf' in target ? 'appointments' : 'balances';
  const id = sheet === 'appointments' ? appointmentsBatchId(target) : balancesBatchId(target);
  if (id === null) return null;
  return { web: `/api/import-upload/${sheet}/${id}`, api: `/patient-imports/${id}/${sheet}` };
}

/** Tope de la API para el archivo (MAX_IMPORT_BYTES de dentalix-api): 5 MB. */
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
