import { ClinicFiscalLines } from '@/components/brand/clinic-fiscal-lines';
import * as React from 'react';
import type { PrescriptionDocument as PrescriptionDoc } from '@/lib/prescriptions/prescriptions-api';
import type { PrescriptionFormat } from '@/lib/prescriptions/prescription-format';
import { legacyPrescriptionLayout } from '@/lib/prescriptions/legacy-prescription-layout';
import { neutralPrescriptionLayout } from '@/lib/prescriptions/prescription-layout';

/** Lo que depende del formato de la sede y no lo tiene (R11): nunca otro formato. */
const MISSING = '—';

const copy = {
  issuedAt: 'Fecha de emisión',
  validUntil: 'Válida hasta',
  patientHeading: 'Paciente',
  patientName: 'Nombre',
  age: 'Edad',
  ageValue: (years: number) => (years === 1 ? '1 año' : `${years} años`),
  clinicalRecord: 'Nº de historia clínica',
  birthYear: 'Año de nacimiento',
  professionalHeading: 'Profesional que prescribe',
  specialty: 'Especialidad',
  contact: 'Contacto',
  medicationsHeading: 'Medicamentos',
  presentation: (form: string, route: string) => `${form} · Vía ${route.toLowerCase()}`,
  posology: (dose: string, frequency: string, days: number) =>
    `${dose}, ${frequency.toLowerCase()}, durante ${days} ${days === 1 ? 'día' : 'días'}.`,
  quantity: 'Cantidad total',
  // Cifras sin formato, también sin formato de sede (I8); las letras, solo si la foto las tiene.
  quantityValue: (n: number, words: string | null, unit: string) =>
    words === null ? `${String(n)} ${unit}` : `${String(n)} (${words}) ${unit}`,
  packages: 'Envases',
  brand: 'Marca',
  instructions: 'Indicaciones',
  notes: 'Indicaciones generales',
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
  /** El formato de la sede de la receta (`prescriptionFormat`); `null` → «—» en fechas. */
  format: PrescriptionFormat | null;
}

/**
 * La receta como DOCUMENTO para papel o PDF A4 (DX-013, DX-324): clínica y
 * sede, paciente, profesional con su registro, medicamentos con la cantidad,
 * fechas y validez, y espacio para la firma. Todo sale de la foto (R9): una
 * receta única pinta la plantilla neutral; una emitida antes de DX-324, la suya
 * congelada, con sus textos, filas y orden de entonces. Las fechas siguen el formato de la sede de la receta (R11). Papel blanco y tinta oscura
 * explícitos, también en modo oscuro.
 */
export function PrescriptionDocument({ prescription: rx, format }: PrescriptionDocumentProps) {
  const layout = legacyPrescriptionLayout(rx) ?? neutralPrescriptionLayout(rx);
  const neutral = layout.patientRows === 'neutral';
  const dateTime = (iso: string | null) =>
    format && iso ? format.fmt.dateTime(new Date(iso), format.timeZone) : MISSING;
  const civilDate = (day: string) => (format ? format.fmt.civilDate(day) : MISSING);
  const voided = rx.status === 'VOIDED';

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
            {/* DX-019: datos fiscales de la clínica (los de hoy, como el logo). */}
            <ClinicFiscalLines fiscal={rx.clinicFiscal} />
            <p className="text-sm text-[#4b5563]">
              {rx.locationName}
              {rx.locationAddress ? ` · ${rx.locationAddress}` : ''}
            </p>
          </div>
        </div>
        <div className="sm:text-right print:text-right">
          <h1 className="text-xl font-semibold tracking-tight">{layout.title}</h1>
          {layout.subtitle !== null ? (
            <p className="text-xs text-[#4b5563]">{layout.subtitle}</p>
          ) : null}
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
              dateTime(rx.voidedAt),
              rx.voidedByName ?? copy.unknownUser,
              rx.voidReason ?? '',
            )}
          </p>
        </div>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">
        <Field label={copy.issuedAt}>
          <span className="tabular-nums">{dateTime(rx.issuedAt)}</span>
        </Field>
        <Field label={layout.dispensationLabel}>
          <span className="tabular-nums">{civilDate(rx.dispensationDate)}</span>
        </Field>
        <Field label={copy.validUntil}>
          <span className="tabular-nums">{civilDate(rx.validUntil)}</span>{' '}
          <span className="text-xs font-normal text-[#4b5563]">({layout.validityNote})</span>
        </Field>
      </dl>

      <section aria-label={copy.patientHeading} className="mt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#4b5563]">
          {copy.patientHeading}
        </h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">
          <Field label={copy.patientName}>{rx.patientName}</Field>
          <Field label={layout.documentLabel}>
            <span className="tabular-nums">{rx.patientDocument ?? '—'}</span>
          </Field>
          {layout.patientRows === 'clinicalRecord' ? (
            <Field label={copy.clinicalRecord}>
              <span className="tabular-nums">{rx.clinicalRecordNumber ?? '—'}</span>
            </Field>
          ) : null}
          {layout.patientRows === 'birthYear' ? (
            <Field label={copy.birthYear}>
              <span className="tabular-nums">{rx.patientBirthYear ?? '—'}</span>
            </Field>
          ) : null}
          {/* Receta única: cada fila solo si la foto tiene el dato. */}
          {neutral && rx.patientAgeYears !== null ? (
            <Field label={copy.age}>
              <span className="tabular-nums">{copy.ageValue(rx.patientAgeYears)}</span>
            </Field>
          ) : null}
          {neutral && rx.clinicalRecordNumber !== null ? (
            <Field label={copy.clinicalRecord}>
              <span className="tabular-nums">{rx.clinicalRecordNumber}</span>
            </Field>
          ) : null}
        </dl>
      </section>

      <section aria-label={copy.medicationsHeading} className="mt-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-[#4b5563]">
          {copy.medicationsHeading}
        </h2>
        <ol className="mt-2 flex flex-col divide-y divide-[#e5e7eb] border-y border-[#e5e7eb]">
          {rx.items.map((item) => (
            <li key={item.id} className="prescription-item flex gap-3 py-3 text-sm">
              <span className="font-semibold tabular-nums">{String(item.position)}.</span>
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
                      <span className="font-medium tabular-nums">{String(item.packages)}</span>
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
        {rx.safetyRulesVersion || rx.allergyOverride || (rx.safetyAlerts?.length ?? 0) > 0 ? (
          <p className="mt-3 text-xs text-[#4b5563]">
            Avisos de seguridad revisados por el prescriptor · {rx.safetyRulesVersion ? `reglas ${rx.safetyRulesVersion}` : 'versión de reglas no disponible'}
          </p>
        ) : null}
      </section>

      <section
        aria-label={copy.professionalHeading}
        className="prescription-signature mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2"
      >
        <dl className="flex flex-col gap-2 text-sm">
          <Field label={copy.professionalHeading}>{rx.professionalName}</Field>
          <Field label={layout.licenseLabel}>
            <span className="tabular-nums">{rx.professionalLicense}</span>
          </Field>
          {neutral && rx.professionalSpecialty ? (
            <Field label={copy.specialty}>{rx.professionalSpecialty}</Field>
          ) : null}
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
