'use client';
import * as React from 'react';
import { Pencil } from 'lucide-react';
import type { Patient } from '@/lib/patients/patients-api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

// Copy as constants (i18n-ready) — es first, matches the rest of the app.
const copy = {
  edit: 'Editar',
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
  guardian: 'Acudiente',
  guardianDoc: 'Documento del acudiente',
  insurer: 'Aseguradora / EPS',
  occupation: 'Ocupación',
  maritalStatus: 'Estado civil',
  physician: 'Médico tratante',
  physicianPhone: 'Teléfono del médico',
  consent: 'Consentimiento de datos',
  consentAccepted: 'Aceptado',
  consentPending: 'Pendiente',
  fallback: '—',
  years: (n: number) => `${n} años`,
};

/** Edad en años cumplidos; `null` si no hay fecha de nacimiento. */
function ageFrom(birthDate: string | null): number | null {
  if (!birthDate) return null;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const monthDiff = now.getMonth() - born.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
}

function formatDate(iso: string | null): string {
  if (!iso) return copy.fallback;
  return new Date(iso).toLocaleDateString('es');
}

interface Field {
  label: string;
  value: string | null;
}

/** Un bloque con sus campos; se omite entero si ninguno tiene dato. */
function Block({ title, fields }: { title: string; fields: Field[] }) {
  const withValue = fields.filter((f) => f.value);
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
  onEdit: () => void;
}

/**
 * Ficha del paciente en bloques. Extraída de `patients/[id]/page.tsx`, que
 * mostraba 8 campos sueltos, para que la página vuelva a ser una cáscara
 * delgada (mismo criterio que `AgendaView`).
 */
export function PatientDataPanel({ patient, onEdit }: PatientDataPanelProps) {
  const age = ageFrom(patient.birthDate);
  const birth = patient.birthDate
    ? `${formatDate(patient.birthDate)}${age === null ? '' : ` · ${copy.years(age)}`}`
    : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-4 p-6">
        <div className="flex justify-end">
          <Button type="button" variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="size-4" /> {copy.edit}
          </Button>
        </div>

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
            { label: copy.guardian, value: patient.guardianName ?? null },
            { label: copy.guardianDoc, value: patient.guardianDocNumber ?? null },
          ]}
        />
        <Block
          title={copy.administrative}
          fields={[
            { label: copy.insurer, value: patient.insurerEps ?? null },
            { label: copy.occupation, value: patient.occupation ?? null },
            { label: copy.maritalStatus, value: patient.maritalStatus ?? null },
            { label: copy.physician, value: patient.physicianName ?? null },
            { label: copy.physicianPhone, value: patient.physicianPhone ?? null },
            {
              label: copy.consent,
              value: patient.dataConsentAccepted
                ? `${copy.consentAccepted} · ${formatDate(patient.dataConsentAt ?? null)}`
                : copy.consentPending,
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
