'use client';
import * as React from 'react';
import type { Patient } from '@/lib/patients/patients-api';
import { ageFrom } from '@/lib/patients/age';
import { formatCivilDate } from '@/lib/format/date';
import { Card, CardContent } from '@/components/ui/card';

// Copy as constants (i18n-ready) — es first, matches the rest of the app.
const copy = {
  identification: 'Identificación',
  contact: 'Contacto',
  emergency: 'Emergencia',
  administrative: 'Administrativo',
  docType: 'Tipo de documento',
  docNumber: 'Número de documento',
  birthDate: 'Fecha de nacimiento',
  sex: 'Sexo',
  phone: 'Teléfono',
  email: 'Correo electrónico',
  address: 'Dirección',
  notes: 'Notas',
  emergencyContact: 'Contacto de emergencia',
  relationship: 'Parentesco',
  emergencyPhone: 'Teléfono de emergencia',
  // DX-153: la cobertura vive en su sección; el texto libre solo se muestra
  // como dato anterior si el paciente no tiene ninguna cobertura.
  legacyInsurer: 'Aseguradora (dato anterior)',
  occupation: 'Ocupación',
  maritalStatus: 'Estado civil',
  physician: 'Médico tratante',
  physicianPhone: 'Teléfono del médico',
  consent: 'Consentimiento de datos',
  consentAccepted: 'Aceptado',
  consentPending: 'Pendiente',
  consentVersion: (v: string) => `v${v}`,
  fallback: '—',
  years: (n: number) => `${n} años`,
};

interface Field {
  label: string;
  value: string | null;
  /**
   * No cuenta para decidir si el bloque está vacío, aunque siempre produce
   * un valor (p. ej. el consentimiento, que es "Pendiente" en vez de nada).
   * Se sigue mostrando cuando el bloque sí se renderiza.
   */
  alwaysShown?: boolean;
}

/** Un bloque con sus campos; se omite entero si ninguno tiene dato. */
function Block({ title, fields }: { title: string; fields: Field[] }) {
  const withValue = fields.filter((f) => !f.alwaysShown && f.value);
  if (withValue.length === 0) return null;
  return (
    <section className="flex flex-col gap-2 border-t border-border pt-4 first:border-0 first:pt-0">
      <h3 className="text-sm font-medium text-muted">{title}</h3>
      <dl className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label}>
            <dt className="text-sm text-muted">{f.label}</dt>
            <dd className="text-ink">{f.value ?? copy.fallback}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

interface PatientDataPanelProps {
  patient: Patient;
}

/**
 * Ficha del paciente en bloques. Extraída de `patients/[id]/page.tsx`, que
 * mostraba 8 campos sueltos, para que la página vuelva a ser una cáscara
 * delgada (mismo criterio que `AgendaView`).
 *
 * Sin acción propia: «Editar» era un botón secundario alineado a la derecha
 * sobre el primer bloque, dentro de una Card sin título, colgando de nada.
 * Ahora es la acción primaria de la cabecera (`PatientRecordHeader`), donde
 * está a la vista desde cualquier pestaña.
 */
export function PatientDataPanel({ patient }: PatientDataPanelProps) {
  const age = ageFrom(patient.birthDate);
  const birth = patient.birthDate
    ? `${formatCivilDate(patient.birthDate)}${age === null ? '' : ` · ${copy.years(age)}`}`
    : null;
  // DX-153: el texto libre anterior solo sale si no hay ninguna cobertura (y se
  // omite entero, sin «—», cuando no aplica).
  const legacyInsurerFields: Field[] =
    patient.coverage?.status === 'NONE' && patient.insurerEps
      ? [{ label: copy.legacyInsurer, value: patient.insurerEps }]
      : [];
  const consent = patient.dataConsentAccepted
    ? [copy.consentAccepted, formatCivilDate(patient.dataConsentAt ?? null)]
        .concat(patient.dataConsentPolicyVersion ? [copy.consentVersion(patient.dataConsentPolicyVersion)] : [])
        .join(' · ')
    : copy.consentPending;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <Block
          title={copy.identification}
          fields={[
            { label: copy.docType, value: patient.docType },
            { label: copy.docNumber, value: patient.docNumber },
            { label: copy.birthDate, value: birth },
            { label: copy.sex, value: patient.sex },
          ]}
        />
        <Block
          title={copy.contact}
          fields={[
            { label: copy.phone, value: patient.phone },
            { label: copy.email, value: patient.email },
            { label: copy.address, value: patient.address },
            { label: copy.notes, value: patient.notes },
          ]}
        />
        <Block
          title={copy.emergency}
          fields={[
            { label: copy.emergencyContact, value: patient.emergencyContactName ?? null },
            { label: copy.relationship, value: patient.emergencyContactRelationship ?? null },
            { label: copy.emergencyPhone, value: patient.emergencyContactPhone ?? null },
            // DX-203: el acudiente vive en «Responsable y familia».
          ]}
        />
        <Block
          title={copy.administrative}
          fields={[
            ...legacyInsurerFields,
            { label: copy.occupation, value: patient.occupation ?? null },
            { label: copy.maritalStatus, value: patient.maritalStatus ?? null },
            { label: copy.physician, value: patient.physicianName ?? null },
            { label: copy.physicianPhone, value: patient.physicianPhone ?? null },
            { label: copy.consent, value: consent, alwaysShown: true },
          ]}
        />
      </CardContent>
    </Card>
  );
}
