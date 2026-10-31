'use client';
import * as React from 'react';
import {
  type ColumnMapping,
  type DocType,
  type ImportFieldKey,
  type ImportInspect,
} from '@/lib/patient-imports/patient-imports-api';
import {
  DOC_TYPES,
  docTypeOptionLabel,
  type ClinicDocumentTypeNames,
} from '@/lib/patients/doc-type';

const copy = {
  legend: 'Columnas del archivo',
  hint: 'Elige qué columna de tu archivo va a cada dato de la ficha. Las marcadas con * son obligatorias.',
  field: 'Dato de Dentalix',
  column: 'Columna de tu archivo',
  sample: 'Ejemplo (primera fila)',
  none: '— No importar —',
  required: '*',
  noSample: 'Sin dato',
  defaultDocType: 'Tipo de documento cuando la celda va vacía',
  defaultDocTypeNone: '— Ninguno: la fila da error —',
};

export const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

interface ColumnMappingFieldsProps {
  inspect: ImportInspect;
  mapping: ColumnMapping;
  onMappingChange: (mapping: ColumnMapping) => void;
  defaultDocType: DocType | null;
  onDefaultDocTypeChange: (value: DocType | null) => void;
  /** Nombres locales de la clínica para las opciones (R17); `{}` = genéricos. */
  docTypeNames: ClinicDocumentTypeNames;
  disabled?: boolean;
}

/**
 * Mapeo de columnas (paso 2 de DX-107). Una fila por dato de la ficha con un
 * <select> nativo (etiquetado) de las cabeceras del archivo y el valor de la
 * primera fila para reconocerla. En escritorio es una rejilla de tres
 * columnas; bajo `sm` cada dato se apila (etiqueta, selector, ejemplo).
 */
export function ColumnMappingFields({
  inspect,
  mapping,
  onMappingChange,
  defaultDocType,
  onDefaultDocTypeChange,
  docTypeNames,
  disabled,
}: ColumnMappingFieldsProps) {
  const id = React.useId();
  const firstRow = inspect.sampleRows[0] ?? [];
  const sampleFor = (header: string | undefined) => {
    if (!header) return null;
    const index = inspect.headers.indexOf(header);
    const value = index >= 0 ? firstRow[index] : undefined;
    return value ? value : null;
  };

  return (
    // min-w-0: un <fieldset> tiene `min-inline-size: min-content` y el selector
    // más ancho lo sacaba 3 px del asistente a 390 px (QA D1).
    <fieldset className="flex min-w-0 flex-col gap-3" disabled={disabled}>
      <legend className="text-base font-semibold text-ink">{copy.legend}</legend>
      <p className="text-sm text-muted">{copy.hint}</p>
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div
          aria-hidden
          className="hidden grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-border bg-surface-2 px-4 py-2 text-xs font-medium text-muted sm:grid"
        >
          <span>{copy.field}</span>
          <span>{copy.column}</span>
          <span>{copy.sample}</span>
        </div>
        <ul className="divide-y divide-hairline">
          {inspect.fields.map((field) => {
            const key = field.key as ImportFieldKey;
            const selectId = `${id}-${field.key}`;
            const sampleId = `${selectId}-sample`;
            const sample = sampleFor(mapping[key]);
            return (
              <li
                key={field.key}
                className="flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[minmax(10rem,14rem)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4"
              >
                <label htmlFor={selectId} className="text-sm font-medium text-ink">
                  {field.label}
                  {field.required ? (
                    <span className="text-danger-text" aria-hidden>
                      {' '}
                      {copy.required}
                    </span>
                  ) : null}
                </label>
                <select
                  id={selectId}
                  aria-describedby={sampleId}
                  aria-required={field.required || undefined}
                  className={fieldClass}
                  value={mapping[key] ?? ''}
                  onChange={(e) => {
                    const next = { ...mapping };
                    if (e.target.value) next[key] = e.target.value;
                    else delete next[key];
                    onMappingChange(next);
                  }}
                >
                  <option value="">{copy.none}</option>
                  {inspect.headers
                    .filter((h) => h !== '')
                    .map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                </select>
                <p id={sampleId} className="min-w-0 truncate text-sm text-muted">
                  <span className="sm:hidden">{copy.sample}: </span>
                  {sample ?? copy.noSample}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="flex flex-col gap-1.5 sm:max-w-md">
        <label htmlFor={`${id}-default-doc`} className="text-sm font-medium text-ink">
          {copy.defaultDocType}
        </label>
        <select
          id={`${id}-default-doc`}
          className={fieldClass}
          value={defaultDocType ?? ''}
          onChange={(e) => onDefaultDocTypeChange((e.target.value || null) as DocType | null)}
        >
          <option value="">{copy.defaultDocTypeNone}</option>
          {DOC_TYPES.map((t) => (
            <option key={t} value={t}>
              {docTypeOptionLabel(t, docTypeNames)}
            </option>
          ))}
        </select>
      </div>
    </fieldset>
  );
}
