import * as React from 'react';
import type { PrescriptionDocument as PrescriptionDoc } from '@/lib/prescriptions/prescriptions-api';
import { formatCivilDate, formatDateTime } from '@/lib/format/date';

const copy = {
  title: { CO: 'Fórmula médica', ES: 'Receta médica privada' },
  legalBasis: {
    CO: 'Decreto 780 de 2016, art. 2.5.3.10.16',
    ES: 'Real Decreto 1718/2010, art. 3',
  },
  issuedAt: 'Fecha de emisión',
  dispensation: { CO: 'Fecha de la receta', ES: 'Fecha prevista de dispensación' },
  validUntil: 'Válida hasta',
  validityNote: { CO: '30 días naturales', ES: '10 días naturales' },
  patientHeading: 'Paciente',
  patientName: 'Nombre',
  document: { CO: 'Documento', ES: 'DNI/NIE' },
  clinicalRecord: 'Nº de historia clínica',
  birthYear: 'Año de nacimiento',
  professionalHeading: 'Profesional que prescribe',
  license: { CO: 'Registro profesional', ES: 'Nº de colegiado' },
  contact: 'Contacto',
  medicationsHeading: 'Medicamentos',
  presentation: (form: string, route: string) => `${form} · Vía ${route.toLowerCase()}`,
  posology: (dose: string, frequency: string, days: number) =>
    `${dose}, ${frequency.toLowerCase()}, durante ${days} ${days === 1 ? 'día' : 'días'}.`,
  quantity: 'Cantidad total',
  // TODO(T7): la cantidad sin letras de la receta única.
  quantityValue: (n: number, words: string | null, unit: string) =>
    words === null ? `${n} ${unit}` : `${n} (${words}) ${unit}`,
  packages: 'Envases',
  brand: 'Marca',
  instructions: 'Indicaciones',
  notes: 'Indicaciones generales',
  allergyNote: (detail: string) =>
    `El profesional confirmó la prescripción conociendo la alergia registrada a: ${detail}.`,
  safetyHeading: 'Avisos de seguridad confirmados',
  safetyIntro: 'El profesional emitió la receta conociendo estos avisos:',
  safetyReason: 'Motivo',
  signature: 'Firma del profesional',
  voided: 'RECETA ANULADA',
  voidedDetail: (when: string, who: string, reason: string) =>
    `Anulada el ${when} por ${who}. Motivo: ${reason}. No es válida para dispensar.`,
  unknownUser: 'un usuario',
  footerHash: 'Huella SHA-256 del contenido emitido',
  tampered:
    'La huella no coincide con el contenido guardado: esta receta pudo alterarse fuera de Dentalix.',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-medium text-[#6b7280]">{label}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

interface PrescriptionDocumentProps {
  prescription: PrescriptionDoc;
}

/**
 * La receta como DOCUMENTO para papel o PDF A4 (DX-013): clínica y sede,
 * paciente, profesional con su registro / nº de colegiado, medicamentos con la
 * cantidad en números y letras, fechas y validez, y espacio para la firma. Los
 * campos siguen el país con el que se emitió (CO o ES), que queda congelado en
 * la receta. Papel blanco y tinta oscura explícitos, también en modo oscuro.
 */
export function PrescriptionDocument({ prescription: rx }: PrescriptionDocumentProps) {
  // TODO(T7): plantilla legada o neutral y formato de la sede de la receta.
  const country = rx.country ?? 'CO';
  const voided = rx.status === 'VOIDED';
  const confirmedAlerts = (rx.safetyAlerts ?? []).filter((a) => a.severity === 'BLOCKING');

  return (
    <article className="prescription-print-root relative mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:max-w-none print:p-0">
      <header className="flex flex-col gap-4 border-b border-[#d1d5db] pb-4 sm:flex-row sm:items-start sm:justify-between print:flex-row">
        <div className="flex items-center gap-3">
          {rx.clinicLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo del tenant con host arbitrario, para imprimir; next/image no aporta nada aquí
            <img
              src={rx.clinicLogoUrl}
              alt={rx.clinicName}
              referrerPolicy="no-referrer"
              className="h-12 w-auto max-w-[160px] object-contain"
            />
          ) : null}
          <div>
            <p className="text-base font-semibold">{rx.clinicName}</p>
            <p className="text-sm text-[#4b5563]">
              {rx.locationName}
              {rx.locationAddress ? ` · ${rx.locationAddress}` : ''}
            </p>
          </div>
        </div>
        <div className="sm:text-right print:text-right">
          <h1 className="text-xl font-semibold tracking-tight">{copy.title[country]}</h1>
          <p className="text-xs text-[#4b5563]">{copy.legalBasis[country]}</p>
        </div>
      </header>

      {voided ? (
        <div
          role="note"
          className="mt-4 rounded-md border-2 border-[#be123c] px-4 py-3 text-[#be123c]"
        >
          <p className="text-base font-bold tracking-wide">{copy.voided}</p>
          <p className="text-sm">
            {copy.voidedDetail(
              formatDateTime(rx.voidedAt),
              rx.voidedByName ?? copy.unknownUser,
              rx.voidReason ?? '',
            )}
          </p>
        </div>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">
        <Field label={copy.issuedAt}>
          <span className="tabular-nums">{formatDateTime(rx.issuedAt)}</span>
        </Field>
        <Field label={copy.dispensation[country]}>
          <span className="tabular-nums">{formatCivilDate(rx.dispensationDate)}</span>
        </Field>
        <Field label={copy.validUntil}>
          <span className="tabular-nums">{formatCivilDate(rx.validUntil)}</span>{' '}
          <span className="text-xs font-normal text-[#4b5563]">({copy.validityNote[country]})</span>
        </Field>
      </dl>

      <section aria-label={copy.patientHeading} className="mt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#4b5563]">
          {copy.patientHeading}
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">
          <Field label={copy.patientName}>{rx.patientName}</Field>
          <Field label={copy.document[country]}>
            <span className="tabular-nums">{rx.patientDocument ?? '—'}</span>
          </Field>
          {country === 'CO' ? (
            <Field label={copy.clinicalRecord}>
              <span className="tabular-nums">{rx.clinicalRecordNumber ?? '—'}</span>
            </Field>
          ) : (
            <Field label={copy.birthYear}>
              <span className="tabular-nums">{rx.patientBirthYear ?? '—'}</span>
            </Field>
          )}
        </dl>
      </section>

      <section aria-label={copy.medicationsHeading} className="mt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#4b5563]">
          {copy.medicationsHeading}
        </h2>
        <ol className="mt-2 flex flex-col divide-y divide-[#e5e7eb] border-y border-[#e5e7eb]">
          {rx.items.map((item) => (
            <li key={item.id} className="prescription-item flex gap-3 py-3 text-sm">
              <span className="font-semibold tabular-nums">{item.position}.</span>
              <div className={voided ? 'line-through decoration-[#be123c]' : undefined}>
                <p className="text-base font-semibold">
                  {item.activeIngredient} {item.concentration}
                </p>
                <p className="text-[#374151]">
                  {copy.presentation(item.pharmaceuticalForm, item.route)}
                  {item.brandName ? ` · ${copy.brand}: ${item.brandName}` : ''}
                </p>
                <p>{copy.posology(item.dose, item.frequency, item.durationDays)}</p>
                <p>
                  <span className="text-[#4b5563]">{copy.quantity}:</span>{' '}
                  <span className="font-medium tabular-nums">
                    {copy.quantityValue(item.totalQuantity, item.quantityInWords, item.quantityUnit)}
                  </span>
                  {item.packages !== null ? (
                    <>
                      {' · '}
                      <span className="text-[#4b5563]">{copy.packages}:</span>{' '}
                      <span className="font-medium tabular-nums">{item.packages}</span>
                    </>
                  ) : null}
                </p>
                {item.instructions ? (
                  <p>
                    <span className="text-[#4b5563]">{copy.instructions}:</span> {item.instructions}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
        {rx.notes ? (
          <p className="mt-3 text-sm">
            <span className="text-[#4b5563]">{copy.notes}:</span> {rx.notes}
          </p>
        ) : null}
        {/* DX-300: avisos bloqueantes confirmados y su motivo (sellados en el hash). */}
        {confirmedAlerts.length > 0 ? (
          <section
            aria-label={copy.safetyHeading}
            className="mt-3 break-inside-avoid rounded border border-[#f59e0b] p-3 text-xs text-[#92400e]"
          >
            <h3 className="font-semibold">{copy.safetyHeading}</h3>
            <p className="mt-1">{copy.safetyIntro}</p>
            <ul className="mt-1 list-disc pl-4">
              {confirmedAlerts.map((alert, i) => (
                <li key={`${alert.code}-${i}`} className="break-words">
                  {alert.message}
                </li>
              ))}
            </ul>
            {rx.safetyOverrideReason ? (
              <p className="mt-1 break-words">
                <span className="font-semibold">{copy.safetyReason}:</span> {rx.safetyOverrideReason}
              </p>
            ) : null}
          </section>
        ) : null}
        {/* Recetas anteriores a DX-300: la nota de alergia de DX-013. */}
        {rx.allergyOverride && rx.safetyAlerts === null ? (
          <p className="mt-2 text-xs text-[#92400e]">
            {copy.allergyNote(
              rx.allergyMatches.map((m) => `${m.allergen} (${m.activeIngredient})`).join(', '),
            )}
          </p>
        ) : null}
      </section>

      <section
        aria-label={copy.professionalHeading}
        className="prescription-signature mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2"
      >
        <dl className="flex flex-col gap-2 text-sm">
          <Field label={copy.professionalHeading}>{rx.professionalName}</Field>
          <Field label={copy.license[country]}>
            <span className="tabular-nums">{rx.professionalLicense}</span>
          </Field>
          {rx.professionalEmail ? (
            <Field label={copy.contact}>{rx.professionalEmail}</Field>
          ) : null}
        </dl>
        <div className="flex flex-col justify-end">
          <div className="h-16" />
          <p className="border-t border-[#111827] pt-2 text-sm">{copy.signature}</p>
        </div>
      </section>

      <footer className="mt-6 flex flex-col gap-1 border-t border-[#d1d5db] pt-3 text-xs text-[#4b5563]">
        {!rx.integrityOk ? <p className="font-medium text-[#be123c]">{copy.tampered}</p> : null}
        <p>
          {copy.footerHash}:{' '}
          <span className="break-all font-mono text-[#111827]">{rx.contentHash}</span>
        </p>
      </footer>
    </article>
  );
}
