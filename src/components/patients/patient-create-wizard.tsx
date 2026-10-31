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
import { Wizard, type WizardStep } from '@/components/ui/wizard';
import { Button } from '@/components/ui/button';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { Callout } from '@/components/ui/callout';
import { ClinicalHistoryFields } from '@/components/clinical/clinical-history-fields';
import { Input } from '@/components/ui/input';
import { DateField } from '@/components/ui/date-field';
import { useDateLocale } from '@/components/ui/date-locale';
import { todayDate } from '@/lib/dates/iso';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { DOC_TYPES, docTypeOptionLabel, normalizeDocTypeLabel } from '@/lib/patients/doc-type';
import { isEmailAddress } from '@/lib/format/email';
import { DocTypeLabelField, docTypeLabelFieldError } from './doc-type-label-field';
import { useDocumentTypeNames } from '@/lib/patients/use-document-type-names';
import type { ClinicalHistoryValue } from '@/lib/clinical/clinical-types';
import { ConditionSummaryText } from '@/components/clinical/condition-summary';
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
  docType: 'Tipo de documento',
  docTypePlaceholder: 'Elige el tipo',
  docTypeRequired: 'Elige el tipo de documento.',
  firstNameRequired: 'Escribe el nombre.',
  lastNameRequired: 'Escribe el apellido.',
  emailInvalid: 'Revisa el correo electrónico: le falta algo (p. ej. nombre@dominio.com).',
  docNumberLabel: 'Número de documento (opcional)',
  birthDateLabel: 'Fecha de nacimiento (opcional)',
  sexLabel: 'Sexo',
  phoneLabel: 'Teléfono (opcional)',
  emailLabel: 'Correo electrónico (opcional)',
  addressLabel: 'Dirección (opcional)',
  notesLabel: 'Notas (opcional)',
  requiredError: 'Nombre, apellido y tipo de documento son obligatorios para continuar.',
  summaryTitle: 'Resumen de la historia clínica',
  summaryAllergies: (n: number) => `Alergias registradas: ${n}`,
  summaryConditions: 'Condiciones: ',
  summaryMedications: (n: number) => `Medicamentos registrados: ${n}`,
  noClinicalHistoryNote:
    'La historia clínica (antecedentes, alergias, medicamentos y hábitos) la completará el equipo clínico desde la ficha del paciente.',
  submitLabel: 'Crear paciente',
  back: 'Atrás',
  next: 'Siguiente',
  /** Bajo los datos: el resto del alta se puede dejar para después. */
  laterNote:
    'Con estos datos ya puedes crear el paciente. Los pasos siguientes son opcionales: la anamnesis y la autorización de datos también se completan después desde su ficha.',
  laterNoteReception:
    'Con estos datos ya puedes crear el paciente. La autorización de datos es opcional aquí: también se registra después desde su ficha.',
  genericError: 'No pudimos crear el paciente. Intenta de nuevo.',
};

const STEPS: WizardStep[] = [
  { key: 'datos', label: 'Datos' },
  { key: 'antecedentes', label: 'Antecedentes', optional: true },
  { key: 'alergias', label: 'Alergias y medicamentos', optional: true },
  { key: 'habitos', label: 'Hábitos', optional: true },
  { key: 'consentimiento', label: 'Autorización de datos', optional: true },
];

/** Pasos que escriben la anamnesis v1: solo para roles clínicos (SEC-005). */
const CLINICAL_STEP_KEYS = new Set(['antecedentes', 'alergias', 'habitos']);

const sexOptions: { value: Sex; label: string }[] = [
  { value: 'UNSPECIFIED', label: 'Sin especificar' },
  { value: 'F', label: 'Femenino' },
  { value: 'M', label: 'Masculino' },
  { value: 'OTHER', label: 'Otro' },
];

/**
 * Campos del paso 1 con error propio, en el orden del formulario. La etiqueta
 * y el email siguen las reglas de la API: su 400 saldría en el paso 5, lejos
 * del campo.
 */
const CHECKED_FIELDS = ['firstName', 'lastName', 'docType', 'docTypeLabel', 'email'] as const;
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
  const emailRef = React.useRef<HTMLInputElement>(null);
  // Cada petición es un objeto nuevo: el efecto enfoca aunque se repita el campo.
  const [focusRequest, setFocusRequest] = useState<{ field: CheckedField } | null>(null);
  React.useEffect(() => {
    if (!focusRequest) return;
    const refs = {
      firstName: firstNameRef,
      lastName: lastNameRef,
      docType: docTypeRef,
      docTypeLabel: docTypeLabelRef,
      email: emailRef,
    };
    refs[focusRequest.field].current?.focus();
  }, [focusRequest]);
  const [docNumber, setDocNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  // Nadie nace mañana: un día futuro marca el campo inválido (hoy, en la zona de la sede).
  const { timeZone } = useDateLocale();
  const todayIso = React.useMemo(() => todayDate(timeZone).toString(), [timeZone]);
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

  const labelError = docTypeLabelFieldError(docTypeLabel);
  const emailInvalid = email.trim() !== '' && !isEmailAddress(email.trim());
  const isBasicInfoValid =
    firstName.trim() !== '' &&
    lastName.trim() !== '' &&
    docType !== '' &&
    !labelError &&
    !emailInvalid;

  /** Marca lo que falta o sobra y lleva el foco al primer campo con error. */
  function flagMissingBasics() {
    const found: MissingFields = {
      ...(!firstName.trim() ? { firstName: copy.firstNameRequired } : {}),
      ...(!lastName.trim() ? { lastName: copy.lastNameRequired } : {}),
      ...(docType === '' ? { docType: copy.docTypeRequired } : {}),
      ...(labelError ? { docTypeLabel: labelError } : {}),
      ...(emailInvalid ? { email: copy.emailInvalid } : {}),
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
                label={copy.docType}
                error={missing.docType}
              >
                <NativeSelect
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
                >
                  <option value="">{copy.docTypePlaceholder}</option>
                  {DOC_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {docTypeOptionLabel(t, docTypeNames)}
                    </option>
                  ))}
                </NativeSelect>
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
                <DateField
                  id="pcw-birth-date"
                  name="birthDate"
                  value={birthDate || null}
                  onChange={(value) => setBirthDate(value ?? '')}
                  max={todayIso}
                  showAge
                />
              </FormField>
              <FormField htmlFor="pcw-sex" label={copy.sexLabel}>
                <NativeSelect
                  id="pcw-sex"
                  name="sex"
                  required
                  value={sex}
                  onChange={(e) => setSex(e.target.value as Sex)}
                >
                  {sexOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </NativeSelect>
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
              <FormField htmlFor="pcw-email" label={copy.emailLabel} error={missing.email}>
                <Input
                  ref={emailRef}
                  id="pcw-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearMissing('email');
                  }}
                  {...invalidProps('pcw-email', missing.email)}
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
              <Textarea
                id="pcw-notes"
                name="notes"
                rows={3}
                autoGrow
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </FormField>

            {validationError ? <InlineError>{validationError}</InlineError> : null}
            {steps.length > 1 ? (
              <p className="t-caption max-w-prose text-muted">
                {canWriteClinicalHistory ? copy.laterNote : copy.laterNoteReception}
              </p>
            ) : null}
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
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3 text-sm text-ink">
                <p className="t-label text-ink">{copy.summaryTitle}</p>
                <p>{copy.summaryAllergies(history.allergies?.length ?? 0)}</p>
                <p>
                  {copy.summaryConditions}
                  <ConditionSummaryText conditions={history.conditions} />
                </p>
                <p>{copy.summaryMedications(history.medications?.length ?? 0)}</p>
              </div>
            ) : (
              <Callout tone="neutral">{copy.noClinicalHistoryNote}</Callout>
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

      {/* Barra de acciones: pegada abajo en el teléfono (el formulario mide
          más que la pantalla), en su sitio desde `sm`. «Crear paciente» es la
          primaria en todos los pasos: solo el primero es obligatorio. */}
      <div className="sticky bottom-0 z-10 -mx-4 flex items-center gap-2 border-t border-border bg-canvas px-4 py-3 sm:static sm:mx-0 sm:border-t-0 sm:bg-transparent sm:px-0 sm:py-0">
        {step > 0 ? (
          <Button type="button" variant="ghost" className="max-sm:min-h-11" onClick={() => goToStep(step - 1)}>
            {copy.back}
          </Button>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {step < steps.length - 1 ? (
            <Button type="button" variant="secondary" className="max-sm:min-h-11" onClick={() => goToStep(step + 1)}>
              {copy.next}
            </Button>
          ) : null}
          <Button type="button" className="max-sm:min-h-11" onClick={handleSubmit} loading={submitting}>
            {copy.submitLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
