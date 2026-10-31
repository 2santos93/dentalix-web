'use client';
import * as React from 'react';
import type { Patient } from '@/lib/patients/patients-api';
import { ageFrom } from '@/lib/patients/age';
import { formatCivilDate } from '@/lib/format/date';
import { docTypeOptionLabel, type ClinicDocumentTypeNames } from '@/lib/patients/doc-type';
import { DescriptionItem, DescriptionList } from '@/components/ui/description-list';
import { SectionHeader } from '@/components/ui/section-header';
import { DATA_SECTION_CLASS } from './data-section';

// Copy as constants (i18n-ready) — es first, matches the rest of the app.
const copy = {
  identification: 'Identificación',
  contact: 'Contacto',
  emergency: 'Emergencia',
  administrative: 'Administrativo',
  docType: 'Tipo de documento',
  docTypeLabel: 'Nombre del documento',
  docNumber: 'Número de documento',
  birthDate: 'Fecha de nacimiento',
  sexLabel: 'Sexo',
  phone: 'Teléfono',
  email: 'Correo electrónico',
  address: 'Dirección',
  notes: 'Notas',
  emergencyContact: 'Contacto de emergencia',
  relationship: 'Parentesco',
  emergencyPhone: 'Teléfono de emergencia',
  occupation: 'Ocupación',
  maritalStatus: 'Estado civil',
  physician: 'Médico tratante',
  physicianPhone: 'Teléfono del médico',
  consent: 'Consentimiento de datos',
  consentAccepted: 'Aceptado',
  consentPending: 'Pendiente',
  // DX-107: importado de un archivo, nunca con autorización inventada.
  consentPendingImported: 'Pendiente · importado sin autorización: pídela en su próxima visita',
  origin: 'Origen de la ficha',
  originImported: 'Importado desde archivo',
  // La API puede traer la versión ya con su «v» («v1»): sin quitarla salía «vv1».
  consentVersion: (v: string) => `v${v.replace(/^v/i, '')}`,
  // El código del DTO no se enseña («Sexo: M»): mismas etiquetas que el formulario.
  sex: {
    M: 'Masculino',
    F: 'Femenino',
    OTHER: 'Otro',
    UNSPECIFIED: 'Sin especificar',
  } as Record<string, string>,
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
  /** Ocupa toda la fila (textos largos: el consentimiento importado). */
  wide?: boolean;
}

/** Un bloque con sus campos; se omite entero si ninguno tiene dato. */
function Block({ title, fields }: { title: string; fields: Field[] }) {
  const withValue = fields.filter((f) => !f.alwaysShown && f.value);
  if (withValue.length === 0) return null;
  return (
    // Cada bloque es una sección plana con título de verdad (`t-title`, tinta):
    // antes el título era 14px gris, igual que las etiquetas de debajo, y la
    // ficha perdía su columna vertebral tipográfica (critique-core §7).
    <section aria-label={title} className={DATA_SECTION_CLASS}>
      <SectionHeader as="h2" title={title} />
      <DescriptionList columns={3}>
        {fields.map((f) => (
          <DescriptionItem key={f.label} label={f.label} wide={f.wide}>
            {f.value ?? copy.fallback}
          </DescriptionItem>
        ))}
      </DescriptionList>
    </section>
  );
}

interface PatientDataPanelProps {
  patient: Patient;
  /** Nombres locales de la clínica (los pide la página); `{}` = genéricos. */
  docTypeNames?: ClinicDocumentTypeNames;
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
export function PatientDataPanel({ patient, docTypeNames = {} }: PatientDataPanelProps) {
  const age = ageFrom(patient.birthDate);
  const birth = patient.birthDate
    ? `${formatCivilDate(patient.birthDate)}${age === null ? '' : ` · ${copy.years(age)}`}`
    : null;
  const consent = patient.dataConsentAccepted
    ? [copy.consentAccepted, formatCivilDate(patient.dataConsentAt ?? null)]
        .concat(patient.dataConsentPolicyVersion ? [copy.consentVersion(patient.dataConsentPolicyVersion)] : [])
        .join(' · ')
    : patient.importBatchId
      ? copy.consentPendingImported
      : copy.consentPending;

  return (
    // Fragmento, no tarjeta: los bloques son hermanos de las demás secciones
    // de la pestaña («Comunicaciones», «Cobertura»…) y comparten su ritmo.
    <>
        <Block
          title={copy.identification}
          fields={[
            // El nombre de la clínica para el tipo, no el `docTypeName` del
            // DTO: ese ya prefiere la etiqueta del paciente (pre-flight M15).
            { label: copy.docType, value: docTypeOptionLabel(patient.docType, docTypeNames) },
            // R7: el nombre libre del paciente, solo si tiene uno.
            ...(patient.docTypeLabel ? [{ label: copy.docTypeLabel, value: patient.docTypeLabel }] : []),
            { label: copy.docNumber, value: patient.docNumber },
            { label: copy.birthDate, value: birth },
            { label: copy.sexLabel, value: patient.sex ? (copy.sex[patient.sex] ?? patient.sex) : null },
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
            { label: copy.occupation, value: patient.occupation ?? null },
            { label: copy.maritalStatus, value: patient.maritalStatus ?? null },
            { label: copy.physician, value: patient.physicianName ?? null },
            { label: copy.physicianPhone, value: patient.physicianPhone ?? null },
            { label: copy.consent, value: consent, alwaysShown: true, wide: !patient.dataConsentAccepted && !!patient.importBatchId },
            ...(patient.importBatchId ? [{ label: copy.origin, value: copy.originImported }] : []),
          ]}
        />
    </>
  );
}
