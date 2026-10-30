import { cn } from '@/lib/utils';

/**
 * Marca de Dentalix (sustituye al emoji 🦷, que cambia según el sistema y no
 * toma el acento de la clínica). Un monograma «D» macizo sobre una tesela
 * redondeada; el hueco interior de la D es la silueta de una corona dental
 * (dos cúspides arriba, cuello abajo), en negativo. Geometría en una rejilla
 * de 32: a 20 px las paredes de la D miden ~2,4 px y la corona sigue leyéndose.
 *
 * Color: la tesela usa el acento (`--color-primary`, el de la clínica en
 * white-label) y la D el texto sobre acento (`--color-primary-fg`); con
 * `tone="mono"` todo va en `currentColor` (impresión, fondos de color).
 */
export function Logo({
  size = 32,
  withWordmark = false,
  tone = 'brand',
  className,
  title = 'Dentalix',
  decorative = false,
}: {
  /** Lado de la tesela en px. Pensado para 20–32. */
  size?: number;
  withWordmark?: boolean;
  tone?: 'brand' | 'mono';
  className?: string;
  /** Nombre accesible. Con wordmark visible, la marca es decorativa. */
  title?: string;
  /** Hay texto al lado que ya dice «Dentalix»: la marca no se anuncia. */
  decorative?: boolean;
}) {
  const hidden = withWordmark || decorative;
  const mark = (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden={hidden ? true : undefined}
      role={hidden ? undefined : 'img'}
      aria-label={hidden ? undefined : title}
      className="shrink-0"
      data-testid="dentalix-logo"
    >
      <rect
        width="32"
        height="32"
        rx="8"
        fill={tone === 'brand' ? 'var(--color-primary)' : 'currentColor'}
        fillOpacity={tone === 'brand' ? 1 : 0.12}
      />
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        // D exterior: asta en x=8, cuenco de radio 9 centrado en (16,16).
        // Hueco: corona con dos cúspides (y≈10,8) y cuello estrecho (y≈20,5).
        d="M8 7h8a9 9 0 0 1 0 18H8V7Zm5.4 4.3c1.2-.9 2.4-.9 3.3-.1.9-.8 2.1-.8 3.3.1 1.3 1 1.6 2.8 1.2 4.8-.4 1.9-1.3 3.5-2.4 4.5-.5.4-1.1.3-1.3-.3l-.4-1.4c-.2-.6-.6-.9-1.1-.9-.5 0-.9.3-1.1.9l-.4 1.4c-.2.6-.8.7-1.3.3-1.1-1-2-2.6-2.4-4.5-.4-2-.1-3.8 1.2-4.8Z"
        fill={tone === 'brand' ? 'var(--color-primary-fg)' : 'currentColor'}
      />
    </svg>
  );
  if (!withWordmark) return <span className={cn('inline-flex', className)}>{mark}</span>;
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      {mark}
      <span className="font-semibold tracking-tight text-ink">Dentalix</span>
    </span>
  );
}
