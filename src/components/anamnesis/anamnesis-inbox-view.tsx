'use client';
import { useEffect, useState } from 'react';
import { ChevronRight, ClipboardCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listAnamnesisInbox, type AnamnesisSubmission } from '@/lib/anamnesis/anamnesis-api';
import { formatDateTime } from '@/lib/format/date';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { PageHeader } from '@/components/shared/page-header';
import { DataList, type DataListColumn } from '@/components/ui/data-list';

const copy = {
  title: 'Anamnesis por revisar',
  description:
    'Cuestionarios de salud que los pacientes enviaron por enlace. La historia clínica no cambia hasta que un odontólogo los acepta.',
  loadError: 'No pudimos cargar las anamnesis por revisar.',
  empty: 'No hay anamnesis por revisar',
  emptyHint: 'Cuando un paciente envíe su cuestionario por el enlace, aparecerá aquí.',
  tableLabel: 'Anamnesis enviadas por los pacientes, las más antiguas primero',
  colPatient: 'Paciente',
  colSubmitted: 'Enviada',
  colAppointment: 'Cita',
  colLocation: 'Sede',
  noAppointment: 'Sin cita',
  review: 'Revisar',
  // La fila entera abre la revisión; el enlace se nombra con la acción.
  reviewPrefix: 'Revisar la anamnesis de ',
  count: (n: number) => `${n} ${n === 1 ? 'cuestionario' : 'cuestionarios'} · los más antiguos primero`,
};

const columns: DataListColumn<AnamnesisSubmission>[] = [
  {
    id: 'patient',
    header: copy.colPatient,
    mobile: 'primary',
    cell: (row) => (
      <>
        <span className="sr-only">{copy.reviewPrefix}</span>
        {row.patient.fullName}
      </>
    ),
  },
  {
    id: 'submitted',
    header: copy.colSubmitted,
    mobile: 'trailing',
    cellClassName: 'tabular-nums',
    cell: (row) => formatDateTime(row.submittedAt),
  },
  {
    id: 'appointment',
    header: copy.colAppointment,
    cellClassName: 'tabular-nums',
    cell: (row) =>
      row.appointment ? formatDateTime(row.appointment.start) : <span className="text-muted">{copy.noAppointment}</span>,
    mobileCell: (row) => (row.appointment ? formatDateTime(row.appointment.start) : null),
  },
  { id: 'location', header: copy.colLocation, cell: (row) => row.location.name },
  {
    id: 'review',
    header: <span className="sr-only">{copy.review}</span>,
    mobile: 'hidden',
    align: 'end',
    // Pista visual de que la fila abre la revisión (el enlace es la fila).
    cell: () => (
      <span aria-hidden className="inline-flex items-center gap-0.5 text-sm font-medium text-primary-text">
        {copy.review}
        <ChevronRight className="size-4" />
      </span>
    ),
  },
];

/**
 * Bandeja «Anamnesis por revisar» (DX-099): lo que los pacientes enviaron por
 * enlace, en las sedes del alcance de la sesión (la API filtra), las más
 * antiguas primero. Estados de carga, vacío y error con «Reintentar».
 */
export function AnamnesisInboxView({ token }: { token: string }) {
  const [rows, setRows] = useState<AnamnesisSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    listAnamnesisInbox(token, 'SUBMITTED')
      .then((data) => {
        if (cancelled) return;
        setRows(data);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // El 403 de la API ya viene en español («solo las ven…»).
        setError(apiErrorMessage(err, copy.loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  return (
    <div className="flex flex-col">
      <PageHeader title={copy.title} description={copy.description} />
      <AsyncSection
        loading={loading}
        error={error}
        onRetry={() => {
          setLoading(true);
          setReloadKey((k) => k + 1);
        }}
        isEmpty={rows.length === 0}
        emptyTitle={copy.empty}
        emptyDescription={copy.emptyHint}
        emptyIcon={<ClipboardCheck aria-hidden />}
        skeleton={<TableSkeleton rows={3} />}
      >
        <div className="flex flex-col gap-3">
          <p className="t-caption text-muted tnum">{copy.count(rows.length)}</p>
          <DataList
            label={copy.tableLabel}
            rows={rows}
            columns={columns}
            getRowKey={(row) => row.id}
            getRowHref={(row) => `/anamnesis-por-revisar/${row.id}`}
          />
        </div>
      </AsyncSection>
    </div>
  );
}
