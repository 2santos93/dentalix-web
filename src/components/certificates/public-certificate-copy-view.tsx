'use client';
import { useEffect, useMemo, useState } from 'react';
import { Clock, Download, FileX, SearchX } from 'lucide-react';
import { ApiError } from '@/lib/api/client';
import {
  CERTIFICATE_COPY_EXPIRED_CODE,
  getPublicCertificateCopy,
  publicCertificateCopyPdfHref,
  type PublicCertificate,
  type PublicCertificateCopy,
} from '@/lib/certificates/certificate-copy';
import { CERTIFICATE_KIND_LABELS } from '@/lib/certificates/certificates-api';
import { documentFormat, NO_DOCUMENT_FORMAT, type DocumentFormat } from '@/lib/format/document-format';
import { ClinicBrand } from '@/components/brand/clinic-brand';
import { PublicNotice, publicBrandStyle } from '@/components/shared/public-page';
import { SectionError } from '@/components/errors/section-error';
import { Button } from '@/components/ui/button';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { Skeleton } from '@/components/ui/skeleton';

// Copy as constants (i18n-ready, es-first).
export const publicCertificateCopyCopy = {
  loading: 'Abriendo tu certificado…',
  title: (label: string, number: string) => `${label} nº ${number}`,
  patient: 'Paciente',
  attendance: 'Atención',
  attended: (date: string, from: string, until: string) => `Asistió a consulta el ${date} de ${from} a ${until}.`,
  scheduled: 'Con las horas programadas de la cita.',
  rest: 'Reposo',
  restDays: (days: number, from: string, until: string) =>
    `${days === 1 ? '1 día' : `${days} días`} de reposo, del ${from} al ${until}.`,
  diagnosis: 'Diagnóstico',
  diagnosisOmitted: 'Consta en el certificado emitido; por privacidad no se incluye en esta copia.',
  professional: 'Profesional',
  location: 'Sede',
  issued: 'Emitido el',
  download: 'Descargar PDF',
  expires: (date: string) => `Este enlace es personal y caduca el ${date}.`,
  voidedTitle: 'Este certificado fue anulado',
  voidedMessage: (date: string | null) =>
    date
      ? `La clínica lo anuló el ${date}. Ya no es válido y no se puede descargar. Si tienes dudas, contacta con la clínica.`
      : 'Ya no es válido y no se puede descargar. Si tienes dudas, contacta con la clínica.',
  expiredTitle: 'Este enlace caducó',
  expiredMessage: 'Si necesitas otra copia del certificado, pídesela a la clínica.',
  notFoundTitle: 'Este enlace no es válido',
  notFoundMessage:
    'Puede que la clínica te haya enviado otro más reciente, o que el enlace esté incompleto. Si necesitas el certificado, pídeselo a la clínica.',
  loadError: 'No pudimos abrir el certificado. Revisa tu conexión.',
  tooManyTitle: 'Demasiados intentos',
  tooManyMessage: 'Espera un minuto antes de volver a abrirlo.',
};

const copy = publicCertificateCopyCopy;

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error'; tooMany: boolean }
  | { kind: 'notFound' }
  | { kind: 'expired' }
  | { kind: 'ready'; data: PublicCertificateCopy };

/** Pintores con el formato de la sede del certificado; sin él, «—» (nunca el del navegador). */
function painters(format: DocumentFormat | null) {
  return {
    date: (iso: string | null) => (format && iso ? format.fmt.date(new Date(iso), format.timeZone) : NO_DOCUMENT_FORMAT),
    time: (iso: string) => (format ? format.fmt.time(new Date(iso), format.timeZone) : NO_DOCUMENT_FORMAT),
    civil: (day: string | null) => (format && day ? format.fmt.civilDate(day) : NO_DOCUMENT_FORMAT),
  };
}

function CertificateBody({
  certificate,
  paint,
}: {
  certificate: PublicCertificate;
  paint: ReturnType<typeof painters>;
}) {
  const { snapshot } = certificate;
  const patient = snapshot.patient.document
    ? `${snapshot.patient.name} · ${snapshot.patient.document}`
    : snapshot.patient.name;
  const professional = snapshot.professional.license
    ? `${snapshot.professional.name} · ${snapshot.professional.license}`
    : snapshot.professional.name;
  return (
    <DescriptionList columns={1}>
      <DescriptionItem label={copy.patient}>{patient}</DescriptionItem>
      <DescriptionItem label={copy.attendance} numeric>
        {copy.attended(
          paint.date(certificate.attendedFrom),
          paint.time(certificate.attendedFrom),
          paint.time(certificate.attendedUntil),
        )}
        {certificate.timesSource === 'SCHEDULED' ? <span className="block text-muted">{copy.scheduled}</span> : null}
      </DescriptionItem>
      {certificate.kind === 'REST' && certificate.restDays !== null ? (
        <DescriptionItem label={copy.rest} numeric>
          {copy.restDays(certificate.restDays, paint.civil(certificate.restStartDate), paint.civil(certificate.restEndDate))}
        </DescriptionItem>
      ) : null}
      {/* La copia pública nunca lleva el diagnóstico (dato de salud): solo avisa de que existe. */}
      {certificate.diagnosisOmitted ? (
        <DescriptionItem label={copy.diagnosis}>{copy.diagnosisOmitted}</DescriptionItem>
      ) : null}
      <DescriptionItem label={copy.professional}>{professional}</DescriptionItem>
      <DescriptionItem label={copy.location}>{snapshot.location.name}</DescriptionItem>
      <DescriptionItem label={copy.issued} numeric>
        {paint.date(certificate.issuedAt)}
      </DescriptionItem>
    </DescriptionList>
  );
}

/**
 * Página pública `/certificado/copia/[token]` (DX-306): la copia del
 * justificante o del reposo que la clínica envió al paciente por WhatsApp, con
 * la marca de la clínica, las fechas con el formato de SU sede y «Descargar
 * PDF». Anulado después del envío: solo «Este certificado fue anulado», sin
 * contenido ni descarga. Caducado o inválido: un aviso sin nada clínico; sin red
 * o 429, escalón 1 con reintento. Móvil primero.
 */
export function PublicCertificateCopyView({ token }: { token: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getPublicCertificateCopy(token)
      .then((data) => {
        if (!cancelled) setState({ kind: 'ready', data });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (err instanceof ApiError && err.status === 404) setState({ kind: 'notFound' });
        else if (err instanceof ApiError && err.status === 410 && err.code === CERTIFICATE_COPY_EXPIRED_CODE)
          setState({ kind: 'expired' });
        else setState({ kind: 'error', tooMany: err instanceof ApiError && err.status === 429 });
      });
    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

  const data = state.kind === 'ready' ? state.data : null;
  const paint = useMemo(() => painters(data ? documentFormat(data.format) : null), [data]);
  const certificate = data?.status === 'AVAILABLE' ? data.certificate : null;
  const voidedDate = data?.voidedAt ? paint.date(data.voidedAt) : null;

  return (
    <div className="flex min-h-dvh flex-col bg-canvas" style={publicBrandStyle(data?.clinic)}>
      <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-6 px-4 py-8">
        {state.kind === 'loading' && (
          <div role="status" className="flex flex-col gap-4">
            <span className="sr-only">{copy.loading}</span>
            <Skeleton className="h-10 w-48 rounded-xl" />
            <Skeleton className="h-64 w-full rounded-xl" />
          </div>
        )}

        {state.kind === 'error' && (
          <SectionError
            title={state.tooMany ? copy.tooManyTitle : undefined}
            description={state.tooMany ? copy.tooManyMessage : copy.loadError}
            onRetry={() => {
              setState({ kind: 'loading' });
              setReloadKey((k) => k + 1);
            }}
          />
        )}

        {state.kind === 'notFound' && (
          <PublicNotice headingLevel={1} icon={SearchX} title={copy.notFoundTitle} message={copy.notFoundMessage} />
        )}

        {state.kind === 'expired' && (
          <PublicNotice headingLevel={1} icon={Clock} title={copy.expiredTitle} message={copy.expiredMessage} />
        )}

        {data?.status === 'VOIDED' && (
          <PublicNotice
            headingLevel={1}
            icon={FileX}
            title={copy.voidedTitle}
            message={copy.voidedMessage(voidedDate === NO_DOCUMENT_FORMAT ? null : voidedDate)}
          />
        )}

        {certificate && data ? (
          <>
            {data.clinic ? <ClinicBrand name={data.clinic.name} logoUrl={data.clinic.logoUrl} variant="public" as="p" /> : null}
            <section className="flex flex-col gap-6 rounded-xl border border-border bg-surface p-4 sm:p-6">
              <h1 className="t-display break-words">
                {copy.title(CERTIFICATE_KIND_LABELS[certificate.kind], certificate.numberLabel)}
              </h1>
              <CertificateBody certificate={certificate} paint={paint} />
              <Button asChild className="w-full sm:w-auto sm:self-start">
                <a href={publicCertificateCopyPdfHref(token)} download>
                  <Download aria-hidden />
                  {copy.download}
                </a>
              </Button>
            </section>
            <p className="t-data text-xs text-muted">{copy.expires(paint.date(data.expiresAt))}</p>
          </>
        ) : null}
      </main>
    </div>
  );
}
