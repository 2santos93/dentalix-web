'use client';
import Link from 'next/link';
import * as React from 'react';
import { Building2, ChevronLeft, MoreHorizontal, Pencil, ShieldCheck } from 'lucide-react';
import type { Patient } from '@/lib/patients/patients-api';
import { documentText, dtoDocTypeName } from '@/lib/patients/doc-type';
import { ageFrom } from '@/lib/patients/age';
import { displayPhone } from '@/lib/phone/display-phone';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { RowAction } from '@/components/shared/row-actions';
import { cn } from '@/lib/utils';
import { OverdueChip } from '@/components/collections/overdue-chip';
import { CoverageChip } from '@/components/patients/coverage-chip';
import { AgreementChip } from '@/components/patients/agreement-chip';
import { agreementChipText } from '@/lib/patients/agreement-presentation';
import { coverageChipText } from '@/lib/patients/coverage-presentation';
import { MedicalAlertIndicator } from '@/components/clinical/medical-alert-indicator';
import { FieldError } from '@/components/errors/field-error';
import { AttendanceBadge } from '@/components/appointments/attendance-badge';
import {
  attendanceBadgeText,
  type PatientAttendanceSummary,
} from '@/lib/cancellations/cancellation';
import {
  ANAMNESIS_EXPIRED_LABEL,
  medicalAlertHeadline,
  medicalAlertLines,
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
  moreActions: 'Más acciones',
  chipsLabel: 'Avisos del paciente',
  alertsLoading: 'Comprobando alertas…',
  alertsFailed: 'Alertas sin comprobar',
  attendanceLoading: 'Comprobando inasistencias…',
  attendanceFailed: 'Asistencia sin comprobar',
};

function fullName(patient: Patient): string {
  return `${patient.firstName} ${patient.lastName}`;
}

interface IdentityItem {
  key: string;
  text: string;
  /** Documento: `.t-id` (cero con barra, tabular). */
  id?: boolean;
}

/**
 * Los tres datos que cambian una decisión clínica antes de abrir ninguna
 * pestaña. Un dato que falta se OMITE entero (no deja un «—» en la cabecera):
 * un hueco silencioso se escanea mejor que un marcador vacío, y el panel de
 * datos sigue siendo el sitio donde se ve qué falta.
 */
function identityItems(patient: Patient): IdentityItem[] {
  const items: IdentityItem[] = [];
  const age = ageFrom(patient.birthDate);
  if (age !== null) items.push({ key: 'age', text: copy.age(age) });
  const doc = documentText(dtoDocTypeName(patient), patient.docNumber);
  if (doc) items.push({ key: 'doc', text: doc, id: true });
  // DX-387: el formato internacional de la API, o el guardado tal cual.
  const phone = displayPhone(patient);
  if (phone) items.push({ key: 'phone', text: copy.phone(phone) });
  return items;
}

/** Chip neutro de retención legal (con la frase completa al pasar o enfocar). */
export interface RetentionChip {
  text: string;
  hint: string | null;
}

interface PatientRecordHeaderProps {
  /** `null` mientras carga o si la carga falló. */
  patient: Patient | null;
  loading: boolean;
  onEdit: () => void;
  /**
   * Acciones raras o administrativas del menú «⋯» (enviar anamnesis, cambiar
   * retención, supresión parcial, archivar…). Quien llama decide cuáles según
   * el rol; sin ninguna, no hay menú.
   */
  menuActions?: RowAction[];
  /** DX-039: retención legal como chip neutro; `null` = sin retención que contar. */
  retention?: RetentionChip | null;
  /**
   * DX-247: banderas médicas del paciente. La cabecera encabeza todas las
   * pestañas (también el plan de tratamiento y el odontograma), así que la
   * alerta se ve sin abrir la historia clínica.
   */
  medicalAlerts?: MedicalAlertFlags | null;
  /** No se pudieron comprobar: se dice, con reintento (nunca parece «sin alertas»). */
  medicalAlertsFailed?: boolean;
  onRetryMedicalAlerts?: () => void;
  /**
   * DX-279: inasistencias y cancelaciones tardías de 12 meses (en las sedes
   * del usuario). `null` = se están pidiendo; `undefined` = no se piden.
   */
  attendance?: PatientAttendanceSummary | null;
  attendanceFailed?: boolean;
  onRetryAttendance?: () => void;
  /**
   * D2: «Editar datos» es la primaria solo donde editar los datos ES la tarea
   * (la pestaña «Datos»). En las demás pestañas la primaria es de la pestaña
   * (p. ej. «Agregar ítem» o «Aceptar con firma» en el plan) y esta baja a
   * secundaria: una primaria por vista.
   */
  editPrimary?: boolean;
}

/**
 * Cabecera compacta de la ficha del paciente (SPEC → Plantillas → Ficha):
 * vuelta a la lista, nombre (`t-display`), una línea de identidad (edad ·
 * documento · teléfono) con la marca de alcance, UNA fila de chips y, a la
 * derecha, «Editar datos» (primaria en la pestaña «Datos», secundaria en las
 * demás, que traen la suya: D2) y el menú «⋯».
 *
 * Fila de chips, en orden de riesgo: alertas clínicas primero (la misma alerta
 * que la agenda, con su panel, y cada alerta como chip de peligro para leerla
 * sin abrir nada), el estado de la anamnesis («Sin anamnesis» una sola vez),
 * inasistencias, saldo vencido, cobertura, convenio y, al final y en neutro,
 * la retención legal. Todo lo demás que antes vivía encima de las pestañas
 * (tarjeta de anamnesis, dos frases repetidas, el panel de retención con tres
 * botones) se fue a las pestañas o al menú: las pestañas quedan en el primer
 * viewport también en el móvil.
 *
 * Es un componente (y no JSX suelto en `patients/[id]/page.tsx`) porque bajo
 * `src/app/` no hay tests por convención del repo: el contrato de la cabecera
 * queda cubierto en `patient-record-header.test.tsx`.
 */
export function PatientRecordHeader({
  patient,
  loading,
  onEdit,
  menuActions = [],
  retention = null,
  medicalAlerts,
  medicalAlertsFailed = false,
  onRetryMedicalAlerts,
  attendance,
  attendanceFailed = false,
  onRetryAttendance,
  editPrimary = true,
}: PatientRecordHeaderProps) {
  const items = patient ? identityItems(patient) : [];
  const alertSeverity = patient ? medicalAlertSeverity(medicalAlerts) : null;
  const alertHeadline = medicalAlerts ? medicalAlertHeadline(medicalAlerts) : null;
  // Con alertas, cada una a la vista; el titular ya dice «Requiere
  // premedicación» o «Alertas médicas».
  const alertLines = alertSeverity === 'critical' && medicalAlerts ? medicalAlertLines(medicalAlerts) : [];
  // Con alertas, el titular no habla de la anamnesis: si además caducó, se dice aparte.
  const expiredWithAlerts =
    alertSeverity === 'critical' && medicalAlerts?.anamnesisStatus === 'EXPIRED';
  // `null` = se están pidiendo; `undefined` = quien la usa no las pide.
  const alertsPending = !!patient && !medicalAlertsFailed && medicalAlerts === null;
  const attendancePending = !!patient && !attendanceFailed && attendance === null;
  const hasAttendanceBadge = !!patient && attendanceBadgeText(attendance?.totals) !== null;
  const title = loading
    ? copy.loadingTitle
    : patient
      ? fullName(patient)
      : copy.unknownPatientTitle;
  const hasChips =
    !!patient &&
    (!!patient.balance?.hasOverdue ||
      !!coverageChipText(patient.coverage) ||
      !!agreementChipText(patient.agreement) ||
      !!alertSeverity ||
      alertsPending ||
      medicalAlertsFailed ||
      hasAttendanceBadge ||
      attendanceFailed ||
      !!retention);

  return (
    <header data-testid="patient-record-header" className="flex flex-col gap-3 pb-4">
      <Link
        href="/patients"
        className="-my-1 inline-flex items-center gap-1 self-start rounded-sm text-sm font-medium text-primary-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text max-md:min-h-11"
      >
        <ChevronLeft aria-hidden className="size-4" />
        {copy.backLink}
      </Link>

      <div className="flex flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          {/* `min-w-0` + `break-words`: un nombre largo se parte dentro de su
              columna en vez de empujar las acciones fuera de la pantalla. */}
          <h1 className="t-display min-w-0 break-words text-ink">{title}</h1>
          {patient ? (
            <div className="flex shrink-0 items-center gap-2">
              {/* En el móvil, solo el icono (el nombre accesible no cambia): el
                  nombre del paciente necesita el ancho. */}
              <Button
                type="button"
                variant={editPrimary ? 'default' : 'secondary'}
                onClick={onEdit}
                className="max-sm:size-11 max-sm:px-0"
              >
                <Pencil aria-hidden className="size-4" />
                <span className="max-sm:sr-only">{copy.edit}</span>
              </Button>
              {menuActions.length > 0 ? <HeaderMenu actions={menuActions} /> : null}
            </div>
          ) : null}
        </div>
        {/* Identidad y alcance a todo el ancho (no en la columna del nombre,
            que en el móvil comparten con los botones). */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {items.length > 0 ? (
            // El punto separador va DELANTE de cada ítem y la lista se corre a
            // la izquierda su ancho con el sobrante recortado: el punto que
            // abriría una línea nueva queda fuera, así nunca empieza una línea
            // por «·» al partirse en el móvil (critique-core §7).
            <div className="min-w-0 overflow-hidden">
              <ul aria-label={copy.identityLabel} className="-ml-4 flex flex-wrap items-center gap-y-1">
                {items.map((item) => (
                  <li
                    key={item.key}
                    className="flex min-w-0 items-center text-sm text-muted before:w-4 before:shrink-0 before:text-center before:text-faint before:content-['·']"
                  >
                    {/* El punto es decorativo (pseudo-elemento): cada valor ya
                        se explica solo («34 años», «Documento nacional
                        DOC-1002», «Tel. …»). `min-w-0` + `overflow-wrap`:
                        un teléfono largo se parte dentro de la franja en vez
                        de ensanchar la cabecera a 390 px (DX-387). */}
                    <span className={cn(item.id ? 't-id' : 'tnum', 'min-w-0 [overflow-wrap:anywhere]')}>
                      {item.text}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {/* Siempre visible, también mientras carga: es una propiedad de la
              ficha, no del paciente que se esté cargando. Mismo término que el
              selector de sede. Ninguna lectura de esta página filtra por sede
              (historia, odontograma, saldo). */}
          <p className="t-caption flex items-center gap-1.5 text-muted">
            <Building2 aria-hidden className="size-3.5 shrink-0" />
            {copy.recordScope}
          </p>
        </div>
      </div>

      {/* Sin hueco visible mientras se pide: la insignia aparece si la hay. */}
      {attendancePending ? (
        <p role="status" className="sr-only">
          {copy.attendanceLoading}
        </p>
      ) : null}

      {hasChips && patient ? (
        <div role="group" aria-label={copy.chipsLabel} className="flex flex-wrap items-center gap-1.5">
          {alertsPending ? (
            <p role="status" className="text-xs text-muted">
              {copy.alertsLoading}
            </p>
          ) : null}
          {medicalAlertsFailed ? (
            <FieldError label={copy.alertsFailed} onRetry={onRetryMedicalAlerts} className="h-9" />
          ) : null}
          {/* DX-247: la misma alerta que la agenda, con su titular y su panel. */}
          {alertSeverity ? (
            <span
              data-testid="record-medical-alert"
              className={cn(
                'inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs leading-4',
                alertSeverity === 'critical'
                  ? 'bg-danger-subtle font-semibold text-danger-text'
                  : 'bg-warning-subtle font-medium text-warning-text',
              )}
            >
              <MedicalAlertIndicator flags={medicalAlerts} patientName={fullName(patient)} size="compact" />
              <span aria-hidden>{alertHeadline}</span>
            </span>
          ) : null}
          {alertLines.map((line) => (
            <Badge key={line} variant="danger" data-testid="record-alert-line" className="whitespace-normal">
              {line}
            </Badge>
          ))}
          {expiredWithAlerts ? <Badge variant="warning">{ANAMNESIS_EXPIRED_LABEL}</Badge> : null}
          {/* DX-279: «2 inasistencias · 1 cancelación tardía (12 meses)». */}
          {attendanceFailed ? (
            <FieldError label={copy.attendanceFailed} onRetry={onRetryAttendance} className="h-9" />
          ) : null}
          <AttendanceBadge counts={attendance?.totals} />
          {/* DX-150: «Saldo vencido · N días» (importe solo ADMIN y RECEPTION). */}
          {patient.balance?.hasOverdue ? <OverdueChip balance={patient.balance} /> : null}
          {/* DX-153: «Cobertura vencida». DX-105: «Convenio: X». */}
          <CoverageChip coverage={patient.coverage} />
          <AgreementChip agreement={patient.agreement} />
          {retention ? <RetentionBadge chip={retention} /> : null}
        </div>
      ) : null}
    </header>
  );
}

/**
 * Retención legal (DX-039): un estado normal y esperado, así que va al final y
 * en neutro. La frase con el plazo sale al pasar el ratón o al enfocarlo (el
 * chip es enfocable para que el teclado también la vea); la versión completa
 * está en la pestaña «Datos».
 */
function RetentionBadge({ chip }: { chip: RetentionChip }) {
  const badge = (
    <Badge
      variant="neutral"
      data-testid="record-retention"
      tabIndex={chip.hint ? 0 : undefined}
      className={cn('tabular-nums', chip.hint && 'focus-ring cursor-default')}
    >
      <ShieldCheck aria-hidden className="size-3.5 shrink-0" />
      {chip.text}
    </Badge>
  );
  return chip.hint ? <Tooltip content={chip.hint}>{badge}</Tooltip> : badge;
}

/** Menú «⋯» de la cabecera: las acciones raras o legales, fuera de la vista. */
function HeaderMenu({ actions }: { actions: RowAction[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="secondary" size="icon" aria-label={copy.moreActions}>
          <MoreHorizontal aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {actions.map((action, i) => (
          <React.Fragment key={action.label}>
            {action.separatorBefore && i > 0 ? <DropdownMenuSeparator /> : null}
            <DropdownMenuItem
              disabled={action.disabled}
              destructive={action.destructive}
              onSelect={action.onSelect}
            >
              {action.icon}
              {action.label}
            </DropdownMenuItem>
          </React.Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
