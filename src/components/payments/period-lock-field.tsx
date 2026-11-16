'use client';
import * as React from 'react';
import { FormField, fieldErrorId } from '@/components/shared/form-field';
import { Textarea } from '@/components/ui/textarea';
import type { RegionalFormat } from '@/lib/format/regional-format';
import { sedeCivilDate } from '@/lib/format/sede-number';
import { addDaysIso } from '@/lib/locations/provider-schedule';
import {
  LOCK_OVERRIDE_REASON_MAX,
  LOCK_OVERRIDE_REASON_MIN,
  isDayLocked,
  type PeriodLock,
} from '@/lib/financial-lock/financial-lock-api';

// Copy como constantes (i18n-ready).
export const periodLockCopy = {
  // Junto al campo de fecha: por qué el calendario no ofrece esos días.
  hint: (through: string) =>
    `Cierre contable: los días hasta el ${through} están cerrados y no admiten abonos.`,
  // DX-091: la 1ª cuota de un plan de cuotas.
  planHint: (through: string) =>
    `Cierre contable: los días hasta el ${through} están cerrados; la primera cuota tiene que vencer después.`,
  hintOverride: (through: string) =>
    `Cierre contable hasta el ${through}. Como administración puedes usar una fecha cerrada indicando el motivo; queda registrado.`,
  lockedDate: (through: string) =>
    `Esa fecha está en un período contable cerrado (hasta el ${through}). Elige una fecha posterior o pide a administración que lo revise.`,
  reasonLabel: 'Motivo para registrar en un período cerrado',
  voidReasonLabel: 'Motivo para anular en un período cerrado',
  planReasonLabel: 'Motivo para cuotas en un período cerrado',
  planCancelReasonLabel: 'Motivo para cancelarlo con cuotas en un período cerrado',
  // Igual que el `voidBlockedReason` de la API en el estado de cuenta.
  voidBlocked: 'El abono es de un período contable cerrado: ya no se puede anular. Pide a administración que lo revise.',
  reasonHint: `Queda registrado quién, cuándo y por qué. Entre ${LOCK_OVERRIDE_REASON_MIN} y ${LOCK_OVERRIDE_REASON_MAX} caracteres.`,
  reasonMissing: `Escribe el motivo (al menos ${LOCK_OVERRIDE_REASON_MIN} caracteres): la fecha está en un período cerrado.`,
};

/**
 * El primer día que el calendario ofrece: el siguiente al cierre, salvo para
 * quien puede saltarlo (ADMIN con la exención), que ve todos.
 */
export function minDateAfterLock(lock: PeriodLock | null): string | undefined {
  if (!lock?.lockedThrough || lock.canOverride) return undefined;
  return addDaysIso(lock.lockedThrough, 1);
}

/** El texto de ayuda del campo de fecha, o `undefined` sin cierre. */
export function periodLockHint(
  lock: PeriodLock | null,
  fmt: RegionalFormat | null,
  subject: 'payment' | 'plan' = 'payment',
): string | undefined {
  if (!lock?.lockedThrough) return undefined;
  const through = sedeCivilDate(lock.lockedThrough, fmt);
  if (lock.canOverride) return periodLockCopy.hintOverride(through);
  return subject === 'plan' ? periodLockCopy.planHint(through) : periodLockCopy.hint(through);
}

/** ¿Hace falta el motivo de la excepción para `day`? */
export function needsLockReason(lock: PeriodLock | null, day: string): boolean {
  return Boolean(lock?.canOverride) && isDayLocked(day, lock?.lockedThrough);
}

/**
 * El error del día elegido, o `null`: cerrado y sin poder saltarlo. El
 * calendario ya no lo ofrece, pero el día se puede teclear.
 */
export function lockedDateError(lock: PeriodLock | null, day: string, fmt: RegionalFormat | null): string | null {
  if (!lock?.lockedThrough || lock.canOverride || !isDayLocked(day, lock.lockedThrough)) return null;
  return periodLockCopy.lockedDate(sedeCivilDate(lock.lockedThrough, fmt));
}

/** El motivo recortado si vale, o `null` (entonces el campo enseña `reasonMissing`). */
export function validLockReason(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length >= LOCK_OVERRIDE_REASON_MIN && trimmed.length <= LOCK_OVERRIDE_REASON_MAX ? trimmed : null;
}

interface LockOverrideReasonFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  disabled?: boolean;
}

/** DX-091: el motivo del ADMIN para hacerlo en un período contable cerrado. */
export function LockOverrideReasonField({ id, label, value, onChange, error, disabled }: LockOverrideReasonFieldProps) {
  return (
    <FormField htmlFor={id} label={label} error={error} hint={periodLockCopy.reasonHint}>
      <Textarea
        id={id}
        name={id}
        rows={2}
        maxLength={LOCK_OVERRIDE_REASON_MAX}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? fieldErrorId(id) : undefined}
      />
    </FormField>
  );
}
