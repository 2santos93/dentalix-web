'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import { getTokenRole } from '@/lib/auth/token-role';
import { canSeeRateBacklog, getRateBacklog, type RateBacklog } from '@/lib/payments/rate-backlog-api';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { readyTimeZone, useSedeTimeZone } from '@/lib/locations/use-sede-time-zone';
import { wallDay } from '@/lib/time/wall-clock';
import { notifyError } from '@/components/errors/notify';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { EXCHANGE_RATE_SETTINGS_HREF } from './without-rate-notice';

// Copy como constantes (i18n-ready). Sin importes, pacientes ni países.
export const rateBacklogCopy = {
  label: 'Abonos sin tasa',
  title: (count: number, since: string | null) => {
    const what = count === 1 ? '1 abono sin tasa' : `${count} abonos sin tasa`;
    return since ? `${what} desde el ${since}` : `${what} desde hace más de 24 h`;
  },
  body: 'El saldo y las imputaciones no los cuentan hasta que haya tasa de su día. Reintentamos solos; si la tasa no llega, pasa a la tasa manual y registra la de ese día: al registrarla verás a cuántos de esos abonos servirá de respaldo.',
  link: 'Revisar la tasa de cambio',
  loadError: 'No pudimos comprobar si hay abonos sin tasa.',
};

const copy = rateBacklogCopy;

/**
 * Aviso DX-380 (OPS-045): solo para ADMIN, cuando la clínica tiene abonos que
 * llevan más de 24 h sin base de imputación o sin su tasa congelada. El barrido
 * los reintenta solo, cada vez más espaciado; si la tasa no llega, el ADMIN
 * pasa a manual y registra la de ese día en Ajustes › Tasa de cambio (DX-402:
 * la de un día anterior a «manual desde» sirve de respaldo a esos abonos), y
 * eso adelanta el reintento: el aviso desaparece cuando se resuelven. Solo el recuento y el
 * día (de la sede) del más antiguo: ningún dato del abono ni del paciente.
 * Advertencia, no error: nada falló en esta pantalla (`section` con nombre,
 * como el aviso de sedes por revisar). Si no se puede leer, el contenido de la
 * pantalla sigue bien: escalón 3 (toast con reintento), sin ocupar espacio.
 */
export function RateBacklogNotice({ token, className }: { token: string; className?: string }) {
  const visible = canSeeRateBacklog(getTokenRole(token));
  const [backlog, setBacklog] = useState<RateBacklog | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const fmt = readyFormat(useSedeFormat(token));
  const timeZone = readyTimeZone(useSedeTimeZone(token));

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    getRateBacklog(token)
      .then((data) => {
        if (!cancelled) setBacklog(data);
      })
      .catch(() => {
        if (cancelled) return;
        setBacklog(null);
        notifyError(copy.loadError, { onRetry: () => setReloadKey((k) => k + 1) });
      });
    return () => {
      cancelled = true;
    };
  }, [visible, token, reloadKey]);

  if (!visible || !backlog || backlog.count === 0) return null;
  const since =
    backlog.oldestSince && fmt && timeZone ? fmt.civilDate(wallDay(backlog.oldestSince, timeZone)) : null;

  return (
    <section
      aria-label={copy.label}
      className={cn(
        'flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-ink sm:flex-row sm:items-start sm:justify-between sm:gap-6',
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5">
        {/* `mt-0.5` alinea el icono con la primera línea, no con la caja. */}
        <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning" />
        <div className="flex min-w-0 flex-col gap-1 text-sm">
          <p className="font-medium tabular-nums">{copy.title(backlog.count, since)}</p>
          {/* `ink`, no `muted`: sobre el tinte de advertencia `muted` no llega a 4,5:1. */}
          <p className="max-w-[68ch]">{copy.body}</p>
        </div>
      </div>
      <Link
        href={EXCHANGE_RATE_SETTINGS_HREF}
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'min-h-11 shrink-0 self-start sm:min-h-9')}
      >
        {copy.link}
      </Link>
    </section>
  );
}
