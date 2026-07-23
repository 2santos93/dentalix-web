import Link from 'next/link';
import type { Patient } from '@/lib/patients/patients-api';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  loading: 'Cargando pacientes…',
  empty: 'No hay pacientes registrados todavía.',
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
}

export function PatientsTable({ patients, loading }: PatientsTableProps) {
  if (loading) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.loading}
      </p>
    );
  }

  if (patients.length === 0) {
    return (
      <p role="status" className="text-sm text-muted">
        {copy.empty}
      </p>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <table className="hidden md:block w-full border-collapse overflow-hidden rounded-lg border border-border bg-surface text-sm text-ink">
        <thead>
          <tr className="border-b border-border text-left">
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colName}
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colDoc}
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colPhone}
            </th>
            <th scope="col" className="px-4 py-3 font-medium text-muted">
              {copy.colEmail}
            </th>
          </tr>
        </thead>
        <tbody>
          {patients.map((patient) => (
            <tr key={patient.id} className="border-b border-border last:border-0">
              <td className="px-4 py-3 text-ink">
                <Link href={`/patients/${patient.id}`} className="hover:underline">
                  {fullName(patient)}
                </Link>
              </td>
              <td className="px-4 py-3 text-ink">{patient.docNumber ?? copy.docFallback}</td>
              <td className="px-4 py-3 text-ink">{patient.phone ?? copy.docFallback}</td>
              <td className="px-4 py-3 text-ink">{patient.email ?? copy.docFallback}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Mobile cards */}
      <div className="flex flex-col gap-3 md:hidden">
        {patients.map((patient) => (
          <div
            key={patient.id}
            className="rounded-lg border border-border bg-surface p-4 text-sm text-ink"
          >
            <Link href={`/patients/${patient.id}`} className="font-medium text-ink hover:underline">
              {fullName(patient)}
            </Link>
            <dl className="mt-2 flex flex-col gap-1 text-muted">
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
          </div>
        ))}
      </div>
    </>
  );
}
