'use client';
import * as React from 'react';
import { useEffect, useId, useMemo, useState } from 'react';
import { CalendarCheck, Printer } from 'lucide-react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  CERTIFICATE_DIAGNOSIS_MAX,
  CERTIFICATE_KIND_LABELS,
  CERTIFICATE_REST_START_MAX_OFFSET_DAYS,
  getCertificateIssuer,
  getCertificateSettings,
  issueCertificate,
  listCertificateAppointments,
  type CertificateIssuer,
  type CertificateKind,
  type CertificateSettings,
  type EligibleAppointment,
  type PatientCertificate,
} from '@/lib/certificates/certificates-api';
import { openCertificatePdf } from '@/lib/certificates/open-certificate-pdf';
import { addCivilDays } from '@/lib/certificates/civil-days';
import { civilDateInZone } from '@/lib/format/date';
import { useSedeStamp } from '@/lib/locations/sede-stamp';
import { SedeStampNote } from '@/components/locations/sede-stamp-note';
import { SectionError } from '@/components/errors/section-error';
import { InlineError } from '@/components/errors/inline-error';
import { EmptyState } from '@/components/shared/empty-state';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { DatePicker } from '@/components/ui/date-picker';
import { Input } from '@/components/ui/input';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';

export const issueCertificateCopy = {
  titles: {
    ATTENDANCE: 'Emitir justificante',
    REST: 'Certificado de reposo',
  } satisfies Record<CertificateKind, string>,
  descriptions: {
    ATTENDANCE:
      'Dice que el paciente asistió a consulta, con la hora real de llegada y de salida o, si no se registraron, las programadas. Nunca lleva diagnóstico.',
    REST: 'Indica los días de reposo desde una cita atendida. Lo firma quien lo emite, con su registro profesional.',
  } satisfies Record<CertificateKind, string>,
  submit: 'Emitir',
  close: 'Cerrar',
  loading: 'Cargando citas atendidas',
  loadError: 'No pudimos cargar las citas atendidas del paciente.',
  noAppointmentsTitle: 'No hay citas atendidas para certificar.',
  noAppointmentsHint:
    'Solo se certifica una cita marcada como «Completada» en una sede en la que trabajas. Márcala así en la agenda y vuelve aquí.',
  appointmentLegend: 'Cita atendida',
  appointmentHint: 'Las más recientes primero.',
  appointmentRequired: 'Elige la cita atendida.',
  appointmentTitle: (date: string, from: string, until: string) => `${date} · ${from}–${until}`,
  appointmentMeta: (location: string, provider: string | null) => (provider ? `${location} · ${provider}` : location),
  alreadyLive: {
    ATTENDANCE: 'Ya tiene un justificante vigente: anúlalo antes para emitir otro.',
    REST: 'Ya tiene un certificado de reposo vigente: anúlalo antes para emitir otro.',
  } satisfies Record<CertificateKind, string>,
  noLicenseTitle: 'Te falta el registro profesional',
  noLicense:
    'El certificado de reposo lleva el registro profesional de quien lo firma y no tienes uno cargado en esta clínica. Pide a administración que lo añada en Personal; el justificante de asistencia sí lo puedes emitir.',
  daysLabel: 'Días de reposo',
  daysHint: (max: number) => `Entre 1 y ${max}.`,
  daysInvalid: (max: number) => `Escribe un número entero de días entre 1 y ${max}.`,
  startLabel: 'Primer día de reposo',
  startHint: 'Por defecto, el día de la atención. No puede ser anterior.',
  startRequired: 'Escribe el primer día de reposo.',
  startOutOfRange: `El primer día de reposo va desde el día de la atención hasta ${CERTIFICATE_REST_START_MAX_OFFSET_DAYS} días después.`,
  restRange: (from: string, until: string) => `Reposo del ${from} al ${until}.`,
  diagnosisLabel: 'Diagnóstico (opcional)',
  diagnosisHint: 'Tu clínica lo imprime en el reposo. Recepción no lo ve. Déjalo vacío para que no salga.',
  genericError: 'No pudimos emitir el certificado. Intenta de nuevo.',
  issuedTitle: (label: string, number: string) => `${label} nº ${number} emitido`,
  issuedBody: 'Queda en la ficha del paciente y su PDF, archivado en «Documentos».',
  print: 'Imprimir',
  printError: 'No pudimos abrir el PDF del certificado. Intenta de nuevo.',
};

const copy = issueCertificateCopy;

interface IssueCertificateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  patientId: string;
  kind: CertificateKind;
  /** La cita desde la que se llegó (detalle de la cita en la agenda): queda elegida. */
  initialAppointmentId?: string | null;
  onIssued?: (certificate: PatientCertificate) => void;
}

interface Loaded {
  appointments: EligibleAppointment[];
  issuer: CertificateIssuer | null;
  settings: CertificateSettings | null;
}

/** Días enteros dentro de 1..max, o null. */
function parseDays(text: string, max: number): number | null {
  if (!/^\d+$/.test(text.trim())) return null;
  const days = Number(text.trim());
  return days >= 1 && days <= max ? days : null;
}

/**
 * «Emitir justificante» y «Certificado de reposo» (DX-306): se elige una cita
 * ATENDIDA del paciente (las que ya tienen uno vigente de ese tipo, deshabilitadas
 * y explicadas) y, en el reposo, los días, el primer día (por defecto el de la
 * atención, en la zona de SU sede) y el diagnóstico si la clínica lo imprime.
 * Tras emitir, el modal ofrece «Imprimir». Un fallo de carga es escalón 1 dentro
 * del modal; un fallo del envío (el `message` en español de la API: 409 ya hay
 * uno vigente, 403 otra sede, 400 lo que falta) es el banner del formulario.
 */
export function IssueCertificateModal({
  open,
  onOpenChange,
  token,
  patientId,
  kind,
  initialAppointmentId = null,
  onIssued,
}: IssueCertificateModalProps) {
  const ids = useId();
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [appointmentId, setAppointmentId] = useState<string | null>(null);
  const [appointmentError, setAppointmentError] = useState<string | null>(null);
  const [days, setDays] = useState('1');
  const [daysError, setDaysError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [diagnosis, setDiagnosis] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<PatientCertificate | null>(null);
  const [printing, setPrinting] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const rest = kind === 'REST';

  const appointments = useMemo(() => loaded?.appointments ?? [], [loaded]);
  // Cada cita con el reloj de SU sede (DX-354b).
  const stamp = useSedeStamp(
    token,
    appointments.map((a) => a.locationId),
  );

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([
      listCertificateAppointments(token, patientId),
      rest ? getCertificateIssuer(token) : Promise.resolve(null),
      rest ? getCertificateSettings(token) : Promise.resolve(null),
    ])
      .then(([list, issuer, settings]) => {
        if (cancelled) return;
        setLoaded({ appointments: list, issuer, settings });
        setLoadError(null);
        const available = list.filter((a) => !a.liveKinds.includes(kind));
        const preferred = available.find((a) => a.id === initialAppointmentId) ?? available[0] ?? null;
        setAppointmentId((current) => current ?? preferred?.id ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(apiErrorMessage(err, copy.loadError));
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, patientId, rest, kind, initialAppointmentId, reloadKey]);

  const selected = appointments.find((a) => a.id === appointmentId) ?? null;
  const zone = selected ? (stamp.clock?.of(selected.locationId)?.timeZone ?? null) : null;
  // El día de la atención en la zona de la sede: el mínimo (y el valor por defecto) del inicio.
  const attendanceDay = selected && zone ? civilDateInZone(selected.start, zone) : null;
  const startMax = attendanceDay ? addCivilDays(attendanceDay, CERTIFICATE_REST_START_MAX_OFFSET_DAYS) : undefined;
  const effectiveStart = startDate ?? attendanceDay;
  const maxDays = loaded?.settings?.restMaxDays ?? 1;
  const parsedDays = parseDays(days, maxDays);
  const restEnd = effectiveStart && parsedDays ? addCivilDays(effectiveStart, parsedDays - 1) : null;
  const missingLicense = rest && loaded?.issuer !== null && loaded?.issuer !== undefined && !loaded.issuer.professionalLicense;
  const printsDiagnosis = rest && loaded?.settings?.restPrintDiagnosis === true;

  function chooseAppointment(id: string) {
    setAppointmentId(id);
    setAppointmentError(null);
    // El inicio vuelve al día de la nueva cita.
    setStartDate(null);
    setStartError(null);
    setError(null);
  }

  async function submit() {
    if (!selected) {
      setAppointmentError(copy.appointmentRequired);
      return;
    }
    let restDays: number | undefined;
    let restStartDate: string | undefined;
    if (rest) {
      if (parsedDays === null) {
        setDaysError(copy.daysInvalid(maxDays));
        return;
      }
      restDays = parsedDays;
      if (attendanceDay) {
        if (!effectiveStart) {
          setStartError(copy.startRequired);
          return;
        }
        if (effectiveStart < attendanceDay || (startMax && effectiveStart > startMax)) {
          setStartError(copy.startOutOfRange);
          return;
        }
        restStartDate = effectiveStart;
      }
    }
    setSubmitting(true);
    setError(null);
    try {
      const cert = await issueCertificate(token, patientId, {
        kind,
        appointmentId: selected.id,
        ...(rest ? { restDays, restStartDate } : {}),
        ...(printsDiagnosis && diagnosis.trim() !== '' ? { diagnosis: diagnosis.trim() } : {}),
      });
      setIssued(cert);
      onIssued?.(cert);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (issued) {
      onOpenChange(false);
      return;
    }
    void submit();
  }

  async function print(cert: PatientCertificate) {
    setPrinting(true);
    setPrintError(null);
    try {
      await openCertificatePdf(token, patientId, cert.id);
    } catch (err) {
      setPrintError(apiErrorMessage(err, copy.printError));
    } finally {
      setPrinting(false);
    }
  }

  const noAppointments = loaded !== null && appointments.length === 0;
  const blocked = loadError !== null || noAppointments || missingLicense;

  let body: React.ReactNode;
  if (issued) {
    body = (
      <div className="flex flex-col gap-3">
        <Callout
          tone="success"
          title={copy.issuedTitle(CERTIFICATE_KIND_LABELS[issued.kind], issued.numberLabel)}
          role="status"
        >
          <p>{copy.issuedBody}</p>
        </Callout>
        <Button
          type="button"
          variant="secondary"
          className="w-full sm:w-auto sm:self-start"
          disabled={printing}
          aria-busy={printing || undefined}
          onClick={() => void print(issued)}
        >
          <Printer aria-hidden />
          {copy.print}
        </Button>
        {printError ? <InlineError>{printError}</InlineError> : null}
      </div>
    );
  } else if (loadError) {
    body = (
      <SectionError
        description={loadError}
        onRetry={() => {
          setLoadError(null);
          setReloadKey((k) => k + 1);
        }}
      />
    );
  } else if (!loaded) {
    body = (
      <div role="status" aria-label={copy.loading} className="flex flex-col gap-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  } else if (noAppointments) {
    body = (
      <EmptyState
        role="status"
        icon={<CalendarCheck aria-hidden />}
        title={copy.noAppointmentsTitle}
        description={copy.noAppointmentsHint}
      />
    );
  } else if (missingLicense) {
    body = (
      <Callout tone="warning" title={copy.noLicenseTitle} role="status">
        <p>{copy.noLicense}</p>
      </Callout>
    );
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <SedeStampNote stamp={stamp} />
        <RadioGroup
          id={`${ids}-appointment`}
          legend={copy.appointmentLegend}
          hint={copy.appointmentHint}
          value={appointmentId ?? undefined}
          onValueChange={chooseAppointment}
          error={appointmentError}
          disabled={submitting}
          optionsClassName="flex max-h-72 flex-col gap-2 overflow-y-auto overscroll-contain p-0.5"
        >
          {appointments.map((a) => {
            const taken = a.liveKinds.includes(kind);
            const meta = copy.appointmentMeta(a.locationName, a.providerName);
            return (
              <RadioCard
                key={a.id}
                value={a.id}
                disabled={taken || submitting}
                title={
                  <span className="t-data">
                    {copy.appointmentTitle(
                      stamp.date(a.start, a.locationId),
                      stamp.time(a.start, a.locationId),
                      stamp.time(a.end, a.locationId),
                    )}
                  </span>
                }
                description={taken ? `${meta}. ${copy.alreadyLive[kind]}` : meta}
              />
            );
          })}
        </RadioGroup>

        {rest ? (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-[8rem_1fr]">
            <FormField
              htmlFor={`${ids}-days`}
              label={copy.daysLabel}
              hint={copy.daysHint(maxDays)}
              error={daysError}
            >
              <Input
                id={`${ids}-days`}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={days}
                disabled={submitting}
                aria-invalid={daysError ? true : undefined}
                onChange={(e) => {
                  setDays(e.target.value);
                  setDaysError(null);
                }}
                className="t-data"
              />
            </FormField>
            {attendanceDay ? (
              <FormField htmlFor={`${ids}-start`} label={copy.startLabel} hint={copy.startHint} error={startError}>
                <DatePicker
                  id={`${ids}-start`}
                  value={effectiveStart}
                  min={attendanceDay}
                  max={startMax}
                  disabled={submitting}
                  aria-invalid={startError ? true : undefined}
                  onChange={(value) => {
                    setStartDate(value);
                    setStartError(null);
                  }}
                />
              </FormField>
            ) : null}
          </div>
        ) : null}
        {rest && restEnd && effectiveStart && selected ? (
          <p className="t-data text-sm text-muted" aria-live="polite">
            {copy.restRange(
              stamp.civilDate(effectiveStart, selected.locationId),
              stamp.civilDate(restEnd, selected.locationId),
            )}
          </p>
        ) : null}
        {printsDiagnosis ? (
          <FormField htmlFor={`${ids}-diagnosis`} label={copy.diagnosisLabel} hint={copy.diagnosisHint}>
            <Textarea
              id={`${ids}-diagnosis`}
              rows={2}
              autoGrow
              value={diagnosis}
              maxLength={CERTIFICATE_DIAGNOSIS_MAX}
              disabled={submitting}
              onChange={(e) => setDiagnosis(e.target.value)}
            />
          </FormField>
        ) : null}
      </div>
    );
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.titles[kind]}
      description={copy.descriptions[kind]}
      onSubmit={handleSubmit}
      submitLabel={issued ? copy.close : copy.submit}
      submitting={submitting}
      submitBusy={!issued && !loaded && !loadError}
      hideSubmit={!issued && blocked}
      error={issued ? null : error}
      touchTargets
      ownValidation
    >
      {body}
    </FormModal>
  );
}
