'use client';
import Link from 'next/link';
import { Building2, ChevronLeft, Pencil } from 'lucide-react';
import type { Patient } from '@/lib/patients/patients-api';
import { DOC_TYPE_SHORT } from '@/lib/patients/doc-type';
import { ageFrom } from '@/lib/patients/age';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/page-header';
import { OverdueChip } from '@/components/collections/overdue-chip';
import { CoverageChip } from '@/components/patients/coverage-chip';
import { coverageChipText } from '@/lib/patients/coverage-presentation';
import { MedicalAlertIndicator } from '@/components/clinical/medical-alert-indicator';
import {
  medicalAlertHeadline,
  medicalAlertSeverity,
  type MedicalAlertFlags,
} from '@/lib/clinical/medical-alerts';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands. Cada entrada es una cadena COMPLETA: las que
// llevan valores son funciones con las variables ordenadas, para que al
// traducir se puedan reordenar sin partir el texto en trozos.
const copy = {
  backLink: 'Volver a pacientes',
  loadingTitle: 'Cargando paciente…',
  // Título cuando el paciente no se pudo cargar: la página necesita un h1 real
  // (antes quedaba vacío) aunque todavía no haya nombre que poner.
  unknownPatientTitle: 'Paciente',
  identityLabel: 'Datos de identificación',
  age: (years: number) => (years === 1 ? '1 año' : `${years} años`),
  document: (type: string, number: string) => `${type} ${number}`,
  phone: (value: string) => `Tel. ${value}`,
  /**
   * Marca de alcance. Verificado contra el backend: NINGUNA lectura de esta
   * página filtra por sede — ni la historia, ni el odontograma, ni el saldo
   * (`PrismaPaymentRepository.listByPlan` no aplica el filtro de sede a
   * propósito, y `GetPlanBalanceUseCase` se apoya en él). «Todas las sedes» es
   * el mismo término que usa el `LocationSwitcher`, para no inventar un
   * segundo vocabulario para el mismo concepto.
   */
  recordScope: 'Ficha centralizada · todas las sedes',
  edit: 'Editar datos',
};

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}

/**
 * Los tres datos que cambian una decisión clínica antes de abrir ninguna
 * pestaña. Un dato que falta se OMITE entero (no deja un «—» en la cabecera):
 * un hueco silencioso se escanea mejor que un marcador vacío, y el panel de
 * datos sigue siendo el sitio donde se ve qué falta.
 */
function identityItems(patient: Patient): { key: string; text: string }[] {
  const items: { key: string; text: string }[] = [];
  const age = ageFrom(patient.birthDate);
  if (age !== null) items.push({ key: 'age', text: copy.age(age) });
  if (patient.docNumber) {
    items.push({ key: 'doc', text: copy.document(DOC_TYPE_SHORT[patient.docType], patient.docNumber) });
  }
  if (patient.phone) items.push({ key: 'phone', text: copy.phone(patient.phone) });
  return items;
}

interface PatientRecordHeaderProps {
  /** `null` mientras carga o si la carga falló. */
  patient: Patient | null;
  loading: boolean;
  onEdit: () => void;
  /**
   * DX-247: banderas médicas del paciente. La cabecera encabeza todas las
   * pestañas (también el plan de tratamiento y el odontograma), así que la
   * alerta se ve sin abrir la historia clínica.
   */
  medicalAlerts?: MedicalAlertFlags | null;
}

/**
 * Cabecera de la ficha del paciente: enlace de vuelta, nombre, tira de
 * identidad (edad · documento · teléfono), marca de alcance y la única acción
 * primaria de la vista.
 *
 * Usa el `PageHeader` del sistema — esta página era la única de la app que
 * se pintaba su propio `<h1>` a mano y se quedaba fuera de `t-display`. La
 * tira y la marca van en el hueco `meta` que `PageHeader` expone.
 *
 * Es un componente (y no JSX suelto en `patients/[id]/page.tsx`) porque bajo
 * `src/app/` no hay tests por convención del repo: así el contrato de la
 * cabecera —qué se muestra, qué se omite y qué dice sobre el alcance— queda
 * cubierto en `patient-record-header.test.tsx`.
 */
export function PatientRecordHeader({
  patient,
  loading,
  onEdit,
  medicalAlerts,
}: PatientRecordHeaderProps) {
  const items = patient ? identityItems(patient) : [];
  const alertSeverity = patient ? medicalAlertSeverity(medicalAlerts) : null;
  const alertHeadline = medicalAlerts ? medicalAlertHeadline(medicalAlerts) : null;
  const title = loading
    ? copy.loadingTitle
    : patient
      ? fullName(patient)
      : copy.unknownPatientTitle;

  return (
    <div>
      <Link
        href="/patients"
        className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {copy.backLink}
      </Link>

      <PageHeader
        title={title}
        meta={
          // `mt-2` aquí y no en `PageHeader`: el hueco `meta` no pone margen
          // propio, para que una marca que decide en el cliente si existe
          // (`ClinicWideNote`) no deje un vacío cuando no se pinta. Va apretado
          // al título porque es su misma frase —quién es y qué alcance tiene—,
          // no un párrafo aparte.
          <div className="mt-2 flex flex-col gap-1.5">
            {items.length > 0 ? (
              <ul aria-label={copy.identityLabel} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {items.map((item, index) => (
                  <li key={item.key} className="flex items-center gap-2 text-sm text-muted">
                    {/* Separador decorativo: el punto medio no aporta nada
                        leído en voz alta, y cada valor ya se explica solo
                        («34 años», «CC 1002», «Tel. …») sin depender de él. */}
                    {index > 0 ? <span aria-hidden className="text-border">·</span> : null}
                    <span className="tnum">{item.text}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            {/* Siempre visible, también mientras carga: es una propiedad de la
                ficha, no del paciente que se esté cargando, y así la cabecera
                no cambia de alto al terminar la carga. */}
            <p className="t-label flex items-center gap-1.5 text-muted">
              <Building2 aria-hidden className="size-3.5 shrink-0" />
              {copy.recordScope}
            </p>
            {/* DX-150: «Saldo vencido · N días» (con importe solo para ADMIN y
                RECEPTION: la API ya lo omite para los demás roles). */}
            {/* DX-153: «Cobertura vencida», junto a la del saldo. */}
            {/* DX-247: la misma alerta médica que la agenda, con su titular. */}
            {patient?.balance?.hasOverdue || coverageChipText(patient?.coverage) || alertSeverity ? (
              <div className="flex flex-wrap items-center gap-2">
                {patient && alertSeverity ? (
                  <span
                    data-testid="record-medical-alert"
                    className={
                      alertSeverity === 'critical'
                        ? 'inline-flex items-center gap-1.5 text-sm font-semibold text-danger'
                        : 'inline-flex items-center gap-1.5 text-sm font-medium text-warning'
                    }
                  >
                    <MedicalAlertIndicator
                      flags={medicalAlerts}
                      patientName={fullName(patient)}
                      size="default"
                    />
                    <span aria-hidden>{alertHeadline}</span>
                  </span>
                ) : null}
                {patient?.balance?.hasOverdue ? <OverdueChip balance={patient.balance} /> : null}
                <CoverageChip coverage={patient?.coverage} />
              </div>
            ) : null}
          </div>
        }
        actions={
          patient ? (
            <Button type="button" onClick={onEdit}>
              <Pencil aria-hidden className="size-4" /> {copy.edit}
            </Button>
          ) : undefined
        }
      />
    </div>
  );
}
