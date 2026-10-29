import { screen } from '@testing-library/react';
import type { UserEvent } from '@testing-library/user-event';
import { countryName } from '@/lib/locations/countries';

/**
 * Elige un país en el `CountryCombobox` (DX-312) como lo haría una persona:
 * vacía el campo, escribe el código y elige la opción con el nombre del país.
 */
export async function chooseCountry(user: UserEvent, input: HTMLElement, code: string): Promise<void> {
  await user.clear(input);
  await user.type(input, code);
  await user.click(screen.getByRole('option', { name: countryName(code) ?? code }));
}
