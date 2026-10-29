import * as React from 'react';
import { SIGNER_TYPE_LABELS, type PatientConsentDocument } from '@/lib/consents/consents-api';
import { documentText, dtoDocTypeName } from '@/lib/patients/doc-type';
import { formatDateTime } from '@/lib/format/date';

const copy = {
  patient: 'Paciente',
  document: 'Documento',
  noDocument: '—',
  signedAt: 'Firmado el',
  signaturesHeading: 'Firmas',
  professional: 'Profesional',
  signerRole: (type: string, doc: string | null) => (doc ? `${type} · ${doc}` : type),
  patientSignatureAlt: (name: string) => `Firma de ${name}`,
  professionalSignatureAlt: (name: string) => `Firma de ${name}`,
  footerSignedAt: 'Fecha y hora de la firma (servidor)',
  footerHash: 'Huella SHA-256 del documento',
  footerVersion: (v: number) => `Plantilla, versión ${v}`,
  tampered:
    'La huella no coincide con el contenido guardado: este documento pudo alterarse fuera de Dentalix.',
};

interface ConsentDocumentProps {
  consent: PatientConsentDocument;
}

/**
 * El consentimiento firmado como DOCUMENTO para papel o PDF (DX-006): cabecera
 * de la clínica, datos del paciente, el texto tal como se firmó, las dos
 * firmas y la fecha. Al pie, la hora del servidor y la huella SHA-256, que es
 * lo que permite comprobar después que nada cambió.
 *
 * Misma excepción de fidelidad de impresión que el estado de cuenta: papel
 * blanco y tinta oscura explícitos, también en modo oscuro.
 */
export function ConsentDocument({ consent }: ConsentDocumentProps) {
  const { clinic, patient } = consent;
  const patientName = `${patient.firstName} ${patient.lastName}`;

  return (
    <article className="consent-print-root mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:max-w-none print:p-0">
      <header
        data-testid="consent-header"
        className="flex flex-col gap-4 border-b border-[#d1d5db] pb-4 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="flex items-center gap-3">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo del tenant con host arbitrario, para imprimir; next/image no aporta nada aquí
            <img
              src={clinic.logoUrl}
              alt={clinic.name}
              referrerPolicy="no-referrer"
              className="h-12 w-auto max-w-[160px] object-contain"
            />
          ) : null}
          <div>
            <p className="text-base font-semibold">{clinic.name}</p>
            <h1 className="text-xl font-semibold tracking-tight">{consent.title}</h1>
          </div>
        </div>
        <p className="text-sm text-[#4b5563] sm:text-right">
          {copy.signedAt}
          <br />
          <span className="font-medium text-[#111827] tabular-nums">
            {formatDateTime(consent.signedAt)}
          </span>
        </p>
      </header>

      <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium text-[#6b7280]">{copy.patient}</dt>
          <dd className="font-medium">{patientName}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium text-[#6b7280]">{copy.document}</dt>
          <dd className="tabular-nums">
            {documentText(dtoDocTypeName(patient), patient.docNumber) ?? copy.noDocument}
          </dd>
        </div>
      </dl>

      <div className="mt-6 whitespace-pre-line text-[0.9375rem] leading-relaxed">
        {consent.body}
      </div>

      <section aria-label={copy.signaturesHeading} className="consent-signatures mt-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 print:grid-cols-2">
          <figure className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL de la firma; next/image no la optimiza */}
            <img
              src={consent.patientSignature}
              alt={copy.patientSignatureAlt(consent.signerName)}
              className="h-28 w-full object-contain object-left-bottom"
            />
            <figcaption className="border-t border-[#111827] pt-2 text-sm">
              <span className="block font-medium">{consent.signerName}</span>
              <span className="text-[#4b5563]">
                {copy.signerRole(SIGNER_TYPE_LABELS[consent.signerType], consent.signerDocument)}
              </span>
            </figcaption>
          </figure>
          <figure className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URL de la firma; next/image no la optimiza */}
            <img
              src={consent.professionalSignature}
              alt={copy.professionalSignatureAlt(consent.professionalName)}
              className="h-28 w-full object-contain object-left-bottom"
            />
            <figcaption className="border-t border-[#111827] pt-2 text-sm">
              <span className="block font-medium">{consent.professionalName}</span>
              <span className="text-[#4b5563]">{copy.professional}</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <footer className="mt-10 flex flex-col gap-2 border-t border-[#d1d5db] pt-4 text-xs text-[#4b5563]">
        {!consent.integrityOk ? (
          <p className="font-medium text-[#be123c]">{copy.tampered}</p>
        ) : null}
        <p>
          {copy.footerSignedAt}:{' '}
          <span className="tabular-nums text-[#111827]">{formatDateTime(consent.signedAt)}</span> ·{' '}
          {copy.footerVersion(consent.templateVersion)}
        </p>
        <p>
          {copy.footerHash}:{' '}
          <span className="break-all font-mono text-[#111827]">{consent.contentHash}</span>
        </p>
      </footer>
    </article>
  );
}
