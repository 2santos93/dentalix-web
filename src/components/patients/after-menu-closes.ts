/**
 * Abre un diálogo desde una opción del menú «⋯» (RowActions) cuando el menú ya
 * devolvió el foco a su botón: el diálogo recuerda ese botón y, al cerrarse,
 * el foco vuelve a la fila (y no a <body>, que es lo que pasa si se abre
 * mientras el foco sigue en la opción del menú, que desaparece).
 *
 * Pendiente de subir a `RowActions` (petición al coordinador en el informe B3).
 */
export function afterMenuCloses(open: () => void): void {
  window.setTimeout(open, 0);
}
