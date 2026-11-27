'use client';
import * as React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { dentitionMismatchMessage } from '@/lib/odontogram/odontogram-errors';
import type { StaffMember } from '@/lib/appointments/staff-api';
import { loadStaff } from '@/lib/session/session-store';
import { getTokenUserId } from '@/lib/auth/token-role';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { sedeToday } from '@/lib/locations/use-sede-time-zone';
import { locationTimeZone } from '@/lib/locations/location-settings';
import { recallNoticeFor } from '@/lib/recall/recall-notice';
import { SedeConfigError } from '@/components/locations/sede-config-error';
import { updateItem, type TreatmentPlanItem } from '@/lib/treatment-plans/treatment-plans-api';
import { attendsAt, attributionInstant, isAttendingRole } from '@/lib/treatment-plans/item-attribution';
import { FormModal } from '@/components/shared/form-modal';
import { FieldError } from '@/components/errors/field-error';
import { InlineError } from '@/components/errors/inline-error';
import { fieldErrorId } from '@/components/shared/form-field';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { DatePicker } from '@/components/ui/date-picker';

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
  // DX-132: el 422 TOOTH_DENTITION_MISMATCH. El ítem NO quedó realizado.
  dentitionHint: 'El procedimiento sigue sin marcar. Ajusta la dentición en el odontograma y vuelve a marcarlo.',
  dentitionLink: (tooth: string) => `Abrir el diente ${tooth} en el odontograma`,
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
  /**
   * DX-132: enlace a la pestaña Odontograma del paciente en el diente del
   * ítem, para resolver el 422 de dentición (el diente no cabe en la carta).
   */
  odontogramHref?: string | null;
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
  odontogramHref = null,
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
  // Fallo del envío (resumen arriba del formulario).
  const [error, setError] = useState<string | null>(null);
  // DX-298 (FE-032): la validación va junto a su campo, con `aria-describedby`.
  const [fieldError, setFieldError] = useState<{ field: 'location' | 'date' | 'performer'; message: string } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  // DX-132: el último envío chocó con la dentición de la carta.
  const [dentitionMismatch, setDentitionMismatch] = useState(false);
  // Reintentar vuelve a la API; abrir el modal otra vez usa la lista de la sesión.
  const freshRef = useRef(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // DX-298 (FE-073): la lista sale de la caché de la sesión: marcar varios
    // ítems seguidos no repite `GET /staff`.
    const fresh = freshRef.current;
    freshRef.current = false;
    loadStaff(token, { fresh })
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

  // El foco va al campo que falta (su error, por `aria-describedby`, se lee con él).
  useEffect(() => {
    if (!fieldError) return;
    const id = fieldError.field === 'location' ? locationSelectId : fieldError.field === 'date' ? dateId : selectId;
    const el = document.getElementById(id);
    const target = el?.matches('input, select, button, [tabindex]') ? el : el?.querySelector<HTMLElement>('[tabindex], input, button');
    target?.focus();
  }, [fieldError, locationSelectId, dateId, selectId]);

  // La sede elegida al atribuir filtra la lista ya cargada, sin volver a pedirla.
  const staff = members === null ? null : members.filter((m) => attendsAt(m.locationIds, scopeLocationId));

  const retry = useCallback(() => {
    setLoadFailed(false);
    setMembers(null);
    freshRef.current = true;
    setReloadKey((k) => k + 1);
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (attribute && !chosenLocation) {
      setFieldError({ field: 'location', message: copy.locationRequired });
      return;
    }
    if (attribute && (!day || zoneMissing || (today !== null && day > today))) {
      setFieldError({ field: 'date', message: copy.dateRequired });
      return;
    }
    if (!performerId) {
      setFieldError({ field: 'performer', message: copy.performerRequired });
      return;
    }
    setFieldError(null);
    setError(null);
    setDentitionMismatch(false);
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
      // DX-015-bis: «Recall de Higiene: vence el …» si el procedimiento movió un recall.
      const recallNotice = recallNoticeFor(saved, locations, activeLocationId);
      if (recallNotice) toast.success(recallNotice);
      onSaved(saved);
    } catch (err) {
      // DX-132: el diente no cabe en la dentición de su posición. El mensaje del
      // servidor nombra diente y posición; debajo, qué hacer y dónde.
      const mismatch = dentitionMismatchMessage(err);
      setDentitionMismatch(mismatch !== null);
      setError(
        mismatch ??
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
      <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm font-medium text-ink">{subject}</p>
      {dentitionMismatch ? (
        <div data-testid="mark-done-dentition-hint" className="flex flex-col items-start gap-1 text-sm text-muted">
          <p>{copy.dentitionHint}</p>
          {odontogramHref && item.toothNumber ? (
            <Link
              href={odontogramHref}
              className="inline-flex min-h-11 items-center font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text sm:min-h-0"
            >
              {copy.dentitionLink(item.toothNumber)}
            </Link>
          ) : null}
        </div>
      ) : null}
      {attribute ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label htmlFor={locationSelectId}>{copy.locationLabel}</Label>
            <NativeSelect
              id={locationSelectId}
              selectClassName="max-md:h-11"
              value={locationId}
              disabled={submitting}
              aria-required
              aria-invalid={fieldError?.field === 'location' || undefined}
              aria-describedby={fieldError?.field === 'location' ? fieldErrorId(locationSelectId) : undefined}
              onChange={(e) => {
                const next = e.target.value;
                setLocationId(next);
                setFieldError(null);
                setError(null);
                // Quien no atiende en la nueva sede deja de estar elegido.
                const stillThere = members?.some(
                  (m) => m.userId === performerId && attendsAt(m.locationIds, next || null),
                );
                if (!stillThere) setPerformerId('');
              }}
            >
              <option value="" disabled>
                {copy.locationPlaceholder}
              </option>
              {pickable.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </NativeSelect>
            {fieldError?.field === 'location' ? (
              <InlineError id={fieldErrorId(locationSelectId)}>{fieldError.message}</InlineError>
            ) : null}
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <Label id={`${dateId}-label`} htmlFor={dateId}>
              {copy.dateLabel}
            </Label>
            {zoneMissing ? (
              <SedeConfigError
                kind="timeZone"
                variant="field"
                retryId={dateId}
                onRetry={onRetryLocations}
                className="h-11 md:h-10"
              />
            ) : (
              <DatePicker
                id={dateId}
                name={dateId}
                value={day || null}
                max={today ?? undefined}
                disabled={submitting}
                required
                aria-labelledby={`${dateId}-label`}
                aria-describedby={fieldError?.field === 'date' ? fieldErrorId(dateId) : undefined}
                isInvalid={fieldError?.field === 'date'}
                onChange={(next) => {
                  setDay(next ?? '');
                  setFieldError(null);
                  setError(null);
                }}
              />
            )}
            {fieldError?.field === 'date' ? (
              <InlineError id={fieldErrorId(dateId)}>{fieldError.message}</InlineError>
            ) : null}
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
          <NativeSelect
            id={selectId}
            selectClassName="max-md:h-11"
            value={performerId}
            disabled={submitting}
            aria-required
            aria-invalid={fieldError?.field === 'performer' || undefined}
            aria-describedby={fieldError?.field === 'performer' ? fieldErrorId(selectId) : undefined}
            onChange={(e) => {
              setPerformerId(e.target.value);
              setFieldError(null);
              setError(null);
            }}
          >
            <option value="" disabled>
              {copy.performerPlaceholder}
            </option>
            {staff.map((member) => (
              <option key={member.userId} value={member.userId}>
                {member.fullName}
              </option>
            ))}
          </NativeSelect>
        )}
        {fieldError?.field === 'performer' ? (
          <InlineError id={fieldErrorId(selectId)}>{fieldError.message}</InlineError>
        ) : null}
      </div>
      {mode === 'done' && (locationName || activeLocationId === null) ? (
        <p className="text-sm text-muted">{locationName ? copy.inLocation(locationName) : copy.defaultLocation}</p>
      ) : null}
    </FormModal>
  );
}
