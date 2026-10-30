'use client';
import * as React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  listClinicalEntries,
  type ClinicalEntry,
  type ClinicalEntryAddendum,
} from '@/lib/patients/clinical-api';
import { ClinicalEntryAddendumModal } from '@/components/patients/clinical-entry-addendum-modal';
import { NewEvolutionModal } from '@/components/clinical-notes/new-evolution-modal';
import { appointmentLine } from '@/lib/clinical-notes/appointment-line';
import { useSedeClock } from '@/lib/locations/sede-clock';
import { listStaff, type StaffMember } from '@/lib/staff/staff-api';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';
import { AsyncSection } from '@/components/shared/async-section';
import { Button } from '@/components/ui/button';

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
  recordedBy: (author: string, when: string) => `${author} · ${when}`,
  recordedAt: (when: string) => when,
  newEntry: 'Nueva evolución',
  genericLoadError: 'No pudimos cargar las evoluciones.',
  tableLabel: 'Evoluciones del paciente',
  addAddendum: 'Añadir adenda',
  addAddendumFor: (entryDate: string) => `Añadir adenda a la evolución del ${entryDate}`,
  addendaLabel: (entryDate: string) => `Adendas de la evolución del ${entryDate}`,
  addendumHeading: 'Adenda',
  addendumReason: 'Motivo:',
  // DX-212: diagnósticos CIE-10 guardados con la evolución.
  diagnosesLabel: (entryDate: string) => `Diagnósticos de la evolución del ${entryDate}`,
  principal: 'Principal',
  related: 'Relacionado',
  tooth: (fdi: string) => `diente ${fdi}`,
};

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
 *
 * DX-170: «Nueva evolución» abre un modal con plantillas y preguntas; una
 * evolución ligada a una cita dice de qué visita es («Cita del dd/mm · Dra.
 * X»).
 */
export function ClinicalEntriesList({ token, patientId }: ClinicalEntriesListProps) {
  // DX-378: el día de la cita, en la zona y con el formato de la sede.
  const sede = useSedeClock(token);
  const clock = sede.status === 'ready' ? sede.clock : null;
  const [entries, setEntries] = useState<ClinicalEntry[]>([]);
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Modal «Nueva evolución»; `newKey` lo monta limpio en cada apertura.
  const [newOpen, setNewOpen] = useState(false);
  const [newKey, setNewKey] = useState(0);
  // Bumped by the retry action to re-run the load effect below.
  const [reloadKey, setReloadKey] = useState(0);
  // Evolución a la que se le está añadiendo una adenda (modal abierto).
  const [addendumFor, setAddendumFor] = useState<ClinicalEntry | null>(null);

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
        setLoadError(apiErrorMessage(err, copy.genericLoadError));
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
        /* fail soft — la fila muestra solo la fecha de registro */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const staffById = useMemo(
    () => new Map(staff.map((member) => [member.userId, member.fullName])),
    [staff],
  );

  /** «Dra. Ríos · 8 ago 2026 14:32», o solo la marca de tiempo si no hay autor. */
  function recordLine(authorId: string | null, createdAt: string): string {
    const when = formatDateTime(createdAt);
    const author = authorId ? staffById.get(authorId) : undefined;
    return author ? copy.recordedBy(author, when) : copy.recordedAt(when);
  }

  /** Añade la adenda recién creada al final (orden cronológico) de su evolución. */
  function handleAddendumCreated(addendum: ClinicalEntryAddendum) {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === addendum.clinicalEntryId
          ? { ...entry, addenda: [...entry.addenda, addendum] }
          : entry,
      ),
    );
  }

  /**
   * Adendas de una evolución, debajo del texto original (que nunca cambia),
   * cada una con su motivo, su autor y la fecha en que la grabó el servidor.
   */
  function renderAddenda(entry: ClinicalEntry) {
    if (entry.addenda.length === 0) return null;
    return (
      <ol
        aria-label={copy.addendaLabel(formatCivilDate(entry.entryDate))}
        className="mt-3 flex flex-col gap-2"
      >
        {entry.addenda.map((addendum) => (
          <li
            key={addendum.id}
            className="rounded-md border-l-2 border-primary bg-surface-2 px-3 py-2 text-sm"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-muted">
              {copy.addendumHeading}
            </p>
            <p className="mt-1 text-ink">{addendum.text}</p>
            <p className="mt-1 text-xs text-muted">
              {copy.addendumReason} {addendum.reason}
            </p>
            <p className="mt-1 text-xs text-muted">
              {recordLine(addendum.authorId, addendum.createdAt)}
            </p>
          </li>
        ))}
      </ol>
    );
  }

  function renderAddButton(entry: ClinicalEntry) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        aria-label={copy.addAddendumFor(formatCivilDate(entry.entryDate))}
        onClick={() => setAddendumFor(entry)}
      >
        {copy.addAddendum}
      </Button>
    );
  }

  /** La nueva va arriba: la lista llega por `entryDate` DESC. */
  function handleCreated(created: ClinicalEntry) {
    setEntries((prev) =>
      [created, ...prev].sort(
        (a, b) => new Date(b.entryDate).getTime() - new Date(a.entryDate).getTime(),
      ),
    );
  }

  /**
   * DX-212: diagnósticos CIE-10 con código y texto (el principal primero).
   * Inalterables como la evolución: no hay acción para cambiarlos.
   */
  function renderDiagnoses(entry: ClinicalEntry) {
    const diagnoses = entry.diagnoses ?? [];
    if (diagnoses.length === 0) return null;
    return (
      <ul
        aria-label={copy.diagnosesLabel(formatCivilDate(entry.entryDate))}
        className="mt-2 flex flex-col gap-1"
      >
        {diagnoses.map((d) => (
          <li key={d.id} className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="text-xs font-medium text-muted">
              {d.kind === 'PRINCIPAL' ? copy.principal : copy.related}
            </span>
            <span className="font-medium tabular-nums text-ink">{d.icd10Code}</span>
            <span className="text-ink">{d.labelEs}</span>
            {d.toothFdi ? (
              <span className="text-xs tabular-nums text-muted">{copy.tooth(d.toothFdi)}</span>
            ) : null}
          </li>
        ))}
      </ul>
    );
  }

  /** «Cita del 17/10 · Dra. Ríos» bajo la fecha, si la evolución tiene cita. */
  function renderAppointment(entry: ClinicalEntry) {
    if (!entry.appointment) return null;
    return (
      <p className="mt-1 text-xs tabular-nums text-muted">
        {appointmentLine(entry.appointment.start, entry.appointment.providerName, clock)}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex justify-end">
        <Button
          type="button"
          className="w-full sm:w-auto"
          onClick={() => {
            setNewKey((k) => k + 1);
            setNewOpen(true);
          }}
        >
          <Plus aria-hidden />
          {copy.newEntry}
        </Button>
      </div>

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
                <td className="px-4 py-3 align-top text-ink tabular-nums">
                  {formatCivilDate(entry.entryDate)}
                  {renderAppointment(entry)}
                </td>
                <td className="px-4 py-3 text-ink">{entry.reason ?? copy.reasonFallback}</td>
                <td className="whitespace-pre-line px-4 py-3 text-ink">
                  {entry.notes}
                  {renderDiagnoses(entry)}
                  {renderAddenda(entry)}
                </td>
                {/* Subordinado: es la procedencia del asiento, no su contenido. */}
                <td className="px-4 py-3 align-top text-muted">
                  <p>{recordLine(entry.performedById, entry.createdAt)}</p>
                  <div className="mt-2">{renderAddButton(entry)}</div>
                </td>
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
              {renderAppointment(entry)}
              <p className="mt-1 text-muted">{entry.reason ?? copy.reasonFallback}</p>
              <p className="mt-2 whitespace-pre-line break-words text-ink">{entry.notes}</p>
              {renderDiagnoses(entry)}
              {renderAddenda(entry)}
              <p className="mt-3 border-t border-hairline pt-2 text-xs text-muted">
                {recordLine(entry.performedById, entry.createdAt)}
              </p>
              <div className="mt-2 flex flex-col items-start gap-2">
                {renderAddButton(entry)}
              </div>
            </div>
          ))}
        </div>
      </AsyncSection>

      {addendumFor ? (
        <ClinicalEntryAddendumModal
          open
          onOpenChange={(open) => {
            if (!open) setAddendumFor(null);
          }}
          token={token}
          patientId={patientId}
          entryId={addendumFor.id}
          entryDateLabel={formatCivilDate(addendumFor.entryDate)}
          onCreated={handleAddendumCreated}
        />
      ) : null}

      <NewEvolutionModal
        key={newKey}
        open={newOpen}
        onOpenChange={setNewOpen}
        token={token}
        patientId={patientId}
        onCreated={handleCreated}
      />
    </div>
  );
}
