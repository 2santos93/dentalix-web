'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useState } from 'react';
import { apiErrorMessage } from '@/lib/api/error-message';
import { listStaff, type StaffMember } from '@/lib/appointments/staff-api';
import { getTokenUserId } from '@/lib/auth/token-role';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { locationTimeZone } from '@/lib/locations/location-settings';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { updateItem, type TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import { attendsAt, attributionInstant, isAttendingRole } from '@/lib/treatment-plans/item-attribution';
import { Input } from '@/components/ui/input';
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
  // DX-305: un realizado «Sin atribuir» se atribuye entero (quién, cuándo y
  // dónde) o no cuenta en la producción de «Comparar sedes».
  attributeTitle: 'Atribuir el procedimiento',
  attributeDescription:
    'Está «Sin atribuir»: indica quién lo realizó, cuándo y en qué sede para que cuente en la producción. Solo la administración puede hacerlo y queda en el registro de auditoría.',
  locationLabel: 'Sede donde se realizó',
  locationPlaceholder: 'Elige una sede',
  locationRequired: 'Elige la sede donde se realizó.',
  dateLabel: 'Fecha en que se realizó',
  dateRequired: 'Indica la fecha en que se realizó (no puede ser futura).',
  attributeError: 'No pudimos atribuir el procedimiento. Intenta de nuevo.',
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
  /**
   * Sedes de la clínica: al atribuir un «Sin atribuir» (DX-305) se elige en
   * cuál se realizó.
   */
  locations?: readonly ClinicLocation[];
  /** Vuelve a leer las sedes (la elegida no tenía zona horaria). */
  onRetryLocations: () => void;
  /**
   * DX-439: marcar desde la cita atendida («Pendiente de cerrar»): la API toma
   * la sede y la fecha de esa cita. Quien llama pasa la sede de la cita como
   * `activeLocationId` (los profesionales que se ofrecen son los de ella).
   */
  appointmentId?: string;
  /** DX-439: quién viene elegido (el profesional de la cita), si atiende allí. */
  preferredPerformerId?: string;
  onSaved: (item: TreatmentPlanItem) => void;
}

/**
 * DX-050: al marcar un procedimiento «Realizado» se elige quién lo hizo, entre
 * los miembros que atienden (DENTIST y ADMIN) en la sede activa. Viene elegido
 * quien marca si atiende; si no (la asistente), el único posible si solo hay
 * uno; si no, hay que elegir. La sede y la hora las pone el servidor.
 * Corregir un realizado «Sin atribuir» (DX-305) pide además la sede y la fecha:
 * los profesionales que se ofrecen son los que atienden en la sede elegida.
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
  locations = [],
  onRetryLocations,
  appointmentId,
  preferredPerformerId,
  onSaved,
}: MarkDoneModalProps) {
  const selectId = useId();
  const locationSelectId = useId();
  const dateId = useId();
  const attribute = mode === 'correct' && item.performedLocationId === null;
  const pickable = locations.filter((l) => l.isActive);
  const [locationId, setLocationId] = useState(
    attribute && pickable.some((l) => l.id === activeLocationId) ? (activeLocationId ?? '') : '',
  );
  const [day, setDay] = useState('');
  const chosenLocation = pickable.find((l) => l.id === locationId) ?? null;
  // El tope de la fecha es «hoy» en la zona de la sede elegida; sin sede
  // elegida no hay tope, y una sede sin zona muestra `SedeConfigError`.
  const chosenZone = locationTimeZone(chosenLocation);
  const today = chosenZone ? sedeToday(chosenZone) : null;
  const zoneMissing = chosenLocation !== null && chosenZone === null;
  // Al atribuir, quien lo realizó tiene que atender en la sede elegida.
  const scopeLocationId = attribute ? locationId || null : activeLocationId;
  const [members, setMembers] = useState<StaffMember[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [performerId, setPerformerId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listStaff(token)
      .then((list) => {
        if (cancelled) return;
        const attending = list
          .filter((m) => isAttendingRole(m.role))
          .sort((x, y) => x.fullName.localeCompare(y.fullName, 'es'));
        setMembers(attending);
        setLoadFailed(false);
        // Al atribuir no se preselecciona a nadie (el ítem no tiene a quién).
        const candidates = attending.filter((m) => attendsAt(m.locationIds, activeLocationId));
        const me = getTokenUserId(token);
        const preferred =
          mode === 'correct'
            ? item.performedById
            : preferredPerformerId && candidates.some((m) => m.userId === preferredPerformerId)
              ? preferredPerformerId
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
  }, [open, token, mode, item.performedById, activeLocationId, preferredPerformerId, reloadKey]);

  // La sede elegida al atribuir filtra la lista ya cargada, sin volver a pedirla.
  const staff = members === null ? null : members.filter((m) => attendsAt(m.locationIds, scopeLocationId));

  const retry = useCallback(() => {
    setLoadFailed(false);
    setMembers(null);
    setReloadKey((k) => k + 1);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (attribute && !chosenLocation) {
      setError(copy.locationRequired);
      return;
    }
    if (attribute && (!day || zoneMissing || (today !== null && day > today))) {
      setError(copy.dateRequired);
      return;
    }
    if (!performerId) {
      setError(copy.performerRequired);
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const patch =
        mode === 'done'
          ? { status: 'DONE' as const, performedById: performerId, ...(appointmentId ? { appointmentId } : {}) }
          : attribute && chosenLocation && chosenZone
            ? {
                performedById: performerId,
                performedLocationId: chosenLocation.id,
                completedAt: attributionInstant(day, chosenZone),
              }
            : { performedById: performerId };
      const saved = await updateItem(token, planId, item.id, patch);
      onSaved(saved);
    } catch (err) {
      setError(
        apiErrorMessage(err, mode === 'done' ? copy.doneError : attribute ? copy.attributeError : copy.correctError),
      );
    } finally {
      setSubmitting(false);
    }
  }

  const unchanged = mode === 'correct' && !attribute && performerId === (item.performedById ?? '');
  const title = mode === 'done' ? copy.doneTitle : attribute ? copy.attributeTitle : copy.correctTitle;
  const description =
    mode === 'done' ? copy.doneDescription : attribute ? copy.attributeDescription : copy.correctDescription;

  return (
    <FormModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      onSubmit={handleSubmit}
      submitLabel={mode === 'done' ? copy.doneSubmit : copy.correctSubmit}
      submitting={submitting}
      submitDisabled={staff === null || staff.length === 0 || unchanged}
      error={error}
    >
      <p className="rounded-lg bg-surface-2 px-3 py-2 text-sm font-medium text-ink">{subject}</p>
      {attribute ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={locationSelectId}>{copy.locationLabel}</Label>
            <select
              id={locationSelectId}
              value={locationId}
              disabled={submitting}
              aria-required
              aria-invalid={error === copy.locationRequired || undefined}
              onChange={(e) => {
                const next = e.target.value;
                setLocationId(next);
                setError(null);
                // Quien no atiende en la nueva sede deja de estar elegido.
                const stillThere = members?.some(
                  (m) => m.userId === performerId && attendsAt(m.locationIds, next || null),
                );
                if (!stillThere) setPerformerId('');
              }}
              className={cn(fieldClass, 'h-11 md:h-10', error === copy.locationRequired && 'border-danger')}
            >
              <option value="" disabled>
                {copy.locationPlaceholder}
              </option>
              {pickable.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={dateId}>{copy.dateLabel}</Label>
            {zoneMissing ? (
              <SedeConfigError
                kind="timeZone"
                variant="field"
                retryId={dateId}
                onRetry={onRetryLocations}
                className="h-11 md:h-10"
              />
            ) : (
              <Input
                id={dateId}
                type="date"
                value={day}
                max={today ?? undefined}
                disabled={submitting}
                aria-required
                aria-invalid={error === copy.dateRequired || undefined}
                onChange={(e) => {
                  setDay(e.target.value);
                  setError(null);
                }}
                className={cn('h-11 tabular-nums md:h-10', error === copy.dateRequired && 'border-danger')}
              />
            )}
          </div>
        </div>
      ) : null}
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
