'use client';
import * as React from 'react';
import { useState } from 'react';
import { ApiError } from '@/lib/api/client';
import {
  updatePatient,
  type Patient,
  type UpdatePatientInput,
} from '@/lib/patients/patients-api';
import { FormModal } from '@/components/molecules/form-modal';
import { FormField } from '@/components/molecules/form-field';
import { Input } from '@/components/ui/input';

// Copy as constants (i18n-ready) — es first.
const copy = {
  title: 'Editar paciente',
  description: 'Corrige o completa los datos del paciente.',
  submit: 'Guardar',
  submitting: 'Guardando…',
  genericError: 'No pudimos guardar los cambios. Intenta de nuevo.',
  identification: 'Identificación',
  contact: 'Contacto',
  emergency: 'Emergencia',
  administrative: 'Administrativo',
  docType: 'Tipo de documento',
  sex: 'Sexo',
};

// Native <select> styled like the Input atom (same class/rationale as staff-view.tsx).
const fieldClass =
  'flex h-10 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:cursor-not-allowed disabled:opacity-50';

const DOC_TYPES: { value: Patient['docType']; label: string }[] = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PASSPORT', label: 'Pasaporte' },
  { value: 'OTHER', label: 'Otro' },
];

const SEXES: { value: Patient['sex']; label: string }[] = [
  { value: 'M', label: 'Masculino' },
  { value: 'F', label: 'Femenino' },
  { value: 'OTHER', label: 'Otro' },
  { value: 'UNSPECIFIED', label: 'Sin especificar' },
];

/** Campos de texto editables. El consentimiento NO está: es un hecho fechado. */
/**
 * Columnas `NOT NULL`: un vaciado se OMITE, nunca viaja como `null`. El
 * backend hoy responde 400 si igual llegara (ver `@NotNullable()` en
 * `UpdatePatientDto`), y el `required` del `<input>` lo bloquea antes en el
 * navegador — pero el tipo es la primera de las tres barreras.
 */
type RequiredTextKey = 'firstName' | 'lastName';

/** Columnas nullable: vaciarlas manda `null`, que es lo que borra el dato. */
type NullableTextKey =
  | 'docNumber' | 'birthDate' | 'phone' | 'email' | 'address' | 'notes'
  | 'emergencyContactName' | 'emergencyContactRelationship'
  | 'emergencyContactPhone' | 'guardianName' | 'guardianDocNumber'
  | 'insurerEps' | 'occupation' | 'maritalStatus' | 'physicianName'
  | 'physicianPhone';

type TextKey = RequiredTextKey | NullableTextKey;

interface TextFieldBase {
  label: string;
  type?: 'text' | 'date' | 'email' | 'tel';
}

/**
 * Unión discriminada por `required`: es lo que deja a TypeScript verificar la
 * regla de arriba en vez de confiar en un `if`. Sin esto, `buildPatch` tenía
 * que castear su resultado y el compilador no podía impedir que un `null`
 * saliera hacia una columna `NOT NULL`.
 */
type TextFieldSpec =
  | (TextFieldBase & { key: RequiredTextKey; required: true })
  | (TextFieldBase & { key: NullableTextKey; required?: false });

const GROUPS: { title: string; fields: TextFieldSpec[] }[] = [
  {
    title: copy.identification,
    fields: [
      { key: 'firstName', label: 'Nombre', required: true },
      { key: 'lastName', label: 'Apellido', required: true },
      { key: 'docNumber', label: 'Número de documento' },
      { key: 'birthDate', label: 'Fecha de nacimiento', type: 'date' },
    ],
  },
  {
    title: copy.contact,
    fields: [
      { key: 'phone', label: 'Teléfono', type: 'tel' },
      { key: 'email', label: 'Correo electrónico', type: 'email' },
      { key: 'address', label: 'Dirección' },
      { key: 'notes', label: 'Notas' },
    ],
  },
  {
    title: copy.emergency,
    fields: [
      { key: 'emergencyContactName', label: 'Contacto de emergencia' },
      { key: 'emergencyContactRelationship', label: 'Parentesco' },
      { key: 'emergencyContactPhone', label: 'Teléfono de emergencia', type: 'tel' },
      { key: 'guardianName', label: 'Acudiente' },
      { key: 'guardianDocNumber', label: 'Documento del acudiente' },
    ],
  },
  {
    title: copy.administrative,
    fields: [
      { key: 'insurerEps', label: 'Aseguradora / EPS' },
      { key: 'occupation', label: 'Ocupación' },
      { key: 'maritalStatus', label: 'Estado civil' },
      { key: 'physicianName', label: 'Médico tratante' },
      { key: 'physicianPhone', label: 'Teléfono del médico', type: 'tel' },
    ],
  },
];

type TextState = Record<TextKey, string>;

/** `birthDate` llega ISO completo y el <input type="date"> quiere YYYY-MM-DD. */
function textStateFrom(patient: Patient): TextState {
  const state = {} as TextState;
  for (const group of GROUPS) {
    for (const f of group.fields) {
      const raw = patient[f.key];
      state[f.key] =
        f.type === 'date' && raw ? String(raw).slice(0, 10) : ((raw as string | null) ?? '');
    }
  }
  return state;
}

interface PatientEditModalProps {
  open: boolean;
  patient: Patient;
  token: string;
  onOpenChange: (open: boolean) => void;
  onSaved: (patient: Patient) => void;
}

/**
 * Edición del paciente sobre `PATCH /patients/:id`. NO reusa `PatientForm`:
 * ese es de alta (llama a `createPatient` y cubre sólo los 12 básicos).
 * Es el primer lugar de la app donde se pueden cargar los administrativos.
 */
export function PatientEditModal({
  open,
  patient,
  token,
  onOpenChange,
  onSaved,
}: PatientEditModalProps) {
  const [text, setText] = useState<TextState>(() => textStateFrom(patient));
  const [docType, setDocType] = useState<Patient['docType']>(patient.docType);
  const [sex, setSex] = useState<Patient['sex']>(patient.sex);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seededPatient, setSeededPatient] = useState(patient);
  // Recuerda si `open` era true en el render anterior, para detectar la
  // transición false→true (reabrir) sin un efecto — mismo patrón de React
  // que `seededPatient` ("store information from previous renders").
  const [wasOpen, setWasOpen] = useState(open);

  // Re-sembrar al cambiar de paciente (reabrir con otro, o con el mismo tras
  // guardar) o al reabrir el modal con el mismo paciente — así una edición
  // cancelada (Cancelar cierra pero no desmonta este componente) no
  // sobrevive a un cierre. Se ajusta durante el render — no en un efecto —
  // siguiendo el patrón de React para "adjust state when a prop changes";
  // un `useEffect` aquí dispara `react-hooks/set-state-in-effect`.
  if (patient !== seededPatient || (open && !wasOpen)) {
    setSeededPatient(patient);
    setText(textStateFrom(patient));
    setDocType(patient.docType);
    setSex(patient.sex);
    setError(null);
  }
  if (open !== wasOpen) {
    setWasOpen(open);
  }

  /**
   * Sólo viaja lo que cambió respecto a `seededPatient`: sin diff, cada
   * guardado reescribía los 20 campos con el snapshot cargado al abrir la
   * página, así que el segundo de dos editores en paralelo revertía en
   * silencio los campos que el primero acababa de corregir (y bumpeaba
   * `updatedAt` aunque no hubiera cambios reales).
   *
   * - sin cambios → se omite
   * - cambiado a un valor → se manda el valor
   * - vaciado → se manda `null`, excepto para `birthDate` y los campos
   *   `required` (`firstName`/`lastName`: `NOT NULL` en el schema), que se
   *   omiten en vez de "borrarse" — ver el comentario en `TextFieldSpec`.
   */
  /**
   * Sólo viaja lo que cambió: omitido = no se toca, con valor = se escribe,
   * vaciado = `null` (borra el dato). Ya no hace falta castear el resultado:
   * `UpdatePatientDto` declara qué campos aceptan `null`, así que el
   * compilador rechaza mandarlo a una columna `NOT NULL`.
   */
  function buildPatch(): UpdatePatientInput {
    const seededText = textStateFrom(seededPatient);
    const patch: UpdatePatientInput = {};
    if (docType !== seededPatient.docType) patch.docType = docType;
    if (sex !== seededPatient.sex) patch.sex = sex;
    for (const group of GROUPS) {
      for (const f of group.fields) {
        const value = text[f.key].trim();
        if (value === seededText[f.key]) continue;
        if (f.required) {
          if (value) patch[f.key] = value;
        } else {
          patch[f.key] = value || null;
        }
      }
    }
    return patch;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const saved = await updatePatient(token, patient.id, buildPatch());
      onSaved(saved);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.genericError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={copy.title}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={saving ? copy.submitting : copy.submit}
      submitting={saving}
      error={error}
      size="lg"
    >
      <div className="flex flex-col gap-6">
        {GROUPS.map((group) => (
          <section key={group.title} className="flex flex-col gap-3">
            <h3 className="text-sm font-medium text-muted">{group.title}</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              {group.fields.map((f) => (
                <FormField key={f.key} htmlFor={`pe-${f.key}`} label={f.label}>
                  <Input
                    id={`pe-${f.key}`}
                    type={f.type ?? 'text'}
                    value={text[f.key]}
                    required={f.required}
                    onChange={(e) =>
                      setText((prev) => ({ ...prev, [f.key]: e.target.value }))
                    }
                  />
                </FormField>
              ))}

              {group.title === copy.identification && (
                <>
                  <FormField htmlFor="pe-doc-type" label={copy.docType}>
                    <select
                      id="pe-doc-type"
                      value={docType}
                      onChange={(e) => setDocType(e.target.value as Patient['docType'])}
                      className={fieldClass}
                    >
                      {DOC_TYPES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                  <FormField htmlFor="pe-sex" label={copy.sex}>
                    <select
                      id="pe-sex"
                      value={sex}
                      onChange={(e) => setSex(e.target.value as Patient['sex'])}
                      className={fieldClass}
                    >
                      {SEXES.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </FormField>
                </>
              )}
            </div>
          </section>
        ))}
      </div>
    </FormModal>
  );
}
