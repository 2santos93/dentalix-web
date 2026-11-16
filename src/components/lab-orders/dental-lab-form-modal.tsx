'use client';
import * as React from 'react';
import { useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createDentalLab,
  LAB_LIMITS as L,
  updateDentalLab,
  type DentalLab,
  type UpdateDentalLabInput,
} from '@/lib/lab-orders/lab-orders-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export const dentalLabFormCopy = {
  createTitle: 'Nuevo laboratorio dental',
  editTitle: (name: string) => `Editar «${name}»`,
  description: 'El laboratorio al que se mandan coronas, prótesis, férulas y alineadores. Nunca se borra: se desactiva.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Laboratorio Dental Caracas',
  contactName: 'Persona de contacto (opcional)',
  phone: 'Teléfono (opcional)',
  email: 'Correo (opcional)',
  notes: 'Notas (opcional)',
  notesHint: 'Horario de recogida, mensajero, forma de envío…',
  active: 'Activo',
  activeHint: 'Uno inactivo no se ofrece en las órdenes nuevas; las suyas siguen en la ficha.',
  submitCreate: 'Crear laboratorio',
  submitEdit: 'Guardar cambios',
  nameRequired: 'Escribe el nombre del laboratorio.',
  emailInvalid: 'Revisa el correo: falta la @ o el dominio.',
  genericError: 'No pudimos guardar el laboratorio. Intenta de nuevo.',
};

const copy = dentalLabFormCopy;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function blankToNull(text: string): string | null {
  const t = text.trim();
  return t === '' ? null : t;
}

interface DentalLabFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** `null` = alta. */
  lab: DentalLab | null;
  onSaved: (lab: DentalLab) => void;
}

/** Alta y edición de un laboratorio dental (DX-017, solo ADMIN). */
export function DentalLabFormModal({ open, onOpenChange, token, lab, onSaved }: DentalLabFormModalProps) {
  const id = useId();
  const [name, setName] = useState(lab?.name ?? '');
  const [contactName, setContactName] = useState(lab?.contactName ?? '');
  const [phone, setPhone] = useState(lab?.phone ?? '');
  const [email, setEmail] = useState(lab?.email ?? '');
  const [notes, setNotes] = useState(lab?.notes ?? '');
  const [active, setActive] = useState(lab?.active ?? true);
  const [nameError, setNameError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedEmail = email.trim();
    let invalid = false;
    if (trimmedName === '') {
      setNameError(copy.nameRequired);
      invalid = true;
    }
    if (trimmedEmail !== '' && !EMAIL.test(trimmedEmail)) {
      setEmailError(copy.emailInvalid);
      invalid = true;
    }
    if (invalid) return;
    setSubmitting(true);
    setError(null);
    const fields = {
      name: trimmedName,
      contactName: blankToNull(contactName),
      phone: blankToNull(phone),
      email: blankToNull(email),
      notes: blankToNull(notes),
    };
    try {
      let saved: DentalLab;
      if (lab) {
        const patch: UpdateDentalLabInput = {};
        if (fields.name !== lab.name) patch.name = fields.name;
        if (fields.contactName !== lab.contactName) patch.contactName = fields.contactName;
        if (fields.phone !== lab.phone) patch.phone = fields.phone;
        if (fields.email !== lab.email) patch.email = fields.email;
        if (fields.notes !== lab.notes) patch.notes = fields.notes;
        if (active !== lab.active) patch.active = active;
        if (Object.keys(patch).length === 0) {
          onOpenChange(false);
          return;
        }
        saved = await updateDentalLab(token, lab.id, patch);
      } else {
        saved = await createDentalLab(token, fields);
      }
      onOpenChange(false);
      onSaved(saved);
    } catch (err) {
      setError(apiErrorMessage(err, copy.genericError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={lab ? copy.editTitle(lab.name) : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={lab ? copy.submitEdit : copy.submitCreate}
      submitting={submitting}
      error={error}
      touchTargets
      ownValidation
    >
      <div className="flex flex-col gap-4">
        <FormField htmlFor={`${id}-name`} label={copy.name} error={nameError}>
          <Input
            id={`${id}-name`}
            value={name}
            maxLength={L.labNameMax}
            placeholder={copy.namePlaceholder}
            autoComplete="off"
            disabled={submitting}
            aria-invalid={nameError ? true : undefined}
            aria-describedby={nameError ? fieldErrorId(`${id}-name`) : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setNameError(null);
            }}
          />
        </FormField>
        <FormField htmlFor={`${id}-contact`} label={copy.contactName}>
          <Input
            id={`${id}-contact`}
            value={contactName}
            maxLength={L.contactNameMax}
            autoComplete="off"
            disabled={submitting}
            onChange={(e) => setContactName(e.target.value)}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField htmlFor={`${id}-phone`} label={copy.phone}>
            <Input
              id={`${id}-phone`}
              type="tel"
              value={phone}
              maxLength={L.phoneMax}
              autoComplete="off"
              disabled={submitting}
              onChange={(e) => setPhone(e.target.value)}
            />
          </FormField>
          <FormField htmlFor={`${id}-email`} label={copy.email} error={emailError}>
            <Input
              id={`${id}-email`}
              type="email"
              value={email}
              maxLength={L.emailMax}
              autoComplete="off"
              disabled={submitting}
              aria-invalid={emailError ? true : undefined}
              aria-describedby={emailError ? fieldErrorId(`${id}-email`) : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                setEmailError(null);
              }}
            />
          </FormField>
        </div>
        <FormField htmlFor={`${id}-notes`} label={copy.notes} hint={copy.notesHint}>
          <Textarea
            id={`${id}-notes`}
            rows={3}
            autoGrow
            value={notes}
            maxLength={L.notesMax}
            disabled={submitting}
            onChange={(e) => setNotes(e.target.value)}
          />
        </FormField>
        {lab ? (
          <Checkbox
            label={copy.active}
            description={copy.activeHint}
            checked={active}
            disabled={submitting}
            onChange={(e) => setActive(e.target.checked)}
          />
        ) : null}
      </div>
    </FormModal>
  );
}
