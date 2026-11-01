'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { createChair, updateChair, type Chair } from '@/lib/chairs/chairs-api';
import type { StaffMember } from '@/lib/appointments/staff-api';
import { FormModal } from '@/components/shared/form-modal';
import { FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';

const copy = {
  createTitle: 'Nuevo sillón',
  editTitle: 'Editar sillón',
  description:
    'El nombre sale en la agenda y en la cita. El profesional por defecto se propone al elegir el sillón en una cita nueva, si aún no hay profesional.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Sillón 1',
  nameHint: 'Hasta 40 caracteres. No se repite en la sede.',
  provider: 'Profesional por defecto (opcional)',
  providerNone: 'Sin profesional por defecto',
  unavailable: (name: string) => `${name} (no disponible)`,
  unknownProvider: 'Profesional actual',
  create: 'Crear sillón',
  save: 'Guardar cambios',
  invalidName: 'Escribe un nombre de hasta 40 caracteres.',
  genericError: 'No pudimos guardar el sillón. Intenta de nuevo.',
};

/** Quien atiende pacientes (como la API): odontología y administración. */
const ATTENDING_ROLES = new Set(['DENTIST', 'ADMIN']);

interface ChairFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  locationId: string;
  /** Sin sillón: alta. Con sillón: edición. */
  chair?: Chair | null;
  staff: StaffMember[];
  onSaved: (chair: Chair) => void;
}

/**
 * Alta y edición de un sillón (DX-211, solo ADMIN). La API valida lo mismo
 * (nombre de 1 a 40, único en la sede; el profesional atiende en ella) y su
 * mensaje sale aquí si lo rechaza. El padre lo monta con una `key` por apertura.
 */
export function ChairFormModal({
  open,
  onOpenChange,
  token,
  locationId,
  chair,
  staff,
  onSaved,
}: ChairFormModalProps) {
  const editing = !!chair;
  const [name, setName] = useState(chair?.name ?? '');
  const [providerId, setProviderId] = useState(chair?.defaultProviderId ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providers = staff.filter((s) => ATTENDING_ROLES.has(s.role));
  // El actual, si ya no está entre las opciones (dado de baja, otro rol).
  const currentId = chair?.defaultProviderId ?? null;
  const currentMissing = currentId !== null && !providers.some((p) => p.userId === currentId);
  const currentName = staff.find((s) => s.userId === currentId)?.fullName ?? copy.unknownProvider;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (trimmed === '' || trimmed.length > 40) return setError(copy.invalidName);
    setSubmitting(true);
    try {
      const defaultProviderId = providerId === '' ? null : providerId;
      // Al editar, el profesional solo se manda si cambió: así renombrar un
      // sillón cuyo profesional ya no está disponible no falla por él.
      const saved = editing
        ? await updateChair(token, chair.id, {
            name: trimmed,
            ...(defaultProviderId !== chair.defaultProviderId ? { defaultProviderId } : {}),
          })
        : await createChair(token, { locationId, name: trimmed, defaultProviderId });
      onSaved(saved);
      onOpenChange(false);
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
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={handleSubmit}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      error={error}
    >
      <FormField htmlFor="chair-name" label={copy.name} hint={copy.nameHint}>
        <Input
          id="chair-name"
          value={name}
          maxLength={40}
          placeholder={copy.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          required
        />
      </FormField>
      <FormField htmlFor="chair-provider" label={copy.provider}>
        <NativeSelect
          id="chair-provider"
          value={providerId}
          onChange={(e) => setProviderId(e.target.value)}
        >
          <option value="">{copy.providerNone}</option>
          {currentMissing ? (
            <option value={currentId}>{copy.unavailable(currentName)}</option>
          ) : null}
          {providers.map((p) => (
            <option key={p.userId} value={p.userId}>
              {p.fullName}
            </option>
          ))}
        </NativeSelect>
      </FormField>
    </FormModal>
  );
}
