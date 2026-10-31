import type * as React from 'react';

/**
 * Enter dentro de un campo de fecha u hora segmentado envía el formulario,
 * como en cualquier `<input>` (envío implícito). Los segmentos de react-aria
 * son `spinbutton` sobre un `span`, así que el navegador no lo hace solo: sin
 * esto, «escribe la hora y Enter» se quedaba sin hacer nada.
 *
 * Se pone en `onKeyDownCapture` de un contenedor del campo (o del formulario
 * entero): en fase de captura, porque react-aria para la propagación del
 * teclado en los segmentos.
 * Pendiente de subir a las primitivas de `components/ui` (informe B1).
 */
export function submitOnEnter(event: React.KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Enter') return;
  const target = event.target as HTMLElement;
  if (target.getAttribute('role') !== 'spinbutton') return;
  const form = target.closest('form');
  if (!form) return;
  event.preventDefault();
  form.requestSubmit();
}
