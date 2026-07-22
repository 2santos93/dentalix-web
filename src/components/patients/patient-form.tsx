'use client';
import * as React from 'react';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError } from '@/lib/api/client';
import { createPatient, type CreatePatientInput, type DocType, type Sex } from '@/lib/patients/patients-api';

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
  submit: 'Crear paciente',
  submitting: 'Creando…',
  genericError: 'No pudimos crear el paciente. Intenta de nuevo.',
};

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

interface PatientFormProps {
  token: string;
  tenant: string | null;
}

export function PatientForm({ token, tenant }: PatientFormProps) {
  const router = useRouter();
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
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
        ...(notes.trim() ? { notes: notes.trim() } : {}),
      };
      await createPatient(token, input, tenant);
      router.push('/patients');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : copy.genericError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="patient-first-name" className="text-sm font-medium text-ink">
            {copy.firstNameLabel}
          </label>
          <input
            id="patient-first-name"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="patient-last-name" className="text-sm font-medium text-ink">
            {copy.lastNameLabel}
          </label>
          <input
            id="patient-last-name"
            name="lastName"
            type="text"
            autoComplete="family-name"
            required
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="patient-doc-type" className="text-sm font-medium text-ink">
            {copy.docTypeLabel}
          </label>
          <select
            id="patient-doc-type"
            name="docType"
            required
            value={docType}
            onChange={(e) => setDocType(e.target.value as DocType)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          >
            {docTypeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="patient-doc-number" className="text-sm font-medium text-ink">
            {copy.docNumberLabel}
          </label>
          <input
            id="patient-doc-number"
            name="docNumber"
            type="text"
            value={docNumber}
            onChange={(e) => setDocNumber(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="patient-birth-date" className="text-sm font-medium text-ink">
            {copy.birthDateLabel}
          </label>
          <input
            id="patient-birth-date"
            name="birthDate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="patient-sex" className="text-sm font-medium text-ink">
            {copy.sexLabel}
          </label>
          <select
            id="patient-sex"
            name="sex"
            required
            value={sex}
            onChange={(e) => setSex(e.target.value as Sex)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          >
            {sexOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="patient-phone" className="text-sm font-medium text-ink">
            {copy.phoneLabel}
          </label>
          <input
            id="patient-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="patient-email" className="text-sm font-medium text-ink">
            {copy.emailLabel}
          </label>
          <input
            id="patient-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="patient-address" className="text-sm font-medium text-ink">
          {copy.addressLabel}
        </label>
        <input
          id="patient-address"
          name="address"
          type="text"
          autoComplete="street-address"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="patient-notes" className="text-sm font-medium text-ink">
          {copy.notesLabel}
        </label>
        <textarea
          id="patient-notes"
          name="notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="rounded-md border border-border bg-surface px-3 py-2 text-ink"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-60"
      >
        {submitting ? copy.submitting : copy.submit}
      </button>
    </form>
  );
}
