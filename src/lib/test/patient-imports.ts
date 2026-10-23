import type {
  ImportBatchDetail,
  ImportInspect,
} from '@/lib/patient-imports/patient-imports-api';

/** Lo que devuelve `POST /patient-imports/inspect` para un CSV de 3 filas. */
export function inspectFixture(overrides: Partial<ImportInspect> = {}): ImportInspect {
  return {
    fileName: 'pacientes.csv',
    fileFormat: 'CSV',
    encoding: 'utf-8',
    delimiter: ';',
    headers: ['Cédula', 'Nombre', 'Apellidos', 'Celular', 'Extra'],
    suggestedMapping: { docNumber: 'Cédula', firstName: 'Nombre', lastName: 'Apellidos', phone: 'Celular' },
    sampleRows: [['1020304050', 'Ana', 'Pérez', '3101234567', 'x']],
    totalRows: 3,
    fields: [
      { key: 'docType', label: 'Tipo de documento', required: false, header: 'tipo_documento' },
      { key: 'docNumber', label: 'Número de documento', required: true, header: 'numero_documento' },
      { key: 'firstName', label: 'Nombres', required: true, header: 'nombres' },
      { key: 'lastName', label: 'Apellidos', required: true, header: 'apellidos' },
      { key: 'phone', label: 'Teléfono', required: false, header: 'telefono' },
    ],
    ...overrides,
  };
}

/** Un lote de importación (DX-107) con dry-run de 3 filas. */
export function batchFixture(overrides: Partial<ImportBatchDetail> = {}): ImportBatchDetail {
  return {
    id: 'batch-1',
    status: 'VALIDATED',
    fileName: 'pacientes.csv',
    fileFormat: 'CSV',
    fileSizeBytes: 120,
    fileSha256: 'a'.repeat(64),
    locationId: 'loc-1',
    createdAt: '2026-10-21T14:00:00.000Z',
    createdBy: { id: 'u-1', fullName: 'Admin Demo' },
    columnMapping: { columns: { docNumber: 'Cédula' }, defaultDocType: 'CC' },
    totals: { totalRows: 3, validRows: 1, duplicateRows: 1, errorRows: 1 },
    progress: {
      preparedRows: 2,
      processedRows: 0,
      createdCount: 0,
      updatedCount: 0,
      skippedCount: 0,
      failedCount: 0,
      percent: 0,
    },
    duplicateMode: null,
    confirmedAt: null,
    startedAt: null,
    finishedAt: null,
    undoneAt: null,
    undoneCreated: null,
    undoneFilled: null,
    canConfirm: true,
    canUndo: false,
    reportAvailable: true,
    balances: null,
    balanceIssues: [],
    balanceIssuesTotal: 0,
    issues: [
      {
        row: 3,
        column: 'Cédula',
        kind: 'DUPLICATE_EXISTING',
        message: 'Ya existe un paciente con este documento en la clínica.',
        value: 'CC 900900',
      },
      { row: 4, column: 'Nombre', kind: 'ERROR', message: 'Falta «Nombres».', value: null },
    ],
    issuesTotal: 2,
    preview: [
      {
        rowNumber: 2,
        status: 'NEW',
        data: { docType: 'CC', docNumber: '1020304050', firstName: 'Ana', lastName: 'Pérez' },
      },
    ],
    ...overrides,
  };
}

/** Hoja de saldos (DX-262) validada: 7 filas, 3 con error, 1 sumada. */
export function balancesFixture(
  overrides: Partial<NonNullable<ImportBatchDetail['balances']>> = {},
): NonNullable<ImportBatchDetail['balances']> {
  return {
    fileName: 'saldos.csv',
    fileFormat: 'CSV',
    fileSizeBytes: 200,
    fileSha256: 'b'.repeat(64),
    totalRows: 7,
    validRows: 4,
    errorRows: 3,
    mergedRows: 1,
    preparedCount: 3,
    addToExisting: false,
    fileTotals: [
      { currency: 'COP', rows: 4, amount: 201100.5 },
      { currency: 'USD', rows: 1, amount: 40 },
    ],
    validTotals: [
      { currency: 'COP', rows: 3, amount: 201000.5 },
      { currency: 'USD', rows: 1, amount: 40 },
    ],
    imported: [],
    progress: { processed: 0, created: 0, skipped: 0, ambiguous: 0, existing: 0 },
    undoneCount: null,
    undoneTotals: [],
    canUndo: false,
    ...overrides,
  };
}
