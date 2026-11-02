'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Info } from 'lucide-react';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageClinicSettings, getClinicSettings } from '@/lib/clinic/clinic-settings-api';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export const clinicFiscalNoticeCopy = {
  label: 'Datos fiscales pendientes',
  title: 'Faltan los datos fiscales de la clínica.',
  body: 'Los recibos salen con el aviso «Datos fiscales pendientes» hasta que pongas la razón social y el identificador fiscal.',
  action: 'Completar datos',
};

const copy = clinicFiscalNoticeCopy;

/**
 * DX-019 (pendiente de inicio, enlaza con DX-020): solo para ADMIN, mientras
 * la clínica no tenga razón social o identificador fiscal. Desaparece al
 * guardarlos en Ajustes › Datos de la clínica. Informativo, como el aviso de
 * sedes por revisar: no hay nada roto.
 */
export function ClinicFiscalNotice({ token, className }: { token: string; className?: string }) {
  const isAdmin = canManageClinicSettings(getTokenRole(token));
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    getClinicSettings(token)
      .then((settings) => {
        if (!cancelled) setPending(settings.fiscalDataPending);
      })
      .catch(() => {
        // Sin datos no hay aviso: no es un fallo del panel.
        if (!cancelled) setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isAdmin, token]);

  if (!isAdmin || !pending) return null;

  return (
    <section
      aria-label={copy.label}
      data-testid="clinic-fiscal-notice"
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-border bg-surface px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <p className="font-medium text-ink">{copy.title}</p>
          <p className="max-w-[68ch] text-muted">{copy.body}</p>
        </div>
      </div>
      <Link
        href="/settings/clinica"
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0 self-start')}
      >
        {copy.action}
      </Link>
    </section>
  );
}
