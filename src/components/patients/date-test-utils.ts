import { within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';

/**
 * Escribe un día ISO en un `DateField`/`DatePicker` (segmentos de react-aria,
 * orden dd/mm/aaaa del locale `es` por defecto). Solo para tests de jest; en
 * e2e está `fillDate` de `e2e/support/dates.ts`.
 */
export async function typeDate(
  user: ReturnType<typeof userEvent.setup>,
  group: HTMLElement,
  iso: string,
): Promise<void> {
  const [y, m, d] = iso.split('-');
  const [first] = within(group).getAllByRole('spinbutton');
  await user.click(first);
  await user.keyboard(`${d}${m}${y}`);
}
