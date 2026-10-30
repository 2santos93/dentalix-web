import { cn } from '@/lib/utils';

/**
 * Logo de la clínica como `<img>`. Antes el mismo bloque estaba copiado en
 * cada documento y vista pública (code-audit §6). Host arbitrario (lo sube la
 * clínica): `next/image` exigiría permitir cada dominio, y `no-referrer` no le
 * cuenta a ese host desde qué pantalla se pidió.
 *
 * - `paper`: cabecera de documentos imprimibles (h-12, hasta 160 px de ancho).
 * - `public`: vistas públicas del paciente (tesela de 40 px).
 * - `shell`: barra de la app (h-8, hasta 10rem).
 */
export function ClinicLogo({
  src,
  alt,
  variant,
  className,
}: {
  src: string;
  alt: string;
  variant: 'paper' | 'public' | 'shell';
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- logo del tenant en un host arbitrario; next/image exigiría whitelistear cada dominio
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      className={cn(
        variant === 'paper' && 'h-12 w-auto max-w-[160px] object-contain',
        variant === 'public' && 'size-10 shrink-0 rounded-lg object-contain',
        variant === 'shell' && 'h-8 w-auto max-w-[10rem] shrink-0 object-contain',
        className,
      )}
    />
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter((w) => /\p{L}/u.test(w[0] ?? ''))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
}

/**
 * Marca de la clínica: logo (si lo hay) y nombre.
 *
 * - `variant="public"`: cabecera de las vistas públicas — logo de 40 px y el
 *   nombre como encabezado (`as`, por defecto `h1`).
 * - `variant="shell"`: barra de la app — con logo, solo el logo (suele llevar
 *   el nombre; el nombre queda en `alt`); sin logo, tesela con iniciales en el
 *   tinte del acento + nombre truncado. Nunca parte en dos líneas.
 */
export function ClinicBrand({
  name,
  logoUrl,
  variant,
  as: Heading = 'h1',
  className,
}: {
  name: string;
  logoUrl: string | null | undefined;
  variant: 'public' | 'shell';
  as?: 'h1' | 'p' | 'span';
  className?: string;
}) {
  if (variant === 'public') {
    return (
      <header className={cn('flex items-center gap-3', className)}>
        {logoUrl && <ClinicLogo src={logoUrl} alt="" variant="public" />}
        <Heading className="min-w-0 break-words text-xl font-semibold tracking-tight text-ink">
          {name}
        </Heading>
      </header>
    );
  }
  if (logoUrl) {
    return (
      <span className={cn('flex min-w-0 items-center', className)} data-testid="clinic-brand">
        <ClinicLogo src={logoUrl} alt={name} variant="shell" />
      </span>
    );
  }
  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)} data-testid="clinic-brand">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary-subtle text-xs font-semibold text-primary-subtle-text"
      >
        {initials(name) || '·'}
      </span>
      <span title={name} className="min-w-0 truncate text-[0.9375rem] font-semibold text-ink">
        {name}
      </span>
    </span>
  );
}
