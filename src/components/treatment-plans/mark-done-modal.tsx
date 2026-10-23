'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { getTokenUserId } from '@/lib/auth/token-role';
import { updateItem, type TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import { attendsAt, isAttendingRole } from '@/lib/treatment-plans/item-attribution';
import { FormModal } from '@/components/shared/form-modal';
import { FieldError } from '@/components/errors/field-error';
import { Label } from '@/components/ui/label';
import { fieldClass } from '@/lib/ui/field-class';
import { cn } from '@/lib/utils';

const copy = {
  doneTitle: 'Marcar como realizado',
  doneDescription: 'Queda registrado quién lo hizo, cuándo y en qué sede: cuenta en la producción de ese profesional.',
  correctTitle: 'Corregir quién lo realizó',
  correctDescription:
    'Solo la administración puede corregirlo. El cambio queda en el registro de auditoría con el antes y el después.',
  performerLabel: 'Profesional que lo realizó',
  performerPlaceholder: 'Elige un profesional',
  performerRequired: 'Elige qué profesional lo realizó.',
  loading: 'Cargando profesionales…',
  loadError: 'No pudimos cargar los profesionales',
  empty: 'Nadie del equipo que atiende pacientes trabaja en esta sede.',
  inLocation: (name: string) => `Se registra en ${name}.`,
  defaultLocation: 'Sin una sede activa, se registra en la sede por defecto de la clínica.',
  doneSubmit: 'Marcar realizado',
  correctSubmit: 'Guardar',
  doneError: 'No pudimos marcar el procedimiento como realizado. Intenta de nuevo.',
  correctError: 'No pudimos corregir quién lo realizó. Intenta de nuevo.',
};

export interface MarkDoneModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  token: string;
  planId: string;
  item: TreatmentPlanItem;
  /** Qué procedimiento es, p. ej. «Resina · diente 16». */
  subject: string;
  /** `done`: pasar a realizado; `correct`: un ADMIN corrige quién lo hizo. */
  mode: 'done' | 'correct';
  /** Sede activa de la sesión (la que la API sella al marcar); `null` = todas. */
  activeLocationId: string | null;
  locationName: string | null;
  onSaved: (item: TreatmentPlanItem) => void;
}

/**
 * DX-050: al marcar un procedimiento «Realizado» se elige quién lo hizo, entre
 * los miembros que atienden (DENTIST y ADMIN) en la sede activa. Viene elegido
 * quien marca si atiende; si no (la asistente), el único posible si solo hay
 * uno; si no, hay que elegir. La sede y la hora las pone el servidor.
 * El estado vive aquí: quien lo usa lo monta con una `key` por ítem.
 */
export function MarkDoneModal({
  open,
  onOpenChange,
  token,
  planId,
  item,
  subject,
  mode,
  activeLocationId,
  locationName,
  onSaved,
}: MarkDoneModalProps) {
  const selectId = useId();
  const [staff, setStaff] = useState<StaffMember[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [performerId, setPerformerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listStaff(token)
      .then((members) => {
        if (cancelled) return;
        const candidates = members
          .filter((m) => isAttendingRole(m.role) && attendsAt(m.locationIds, activeLocationId))
          .sort((x, y) => x.fullName.localeCompare(y.fullName, 'es'));
        setStaff(candidates);
        setLoadFailed(false);
        const me = getTokenUserId(token);
        const preferred =
          mode === 'correct'
            ? item.performedById
            : candidates.some((m) => m.userId === me)
              ? me
              : candidates.length === 1
                ? candidates[0].userId
                : null;
        setPerformerId(preferred && candidates.some((m) => m.userId === preferred) ? preferred : '');
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [open, token, mode, item.performedById, activeLocationId, reloadKey]);

  const retry = useCallback(() => {
    setLoadFailed(false);
    setStaff(null);
    setReloadKey((k) => k + 1);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!performerId) {
      setError(copy.performerRequired);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const saved = await updateItem(
        token,
        planId,
        item.id,
        mode === 'done' ? { status: 'DONE', performedById: performerId } : { performedById: performerId },
      );
      onSaved(saved);
    } catch (err) {
      setError(apiErrorMessage(err, mode === 'done' ? copy.doneError : copy.correctError));
    } finally {
      setSubmitting(false);
    }
  }

  const unchanged = mode === 'correct' && performerId === (item.performedById ?? '');

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={mode === 'done' ? copy.doneTitle : copy.correctTitle}
      description={mode === 'done' ? copy.doneDescription : copy.correctDescription}
      onSubmit={handleSubmit}
      submitLabel={mode === 'done' ? copy.doneSubmit : copy.correctSubmit}
      submitting={submitting}
      submitDisabled={staff === null || staff.length === 0 || unchanged}
      error={error}
    >
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink">{subject}</p>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={selectId}>{copy.performerLabel}</Label>
        {loadFailed ? (
          <FieldError label={copy.loadError} onRetry={retry} retryId={selectId} className="h-11 md:h-10" focusRetry />
        ) : staff === null ? (
          <p role="status" className="flex h-11 items-center text-sm text-muted md:h-10">
            {copy.loading}
          </p>
        ) : staff.length === 0 ? (
          <p role="status" className="text-sm text-muted">
            {copy.empty}
          </p>
        ) : (
          <select
            id={selectId}
            value={performerId}
            disabled={submitting}
            aria-required
            aria-invalid={error === copy.performerRequired || undefined}
            onChange={(e) => {
              setPerformerId(e.target.value);
              setError(null);
            }}
            className={cn(fieldClass, 'h-11 md:h-10', error === copy.performerRequired && 'border-danger')}
          >
            <option value="" disabled>
              {copy.performerPlaceholder}
            </option>
            {staff.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
              </option>
            ))}
          </select>
        )}
      </div>
      {mode === 'done' && (locationName || activeLocationId === null) ? (
        <p className="text-sm text-muted">{locationName ? copy.inLocation(locationName) : copy.defaultLocation}</p>
      ) : null}
    </FormModal>
  );
}
