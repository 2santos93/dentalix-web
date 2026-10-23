'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ClipboardCheck } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listAnamnesisInbox, type AnamnesisSubmission } from '@/lib/anamnesis/anamnesis-api';
import { formatDateTime } from '@/lib/format/date';
import { AsyncSection, TableSkeleton } from '@/components/shared/async-section';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

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
  colActions: 'Acciones',
  noAppointment: 'Sin cita',
  review: 'Revisar',
  reviewLabel: (name: string) => `Revisar la anamnesis de ${name}`,
};

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
        <Table aria-label={copy.tableLabel}>
          <TableHeader>
            <TableRow>
              <TableHead>{copy.colPatient}</TableHead>
              <TableHead>{copy.colSubmitted}</TableHead>
              <TableHead>{copy.colAppointment}</TableHead>
              <TableHead>{copy.colLocation}</TableHead>
              <TableHead className="text-right">{copy.colActions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={row.id} data-testid="anamnesis-inbox-row">
                <TableCell data-label={copy.colPatient} className="font-medium text-ink">
                  <Link
                    href={`/patients/${row.patient.id}`}
                    className="underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    {row.patient.fullName}
                  </Link>
                </TableCell>
                <TableCell data-label={copy.colSubmitted} className="tabular-nums">
                  {formatDateTime(row.submittedAt)}
                </TableCell>
                <TableCell data-label={copy.colAppointment} className="tabular-nums">
                  {row.appointment ? formatDateTime(row.appointment.start) : copy.noAppointment}
                </TableCell>
                <TableCell data-label={copy.colLocation}>{row.location.name}</TableCell>
                <TableCell data-label={copy.colActions} className="sm:text-right">
                  <Button asChild size="sm" className="min-h-11 sm:min-h-9">
                    <Link
                      href={`/anamnesis-por-revisar/${row.id}`}
                      aria-label={copy.reviewLabel(row.patient.fullName)}
                    >
                      {copy.review}
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </AsyncSection>
    </div>
  );
}
