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
import { EmptyState } from '@/components/molecules/empty-state';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Cargando pacientes…',
  empty: 'No hay pacientes registrados todavía.',
  emptyHint: 'Crea el primer paciente para empezar a gestionar su historia.',
  colName: 'Nombre',
  colDoc: 'Documento',
  colPhone: 'Teléfono',
  colEmail: 'Correo electrónico',
  docFallback: '—',
};

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}

function initials(patient: Patient): string {
  return `${patient.firstName[0] ?? ''}${patient.lastName[0] ?? ''}`.toUpperCase();
}

interface PatientsTableProps {
  patients: Patient[];
  loading: boolean;
}

export function PatientsTable({ patients, loading }: PatientsTableProps) {
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
    return (
      <EmptyState role="status" title={copy.empty} description={copy.emptyHint} />
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
                <TableCell>
                  <Link
                    href={`/patients/${patient.id}`}
                    className="flex items-center gap-3 font-medium text-ink hover:text-primary"
                  >
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                      {initials(patient)}
                    </span>
                    {fullName(patient)}
                  </Link>
                </TableCell>
                <TableCell className="text-muted">
                  {patient.docNumber ?? copy.docFallback}
                </TableCell>
                <TableCell className="text-muted">
                  {patient.phone ?? copy.docFallback}
                </TableCell>
                <TableCell className="text-muted">
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
              <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {initials(patient)}
              </span>
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
