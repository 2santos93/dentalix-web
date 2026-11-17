import * as React from 'react';
import { taxIdLine } from '@/lib/clinic/clinic-settings-api';
import { labOrderNumberLabel, type LabOrderPrint } from '@/lib/lab-orders/lab-orders-api';
import type { SedePainters } from '@/lib/locations/sede-stamp';

export const labOrderDocumentCopy = {
  title: 'Orden de laboratorio dental',
  subtitle: 'Prescripción de producto sanitario a medida',
  number: 'Orden',
  replaces: (n: string) => `Corrige la orden ${n}`,
  createdOn: 'Fecha de la orden',
  sentOn: 'Enviada',
  dueOn: 'Fecha prometida',
  noDue: 'Sin fecha',
  notSent: 'Sin enviar',
  labHeading: 'Laboratorio',
  lab: 'Laboratorio',
  service: 'Servicio',
  patientHeading: 'Paciente',
  patientName: 'Nombre',
  document: 'Documento',
  age: 'Edad',
  ageValue: (years: number) => (years === 1 ? '1 año' : `${years} años`),
  birthDate: 'Fecha de nacimiento',
  professionalHeading: 'Profesional que prescribe',
  license: 'N.º de registro profesional',
  specialty: 'Especialidad',
  workHeading: 'Trabajo',
  work: 'Descripción',
  teeth: 'Dientes (FDI)',
  shade: 'Color o tono',
  material: 'Material',
  instructions: 'Instrucciones',
  none: '—',
  healthRegistration: (n: string) => `Registro sanitario ${n}`,
  signature: 'Firma y sello del profesional',
  cancelled: 'ORDEN ANULADA',
  cancelledDetail: (when: string, reason: string) => `Anulada el ${when}. Motivo: ${reason}. No es válida.`,
  printedAt: (when: string) => `Impresa el ${when}`,
};

const copy = labOrderDocumentCopy;

function Field({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-full' : undefined}>
      <dt className="text-xs font-medium text-[#4b5563]">{label}</dt>
      <dd className="font-medium [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

interface LabOrderDocumentProps {
  data: LabOrderPrint;
  /** Fechas con el formato de la sede de la orden; sin él, «—». */
  stamp: SedePainters;
}

/**
 * La orden de laboratorio como DOCUMENTO A4 (DX-017): la prescripción escrita
 * del producto a medida, con la clínica y la sede, el profesional y su n.º de
 * registro, el paciente, los dientes, el color, el material, las instrucciones
 * y la fecha prometida. Papel blanco y tinta oscura explícitos, también con el
 * tema oscuro.
 */
export function LabOrderDocument({ data, stamp }: LabOrderDocumentProps) {
  const { order, clinic, location, professional, patient } = data;
  const loc = order.locationId;
  const cancelled = order.status === 'CANCELLED';
  const fiscal = [clinic.legalName, clinic.taxId ? taxIdLine(clinic.taxId, clinic.taxIdLabel) : null].filter(
    (v): v is string => Boolean(v),
  );
  const clinicContact = [clinic.phone, clinic.email].filter((v): v is string => Boolean(v));
  const locationLine = [location.name, location.address, location.phone].filter((v): v is string => Boolean(v));

  return (
    <article className="lab-order-print-root relative mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:max-w-none print:p-0">
      <header className="flex flex-col gap-4 border-b border-[#d1d5db] pb-4 sm:flex-row sm:items-start sm:justify-between print:flex-row">
        <div className="flex min-w-0 items-center gap-3">
          {clinic.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo del tenant con host arbitrario, para imprimir; next/image no aporta nada aquí
            <img
              src={clinic.logoUrl}
              alt={clinic.name}
              referrerPolicy="no-referrer"
              className="h-12 w-auto max-w-[160px] object-contain"
            />
          ) : null}
          <div className="min-w-0 [overflow-wrap:anywhere]">
            <p className="text-base font-semibold">{clinic.name}</p>
            {fiscal.length > 0 ? <p className="text-xs text-[#4b5563]">{fiscal.join(' · ')}</p> : null}
            {clinicContact.length > 0 ? <p className="text-xs text-[#4b5563]">{clinicContact.join(' · ')}</p> : null}
            <p className="text-sm text-[#4b5563]">{locationLine.join(' · ')}</p>
            {location.healthRegistrationNumber ? (
              <p className="text-xs text-[#4b5563]">{copy.healthRegistration(location.healthRegistrationNumber)}</p>
            ) : null}
          </div>
        </div>
        <div className="sm:shrink-0 sm:text-right print:shrink-0 print:text-right">
          <h1 className="text-xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-xs text-[#4b5563]">{copy.subtitle}</p>
          <p className="mt-1 text-sm font-semibold tabular-nums">
            {copy.number} {labOrderNumberLabel(order.number)}
          </p>
          {order.replacesOrder ? (
            <p className="text-sm font-medium">{copy.replaces(labOrderNumberLabel(order.replacesOrder.number))}</p>
          ) : null}
        </div>
      </header>

      {cancelled ? (
        <div role="note" className="mt-4 rounded-md border-2 border-[#be123c] px-4 py-3 text-[#be123c]">
          <p className="text-base font-bold tracking-wide">{copy.cancelled}</p>
          <p className="text-sm">{copy.cancelledDetail(stamp.dateTime(order.cancelledAt, loc), order.cancelReason ?? '')}</p>
        </div>
      ) : null}

      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">
        <Field label={copy.createdOn}>
          <span className="tabular-nums">{stamp.date(order.createdAt, loc)}</span>
        </Field>
        <Field label={copy.sentOn}>
          <span className="tabular-nums">{order.sentAt ? stamp.date(order.sentAt, loc) : copy.notSent}</span>
        </Field>
        <Field label={copy.dueOn}>
          <span className="tabular-nums">{order.dueOn ? stamp.civilDate(order.dueOn, loc) : copy.noDue}</span>
        </Field>
      </dl>

      <section aria-label={copy.labHeading} className="mt-5">
        <h2 className="text-sm font-semibold text-[#4b5563]">{copy.labHeading}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">
          <Field label={copy.lab}>{order.lab.name}</Field>
          <Field label={copy.service}>{order.service?.name ?? copy.none}</Field>
        </dl>
      </section>

      <section aria-label={copy.patientHeading} className="mt-5">
        <h2 className="text-sm font-semibold text-[#4b5563]">{copy.patientHeading}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">
          <Field label={copy.patientName}>{patient.fullName}</Field>
          <Field label={copy.document}>
            <span className="tabular-nums">{patient.document ?? copy.none}</span>
          </Field>
          <Field label={patient.ageYears !== null ? copy.age : copy.birthDate}>
            <span className="tabular-nums">
              {patient.ageYears !== null
                ? copy.ageValue(patient.ageYears)
                : patient.birthDate
                  ? stamp.civilDate(patient.birthDate, loc)
                  : copy.none}
            </span>
          </Field>
        </dl>
      </section>

      <section aria-label={copy.professionalHeading} className="mt-5">
        <h2 className="text-sm font-semibold text-[#4b5563]">{copy.professionalHeading}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">
          <Field label={copy.patientName}>{professional.fullName}</Field>
          <Field label={copy.license}>
            <span className="tabular-nums">{professional.license ?? copy.none}</span>
          </Field>
          {professional.specialty ? <Field label={copy.specialty}>{professional.specialty}</Field> : null}
        </dl>
      </section>

      <section aria-label={copy.workHeading} className="lab-order-work mt-5">
        <h2 className="text-sm font-semibold text-[#4b5563]">{copy.workHeading}</h2>
        <dl className="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">
          <Field label={copy.work} wide>
            {order.description}
          </Field>
          <Field label={copy.teeth}>
            <span className="tabular-nums">{order.toothNumbers.length > 0 ? order.toothNumbers.join(', ') : copy.none}</span>
          </Field>
          <Field label={copy.shade}>{order.shade ?? copy.none}</Field>
          <Field label={copy.material}>{order.material ?? copy.none}</Field>
          <Field label={copy.instructions} wide>
            <span className="whitespace-pre-line font-normal">{order.instructions ?? copy.none}</span>
          </Field>
        </dl>
      </section>

      <footer className="lab-order-signature mt-10 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between print:flex-row print:items-end print:justify-between">
        <div className="w-full max-w-[80mm]">
          <div className="h-16 border-b border-[#111827]" />
          <p className="mt-1 text-xs text-[#4b5563]">{copy.signature}</p>
          <p className="text-sm font-medium">{professional.fullName}</p>
          {professional.license ? <p className="text-xs tabular-nums text-[#4b5563]">{professional.license}</p> : null}
        </div>
        <p className="text-xs tabular-nums text-[#4b5563]">{copy.printedAt(stamp.dateTime(data.printedAt, loc))}</p>
      </footer>
    </article>
  );
}
