'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  listClinicalEntries,
  createClinicalEntry,
  type ClinicalEntry,
  type CreateClinicalEntryInput,
} from '@/lib/patients/clinical-api';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Cargando evoluciones…',
  empty: 'No hay evoluciones registradas todavía.',
  colDate: 'Fecha',
  colReason: 'Motivo',
  colNotes: 'Notas',
  reasonFallback: '—',
  formTitle: 'Agregar evolución',
  entryDateLabel: 'Fecha',
  reasonLabel: 'Motivo',
  notesLabel: 'Notas',
  submit: 'Agregar evolución',
  submitting: 'Guardando…',
  genericLoadError: 'No pudimos cargar las evoluciones. Intenta de nuevo.',
  genericCreateError: 'No pudimos agregar la evolución. Intenta de nuevo.',
};

interface ClinicalEntriesListProps {
  token: string;
  patientId: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es');
}

export function ClinicalEntriesList({ token, patientId }: ClinicalEntriesListProps) {
  const [entries, setEntries] = useState<ClinicalEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [entryDate, setEntryDate] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

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
  }, [token, patientId]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setCreateError(null);
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
      {loading ? (
        <p role="status" className="text-sm text-muted">
          {copy.loading}
        </p>
      ) : loadError ? (
        <p role="alert" className="text-sm text-danger">
          {loadError}
        </p>
      ) : entries.length === 0 ? (
        <p role="status" className="text-sm text-muted">
          {copy.empty}
        </p>
      ) : (
        <>
          {/* Desktop table */}
          <table className="hidden md:block w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink">
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="px-4 py-3 font-medium text-muted">
                  {copy.colDate}
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-muted">
                  {copy.colReason}
                </th>
                <th scope="col" className="px-4 py-3 font-medium text-muted">
                  {copy.colNotes}
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-ink">{formatDate(entry.entryDate)}</td>
                  <td className="px-4 py-3 text-ink">{entry.reason ?? copy.reasonFallback}</td>
                  <td className="px-4 py-3 text-ink">{entry.notes}</td>
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
                <p className="font-medium text-ink">{formatDate(entry.entryDate)}</p>
                <p className="mt-1 text-muted">{entry.reason ?? copy.reasonFallback}</p>
                <p className="mt-2 text-ink">{entry.notes}</p>
              </div>
            ))}
          </div>
        </>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <h3 className="text-base font-semibold text-ink">{copy.formTitle}</h3>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <label htmlFor="ce-entry-date" className="text-sm font-medium text-ink">
              {copy.entryDateLabel}
            </label>
            <input
              id="ce-entry-date"
              name="entryDate"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="ce-reason" className="text-sm font-medium text-ink">
              {copy.reasonLabel}
            </label>
            <input
              id="ce-reason"
              name="reason"
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="ce-notes" className="text-sm font-medium text-ink">
            {copy.notesLabel}
          </label>
          <textarea
            id="ce-notes"
            name="notes"
            rows={3}
            required
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          />
        </div>

        {createError && (
          <p role="alert" className="text-sm text-danger">
            {createError}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="self-start rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
        >
          {submitting ? copy.submitting : copy.submit}
        </button>
      </form>
    </div>
  );
}
