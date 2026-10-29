'use client';
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
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
import { cn } from '@/lib/utils';
import { fieldClass } from '@/lib/ui/field-class';
import { DOC_TYPES, docTypeOptionLabel } from '@/lib/patients/doc-type';
import { useDocumentTypeNames } from '@/lib/patients/use-document-type-names';

// Copy as constants (i18n-ready) — es first, matches the rest of the copy
// until next-intl wiring lands.
const copy = {
  firstNameLabel: 'Nombre',
  lastNameLabel: 'Apellido',
  docTypeLabel: 'Tipo de documento',
  docTypePlaceholder: 'Elige el tipo',
  docTypeRequired: 'Elige el tipo de documento.',
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

type RequiredField = 'firstName' | 'lastName' | 'docType';

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
  const [showDocTypeError, setShowDocTypeError] = useState(false);
  const docTypeNames = useDocumentTypeNames(token);
  const firstNameRef = React.useRef<HTMLInputElement>(null);
  const lastNameRef = React.useRef<HTMLInputElement>(null);
  const docTypeRef = React.useRef<HTMLSelectElement>(null);
  // Cada petición es un objeto nuevo: el efecto enfoca aunque se repita el campo.
  const [focusRequest, setFocusRequest] = useState<{ field: RequiredField } | null>(null);
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
    const refs = { firstName: firstNameRef, lastName: lastNameRef, docType: docTypeRef };
    refs[focusRequest.field].current?.focus();
  }, [focusRequest]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // La validación es nuestra (`noValidate`): el error va junto al campo,
    // enlazado por `aria-describedby`, y no en la burbuja del navegador.
    if (!firstName.trim() || !lastName.trim() || docType === '') {
      setError(copy.requiredError);
      setShowDocTypeError(docType === '');
      setFocusRequest({
        field: !firstName.trim() ? 'firstName' : !lastName.trim() ? 'lastName' : 'docType',
      });
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const input: CreatePatientInput = {
        firstName,
        lastName,
        docType,
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
        <FormField htmlFor="patient-first-name" label={copy.firstNameLabel}>
          <Input
            ref={firstNameRef}
            id="patient-first-name"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
        </FormField>
        <FormField htmlFor="patient-last-name" label={copy.lastNameLabel}>
          <Input
            ref={lastNameRef}
            id="patient-last-name"
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
        <FormField
          htmlFor="patient-doc-type"
          label={copy.docTypeLabel}
          error={showDocTypeError ? copy.docTypeRequired : null}
        >
          <select
            ref={docTypeRef}
            id="patient-doc-type"
            name="docType"
            required
            value={docType}
            onChange={(e) => {
              setDocType(e.target.value as DocType | '');
              setShowDocTypeError(false);
            }}
            aria-invalid={showDocTypeError || undefined}
            aria-describedby={showDocTypeError ? fieldErrorId('patient-doc-type') : undefined}
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

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField htmlFor="patient-birth-date" label={copy.birthDateLabel}>
          <Input
            id="patient-birth-date"
            name="birthDate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
          />
        </FormField>
        <FormField htmlFor="patient-sex" label={copy.sexLabel}>
          <select
            id="patient-sex"
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
        <FormField htmlFor="patient-email" label={copy.emailLabel}>
          <Input
            id="patient-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
          <select
            id="patient-country"
            name="countryCode"
            value={countryCode}
            onChange={(e) => {
              setCountryCode(e.target.value);
              setCity(null);
            }}
            className={cn(fieldClass, 'h-10')}
          >
            <option value="">—</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
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
        <textarea
          id="patient-notes"
          name="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className={fieldClass}
        />
      </FormField>

      {error ? <InlineError>{error}</InlineError> : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="animate-spin" /> {copy.submitting}
            </>
          ) : (
            copy.submit
          )}
        </Button>
      </div>
    </form>
  );
}
