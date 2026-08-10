'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  listClinicalEntries,
  createClinicalEntry,
  type ClinicalEntry,
  type CreateClinicalEntryInput,
} from '@/lib/patients/clinical-api';
import { listStaff, type StaffMember } from '@/lib/staff/staff-api';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';
import { AsyncSection } from '@/components/shared/async-section';
import { FormField } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  empty: 'No hay evoluciones registradas todavía.',
  emptyHint: 'La primera evolución que agregues aparecerá aquí, con su autor y su fecha de registro.',
  // «Fecha de atención» y no «Fecha»: la columna de al lado también es una
  // fecha, y son cosas distintas — una la escribe el usuario, la otra la pone
  // el servidor. Nombrarlas igual era lo que hacía ambiguo el documento.
  colEntryDate: 'Fecha de atención',
  colReason: 'Motivo',
  colNotes: 'Notas',
  colRecord: 'Registro',
  reasonFallback: '—',
  unknownAuthor: 'Autor no registrado',
  recordedBy: (author: string, when: string) => `${author} · ${when}`,
  recordedAt: (when: string) => when,
  formTitle: 'Agregar evolución',
  entryDateLabel: 'Fecha de atención',
  entryDateHint: 'Si la dejas vacía se usa hoy. No puede ser una fecha futura.',
  reasonLabel: 'Motivo',
  notesLabel: 'Notas',
  submit: 'Agregar evolución',
  submitting: 'Guardando…',
  futureDateError: 'La fecha de atención no puede ser futura.',
  genericLoadError: 'No pudimos cargar las evoluciones.',
  genericCreateError: 'No pudimos agregar la evolución. Intenta de nuevo.',
  tableLabel: 'Evoluciones del paciente',
};

/** Hoy en formato `yyyy-mm-dd`, para topar el `<input type="date">`. */
function todayISO(): string {
  const now = new Date();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

interface ClinicalEntriesListProps {
  token: string;
  patientId: string;
}

/**
 * Evoluciones del paciente: documento médico-legal, append-only.
 *
 * Cada fila declara DOS cosas que antes se confundían en una sola columna
 * «Fecha»: la **fecha de atención** (`entryDate`, la escribe el usuario y puede
 * ser retroactiva) y el **registro** (`createdAt` + `performedById`, los pone el
 * servidor y no se pueden editar). Un revisor busca lo segundo — quién escribió
 * esto y cuándo quedó grabado — y hasta ahora la pantalla solo mostraba lo
 * primero, que es el dato que el propio autor eligió.
 *
 * El nombre del autor se resuelve contra el personal de la clínica; si esa
 * lista falla, la fila sigue mostrando su marca de tiempo (fail soft: nunca se
 * oculta el registro por no poder nombrar a quien lo hizo).
 */
export function ClinicalEntriesList({ token, patientId }: ClinicalEntriesListProps) {
  const [entries, setEntries] = useState<ClinicalEntry[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Bumped by the retry action to re-run the load effect below.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listClinicalEntries(token, patientId);
        if (cancelled) return;
        setEntries(data);
        setLoadError(null);
      } catch (err) {
        if (cancelled) return;
        setLoadError(err instanceof ApiError ? err.message : copy.genericLoadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  useEffect(() => {
    let cancelled = false;
    // Fail soft y en su propio efecto: sin la lista de personal las
    // evoluciones se siguen mostrando, solo que sin nombre de autor. No debe
    // poder tumbar el documento.
    listStaff(token)
      .then((data) => {
        if (!cancelled) setStaff(data ?? []);
      })
      .catch(() => {
        /* fail soft — la fila cae a «Autor no registrado» */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const staffById = useMemo(
    () => new Map(staff.map((member) => [member.userId, member.fullName])),
    [staff],
  );

  function authorName(entry: ClinicalEntry): string {
    if (!entry.performedById) return copy.unknownAuthor;
    return staffById.get(entry.performedById) ?? copy.unknownAuthor;
  }

  /** «Dra. Ríos · 8 ago 2026 14:32», o solo la marca de tiempo si no hay autor. */
  function recordLine(entry: ClinicalEntry): string {
    const when = formatDateTime(entry.createdAt);
    const author = authorName(entry);
    return author === copy.unknownAuthor
      ? copy.recordedAt(when)
      : copy.recordedBy(author, when);
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
    setValidationError(null);

    // Una atención no puede haber ocurrido mañana. El `max` del input lo
    // bloquea en el navegador; esto cubre el teclado y el pegado.
    if (entryDate && entryDate > todayISO()) {
      setValidationError(copy.futureDateError);
      return;
    }

    setSubmitting(true);
    try {
      const input: CreateClinicalEntryInput = {
        notes: notes.trim(),
        ...(entryDate ? { entryDate: new Date(entryDate).toISOString() } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      };
      const created = await createClinicalEntry(token, patientId, input);
      // Entries are returned DESC by `entryDate` — prepend so the newest
      // stays on top without re-sorting the whole list.
      setEntries((prev) => [created, ...prev]);
      setEntryDate('');
      setReason('');
      setNotes('');
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : copy.genericCreateError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <AsyncSection
        loading={loading}
        error={loadError}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={entries.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
      >
        {/* Desktop table. `md:table` y no `md:block`: `display:block` sobre una
            `<table>` descarta la maquetación de tabla en el motor de layout
            aunque los roles sobrevivan. */}
        <table
          aria-label={copy.tableLabel}
          className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink md:table"
        >
          <thead>
            <tr className="border-b border-border text-left">
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colEntryDate}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colReason}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colNotes}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colRecord}
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-ink tabular-nums">
                  {formatCivilDate(entry.entryDate)}
                </td>
                <td className="px-4 py-3 text-ink">{entry.reason ?? copy.reasonFallback}</td>
                <td className="px-4 py-3 text-ink">{entry.notes}</td>
                {/* Subordinado: es la procedencia del asiento, no su contenido. */}
                <td className="px-4 py-3 text-muted">{recordLine(entry)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Mobile cards */}
        <div className="flex flex-col gap-3 md:hidden">
          {entries.map((entry) => (
            <div
              key={entry.id}
              className="rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <p className="font-medium tabular-nums text-ink">
                {formatCivilDate(entry.entryDate)}
              </p>
              <p className="mt-1 text-muted">{entry.reason ?? copy.reasonFallback}</p>
              <p className="mt-2 text-ink">{entry.notes}</p>
              <p className="mt-3 border-t border-hairline pt-2 text-xs text-muted">
                {recordLine(entry)}
              </p>
            </div>
          ))}
        </div>
      </AsyncSection>

      <form onSubmit={handleSubmit} aria-label={copy.formTitle} className="flex flex-col gap-4">
        <h3 className="text-base font-semibold text-ink">{copy.formTitle}</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            htmlFor="ce-entry-date"
            label={copy.entryDateLabel}
            hint={copy.entryDateHint}
            error={validationError}
          >
            <Input
              id="ce-entry-date"
              name="entryDate"
              type="date"
              max={todayISO()}
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
            />
          </FormField>
          <FormField htmlFor="ce-reason" label={copy.reasonLabel}>
            <Input
              id="ce-reason"
              name="reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>
        </div>

        <FormField htmlFor="ce-notes" label={copy.notesLabel}>
          <textarea
            id="ce-notes"
            name="notes"
            rows={3}
            required
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className={cn(fieldClass, 'h-auto')}
          />
        </FormField>

        {createError && <InlineError>{createError}</InlineError>}

        <Button type="submit" disabled={submitting} className="self-start">
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </form>
    </div>
  );
}
