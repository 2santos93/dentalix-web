'use client';
import * as React from 'react';
import type {
  BankStatementInspect,
  BankStatementMapping,
  DateOrder,
  DecimalSeparator,
} from '@/lib/bank-reconciliation/bank-reconciliation-api';
import { NativeSelect } from '@/components/ui/native-select';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';

export const statementMappingCopy = {
  legend: 'Columnas del extracto',
  hint: 'Elige qué columna del extracto va a cada dato. Las marcadas con * son obligatorias.',
  field: 'Dato',
  column: 'Columna del extracto',
  sample: 'Ejemplo (primera fila)',
  none: '— No usar —',
  noSample: 'Sin dato',
  date: 'Fecha',
  reference: 'Referencia',
  amount: 'Importe con signo',
  credit: 'Créditos (entradas)',
  debit: 'Débitos (salidas)',
  description: 'Descripción',
  amountMode: '¿Cómo trae el importe el extracto?',
  signed: 'Una columna con signo (las entradas en positivo)',
  split: 'Dos columnas: créditos y débitos',
  dateOrder: 'Orden de la fecha',
  dateOrders: {
    DMY: 'Día, mes y año (15/10/2026)',
    MDY: 'Mes, día y año (10/15/2026)',
    YMD: 'Año, mes y día (2026-10-15)',
  } satisfies Record<DateOrder, string>,
  decimalSeparator: 'Separador de los decimales',
  decimalSeparators: {
    ',': 'Coma (4.500,00)',
    '.': 'Punto (4,500.00)',
  } satisfies Record<DecimalSeparator, string>,
};
const copy = statementMappingCopy;

type ColumnKey = 'date' | 'reference' | 'amount' | 'credit' | 'debit' | 'description';
export type AmountMode = 'signed' | 'split';

/** El modo del importe que trae un mapeo (el sugerido o el guardado). */
export function amountModeOf(mapping: BankStatementMapping): AmountMode {
  return mapping.credit && !mapping.amount ? 'split' : 'signed';
}

interface StatementMappingFieldsProps {
  inspect: BankStatementInspect;
  mapping: BankStatementMapping;
  onMappingChange: (mapping: BankStatementMapping) => void;
  disabled?: boolean;
}

/**
 * DX-571: el mapeo de columnas del extracto del banco, con la misma rejilla
 * que la importación de pacientes (dato · columna · ejemplo de la primera
 * fila; apilado bajo `sm`): fecha, referencia, importe con signo O créditos
 * (y débitos), descripción, más el orden de la fecha y el separador decimal.
 */
export function StatementMappingFields({ inspect, mapping, onMappingChange, disabled }: StatementMappingFieldsProps) {
  const id = React.useId();
  // El modo es de la pantalla: «dos columnas» sin elegir aún la de créditos sigue siendo ese modo.
  const [mode, setMode] = React.useState<AmountMode>(() => amountModeOf(mapping));
  const firstRow = inspect.sampleRows[0] ?? [];
  const sampleFor = (header: string | undefined) => {
    if (!header) return null;
    const index = inspect.headers.indexOf(header);
    const value = index >= 0 ? firstRow[index] : undefined;
    return value ? value : null;
  };
  const rows: { key: ColumnKey; label: string; required: boolean }[] = [
    { key: 'date', label: copy.date, required: true },
    { key: 'reference', label: copy.reference, required: true },
    ...(mode === 'signed'
      ? [{ key: 'amount' as const, label: copy.amount, required: true }]
      : [
          { key: 'credit' as const, label: copy.credit, required: true },
          { key: 'debit' as const, label: copy.debit, required: false },
        ]),
    { key: 'description', label: copy.description, required: false },
  ];

  function setColumn(key: ColumnKey, header: string) {
    const next = { ...mapping };
    if (header) next[key] = header;
    else delete next[key];
    onMappingChange(next);
  }

  return (
    <fieldset className="flex min-w-0 flex-col gap-4" disabled={disabled}>
      <legend className="t-title text-ink">{copy.legend}</legend>
      <p className="text-sm text-muted">{copy.hint}</p>
      <RadioGroup
        id={`${id}-mode`}
        legend={copy.amountMode}
        value={mode}
        onValueChange={(v) => {
          if (v === mode) return;
          // Al cambiar de modo se sueltan las columnas del importe: no se mezclan.
          setMode(v as AmountMode);
          const rest = { ...mapping };
          delete rest.amount;
          delete rest.credit;
          delete rest.debit;
          onMappingChange(rest);
        }}
      >
        <RadioOption id={`${id}-mode`} value="signed" label={copy.signed} />
        <RadioOption value="split" label={copy.split} />
      </RadioGroup>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <div
          aria-hidden
          className="hidden grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)_minmax(0,1fr)] gap-4 border-b border-border bg-surface-sunken px-4 py-2 t-label text-muted sm:grid"
        >
          <span>{copy.field}</span>
          <span>{copy.column}</span>
          <span>{copy.sample}</span>
        </div>
        <ul className="divide-y divide-border-subtle">
          {rows.map((row) => {
            const selectId = `${id}-${row.key}`;
            const sampleId = `${selectId}-sample`;
            const sample = sampleFor(mapping[row.key] || undefined);
            return (
              <li
                key={row.key}
                className="flex flex-col gap-2 px-4 py-3 sm:grid sm:grid-cols-[minmax(9rem,12rem)_minmax(0,1fr)_minmax(0,1fr)] sm:items-center sm:gap-4"
              >
                <label htmlFor={selectId} className="text-sm font-medium text-ink">
                  {row.label}
                  {row.required ? (
                    <span className="text-danger-text" aria-hidden>
                      {' '}
                      *
                    </span>
                  ) : null}
                </label>
                <NativeSelect
                  id={selectId}
                  aria-describedby={sampleId}
                  aria-required={row.required || undefined}
                  value={mapping[row.key] ?? ''}
                  onChange={(e) => setColumn(row.key, e.target.value)}
                >
                  <option value="">{copy.none}</option>
                  {inspect.headers
                    .filter((h) => h !== '')
                    .map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                </NativeSelect>
                <p id={sampleId} className="min-w-0 truncate text-sm text-muted">
                  <span className="sm:hidden">{copy.sample}: </span>
                  {sample ?? copy.noSample}
                </p>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-date-order`} className="t-label text-ink">
            {copy.dateOrder}
          </label>
          <NativeSelect
            id={`${id}-date-order`}
            value={mapping.dateOrder}
            onChange={(e) => onMappingChange({ ...mapping, dateOrder: e.target.value as DateOrder })}
          >
            {(Object.keys(copy.dateOrders) as DateOrder[]).map((order) => (
              <option key={order} value={order}>
                {copy.dateOrders[order]}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <label htmlFor={`${id}-decimal`} className="t-label text-ink">
            {copy.decimalSeparator}
          </label>
          <NativeSelect
            id={`${id}-decimal`}
            value={mapping.decimalSeparator}
            onChange={(e) => onMappingChange({ ...mapping, decimalSeparator: e.target.value as DecimalSeparator })}
          >
            {(Object.keys(copy.decimalSeparators) as DecimalSeparator[]).map((sep) => (
              <option key={sep} value={sep}>
                {copy.decimalSeparators[sep]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
    </fieldset>
  );
}
