import type { Page } from '@playwright/test';
import { expect } from './test';

/**
 * DX-279: cancelar desde la agenda abre el diálogo de origen y motivo. Lo
 * completa (la clínica reprograma, salvo que se pida otro origen) y confirma.
 */
export async function confirmCancellation(
  page: Page,
  origin: 'El paciente avisa' | 'La clínica' = 'La clínica',
  reason = 'CLINIC_RESCHEDULE',
): Promise<void> {
  const dialog = page.getByRole('dialog', { name: /^Cancelar la cita de / });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel(new RegExp(origin)).check();
  await dialog.getByLabel('Motivo').selectOption(reason);
  await dialog.getByRole('button', { name: 'Cancelar la cita' }).click();
  await expect(dialog).toBeHidden();
}
