'use client';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import type { components } from '@/lib/api/schema';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageExchangeRates } from '@/lib/exchange/exchange-settings-api';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';

export type PaymentWithoutRate = components['schemas']['PaymentWithoutRateDto'];

/** Ajustes › Tasa de cambio (DX-374). */
export const EXCHANGE_RATE_SETTINGS_HREF = '/settings/tasa-de-cambio';

// Copy como constantes (i18n-ready). Ningún texto nombra un país ni un banco.
export const withoutRateCopy = {
  title: (n: number) => (n === 1 ? '1 abono sin tasa' : `${n} abonos sin tasa`),
  body: 'El saldo todavía no los cuenta: falta la tasa de cambio de su día.',
  item: (amount: string, date: string) => `${amount} del ${date}`,
  adminLink: 'Registrar la tasa en Ajustes › Tasa de cambio',
  adminHint: 'En cuanto la registres, el saldo los cuenta en un minuto.',
  otherRoles: 'Pide a un administrador que registre la tasa de ese día en Ajustes › Tasa de cambio.',
};

/**
 * Aviso «sin tasa» (DX-375) donde se ve el saldo: los abonos en otra moneda
 * que no tenían tasa de su día se guardaron, pero el saldo no los cuenta hasta
 * que se registre la tasa (y el barrido la congele). Al ADMIN le enlaza a
 * Ajustes › Tasa de cambio; al resto le dice a quién pedírselo. No es un error
 * (nada falló): tono de advertencia y `role="status"`, sin interrumpir. Todo
 * el texto va en `ink`: `muted` sobre el tinte de advertencia no llega a
 * 4,5:1 (axe en claro). Importe y día con el formato de la sede y el código
 * ISO de la moneda (DX-378): mientras carga, o sin formato, «—».
 */
export function WithoutRateNotice({ token, payments }: { token: string; payments: PaymentWithoutRate[] }) {
  const fmt = readyFormat(useSedeFormat(token));
  if (payments.length === 0) return null;
  const canRegister = canManageExchangeRates(getTokenRole(token));
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning-subtle px-3 py-2 text-sm text-ink"
    >
      <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-text" />
      <div className="min-w-0 flex-1">
        <p className="font-medium">{withoutRateCopy.title(payments.length)}</p>
        <p>{withoutRateCopy.body}</p>
        <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
          {payments.map((p) => (
            <li key={p.paymentId}>
              {withoutRateCopy.item(sedeMoney(p.amount, p.currency, fmt), sedeCivilDate(p.paidOn, fmt))}
            </li>
          ))}
        </ul>
        {canRegister ? (
          <p className="mt-1">
            <Link
              href={EXCHANGE_RATE_SETTINGS_HREF}
              className="inline-flex min-h-11 items-center font-medium text-primary underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:min-h-0"
            >
              {withoutRateCopy.adminLink}
            </Link>
            <span className="block text-xs">{withoutRateCopy.adminHint}</span>
          </p>
        ) : (
          <p className="mt-1">{withoutRateCopy.otherRoles}</p>
        )}
      </div>
    </div>
  );
}
