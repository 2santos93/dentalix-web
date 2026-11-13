'use client';
import * as React from 'react';
import { useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import {
  createRecallType,
  setRecallTypeTriggers,
  updateRecallType,
  type RecallType,
  type UpdateRecallTypeInput,
} from '@/lib/recall/recall-api';
import { currentPartnerId, planExclusion } from '@/lib/recall/recall-exclusion';
import { linkedAppointmentType } from '@/lib/recall/recall-appointment-type';
import type { AppointmentType } from '@/lib/appointments/appointment-types-api';
import { FieldError } from '@/components/errors/field-error';
import { notifyError } from '@/components/errors/notify';
import { FormField } from '@/components/shared/form-field';
import { FormModal } from '@/components/shared/form-modal';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { RecallTriggersField } from './recall-triggers-field';

export const RECALL_TYPE_NAME_MAX = 60;
export const RECALL_TYPE_MONTHS_MIN = 1;
export const RECALL_TYPE_MONTHS_MAX = 36;

export const recallTypeFormCopy = {
  createTitle: 'Nuevo tipo de recall',
  editTitle: 'Editar tipo de recall',
  description: 'Cada cuánto vuelve el paciente y qué procedimientos realizados reinician el plazo.',
  name: 'Nombre',
  namePlaceholder: 'Por ejemplo, Control de ortodoncia',
  months: 'Intervalo por defecto (meses)',
  monthsHint: 'Entre 1 y 36. Es el intervalo de los recalls que cree un procedimiento.',
  // D11: cambiar el intervalo no mueve los recalls que ya existen.
  monthsEditHint: 'Solo se aplica a los recalls que se creen a partir de ahora.',
  active: 'Activo',
  activeHint: 'Inactivo: deja de crear recalls por procedimiento; los que ya hay siguen en la lista.',
  exclusive: 'Excluyente con',
  none: 'Ninguno',
  inactiveOption: (name: string) => `${name} (inactivo)`,
  // D10: el grupo se aplica en el próximo DONE o PUT, nunca en el acto.
  exclusiveHint:
    'Un paciente no tiene los dos activos: manda el último procedimiento. Se aplica al próximo procedimiento de cada paciente; no cambia los recalls de hoy.',
  // D20: el tipo de cita con el que «Agendar» de la lista de recall prellena la cita.
  appointmentType: 'Tipo de cita al agendar',
  appointmentTypeHint: 'Al agendar desde la lista de recall, la cita sale con este tipo y su duración.',
  appointmentTypesLoading: 'Cargando tipos de cita…',
  appointmentTypesError: 'No se pudieron cargar',
  retiredAppointmentType: 'Un tipo de cita retirado',
  create: 'Crear tipo',
  save: 'Guardar cambios',
  invalidName: `Escribe un nombre (hasta ${RECALL_TYPE_NAME_MAX} caracteres).`,
  invalidMonths: `El intervalo debe ser un número entero de meses entre ${RECALL_TYPE_MONTHS_MIN} y ${RECALL_TYPE_MONTHS_MAX}.`,
  saveError: 'No pudimos guardar el tipo de recall. Intenta de nuevo.',
  // El aviso lleva «Reintentar»; si otro diálogo lo tapa (notifyError lo quita), queda «Editar».
  triggersFailed: (name: string, reason: string) =>
    `Se guardó «${name}», pero no sus disparadores. ${reason} También puedes volver a elegirlos desde «Editar».`,
  partnerFailed: (partner: string, reason: string) =>
    `No pudimos marcar «${partner}» como excluyente: no se guardó nada. ${reason}`,
  partialReason: 'Intenta de nuevo.',
};
const copy = recallTypeFormCopy;

/**
 * El último paso, con el tipo ya guardado: sus disparadores. Si falla, el modal
 * ya se cerró, la lista muestra lo guardado y un aviso (escalón 3) reintenta
 * solo esto.
 */
async function saveTriggers(
  token: string,
  saved: RecallType,
  triggers: string[],
  onSaved: (types: RecallType[]) => void,
): Promise<void> {
  try {
    onSaved([await setRecallTypeTriggers(token, saved.id, triggers)]);
  } catch (err) {
    notifyError(copy.triggersFailed(saved.name, apiErrorMessage(err, copy.partialReason)), {
      onRetry: () => void saveTriggers(token, saved, triggers, onSaved),
    });
  }
}

/**
 * D20: «Ninguno» y los tipos de cita activos. El que ya tenía el tipo de
 * recall se ofrece aunque ya no esté activo, para no perderlo al guardar otra
 * cosa (la API acepta volver a mandarlo).
 */
function appointmentTypeOptions(
  appointmentTypes: readonly AppointmentType[] | 'loading',
  currentId: string,
): React.ReactNode {
  if (appointmentTypes === 'loading') {
    return <option value={currentId}>{copy.appointmentTypesLoading}</option>;
  }
  const linked = linkedAppointmentType(currentId || null, appointmentTypes);
  return (
    <>
      <option value="">{copy.none}</option>
      {appointmentTypes
        .filter((t) => t.active)
        .map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      {linked.kind === 'inactive' ? <option value={currentId}>{copy.inactiveOption(linked.name)}</option> : null}
      {linked.kind === 'missing' ? <option value={currentId}>{copy.retiredAppointmentType}</option> : null}
    </>
  );
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id) => b.includes(id));
}

interface RecallTypeFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  /** Sin tipo: alta. Con tipo: edición. */
  type: RecallType | null;
  /** Todos los tipos vivos (para «Excluyente con…»). */
  types: readonly RecallType[];
  /** Los tipos que cambiaron (el propio y, si se tocó, el otro de la exclusión). */
  onSaved: (types: RecallType[]) => void;
  /** D20: los tipos de cita de la clínica (activos e inactivos). */
  appointmentTypes: readonly AppointmentType[] | 'loading' | 'failed';
  onRetryAppointmentTypes: () => void;
}

/**
 * Alta y edición de un tipo de recall (DX-015-bis, solo ADMIN): nombre,
 * intervalo por defecto, activo, «Excluyente con…» (D13) y los procedimientos
 * que lo reinician (D12). Guarda en este orden:
 * 1. si hace falta un grupo nuevo, el del OTRO tipo primero: si falla no se
 *    guardó nada y este conserva su exclusión de antes; si lo que falla
 *    después es este tipo, el otro queda solo en su grupo, que no tiene efecto
 *    (y el reintento reutiliza ese grupo: la lista ya lo trae);
 * 2. el tipo, con su grupo;
 * 3. sus disparadores (`PUT …/triggers`), con aviso y reintento si fallan.
 * El padre lo monta con una `key` por apertura.
 */
export function RecallTypeFormModal({
  open,
  onOpenChange,
  token,
  type,
  types,
  onSaved,
  appointmentTypes,
  onRetryAppointmentTypes,
}: RecallTypeFormModalProps) {
  const editing = type !== null;
  const initialPartner = currentPartnerId(type, types) ?? '';
  const initialTriggers = type?.triggerCatalogItemIds ?? [];
  const [name, setName] = useState(type?.name ?? '');
  const [months, setMonths] = useState(String(type?.defaultIntervalMonths ?? 6));
  const [active, setActive] = useState(type?.active ?? true);
  const [partnerId, setPartnerId] = useState(initialPartner);
  const [triggerIds, setTriggerIds] = useState<string[]>(initialTriggers);
  const initialAppointmentTypeId = type?.appointmentTypeId ?? '';
  const [appointmentTypeId, setAppointmentTypeId] = useState(initialAppointmentTypeId);
  const [nameError, setNameError] = useState<string | null>(null);
  const [monthsError, setMonthsError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const others = types.filter((t) => t.id !== type?.id);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const trimmed = name.trim();
    const n = Number(months);
    const badName = trimmed === '' || trimmed.length > RECALL_TYPE_NAME_MAX;
    const badMonths =
      months.trim() === '' || !Number.isInteger(n) || n < RECALL_TYPE_MONTHS_MIN || n > RECALL_TYPE_MONTHS_MAX;
    setNameError(badName ? copy.invalidName : null);
    setMonthsError(badMonths ? copy.invalidMonths : null);
    if (badName || badMonths) return;

    const plan = planExclusion({
      self: { id: type?.id ?? null, exclusionGroup: type?.exclusionGroup ?? null },
      partnerId: partnerId || null,
      types,
    });
    const input: UpdateRecallTypeInput = {
      name: trimmed,
      defaultIntervalMonths: n,
      active,
      ...(plan.selfGroup !== undefined ? { exclusionGroup: plan.selfGroup } : {}),
      // Solo si cambió: un enlace que se desactivó después se conserva sin tocarlo.
      ...(appointmentTypeId !== initialAppointmentTypeId ? { appointmentTypeId: appointmentTypeId || null } : {}),
    };
    setSubmitting(true);
    if (plan.partnerPatch) {
      const partner = others.find((t) => t.id === plan.partnerPatch!.id);
      try {
        onSaved([await updateRecallType(token, plan.partnerPatch.id, { exclusionGroup: plan.partnerPatch.exclusionGroup })]);
      } catch (err) {
        setError(copy.partnerFailed(partner?.name ?? '', apiErrorMessage(err, copy.partialReason)));
        setSubmitting(false);
        return;
      }
    }
    let saved: RecallType;
    try {
      saved = editing
        ? await updateRecallType(token, type.id, input)
        : await createRecallType(token, { ...input, name: trimmed, defaultIntervalMonths: n });
    } catch (err) {
      setError(apiErrorMessage(err, copy.saveError));
      setSubmitting(false);
      return;
    }
    onSaved([saved]);
    onOpenChange(false);
    setSubmitting(false);
    if (!sameSet(triggerIds, initialTriggers)) await saveTriggers(token, saved, triggerIds, onSaved);
  }

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={editing ? copy.editTitle : copy.createTitle}
      description={copy.description}
      onSubmit={(e) => void handleSubmit(e)}
      submitLabel={editing ? copy.save : copy.create}
      submitting={submitting}
      error={error}
      ownValidation
    >
      <FormField htmlFor="rt-name" label={copy.name} error={nameError}>
        <Input
          id="rt-name"
          value={name}
          maxLength={RECALL_TYPE_NAME_MAX}
          placeholder={copy.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={nameError ? true : undefined}
          required
        />
      </FormField>
      <FormField
        htmlFor="rt-months"
        label={copy.months}
        hint={editing ? copy.monthsEditHint : copy.monthsHint}
        error={monthsError}
      >
        <Input
          id="rt-months"
          type="number"
          inputMode="numeric"
          min={RECALL_TYPE_MONTHS_MIN}
          max={RECALL_TYPE_MONTHS_MAX}
          step={1}
          value={months}
          onChange={(e) => setMonths(e.target.value)}
          aria-invalid={monthsError ? true : undefined}
          className="tabular-nums sm:max-w-40"
          required
        />
      </FormField>
      <Checkbox
        label={copy.active}
        description={copy.activeHint}
        checked={active}
        onChange={(e) => setActive(e.target.checked)}
      />
      <FormField htmlFor="rt-exclusive" label={copy.exclusive} hint={copy.exclusiveHint}>
        <NativeSelect id="rt-exclusive" value={partnerId} onChange={(e) => setPartnerId(e.target.value)}>
          <option value="">{copy.none}</option>
          {others.map((t) => (
            <option key={t.id} value={t.id}>
              {t.active ? t.name : copy.inactiveOption(t.name)}
            </option>
          ))}
        </NativeSelect>
      </FormField>
      <FormField htmlFor="rt-appointment-type" label={copy.appointmentType} hint={copy.appointmentTypeHint}>
        {appointmentTypes === 'failed' ? (
          <FieldError
            label={copy.appointmentTypesError}
            onRetry={onRetryAppointmentTypes}
            className="h-10 w-full"
          />
        ) : (
          <NativeSelect
            id="rt-appointment-type"
            value={appointmentTypeId}
            disabled={appointmentTypes === 'loading'}
            onChange={(e) => setAppointmentTypeId(e.target.value)}
          >
            {appointmentTypeOptions(appointmentTypes, initialAppointmentTypeId)}
          </NativeSelect>
        )}
      </FormField>
      <RecallTriggersField token={token} current={type?.triggers ?? []} value={triggerIds} onChange={setTriggerIds} />
    </FormModal>
  );
}
