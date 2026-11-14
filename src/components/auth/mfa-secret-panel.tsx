'use client';
import { QRCodeSVG } from 'qrcode.react';
import { groupSecret } from '@/lib/platform/platform-api';

const copy = {
  qrLabel: 'Código QR para añadir la cuenta a tu app de autenticación',
  scan: 'Escanea el código con tu app de autenticación (Google Authenticator, 1Password, Authy…).',
  manualLabel: '¿No puedes escanearlo? Escribe esta clave',
  manualHint: 'Elige el tipo «basada en tiempo».',
  openInApp: 'Abrir en la app de este móvil',
};

/**
 * Paso del alta (DX-021): QR y clave manual del mismo secreto. El QR se dibuja
 * en el navegador: el secreto no sale hacia ningún servicio. Fondo blanco fijo
 * también en oscuro: los lectores necesitan módulos oscuros sobre claro.
 */
export function MfaSecretPanel({
  secret,
  otpauthUri,
}: {
  secret: string;
  otpauthUri: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{copy.scan}</p>
      <div className="self-center rounded-lg border border-border bg-white p-3">
        <QRCodeSVG value={otpauthUri} size={176} level="M" title={copy.qrLabel} />
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="t-label text-ink">{copy.manualLabel}</p>
        <code
          data-testid="mfa-secret"
          className="block select-all break-all rounded-lg border border-border bg-surface-sunken px-3 py-2 font-mono text-sm tracking-wider text-ink"
        >
          {groupSecret(secret)}
        </code>
        <p className="text-xs text-muted">{copy.manualHint}</p>
        <a
          href={otpauthUri}
          className="inline-flex min-h-11 items-center self-start text-sm font-medium text-primary-text underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-text sm:hidden"
        >
          {copy.openInApp}
        </a>
      </div>
    </div>
  );
}
