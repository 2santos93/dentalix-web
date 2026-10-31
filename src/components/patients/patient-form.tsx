'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createPatient,
  type CreatePatientInput,
  type DocType,
  type Patient,
  type Sex,
} from '@/lib/patients/patients-api';
import { listCountries, type Country } from '@/lib/reference/countries-api';
import { CityCombobox, type CitySelection } from '@/components/shared/city-combobox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { InlineError } from '@/components/errors/inline-error';
import { NativeSelect } from '@/components/ui/native-select';
import { Textarea } from '@/components/ui/textarea';
import { DateField } from '@/components/ui/date-field';
import { DOC_TYPES, docTypeOptionLabel, normalizeDocTypeLabel } from '@/lib/patients/doc-type';
import { isEmailAddress } from '@/lib/format/email';
import { DocTypeLabelField, docTypeLabelFieldError } from './doc-type-label-field';
import { useDocumentTypeNames } from '@/lib/patients/use-document-type-names';

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
  requiredError: 'Nombre, apellido y tipo de documento son obligatorios para continuar.',
  docNumberLabel: 'Número de documento',
  birthDateLabel: 'Fecha de nacimiento',
  sexLabel: 'Sexo',
  phoneLabel: 'Teléfono',
  emailLabel: 'Correo electrónico',
  addressLabel: 'Dirección',
  countryLabel: 'País',
  cityLabel: 'Ciudad',
  notesLabel: 'Notas',
  submit: 'Crear paciente',
  submitting: 'Creando…',
  genericError: 'No pudimos crear el paciente. Intenta de nuevo.',
};

const sexOptions: { value: Sex; label: string }[] = [
  { value: 'UNSPECIFIED', label: 'Sin especificar' },
  { value: 'F', label: 'Femenino' },
  { value: 'M', label: 'Masculino' },
  { value: 'OTHER', label: 'Otro' },
];

/**
 * Campos con error propio, en el orden del formulario: el foco va al primero
 * que falle. El cliente aplica a la etiqueta y al email las reglas de la API,
 * así que sus 400 no se alcanzan desde aquí (hoy la API no ata ningún 400 de
 * pacientes a un campo).
 */
const CHECKED_FIELDS = ['firstName', 'lastName', 'docType', 'docTypeLabel', 'email'] as const;
type CheckedField = (typeof CHECKED_FIELDS)[number];
type FieldErrors = Partial<Record<CheckedField, string>>;

const FIELD_IDS: Record<CheckedField, string> = {
  firstName: 'patient-first-name',
  lastName: 'patient-last-name',
  docType: 'patient-doc-type',
  docTypeLabel: 'patient-doc-type-label',
  email: 'patient-email',
};

/** `aria-invalid`/`aria-describedby` de un control con su error. */
function invalidProps(field: CheckedField, errors: FieldErrors) {
  return errors[field]
    ? { 'aria-invalid': true as const, 'aria-describedby': fieldErrorId(FIELD_IDS[field]) }
    : {};
}

interface PatientFormProps {
  token: string;
  /**
   * When provided, the form calls this with the created patient instead of
   * navigating to /patients — lets it be reused inside a dialog (e.g. creating
   * a patient without leaving the agenda). Omit for the standalone page.
   */
  onCreated?: (patient: Patient) => void;
  /**
   * Pre-fills the document-number field — e.g. when the agenda's patient
   * search found no match for a typed document and opens this form to create
   * that patient, so the number isn't retyped. Optional.
   */
  initialDocNumber?: string;
}

export function PatientForm({ token, onCreated, initialDocNumber }: PatientFormProps) {
  const router = useRouter();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  // DX-327 (R10): sin tipo propuesto; quien da de alta lo elige.
  const [docType, setDocType] = useState<DocType | ''>('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const docTypeNames = useDocumentTypeNames(token);
  const firstNameRef = React.useRef<HTMLInputElement>(null);
  const lastNameRef = React.useRef<HTMLInputElement>(null);
  const docTypeRef = React.useRef<HTMLSelectElement>(null);
  const [docTypeLabel, setDocTypeLabel] = useState('');
  const docTypeLabelRef = React.useRef<HTMLInputElement>(null);
  const emailRef = React.useRef<HTMLInputElement>(null);
  // Cada petición es un objeto nuevo: el efecto enfoca aunque se repita el campo.
  const [focusRequest, setFocusRequest] = useState<{ field: CheckedField } | null>(null);
  const [docNumber, setDocNumber] = useState(initialDocNumber ?? '');
  const [birthDate, setBirthDate] = useState('');
  const [sex, setSex] = useState<Sex>('UNSPECIFIED');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [countries, setCountries] = useState<Country[]>([]);
  const [countryCode, setCountryCode] = useState('');
  const [city, setCity] = useState<CitySelection | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listCountries(token)
      .then((data) => {
        if (!cancelled) setCountries(data);
      })
      .catch(() => {
        /* fail soft — country select just stays empty */
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
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

  /** Quita el error de un campo al corregirlo. */
  function clearFieldError(field: CheckedField) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function validate(): FieldErrors {
    const found: FieldErrors = {};
    if (!firstName.trim()) found.firstName = copy.firstNameRequired;
    if (!lastName.trim()) found.lastName = copy.lastNameRequired;
    if (docType === '') found.docType = copy.docTypeRequired;
    const labelError = docTypeLabelFieldError(docTypeLabel);
    if (labelError) found.docTypeLabel = labelError;
    // La regla de `@IsEmail()` de la API, más estricta que la del navegador
    // (que acepta «ana@x»).
    if (email.trim() && !isEmailAddress(email.trim())) found.email = copy.emailInvalid;
    return found;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // La validación es nuestra (`noValidate`): el error va junto al campo,
    // enlazado por `aria-describedby`, y no en la burbuja del navegador.
    const found = validate();
    const firstInvalid = CHECKED_FIELDS.find((f) => found[f]);
    // `docType === ''` ya está en `found`; repetirlo estrecha el tipo para TS.
    if (firstInvalid || docType === '') {
      setFieldErrors(found);
      const missingRequired = Boolean(found.firstName || found.lastName || found.docType);
      setError(missingRequired ? copy.requiredError : null);
      setFocusRequest({ field: firstInvalid ?? 'docType' });
      return;
    }
    setFieldErrors({});
    setError(null);
    setSubmitting(true);
    try {
      const label = normalizeDocTypeLabel(docTypeLabel);
      const input: CreatePatientInput = {
        firstName,
        lastName,
        docType,
        ...(label ? { docTypeLabel: label } : {}),
        sex,
        ...(docNumber.trim() ? { docNumber: docNumber.trim() } : {}),
        ...(birthDate ? { birthDate: new Date(birthDate).toISOString() } : {}),
        ...(phone.trim() ? { phone: phone.trim() } : {}),
        ...(email.trim() ? { email: email.trim().toLowerCase() } : {}),
        ...(address.trim() ? { address: address.trim() } : {}),
        ...(countryCode ? { countryCode } : {}),
        ...(city ? { cityId: city.id } : {}),
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      const created = await createPatient(token, input);
      if (onCreated) {
        onCreated(created);
      } else {
        router.push('/patients');
      }
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField htmlFor="patient-first-name" label={copy.firstNameLabel} error={fieldErrors.firstName}>
          <Input
            ref={firstNameRef}
            id="patient-first-name"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(e) => {
              setFirstName(e.target.value);
              clearFieldError('firstName');
            }}
            {...invalidProps('firstName', fieldErrors)}
          />
        </FormField>
        <FormField htmlFor="patient-last-name" label={copy.lastNameLabel} error={fieldErrors.lastName}>
          <Input
            ref={lastNameRef}
            id="patient-last-name"
            name="lastName"
            type="text"
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(e) => {
              setLastName(e.target.value);
              clearFieldError('lastName');
            }}
            {...invalidProps('lastName', fieldErrors)}
          />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          htmlFor="patient-doc-type"
          label={copy.docType}
          error={fieldErrors.docType}
        >
          <NativeSelect
            ref={docTypeRef}
            id="patient-doc-type"
            name="docType"
            required
            value={docType}
            onChange={(e) => {
              setDocType(e.target.value as DocType | '');
              clearFieldError('docType');
            }}
            {...invalidProps('docType', fieldErrors)}
          >
            <option value="">{copy.docTypePlaceholder}</option>
            {DOC_TYPES.map((t) => (
              <option key={t} value={t}>
                {docTypeOptionLabel(t, docTypeNames)}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor="patient-doc-number" label={copy.docNumberLabel}>
          <Input
            id="patient-doc-number"
            name="docNumber"
            type="text"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
          />
        </FormField>
      </div>

      <DocTypeLabelField
        id={FIELD_IDS.docTypeLabel}
        inputRef={docTypeLabelRef}
        value={docTypeLabel}
        onChange={(value) => {
          setDocTypeLabel(value);
          clearFieldError('docTypeLabel');
        }}
        error={fieldErrors.docTypeLabel}
      />

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField htmlFor="patient-birth-date" label={copy.birthDateLabel}>
          <DateField
            id="patient-birth-date"
            name="birthDate"
            value={birthDate || null}
            onChange={(value) => setBirthDate(value ?? '')}
            showAge
          />
        </FormField>
        <FormField htmlFor="patient-sex" label={copy.sexLabel}>
          <NativeSelect
            id="patient-sex"
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
        <FormField htmlFor="patient-phone" label={copy.phoneLabel}>
          <Input
            id="patient-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </FormField>
        <FormField htmlFor="patient-email" label={copy.emailLabel} error={fieldErrors.email}>
          <Input
            ref={emailRef}
            id="patient-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              clearFieldError('email');
            }}
            {...invalidProps('email', fieldErrors)}
          />
        </FormField>
      </div>

      <FormField htmlFor="patient-address" label={copy.addressLabel}>
        <Input
          id="patient-address"
          name="address"
          type="text"
          autoComplete="street-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField htmlFor="patient-country" label={copy.countryLabel}>
          <NativeSelect
            id="patient-country"
            name="countryCode"
            value={countryCode}
            onChange={(e) => {
              setCountryCode(e.target.value);
              setCity(null);
            }}
          >
            <option value="">—</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField htmlFor="patient-city" label={copy.cityLabel}>
          <CityCombobox
            id="patient-city"
            token={token}
            countryCode={countryCode || null}
            value={city}
            onChange={setCity}
          />
        </FormField>
      </div>

      <FormField htmlFor="patient-notes" label={copy.notesLabel}>
        <Textarea
          id="patient-notes"
          name="notes"
          rows={3}
          autoGrow
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </FormField>

      {error ? <InlineError>{error}</InlineError> : null}

      <div className="flex justify-end">
        <Button type="submit" loading={submitting}>
          {submitting ? copy.submitting : copy.submit}
        </Button>
      </div>
    </form>
  );
}
