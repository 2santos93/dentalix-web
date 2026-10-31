/**
 * Escape con la lista de un combobox abierta cierra solo la lista; un segundo
 * Escape ya cierra el diálogo o la hoja (DX-312). Lo usan `DialogContent` y
 * `SheetContent` en su `onEscapeKeyDown`: Radix escucha Escape en `document`
 * en fase de captura, antes que el campo, así que el `stopPropagation` del
 * combobox no llega a tiempo.
 *
 * Contrato: todo combobox con `aria-expanded="true"` dentro de un diálogo o de
 * una hoja cierra su lista con Escape (`aria-expanded="false"`). Si no lo
 * hace, Escape no cierra nada y el foco queda atrapado (WCAG 2.1.2). Fuera de
 * producción se comprueba: si tras el Escape el combobox sigue expandido, se
 * avisa por consola.
 *
 * Igual con una capa de react-aria abierta encima (el calendario de un
 * `DatePicker`): Escape la cierra a ella sola.
 */
export function keepOpenWhileComboboxExpanded(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null;
  // Lo mismo con una capa anidada de otro portal (el calendario de un
  // DatePicker, `data-nested-layer`): Radix no la ve como capa suya, así que
  // el Escape que cierra el calendario cerraba también el diálogo con lo
  // escrito. Escape desde dentro de ella la cierra solo a ella.
  if (isInNestedLayer(target)) {
    event.preventDefault();
    return;
  }
  const combobox = target?.closest?.<HTMLElement>('[role="combobox"][aria-expanded="true"]');
  if (!combobox) return;
  event.preventDefault();
  if (process.env.NODE_ENV !== 'production') {
    setTimeout(() => {
      if (combobox.isConnected && combobox.getAttribute('aria-expanded') === 'true') {
        console.error(
          'Combobox sin Escape: sigue con aria-expanded="true" tras Escape dentro de un diálogo o una hoja, que no se cierra. El combobox debe cerrar su lista con Escape.',
          combobox,
        );
      }
    }, 0);
  }
}

/** ¿Está `target` dentro de una capa anidada de otro portal (`data-nested-layer`)? */
function isInNestedLayer(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('[data-nested-layer]') !== null;
}

/**
 * Para el `onInteractOutside` de `DialogContent` y `SheetContent`: un clic o
 * un foco dentro de una capa anidada (el calendario de un DatePicker, en su
 * propio portal) no es «fuera» del diálogo y no lo cierra.
 */
export function keepOpenForNestedLayer(event: Event): void {
  if (isInNestedLayer(event.target)) event.preventDefault();
}
