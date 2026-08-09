import userEvent from '@testing-library/user-event';

/**
 * `userEvent.setup()` para pruebas que abren un overlay de Radix (menú de
 * acciones, diálogo, sheet).
 *
 * Radix marca el resto de la página con `pointer-events: none` mientras el
 * overlay está abierto —así el clic no se escapa por debajo, que es lo
 * correcto en un navegador—. Pero `userEvent` comprueba antes de cada clic que
 * el elemento sea "apuntable", y en jsdom esa comprobación no termina nunca:
 * el test se cuelga sin fallar, que es la peor forma de fallar.
 *
 * `pointerEventsCheck: 0` desactiva SOLO esa comprobación previa. No cambia lo
 * que el componente hace ni se salta el `disabled` de un botón: los eventos se
 * siguen despachando igual.
 */
export function setupUser() {
  return userEvent.setup({ pointerEventsCheck: 0 });
}
