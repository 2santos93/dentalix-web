'use client';
import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import type { components } from '@/lib/api/schema';
import { getTokenRole } from '@/lib/auth/token-role';
import { canManageExchangeRates, type ExchangeRateSettings } from '@/lib/exchange/exchange-settings-api';
import { sedeCivilDate, sedeMoney } from '@/lib/format/sede-number';
import { readyFormat, useSedeFormat } from '@/lib/locations/use-sede-format';
import { Callout } from '@/components/ui/callout';
import { useExchangeRateSettings, type ExchangeRateSettingsState } from './use-exchange-rate-settings';

export type PaymentWithoutRate = components['schemas']['PaymentWithoutRateDto'];

/** Ajustes › Tasa de cambio (DX-374). */
export const EXCHANGE_RATE_SETTINGS_HREF = '/settings/tasa-de-cambio';

// Copy como constantes (i18n-ready). Ningún texto nombra un país ni un banco.
export const withoutRateCopy = {
  title: (n: number) => (n === 1 ? '1 abono sin tasa' : `${n} abonos sin tasa`),
  body: 'El saldo todavía no los cuenta: falta la tasa de cambio de su día.',
  item: (amount: string, date: string) => `${amount} del ${date}`,
  // Fuente manual (ADMIN): la tasa la registra la clínica.
  adminLink: 'Registrar la tasa en Ajustes › Tasa de cambio',
  adminHint: 'En cuanto la registres, el saldo los cuenta en un minuto.',
  // DX-402: un abono de un día anterior al paso a manual toma la manual de su
  // día como respaldo si el proveedor no la da.
  backupHint:
    'Para un abono de antes del paso a manual, la tasa que registres para su día le sirve de respaldo si el proveedor no la da: el saldo lo cuenta en un minuto.',
  // DX-386: con la fuente automática la tasa la da el proveedor: registrar
  // una manual no sirve mientras no se pase a manual.
  automatic: 'La tasa del proveedor aún no está disponible; reintentamos solos y el saldo los cuenta en cuanto llegue.',
  switchToManualLink: 'Pasar a tasa manual en Ajustes › Tasa de cambio',
  switchToManualHint:
    'Solo si no puedes esperar: pasa a la tasa manual y registra la de su día; servirá de respaldo a estos abonos si el proveedor no la da. Desde el cambio, la clínica registra la tasa de cada día.',
  // ADMIN sin la fuente (no se pudo leer): no se da por hecha ninguna.
  settingsLink: 'Revisar la tasa en Ajustes › Tasa de cambio',
  // El resto de roles no puede leer la fuente: texto válido para las dos.
  otherRoles: 'Si no se resuelve, pide a un administrador que revise la tasa de cambio de ese día.',
};

const linkClass =
  'inline-flex min-h-11 items-center font-medium text-primary-text underline underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas sm:min-h-0';

/**
 * De dónde sale la tasa del día de cada abono: manual desde `manualSince`
 * (si la clínica está en manual), del proveedor en cualquier otro caso — la
 * misma regla con la que la API congela la tasa (DX-374). DX-402: con manual,
 * un abono de un día anterior también puede tomar la manual de su día como
 * respaldo (`backup`).
 */
function rateDays(payments: PaymentWithoutRate[], settings: ExchangeRateSettings) {
  const since = settings.source === 'MANUAL' ? settings.manualSince : null;
  const manual = since !== null ? payments.filter((p) => p.paidOn >= since).length : 0;
  const provider = manual < payments.length;
  return { manual: manual > 0, provider, backup: since !== null && provider };
}

/**
 * Aviso «sin tasa» (DX-375) donde se ve el saldo: los abonos en otra moneda
 * que no tenían tasa de su día se guardaron, pero el saldo no los cuenta hasta
 * que haya tasa (y el barrido la congele). Al ADMIN le dice qué hacer según
 * la fuente de la clínica (DX-386: registrar la manual, o esperar al
 * proveedor y, si no puede, pasar a manual); al resto, un texto que vale para
 * las dos y a quién pedírselo, sin leer la fuente (solo ADMIN). No es un error
 * (nada falló): tono de advertencia y `role="status"`, sin interrumpir. Todo
 * el texto va en `ink`: `muted` sobre el tinte de advertencia no llega a
 * 4,5:1 (axe en claro). Importe y día con el formato de la sede y el código
 * ISO de la moneda (DX-378): mientras carga, o sin formato, «—».
 */
export function WithoutRateNotice({ token, payments }: { token: string; payments: PaymentWithoutRate[] }) {
  const fmt = readyFormat(useSedeFormat(token));
  const canRegister = canManageExchangeRates(getTokenRole(token));
  const settings = useExchangeRateSettings(token, canRegister && payments.length > 0);
  if (payments.length === 0) return null;
  return (
    <Callout tone="warning" role="status" icon={TriangleAlert} title={withoutRateCopy.title(payments.length)}>
      <p>{withoutRateCopy.body}</p>
      <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 tabular-nums">
        {payments.map((p) => (
          <li key={p.paymentId}>
            {withoutRateCopy.item(sedeMoney(p.amount, p.currency, fmt), sedeCivilDate(p.paidOn, fmt))}
          </li>
        ))}
      </ul>
      {canRegister ? (
        <AdminAction settings={settings} payments={payments} />
      ) : (
        <p className="mt-1">{withoutRateCopy.otherRoles}</p>
      )}
    </Callout>
  );
}

/**
 * Qué puede hacer el ADMIN según la fuente (DX-386): con manual, registrar la
 * tasa; con la del proveedor, esperar o, si no puede, pasar a manual sabiendo
 * desde cuándo rige. Mientras se lee la fuente, nada que proponer todavía.
 */
function AdminAction({ settings, payments }: { settings: ExchangeRateSettingsState; payments: PaymentWithoutRate[] }) {
  if (settings.status === 'idle' || settings.status === 'loading') return null;
  if (settings.status === 'error') {
    return (
      <p className="mt-1">
        <Link href={EXCHANGE_RATE_SETTINGS_HREF} className={linkClass}>
          {withoutRateCopy.settingsLink}
        </Link>
      </p>
    );
  }
  const days = rateDays(payments, settings.settings);
  const automatic = settings.settings.source === 'AUTOMATIC';
  return (
    <>
      {days.provider ? <p className="mt-1">{withoutRateCopy.automatic}</p> : null}
      {days.manual || days.backup ? (
        <p className="mt-1">
          <Link href={EXCHANGE_RATE_SETTINGS_HREF} className={linkClass}>
            {withoutRateCopy.adminLink}
          </Link>
          {days.manual ? <span className="t-caption block">{withoutRateCopy.adminHint}</span> : null}
          {days.backup ? <span className="t-caption block">{withoutRateCopy.backupHint}</span> : null}
        </p>
      ) : null}
      {automatic ? (
        <p className="mt-1">
          <Link href={EXCHANGE_RATE_SETTINGS_HREF} className={linkClass}>
            {withoutRateCopy.switchToManualLink}
          </Link>
          <span className="t-caption block">{withoutRateCopy.switchToManualHint}</span>
        </p>
      ) : null}
    </>
  );
}
