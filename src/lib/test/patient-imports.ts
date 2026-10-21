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
