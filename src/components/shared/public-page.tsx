import type { CSSProperties } from 'react';
import type { LucideIcon } from 'lucide-react';
import { primaryForeground } from '@/lib/color/contrast';

const HEX = /^#[0-9a-fA-F]{3,8}$/;

/**
 * El color de la clínica para una página pública del paciente (white-label),
 * o nada si no es un hex válido. Lo comparten la confirmación de cita (DX-005)
 * y la baja de recordatorios (DX-128).
 */
export function publicBrandStyle(
  clinic: { primaryColor?: string | null } | null | undefined,
): CSSProperties | undefined {
  const color = clinic?.primaryColor;
  if (!color || !HEX.test(color)) return undefined;
  const fg = primaryForeground(color);
  return {
    '--color-primary': color,
    ...(fg ? { '--color-primary-fg': fg } : {}),
  } as CSSProperties;
}

/** Aviso a página completa de una página pública: icono, título y explicación. */
export function PublicNotice({
  icon: Icon,
  title,
  message,
}: {
  icon: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-border bg-surface px-6 py-12 text-center">
      <span
        aria-hidden
        className="mb-1 flex size-10 items-center justify-center rounded-full bg-surface-sunken text-muted"
      >
        <Icon className="size-5" />
      </span>
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <p className="max-w-sm text-sm text-muted">{message}</p>
    </div>
  );
}
