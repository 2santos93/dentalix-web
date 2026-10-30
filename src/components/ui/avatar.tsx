'use client';
import * as React from 'react';
import { cn } from '@/lib/utils';

const SIZES = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-9 text-sm',
  lg: 'size-12 text-base',
  xl: 'size-16 text-lg',
} as const;

export interface AvatarProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Iniciales ya calculadas (`initials()` de `@/lib/format/initials`). */
  initials: string;
  /** Foto opcional; si falla la carga, quedan las iniciales. */
  src?: string | null;
  /** Texto alternativo de la foto. Sin él el avatar es decorativo (el nombre va al lado). */
  alt?: string;
  size?: keyof typeof SIZES;
}

/**
 * Avatar (DESIGN.md → Avatar): círculo neutro (`surface-active` + tinta) con
 * iniciales, o foto. Nunca el acento: una lista de pacientes pintaba un círculo
 * de marca por fila y gastaba el presupuesto de acento en decoración.
 */
export function Avatar({ initials, src, alt, size = 'md', className, ...props }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);
  const showImage = Boolean(src) && !failed;
  return (
    <span
      aria-hidden={alt ? undefined : true}
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full bg-surface-active font-semibold text-ink',
        SIZES[size],
        className,
      )}
      {...props}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- fotos firmadas de la API, sin optimizador
        <img src={src!} alt={alt ?? ''} className="size-full object-cover" onError={() => setFailed(true)} />
      ) : (
        initials
      )}
    </span>
  );
}
