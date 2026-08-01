'use client';
import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import {
  createPatient,
  type CreatePatientInput,
  type DocType,
  type Sex,
} from '@/lib/patients/patients-api';
import { Wizard, WizardNav, type WizardStep } from '@/components/ui/wizard';
import { ClinicalHistoryFields } from '@/components/clinical/clinical-history-fields';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/molecules/form-field';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';
import type { ClinicalHistoryValue } from '@/lib/clinical/clinical-types';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  firstNameLabel: 'Nombre',
  lastNameLabel: 'Apellido',
  docTypeLabel: 'Tipo de documento',
  docNumberLabel: 'Número de documento',
  birthDateLabel: 'Fecha de nacimiento',
  sexLabel: 'Sexo',
  phoneLabel: 'Teléfono',
  emailLabel: 'Correo electrónico',
  addressLabel: 'Dirección',
  notesLabel: 'Notas',
  requiredError: 'Nombre y apellido son obligatorios para continuar.',
  consentLabel:
    'El paciente acepta el tratamiento de sus datos personales según la política de privacidad.',
  summaryTitle: 'Resumen de la historia clínica',
  summaryAllergies: (n: number) => `Alergias registradas: ${n}`,
  summaryConditions: (n: number) => `Condiciones marcadas: ${n}`,
  summaryMedications: (n: number) => `Medicamentos registrados: ${n}`,
  submitLabel: 'Guardar',
  genericError: 'No pudimos crear el paciente. Intenta de nuevo.',
};

const STEPS: WizardStep[] = [
  { key: 'datos', label: 'Datos' },
  { key: 'antecedentes', label: 'Antecedentes' },
  { key: 'alergias', label: 'Alergias y medicamentos' },
  { key: 'habitos', label: 'Hábitos' },
  { key: 'consentimiento', label: 'Consentimiento' },
];

const docTypeOptions: { value: DocType; label: string }[] = [
  { value: 'CC', label: 'Cédula de ciudadanía' },
  { value: 'TI', label: 'Tarjeta de identidad' },
  { value: 'CE', label: 'Cédula de extranjería' },
  { value: 'PASSPORT', label: 'Pasaporte' },
  { value: 'OTHER', label: 'Otro' },
];

const sexOptions: { value: Sex; label: string }[] = [
  { value: 'UNSPECIFIED', label: 'Sin especificar' },
  { value: 'F', label: 'Femenino' },
  { value: 'M', label: 'Masculino' },
  { value: 'OTHER', label: 'Otro' },
];

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
}

/** Multi-step alta: datos básicos + historia clínica estructurada + consentimiento, en un solo submit. */
export function PatientCreateWizard({ token }: PatientCreateWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [docType, setDocType] = useState<DocType>('CC');
  const [docNumber, setDocNumber] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<Sex>('UNSPECIFIED');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');

  const [history, setHistory] = useState<ClinicalHistoryValue>({});

  const [dataConsentAccepted, setDataConsentAccepted] = useState(false);
  const [dataConsentAt, setDataConsentAt] = useState<string | undefined>(undefined);
  const [dataConsentPolicyVersion, setDataConsentPolicyVersion] = useState<string | undefined>(
    undefined,
  );

  const [validationError, setValidationError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isBasicInfoValid = firstName.trim() !== '' && lastName.trim() !== '';

  function handleConsentChange(checked: boolean) {
    setDataConsentAccepted(checked);
    if (checked) {
      setDataConsentPolicyVersion('v1');
      setDataConsentAt(new Date().toISOString());
    } else {
      setDataConsentPolicyVersion(undefined);
      setDataConsentAt(undefined);
    }
  }

  function goToStep(next: number) {
    // Step 1 (Datos) is required — block moving forward off of it without
    // nombre/apellido. Steps 2-5 are free to jump between.
    if (step === 0 && next > step && !isBasicInfoValid) {
      setValidationError(copy.requiredError);
      return;
    }
    setValidationError(null);
    setStep(next);
  }

  async function handleSubmit() {
    if (!isBasicInfoValid) {
      setValidationError(copy.requiredError);
      setStep(0);
      return;
    }
    setValidationError(null);
    setError(null);
    setSubmitting(true);
    try {
      const input: CreatePatientInput = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        docType,
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
        ...(historyHasContent(history) ? { medicalHistory: history } : {}),
        ...(dataConsentAccepted
          ? {
              dataConsentAccepted: true,
              ...(dataConsentPolicyVersion ? { dataConsentPolicyVersion } : {}),
              ...(dataConsentAt ? { dataConsentAt } : {}),
            }
          : {}),
      };
      const created = await createPatient(token, input);
      router.push(`/patients/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Wizard steps={STEPS} current={step} onStepChange={goToStep}>
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <div className="grid gap-5 sm:grid-cols-2">
              <FormField htmlFor="pcw-first-name" label={copy.firstNameLabel}>
                <Input
                  id="pcw-first-name"
                  name="firstName"
                  type="text"
                  autoComplete="given-name"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                />
              </FormField>
              <FormField htmlFor="pcw-last-name" label={copy.lastNameLabel}>
                <Input
                  id="pcw-last-name"
                  name="lastName"
                  type="text"
                  autoComplete="family-name"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                />
              </FormField>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <FormField htmlFor="pcw-doc-type" label={copy.docTypeLabel}>
                <select
                  id="pcw-doc-type"
                  name="docType"
                  required
                  value={docType}
                  onChange={(e) => setDocType(e.target.value as DocType)}
                  className={cn(fieldClass, 'h-10')}
                >
                  {docTypeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
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

            {validationError ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {validationError}
              </p>
            ) : null}
          </div>
        )}

        {step === 1 && (
          <ClinicalHistoryFields
            value={history}
            onChange={setHistory}
            sections={['conditions']}
          />
        )}

        {step === 2 && (
          <ClinicalHistoryFields
            value={history}
            onChange={setHistory}
            sections={['allergies', 'medications']}
          />
        )}

        {/* Last clinical step owns the shared "Notas" field, so it appears once
            in the wizard instead of on every clinical step. */}
        {step === 3 && (
          <ClinicalHistoryFields value={history} onChange={setHistory} sections={['habits', 'notes']} />
        )}

        {step === 4 && (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1 rounded-lg border border-border p-3 text-sm text-ink">
              <p className="t-label text-ink">{copy.summaryTitle}</p>
              <p>{copy.summaryAllergies(history.allergies?.length ?? 0)}</p>
              <p>{copy.summaryConditions(history.conditions?.length ?? 0)}</p>
              <p>{copy.summaryMedications(history.medications?.length ?? 0)}</p>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={dataConsentAccepted}
                onChange={(e) => handleConsentChange(e.target.checked)}
              />
              {copy.consentLabel}
            </label>
            {error ? (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            ) : null}
          </div>
        )}
      </Wizard>

      <WizardNav
        current={step}
        total={STEPS.length}
        onBack={() => goToStep(step - 1)}
        onNext={() => goToStep(step + 1)}
        onSubmit={handleSubmit}
        submitting={submitting}
        submitLabel={copy.submitLabel}
      />
    </div>
  );
}
