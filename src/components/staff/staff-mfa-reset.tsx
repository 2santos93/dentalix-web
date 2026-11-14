'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  getStaffMfa,
  resetStaffMfa,
  type MfaResetReason,
} from '@/lib/auth/mfa-api';
import { Button } from '@/components/ui/button';
import { Callout } from '@/components/ui/callout';
import { NativeSelect } from '@/components/ui/native-select';
import { FormField } from '@/components/shared/form-field';
import { ReauthDialog } from '@/components/profile/mfa-settings';

const copy = {
  on: 'Tiene la verificación en dos pasos activa.',
  reset: 'Restablecer',
  title: 'Restablecer la verificación en dos pasos',
  description: (name: string) =>
    `Para cuando ${name} perdió el móvil y sus códigos de recuperación. Se borra su verificación, se cierran sus sesiones y le avisamos por correo. Confirma con tu contraseña y tu código.`,
  reasonLabel: 'Motivo',
  reasons: {
    LOST_DEVICE: 'Perdió el móvil',
    DEVICE_REPLACED: 'Cambió de móvil',
    SECURITY_INCIDENT: 'Incidente de seguridad',
  } satisfies Record<MfaResetReason, string>,
  submit: 'Restablecer',
  error: 'No pudimos restablecerla. Intenta de nuevo.',
  done: 'Verificación restablecida. Le avisamos por correo.',
};

/**
 * DX-021-bis: un ADMIN restablece la verificación de OTRO miembro. Sin nada que
 * restablecer (o si el estado no llega, o es su propio perfil), no se muestra:
 * es una acción de excepción.
 */
export function StaffMfaReset({
  token,
  userId,
  memberName,
  self,
}: {
  token: string;
  userId: string;
  memberName: string;
  self: boolean;
}) {
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<MfaResetReason>('LOST_DEVICE');

  useEffect(() => {
    if (self) return;
    let cancelled = false;
    getStaffMfa(token, userId)
      .then((res) => {
        if (!cancelled) setEnabled(res.enabled);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, userId, self]);

  if (self || !enabled) return null;

  return (
    <>
      <Callout
        tone="info"
        action={
          <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
            {copy.reset}
          </Button>
        }
      >
        {copy.on}
      </Callout>
      {open ? (
        <ReauthDialog
          title={copy.title}
          description={copy.description(memberName)}
          submitLabel={copy.submit}
          destructive
          errorFallback={copy.error}
          onClose={() => setOpen(false)}
          onConfirm={async (currentPassword, factor) => {
            await resetStaffMfa(token, userId, { currentPassword, reason, factor });
            setEnabled(false);
            setOpen(false);
            toast.success(copy.done);
          }}
        >
          <FormField htmlFor="mfa-reset-reason" label={copy.reasonLabel}>
            <NativeSelect
              id="mfa-reset-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as MfaResetReason)}
            >
              {Object.entries(copy.reasons).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </NativeSelect>
          </FormField>
        </ReauthDialog>
      ) : null}
    </>
  );
}
