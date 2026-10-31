'use client';
import type { Patient } from '@/lib/patients/patients-api';
import { displayPhone } from '@/lib/phone/display-phone';
import { DataList, type DataListColumn } from '@/components/ui/data-list';
import { EmptyState } from '@/components/shared/empty-state';
import { Avatar } from '@/components/ui/avatar';
import { initials } from '@/lib/format/initials';
import { ageFrom } from '@/lib/patients/age';
import { COVERAGE_EXPIRED_LABEL } from '@/lib/patients/coverage-presentation';
import type { SedeClock } from '@/lib/locations/sede-clock';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  label: 'Pacientes',
  loading: 'Cargando pacientes…',
  empty: 'No hay pacientes registrados todavía.',
  emptyHint: 'Crea el primer paciente para empezar a gestionar su historia.',
  noMatches: 'Ningún paciente coincide con la búsqueda.',
  noMatchesHint: 'Revisa el nombre o el número de documento.',
  noPayerMatches: 'Ningún paciente tiene cobertura con ese pagador.',
  noPayerMatchesHint: 'Elige «Todas» en Cobertura para ver el listado completo.',
  colName: 'Nombre',
  colDoc: 'Documento',
  colAge: 'Edad',
  colPhone: 'Teléfono',
  colCoverage: 'Cobertura',
  colLastAttention: 'Última atención',
  age: (years: number) => (years === 1 ? '1 año' : `${years} años`),
  pendingStart: 'pendiente de inicio',
  fallback: '—',
};

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}

function ageText(patient: Patient): string | null {
  const years = ageFrom(patient.birthDate);
  return years === null ? null : copy.age(years);
}

/** «Aseguradora Norte», «Aseguradora Norte · Cobertura vencida»; nada sin cobertura. */
function coverageText(patient: Patient): string | null {
  const c = patient.coverage;
  if (!c || c.status === 'NONE' || !c.payerName) return null;
  if (c.status === 'EXPIRED') return `${c.payerName} · ${COVERAGE_EXPIRED_LABEL.toLowerCase()}`;
  if (c.status === 'NOT_STARTED') return `${c.payerName} · ${copy.pendingStart}`;
  return c.payerName;
}

function Muted({ children }: { children: React.ReactNode }) {
  return <span className="text-muted">{children}</span>;
}

function columns(clock: SedeClock | null): DataListColumn<Patient>[] {
  return [
    {
      id: 'name',
      header: copy.colName,
      mobile: 'primary',
      cell: fullName,
    },
    {
      id: 'doc',
      header: copy.colDoc,
      cell: (p) =>
        p.docNumber ? <span className="t-id text-muted">{p.docNumber}</span> : <Muted>{copy.fallback}</Muted>,
      mobileCell: (p) => (p.docNumber ? <span className="t-id">{p.docNumber}</span> : null),
    },
    {
      id: 'age',
      header: copy.colAge,
      mobile: 'trailing',
      numeric: true,
      cell: (p) => <span className="text-muted">{ageText(p) ?? copy.fallback}</span>,
      // La edad orienta pero no compite con el nombre: muted en la tarjeta.
      mobileCell: (p) => {
        const text = ageText(p);
        return text ? <span className="text-muted">{text}</span> : null;
      },
    },
    {
      id: 'phone',
      header: copy.colPhone,
      // DX-387: el formato internacional de la API, o el guardado tal cual. Un
      // teléfono largo se parte en su celda/tarjeta en vez de ensancharla.
      cell: (p) => (
        <span className="min-w-0 text-muted tabular-nums [overflow-wrap:anywhere]">
          {displayPhone(p) ?? copy.fallback}
        </span>
      ),
      mobileCell: (p) => {
        const phone = displayPhone(p);
        return phone ? <span className="min-w-0 tabular-nums [overflow-wrap:anywhere]">{phone}</span> : null;
      },
    },
    {
      id: 'coverage',
      header: copy.colCoverage,
      mobile: 'hidden',
      showFrom: 'lg',
      cell: (p) => {
        const text = coverageText(p);
        if (!text) return <Muted>{copy.fallback}</Muted>;
        return (
          <span className={p.coverage?.status === 'EXPIRED' ? 'text-danger-text' : 'text-muted'}>{text}</span>
        );
      },
    },
    {
      id: 'lastAttention',
      header: copy.colLastAttention,
      mobile: 'hidden',
      showFrom: 'lg',
      numeric: true,
      cell: (p) => (
        <span className="text-muted">
          {p.lastAttentionAt && clock
            ? clock.fmt.date(new Date(p.lastAttentionAt), clock.timeZone)
            : copy.fallback}
        </span>
      ),
    },
  ];
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
  /** Reloj de la sede para «Última atención»; sin él la columna dice «—». */
  clock?: SedeClock | null;
}

/**
 * Lista de pacientes sobre `DataList`: tabla en tablet y escritorio, tarjeta
 * compacta de dos líneas en el teléfono (nombre + edad / documento ·
 * teléfono). Solo columnas que ya trae `GET /patients`: próxima cita y saldo
 * no llegan en la lista (ver el informe K2).
 */
export function PatientsTable({
  patients,
  loading,
  filtered = false,
  payerOnly = false,
  clock = null,
}: PatientsTableProps) {
  return (
    <DataList
      label={copy.label}
      rows={patients}
      columns={columns(clock)}
      getRowKey={(p) => p.id}
      getRowHref={(p) => `/patients/${p.id}`}
      leading={(p) => <Avatar size="sm" initials={initials(p.firstName, p.lastName)} />}
      loading={loading}
      loadingLabel={copy.loading}
      // "Todavía no hay pacientes" y "la búsqueda no encuentra ninguno" son
      // cosas distintas: la primera invita a crear el primero, la segunda diría
      // una falsedad si repitiera esa invitación.
      empty={
        <EmptyState
          role="status"
          title={payerOnly ? copy.noPayerMatches : filtered ? copy.noMatches : copy.empty}
          description={
            payerOnly ? copy.noPayerMatchesHint : filtered ? copy.noMatchesHint : copy.emptyHint
          }
        />
      }
    />
  );
}
