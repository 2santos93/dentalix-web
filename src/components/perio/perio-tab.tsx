'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Activity, Plus } from 'lucide-react';
import {
  PERIO_STATUS_LABELS,
  listPerioExams,
  type PerioExamDetail,
  type PerioExamSummary,
  perioErrorMessage,
} from '@/lib/perio/perio-api';
import { formatCivilDate } from '@/lib/format/date';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { perioPercent } from '@/lib/perio/perio-percent';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { AsyncSection } from '@/components/shared/async-section';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { NewPerioExamModal } from './new-perio-exam-modal';
import { PerioExamEditor } from './perio-exam-editor';

const copy = {
  heading: 'Periodontograma',
  support:
    'Sondaje, sangrado, placa, recesión y NIC por sitio. Cada examen queda en el histórico para seguir la evolución.',
  newExam: 'Nuevo examen',
  empty: 'Este paciente no tiene exámenes periodontales.',
  emptyHint: 'Crea el primero para registrar el sondaje de los seis sitios de cada diente.',
  loadError: 'No pudimos cargar los exámenes periodontales.',
  loading: 'Cargando exámenes periodontales',
  tableLabel: 'Histórico de exámenes periodontales',
  colDate: 'Fecha',
  colProvider: 'Profesional',
  colStatus: 'Estado',
  colBop: 'Sangrado',
  colPlaque: 'Placa',
  colDeep: 'Sitios ≥4 / ≥6 mm',
  open: (date: string) => `Abrir examen del ${date}`,
  openShort: 'Abrir',
  deep: (d4: number, d6: number) => `${d4} / ${d6}`,
};

function ListSkeleton() {
  return (
    <div role="status" aria-label={copy.loading} className="flex flex-col gap-3">
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
      <Skeleton className="h-11 w-full" />
    </div>
  );
}

interface PerioTabProps {
  token: string;
  patientId: string;
}

/**
 * Pestaña «Periodontograma» de la ficha (DX-007): histórico de exámenes con
 * sus índices y, al abrir uno, el editor de la rejilla. El examen anterior
 * (el siguiente en la lista, que va de más reciente a más antiguo) se ofrece
 * para comparar.
 */
export function PerioTab({ token, patientId }: PerioTabProps) {
  const [exams, setExams] = useState<PerioExamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [openExamId, setOpenExamId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalKey, setModalKey] = useState(0);
  // G1-B: los porcentajes van con el formato de la sede de la pantalla; sin él, «—» y el aviso.
  const sedeFormat = useSedeFormat(token);
  const fmt = readyFormat(sedeFormat);
  const pct = (value: number) => perioPercent(value, fmt);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await listPerioExams(token, patientId);
        if (cancelled) return;
        setExams(data);
        setError(null);
      } catch (err) {
        if (cancelled) return;
        setError(perioErrorMessage(err, copy.loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, patientId, reloadKey]);

  function handleCreated(exam: PerioExamDetail) {
    setReloadKey((k) => k + 1);
    setOpenExamId(exam.id);
  }

  if (openExamId) {
    const index = exams.findIndex((e) => e.id === openExamId);
    // Se compara con el FINAL anterior (más antiguo): un borrador intermedio
    // no es una referencia clínica. Recién creado y aún no recargado (-1): el
    // primer FINAL de la lista.
    const previous = exams.slice(index + 1).find((e) => e.status === 'FINAL') ?? null;
    return (
      <PerioExamEditor
        key={openExamId}
        token={token}
        patientId={patientId}
        examId={openExamId}
        previous={previous ? { id: previous.id, examDate: previous.examDate } : null}
        sedeFormat={sedeFormat}
        onBack={() => setOpenExamId(null)}
        onChanged={() => setReloadKey((k) => k + 1)}
        onDeleted={() => {
          setOpenExamId(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  }

  function statusBadge(exam: PerioExamSummary) {
    return (
      <Badge variant={exam.status === 'FINAL' ? 'success' : 'warning'}>
        {PERIO_STATUS_LABELS[exam.status]}
      </Badge>
    );
  }

  function openButton(exam: PerioExamSummary) {
    return (
      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() => setOpenExamId(exam.id)}
        aria-label={copy.open(formatCivilDate(exam.examDate))}
        className="w-full sm:w-auto"
      >
        {copy.openShort}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-ink">{copy.heading}</h2>
          <p className="max-w-[68ch] text-sm text-muted">{copy.support}</p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setModalKey((k) => k + 1);
            setModalOpen(true);
          }}
          className="w-full sm:w-auto"
        >
          <Plus aria-hidden />
          {copy.newExam}
        </Button>
      </div>

      {sedeFormat.status === 'error' ? (
        <SedeConfigError kind="locale" variant="note" onRetry={sedeFormat.retry} description={sedeFormat.message} />
      ) : null}

      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => setReloadKey((k) => k + 1)}
        isEmpty={exams.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<Activity aria-hidden />}
        skeleton={<ListSkeleton />}
      >
        <table
          aria-label={copy.tableLabel}
          className="hidden w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink md:table"
        >
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left">
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colDate}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colProvider}
              </th>
              <th scope="col" className="px-4 py-3 font-medium text-muted">
                {copy.colStatus}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                {copy.colBop}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                {copy.colPlaque}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium text-muted">
                {copy.colDeep}
              </th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">{copy.openShort}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {exams.map((exam) => (
              <tr key={exam.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3 tabular-nums">{formatCivilDate(exam.examDate)}</td>
                <td className="px-4 py-3">{exam.providerName}</td>
                <td className="px-4 py-3">{statusBadge(exam)}</td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {pct(exam.indices.bopPercent)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {pct(exam.indices.plaquePercent)}
                </td>
                <td className="px-4 py-3 text-right tabular-nums">
                  {copy.deep(exam.indices.sites4mmOrMore, exam.indices.sites6mmOrMore)}
                </td>
                <td className="px-4 py-3 text-right">{openButton(exam)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul aria-label={copy.tableLabel} className="flex flex-col gap-3 md:hidden">
          {exams.map((exam) => (
            <li
              key={exam.id}
              className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm text-ink"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium tabular-nums">{formatCivilDate(exam.examDate)}</p>
                {statusBadge(exam)}
              </div>
              <p className="text-muted">{exam.providerName}</p>
              <p className="tabular-nums">
                {copy.colBop}: {pct(exam.indices.bopPercent)} · {copy.colPlaque}:{' '}
                {pct(exam.indices.plaquePercent)} · {copy.colDeep}:{' '}
                {copy.deep(exam.indices.sites4mmOrMore, exam.indices.sites6mmOrMore)}
              </p>
              {openButton(exam)}
            </li>
          ))}
        </ul>
      </AsyncSection>

      <NewPerioExamModal
        key={modalKey}
        open={modalOpen}
        onOpenChange={setModalOpen}
        token={token}
        patientId={patientId}
        hasPrevious={exams.length > 0}
        onCreated={handleCreated}
      />
    </div>
  );
}
