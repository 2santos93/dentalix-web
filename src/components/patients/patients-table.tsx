import Link from 'next/link';
import type { Patient } from '@/lib/patients/patients-api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { initials } from '@/lib/format/initials';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Cargando pacientes…',
  empty: 'No hay pacientes registrados todavía.',
  emptyHint: 'Crea el primer paciente para empezar a gestionar su historia.',
  noMatches: 'Ningún paciente coincide con la búsqueda.',
  noMatchesHint: 'Revisa el nombre o el número de documento.',
  noPayerMatches: 'Ningún paciente tiene cobertura con ese pagador.',
  noPayerMatchesHint: 'Elige «Todos los pagadores» para ver el listado completo.',
  colName: 'Nombre',
  colDoc: 'Documento',
  colPhone: 'Teléfono',
  colEmail: 'Correo electrónico',
  docFallback: '—',
};

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}

interface PatientsTableProps {
  patients: Patient[];
  loading: boolean;
  /** Hay una búsqueda activa: cambia qué significa una lista vacía. */
  filtered?: boolean;
  /**
   * El único filtro activo es el de pagador (sin búsqueda): el vacío no habla
   * de nombre o documento, que la persona no escribió. Con búsqueda manda
   * `filtered`.
   */
  payerOnly?: boolean;
}

export function PatientsTable({
  patients,
  loading,
  filtered = false,
  payerOnly = false,
}: PatientsTableProps) {
  if (loading) {
    return (
      <Card className="overflow-hidden p-2">
        <span role="status" className="sr-only">
          {copy.loading}
        </span>
        <div className="flex flex-col gap-2 p-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (patients.length === 0) {
    // "Todavía no hay pacientes" y "la búsqueda no encuentra ninguno" son
    // cosas distintas: la primera invita a crear el primero, la segunda diría
    // una falsedad si repitiera esa invitación.
    return (
      <EmptyState
        role="status"
        title={payerOnly ? copy.noPayerMatches : filtered ? copy.noMatches : copy.empty}
        description={
          payerOnly ? copy.noPayerMatchesHint : filtered ? copy.noMatchesHint : copy.emptyHint
        }
      />
    );
  }

  return (
    <>
      {/* Desktop table */}
      <Card className="hidden overflow-hidden p-0 md:block">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>{copy.colName}</TableHead>
              <TableHead>{copy.colDoc}</TableHead>
              <TableHead>{copy.colPhone}</TableHead>
              <TableHead>{copy.colEmail}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {patients.map((patient) => (
              <TableRow key={patient.id}>
                <TableCell data-label={copy.colName}>
                  <Link
                    href={`/patients/${patient.id}`}
                    className="flex items-center gap-3 font-medium text-ink hover:text-primary"
                  >
                    <Avatar size="sm" initials={initials(patient.firstName, patient.lastName)} />
                    {fullName(patient)}
                  </Link>
                </TableCell>
                <TableCell className="text-muted" data-label={copy.colDoc}>
                  {patient.docNumber ?? copy.docFallback}
                </TableCell>
                <TableCell className="text-muted" data-label={copy.colPhone}>
                  {patient.phone ?? copy.docFallback}
                </TableCell>
                <TableCell className="text-muted" data-label={copy.colEmail}>
                  {patient.email ?? copy.docFallback}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {patients.map((patient) => (
          <Card key={patient.id} className="p-4">
            <Link
              href={`/patients/${patient.id}`}
              className="flex items-center gap-3 font-medium text-ink hover:text-primary"
            >
              <Avatar initials={initials(patient.firstName, patient.lastName)} />
              {fullName(patient)}
            </Link>
            <dl className="mt-3 flex flex-col gap-1.5 text-sm text-muted">
              <div className="flex justify-between gap-2">
                <dt>{copy.colDoc}</dt>
                <dd className="text-ink">{patient.docNumber ?? copy.docFallback}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{copy.colPhone}</dt>
                <dd className="text-ink">{patient.phone ?? copy.docFallback}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt>{copy.colEmail}</dt>
                <dd className="text-ink">{patient.email ?? copy.docFallback}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </>
  );
}
