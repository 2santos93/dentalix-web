'use client';
import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ISSUE_KIND_LABELS, type ImportIssue } from '@/lib/patient-imports/patient-imports-api';

const copy = {
  label: 'Errores y duplicados por fila',
  row: 'Fila',
  column: 'Columna',
  kind: 'Tipo',
  reason: 'Motivo',
  value: 'Valor',
  none: '—',
  more: (shown: number, total: number) =>
    `Se muestran ${shown} de ${total}. El informe descargable los trae todos.`,
};

const KIND_VARIANT: Record<ImportIssue['kind'], 'danger' | 'warning' | 'muted'> = {
  ERROR: 'danger',
  DUPLICATE_FILE: 'warning',
  DUPLICATE_EXISTING: 'muted',
  MERGED: 'muted',
};

/**
 * Problemas por fila del dry-run (DX-107): fila, columna del archivo, tipo,
 * motivo en español y el valor. Bajo `sm` cada fila es una tarjeta (Table).
 */
export function ImportIssuesTable({
  issues,
  total,
  label = copy.label,
}: {
  issues: ImportIssue[];
  total: number;
  /** Nombre accesible de la tabla (la hoja de saldos lleva el suyo, DX-262). */
  label?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <Table aria-label={label}>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16 text-right">{copy.row}</TableHead>
              <TableHead>{copy.column}</TableHead>
              <TableHead>{copy.kind}</TableHead>
              <TableHead>{copy.reason}</TableHead>
              <TableHead>{copy.value}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {issues.map((issue, i) => (
              <TableRow key={`${issue.row}-${issue.column ?? ''}-${i}`}>
                <TableCell data-label={copy.row} className="tabular-nums sm:text-right">
                  {issue.row}
                </TableCell>
                <TableCell data-label={copy.column} className="break-words">
                  {issue.column ?? copy.none}
                </TableCell>
                <TableCell data-label={copy.kind}>
                  <Badge variant={KIND_VARIANT[issue.kind]}>{ISSUE_KIND_LABELS[issue.kind]}</Badge>
                </TableCell>
                <TableCell data-label={copy.reason} className="min-w-0 break-words">
                  {issue.message}
                </TableCell>
                <TableCell data-label={copy.value} className="break-all text-muted">
                  {issue.value ?? copy.none}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {total > issues.length ? (
        <p className="text-sm text-muted">{copy.more(issues.length, total)}</p>
      ) : null}
    </div>
  );
}
