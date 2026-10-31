'use client';
import { Tooltip } from '@/components/ui/tooltip';
import { originLabel } from './origin';

/**
 * El origen de un registro en dos líneas: el dispositivo legible y la IP. El
 * User-Agent completo queda en el tooltip del dispositivo (DESIGN.md →
 * Tooltip: un dato abreviado).
 */
export function OriginCell({ ip, userAgent }: { ip: string | null | undefined; userAgent: string | null | undefined }) {
  const origin = originLabel(ip, userAgent);
  return (
    <span className="flex min-w-0 flex-col">
      {origin.device ? (
        origin.userAgent ? (
          <Tooltip content={origin.userAgent}>
            <span className="block truncate text-ink">{origin.device}</span>
          </Tooltip>
        ) : (
          <span className="block truncate text-ink">{origin.device}</span>
        )
      ) : null}
      <span className={origin.device ? 't-caption t-data' : 't-data text-ink'}>{origin.ip}</span>
    </span>
  );
}

/** Una sola línea para la tarjeta del teléfono: «Chrome · macOS · 203.0.113.7». */
export function originText(ip: string | null | undefined, userAgent: string | null | undefined): string {
  const origin = originLabel(ip, userAgent);
  return [origin.device, origin.ip].filter(Boolean).join(' · ');
}
