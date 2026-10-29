'use client';
import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createPatient,
  type CreatePatientInput,
  type DocType,
  type Sex,
} from '@/lib/patients/patients-api';
import { Wizard, WizardNav, type WizardStep } from '@/components/ui/wizard';
import { ClinicalHistoryFields } from '@/components/clinical/clinical-history-fields';
import { Input } from '@/components/ui/input';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import {
  DOC_TYPES,
  docTypeLabelTooLong,
  docTypeOptionLabel,
  normalizeDocTypeLabel,
} from '@/lib/patients/doc-type';
import { DocTypeLabelField, docTypeLabelFieldCopy } from './doc-type-label-field';
import { useDocumentTypeNames } from '@/lib/patients/use-document-type-names';
import type { ClinicalHistoryValue } from '@/lib/clinical/clinical-types';
import {
  EMPTY_SELECTION,
  decisionsFromSelection,
  type PrivacyPolicyVersion,
} from '@/lib/data-consents/data-consents-api';
import { PatientConsentStep } from '@/components/data-consents/patient-consent-step';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  firstNameLabel: 'Nombre',
  lastNameLabel: 'Apellido',
  docTypeLabel: 'Tipo de documento',
  docTypePlaceholder: 'Elige el tipo',
  docTypeRequired: 'Elige el tipo de documento.',
  firstNameRequired: 'Escribe el nombre.',
  lastNameRequired: 'Escribe el apellido.',
  docNumberLabel: 'Número de documento',
  birthDateLabel: 'Fecha de nacimiento',
  sexLabel: 'Sexo',
  phoneLabel: 'Teléfono',
  emailLabel: 'Correo electrónico',
  addressLabel: 'Dirección',
  notesLabel: 'Notas',
  requiredError: 'Nombre, apellido y tipo de documento son obligatorios para continuar.',
  summaryTitle: 'Resumen de la historia clínica',
  summaryAllergies: (n: number) => `Alergias registradas: ${n}`,
  summaryConditions: (n: number) => `Condiciones marcadas: ${n}`,
  summaryMedications: (n: number) => `Medicamentos registrados: ${n}`,
  noClinicalHistoryNote:
    'La historia clínica (antecedentes, alergias, medicamentos y hábitos) la completará el equipo clínico desde la ficha del paciente.',
  submitLabel: 'Guardar',
  genericError: 'No pudimos crear el paciente. Intenta de nuevo.',
};

const STEPS: WizardStep[] = [
  { key: 'datos', label: 'Datos' },
  { key: 'antecedentes', label: 'Antecedentes' },
  { key: 'alergias', label: 'Alergias y medicamentos' },
  { key: 'habitos', label: 'Hábitos' },
  { key: 'consentimiento', label: 'Autorización de datos' },
];

/** Pasos que escriben la anamnesis v1: solo para roles clínicos (SEC-005). */
const CLINICAL_STEP_KEYS = new Set(['antecedentes', 'alergias', 'habitos']);

const sexOptions: { value: Sex; label: string }[] = [
  { value: 'UNSPECIFIED', label: 'Sin especificar' },
  { value: 'F', label: 'Femenino' },
  { value: 'M', label: 'Masculino' },
  { value: 'OTHER', label: 'Otro' },
];

/** Campos del paso 1 con error propio, en el orden del formulario. */
const CHECKED_FIELDS = ['firstName', 'lastName', 'docType', 'docTypeLabel'] as const;
type CheckedField = (typeof CHECKED_FIELDS)[number];
type MissingFields = Partial<Record<CheckedField, string>>;

/** `aria-invalid`/`aria-describedby` de un control con su error. */
function invalidProps(id: string, error: string | undefined) {
  return error ? { 'aria-invalid': true as const, 'aria-describedby': fieldErrorId(id) } : {};
}

/** True when `history` carries any data worth persisting — used to omit an empty `medicalHistory` from the create payload. */
function historyHasContent(history: ClinicalHistoryValue): boolean {
  return Boolean(
    (history.allergies && history.allergies.length > 0) ||
      (history.conditions && history.conditions.length > 0) ||
      (history.medications && history.medications.length > 0) ||
      (history.habits && Object.keys(history.habits).length > 0) ||
      history.embarazo ||
      history.semanasEmbarazo !== undefined ||
      (history.familyHistory && history.familyHistory.trim() !== '') ||
      (history.notes && history.notes.trim() !== ''),
  );
}

interface PatientCreateWizardProps {
  token: string;
  /**
   * Si quien da de alta puede escribir historia clínica (`CLINICAL_ROLES`).
   * Sin permiso (recepción) el alta no muestra los pasos de anamnesis ni
   * envía `medicalHistory`: la API lo rechazaría con 403.
   */
  canWriteClinicalHistory: boolean;
}

/** Multi-step alta: datos básicos + historia clínica estructurada + consentimiento, en un solo submit. */
export function PatientCreateWizard({ token, canWriteClinicalHistory }: PatientCreateWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const steps = canWriteClinicalHistory
    ? STEPS
    : STEPS.filter((s) => !CLINICAL_STEP_KEYS.has(s.key));
  const stepKey = steps[step]?.key;

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // DX-327 (R10): sin tipo propuesto; quien da de alta lo elige.
  const [docType, setDocType] = useState<DocType | ''>('');
  const [missing, setMissing] = useState<MissingFields>({});
  const docTypeNames = useDocumentTypeNames(token);
  const firstNameRef = React.useRef<HTMLInputElement>(null);
  const lastNameRef = React.useRef<HTMLInputElement>(null);
  const docTypeRef = React.useRef<HTMLSelectElement>(null);
  const [docTypeLabel, setDocTypeLabel] = useState('');
  const docTypeLabelRef = React.useRef<HTMLInputElement>(null);
  // Cada petición es un objeto nuevo: el efecto enfoca aunque se repita el campo.
  const [focusRequest, setFocusRequest] = useState<{ field: CheckedField } | null>(null);
  React.useEffect(() => {
    if (!focusRequest) return;
    const refs = {
      firstName: firstNameRef,
      lastName: lastNameRef,
      docType: docTypeRef,
      docTypeLabel: docTypeLabelRef,
    };
    refs[focusRequest.field].current?.focus();
  }, [focusRequest]);
  const [docNumber, setDocNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<Sex>('UNSPECIFIED');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [history, setHistory] = useState<ClinicalHistoryValue>({});

  // Autorización Ley 1581 (DX-037): ninguna casilla empieza marcada.
  const [consentSelection, setConsentSelection] = useState(EMPTY_SELECTION);
  const [consentPolicy, setConsentPolicy] = useState<PrivacyPolicyVersion | null>(null);

  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isBasicInfoValid =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    docType !== '' &&
    !docTypeLabelTooLong(docTypeLabel);

  /** Marca lo que falta o sobra y lleva el foco al primer campo con error. */
  function flagMissingBasics() {
    const found: MissingFields = {
      ...(!firstName.trim() ? { firstName: copy.firstNameRequired } : {}),
      ...(!lastName.trim() ? { lastName: copy.lastNameRequired } : {}),
      ...(docType === '' ? { docType: copy.docTypeRequired } : {}),
      ...(docTypeLabelTooLong(docTypeLabel) ? { docTypeLabel: docTypeLabelFieldCopy.tooLong } : {}),
    };
    const missingRequired = Boolean(found.firstName || found.lastName || found.docType);
    setValidationError(missingRequired ? copy.requiredError : null);
    setMissing(found);
    // Tras el render: si se vuelve al paso 1 desde otro, el campo aún no existe.
    const firstInvalid = CHECKED_FIELDS.find((f) => found[f]);
    if (firstInvalid) setFocusRequest({ field: firstInvalid });
  }

  /** Quita el error de un campo al corregirlo. */
  function clearMissing(field: CheckedField) {
    setMissing((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function goToStep(next: number) {
    // Step 1 (Datos) is required — block moving forward off of it without
    // nombre/apellido/tipo de documento. Steps 2-5 are free to jump between.
    if (step === 0 && next > step && !isBasicInfoValid) {
      flagMissingBasics();
      return;
    }
    setValidationError(null);
    setStep(next);
  }

  async function handleSubmit() {
    if (!isBasicInfoValid) {
      setStep(0);
      flagMissingBasics();
      return;
    }
    setValidationError(null);
    setError(null);
    setSubmitting(true);
    try {
      // Solo lo marcado es una decisión; sin casillas marcadas no se registra
      // ninguna autorización (el silencio no autoriza).
      const decisions = decisionsFromSelection(consentSelection);
      const label = normalizeDocTypeLabel(docTypeLabel);
      const input: CreatePatientInput = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        docType,
        ...(label ? { docTypeLabel: label } : {}),
        sex,
        ...(docNumber.trim() ? { docNumber: docNumber.trim() } : {}),
        ...(birthDate ? { birthDate: new Date(birthDate).toISOString() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
        // `CreatePatientInput.medicalHistory` is typed as
        // `ClinicalHistoryValue` (patients-api.ts overrides the generated
        // field, whose nested shape Swagger can't introspect), so `history`
        // is assignable as-is — no cast.
        ...(canWriteClinicalHistory && historyHasContent(history)
          ? { medicalHistory: history }
          : {}),
        ...(consentPolicy && decisions.length > 0
          ? { dataConsents: { policyVersionId: consentPolicy.id, decisions } }
          : {}),
      };
      const created = await createPatient(token, input);
      router.push(`/patients/${created.id}`);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Wizard steps={steps} current={step} onStepChange={goToStep}>
        {stepKey === 'datos' && (
          <div className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField htmlFor="pcw-first-name" label={copy.firstNameLabel} error={missing.firstName}>
                <Input
                  ref={firstNameRef}
                  id="pcw-first-name"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  required
                  value={firstName}
                  onChange={(e) => {
                    setFirstName(e.target.value);
                    clearMissing('firstName');
                  }}
                  {...invalidProps('pcw-first-name', missing.firstName)}
                />
              </FormField>
              <FormField htmlFor="pcw-last-name" label={copy.lastNameLabel} error={missing.lastName}>
                <Input
                  ref={lastNameRef}
                  id="pcw-last-name"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  required
                  value={lastName}
                  onChange={(e) => {
                    setLastName(e.target.value);
                    clearMissing('lastName');
                  }}
                  {...invalidProps('pcw-last-name', missing.lastName)}
                />
              </FormField>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField
                htmlFor="pcw-doc-type"
                label={copy.docTypeLabel}
                error={missing.docType}
              >
                <select
                  ref={docTypeRef}
                  id="pcw-doc-type"
                  name="docType"
                  required
                  value={docType}
                  onChange={(e) => {
                    setDocType(e.target.value as DocType | '');
                    clearMissing('docType');
                  }}
                  {...invalidProps('pcw-doc-type', missing.docType)}
                  className={cn(fieldClass, 'h-10')}
                >
                  <option value="">{copy.docTypePlaceholder}</option>
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {docTypeOptionLabel(t, docTypeNames)}
                    </option>
                  ))}
                </select>
              </FormField>
              <FormField htmlFor="pcw-doc-number" label={copy.docNumberLabel}>
                <Input
                  id="pcw-doc-number"
                  name="docNumber"
                  type="text"
                  value={docNumber}
                  onChange={(e) => setDocNumber(e.target.value)}
                />
              </FormField>
            </div>

            <DocTypeLabelField
              id="pcw-doc-type-label"
              inputRef={docTypeLabelRef}
              value={docTypeLabel}
              onChange={(value) => {
                setDocTypeLabel(value);
                clearMissing('docTypeLabel');
              }}
              error={missing.docTypeLabel}
            />

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField htmlFor="pcw-birth-date" label={copy.birthDateLabel}>
                <Input
                  id="pcw-birth-date"
                  name="birthDate"
                  type="date"
                  value={birthDate}
                  onChange={(e) => setBirthDate(e.target.value)}
                />
              </FormField>
              <FormField htmlFor="pcw-sex" label={copy.sexLabel}>
                <select
                  id="pcw-sex"
                  name="sex"
                  required
                  value={sex}
                  onChange={(e) => setSex(e.target.value as Sex)}
                  className={cn(fieldClass, 'h-10')}
                >
                  {sexOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </FormField>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField htmlFor="pcw-phone" label={copy.phoneLabel}>
                <Input
                  id="pcw-phone"
                  name="phone"
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </FormField>
              <FormField htmlFor="pcw-email" label={copy.emailLabel}>
                <Input
                  id="pcw-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </FormField>
            </div>

            <FormField htmlFor="pcw-address" label={copy.addressLabel}>
              <Input
                id="pcw-address"
                name="address"
                type="text"
                autoComplete="street-address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </FormField>

            <FormField htmlFor="pcw-notes" label={copy.notesLabel}>
              <textarea
                id="pcw-notes"
                name="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className={fieldClass}
              />
            </FormField>

            {validationError ? <InlineError>{validationError}</InlineError> : null}
          </div>
        )}

        {stepKey === 'antecedentes' && (
          <ClinicalHistoryFields
            value={history}
            onChange={setHistory}
            sections={['conditions']}
          />
        )}

        {stepKey === 'alergias' && (
          <ClinicalHistoryFields
            value={history}
            onChange={setHistory}
            sections={['allergies', 'medications']}
          />
        )}

        {/* Last clinical step owns the shared "Notas" field, so it appears once
            in the wizard instead of on every clinical step. */}
        {stepKey === 'habitos' && (
          <ClinicalHistoryFields value={history} onChange={setHistory} sections={['habits', 'notes']} />
        )}

        {stepKey === 'consentimiento' && (
          <div className="flex flex-col gap-4">
            {canWriteClinicalHistory ? (
              <div className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm text-ink">
                <p className="t-label text-ink">{copy.summaryTitle}</p>
                <p>{copy.summaryAllergies(history.allergies?.length ?? 0)}</p>
                <p>{copy.summaryConditions(history.conditions?.length ?? 0)}</p>
                <p>{copy.summaryMedications(history.medications?.length ?? 0)}</p>
              </div>
            ) : (
              <p className="rounded-lg border border-border p-3 text-sm text-muted">
                {copy.noClinicalHistoryNote}
              </p>
            )}
            <PatientConsentStep
              token={token}
              value={consentSelection}
              onChange={setConsentSelection}
              onPolicyChange={setConsentPolicy}
            />
            {error ? <InlineError>{error}</InlineError> : null}
          </div>
        )}
      </Wizard>

      <WizardNav
        current={step}
        total={steps.length}
        onBack={() => goToStep(step - 1)}
        onNext={() => goToStep(step + 1)}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel={copy.submitLabel}
      />
    </div>
  );
}
