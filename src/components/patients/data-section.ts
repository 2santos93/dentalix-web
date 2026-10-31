/**
 * Bloques de la pestaña «Datos» de la ficha (DESIGN.md → «separa con
 * hairlines y espacio; prefiere una sección con título a otra tarjeta»): cada
 * bloque es una sección plana con su `SectionHeader`, separada de la anterior
 * por una línea y 24px, sin tarjeta alrededor — antes eran cinco tarjetas
 * apiladas con otra caja discontinua dentro (critique-core §7).
 */
export const DATA_SECTION_CLASS =
  'flex min-w-0 flex-col gap-4 border-t border-border-subtle pt-6 first:border-t-0 first:pt-0';

/**
 * La cabecera de un bloque mantiene su acción en la misma fila también en
 * móvil (con salto si no cabe): una acción secundaria a todo el ancho bajo
 * cada título convertía la pestaña en una escalera de botones.
 */
export const DATA_SECTION_HEADER_CLASS = 'flex-row flex-wrap items-center justify-between gap-2';
