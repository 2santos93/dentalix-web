'use client';
import { useState } from 'react';
import { toast } from 'sonner';
import { apiErrorMessage } from '@/lib/api/error-message';
import { EXTRA_PERMISSIONS, type ExtraPermission } from '@/lib/auth/permissions';
import { replaceStaffPermissions, type ClinicRole } from '@/lib/staff/staff-api';
import { Switch } from '@/components/ui/switch';
import { SectionHeader } from '@/components/ui/section-header';
import { InlineError } from '@/components/errors/inline-error';
import { DATA_SECTION_CLASS } from '@/components/patients/data-section';
import { staffPermissionsCopy } from './staff-permissions-copy';

export { staffPermissionsCopy };

/** Lo que cada rol ya hace de serie (como en la API): el interruptor sale fijo y encendido. */
function includedInRole(role: ClinicRole, permission: ExtraPermission): boolean {
  return role === 'RECEPTION' && permission === 'PAYMENT_REGISTER';
}

interface StaffPermissionsSectionProps {
  token: string;
  userId: string;
  memberRole: ClinicRole;
  /** Los concedidos, de `GET /staff/:userId`. */
  initial: readonly ExtraPermission[];
}

/**
 * DX-090: «Permisos extra» de la ficha del miembro (solo ADMIN y miembros
 * activos). Un interruptor por permiso del catálogo; cada cambio se guarda al
 * momento (`PUT /staff/:userId/permissions` con la lista completa), por eso
 * es un `Switch` y no una casilla con «Guardar» (DESIGN.md → Form Controls).
 * Si falla, vuelve a como estaba y el error queda bajo los interruptores.
 */
export function StaffPermissionsSection({ token, userId, memberRole, initial }: StaffPermissionsSectionProps) {
  const [granted, setGranted] = useState<readonly ExtraPermission[]>(initial);
  const [saving, setSaving] = useState<ExtraPermission | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (memberRole === 'ADMIN') {
    return (
      <section aria-labelledby="staff-permissions-title" className={DATA_SECTION_CLASS}>
        <SectionHeader
          titleId="staff-permissions-title"
          title={staffPermissionsCopy.title}
          description={staffPermissionsCopy.adminHint}
        />
      </section>
    );
  }

  async function toggle(permission: ExtraPermission, on: boolean) {
    const before = granted;
    const next = EXTRA_PERMISSIONS.filter((p) => (p === permission ? on : before.includes(p)));
    setError(null);
    setGranted(next);
    setSaving(permission);
    try {
      const result = await replaceStaffPermissions(token, userId, [...next]);
      setGranted(result.extraPermissions);
      const label = staffPermissionsCopy.labels[permission];
      toast.success(on ? staffPermissionsCopy.granted(label) : staffPermissionsCopy.revoked(label));
    } catch (err) {
      setGranted(before);
      setError(apiErrorMessage(err, staffPermissionsCopy.saveError));
    } finally {
      setSaving(null);
    }
  }

  return (
    <section aria-labelledby="staff-permissions-title" className={DATA_SECTION_CLASS}>
      <SectionHeader
        titleId="staff-permissions-title"
        title={staffPermissionsCopy.title}
        description={staffPermissionsCopy.hint}
      />
      <fieldset className="flex min-w-0 flex-col gap-1" aria-describedby={error ? 'staff-permissions-error' : undefined}>
        <legend className="sr-only">{staffPermissionsCopy.legend}</legend>
        <div className="flex flex-col divide-y divide-border-subtle">
          {EXTRA_PERMISSIONS.map((permission) => {
            const fixed = includedInRole(memberRole, permission);
            return (
              <Switch
                key={permission}
                id={`staff-permission-${permission}`}
                label={<span className="font-medium">{staffPermissionsCopy.labels[permission]}</span>}
                description={
                  fixed
                    ? `${staffPermissionsCopy.descriptions[permission]} ${staffPermissionsCopy.includedInRole}`
                    : staffPermissionsCopy.descriptions[permission]
                }
                checked={fixed || granted.includes(permission)}
                disabled={fixed || saving !== null}
                aria-busy={saving === permission || undefined}
                onChange={(e) => void toggle(permission, e.target.checked)}
              />
            );
          })}
        </div>
      </fieldset>
      {error ? (
        <InlineError id="staff-permissions-error" variant="summary">
          {error}
        </InlineError>
      ) : null}
    </section>
  );
}
