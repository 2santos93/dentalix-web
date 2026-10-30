import * as React from 'react';
import { Badge, type BadgeProps } from '@/components/ui/badge';
import {
  CATEGORY_KINDS,
  statusPresentation,
  type StatusKind,
  type StatusOf,
} from '@/lib/status/tones';

export type StatusBadgeProps<K extends StatusKind> = Omit<BadgeProps, 'variant' | 'dot'> & {
  kind: K;
  status: StatusOf<K>;
  /**
   * Texto propio cuando el estado lleva detalle («Enviado 12 oct 10:30»). El
   * tono sigue saliendo del mapa: nunca se elige el color en la pantalla.
   */
  children?: React.ReactNode;
};

/**
 * Chip de un estado de dominio (DESIGN.md → Status tones): tono y etiqueta
 * salen del único mapa `src/lib/status/tones.ts`, con punto para que el color
 * no sea la única pista. Las categorías (método de pago) se pintan neutras y
 * sin punto. `data-status` expone el código para pruebas y estilos.
 */
export function StatusBadge<K extends StatusKind>({ kind, status, children, ...props }: StatusBadgeProps<K>) {
  const { tone, label } = statusPresentation(kind, status);
  return (
    <Badge variant={tone} dot={!CATEGORY_KINDS.has(kind)} data-status={status} {...props}>
      {children ?? label}
    </Badge>
  );
}
