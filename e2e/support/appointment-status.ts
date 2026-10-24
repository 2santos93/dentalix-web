import type { Locator } from './test';

/**
 * DX-295: el selector de estado de la cita ya no es un `<select>` nativo (las
 * flechas cambiaban la cita sin confirmar), sino un combobox que abre una lista
 * y aplica con Enter o con un clic. Esto elige `label` («Confirmada»,
 * «Cancelada»…) con un clic en la opción, como lo haría recepción.
 */
export async function chooseAppointmentStatus(trigger: Locator, label: string): Promise<void> {
  await trigger.click();
  await trigger.page().getByRole('option', { name: label, exact: true }).click();
}
