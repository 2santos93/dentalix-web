import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CountryCombobox, countryComboboxCopy } from './country-combobox';
import { COUNTRIES } from '@/lib/locations/countries';

function Harness({
  initial = '',
  onChange = jest.fn(),
  invalid,
}: {
  initial?: string;
  onChange?: (code: string) => void;
  invalid?: boolean;
}) {
  const [value, setValue] = useState(initial);
  return (
    <form aria-label="sede">
      <label htmlFor="pais">País</label>
      <CountryCombobox
        id="pais"
        value={value}
        onChange={(code) => {
          onChange(code);
          setValue(code);
        }}
        invalid={invalid}
        required
        ariaDescribedBy={invalid ? 'pais-error' : 'pais-hint'}
      />
      {invalid ? <p id="pais-error">Elige el país de la sede.</p> : <p id="pais-hint">País donde está la sede.</p>}
      <button type="button">Después</button>
    </form>
  );
}

function setup(props: Parameters<typeof Harness>[0] = {}) {
  const onChange = props.onChange ?? jest.fn();
  render(<Harness {...props} onChange={onChange} />);
  return { onChange, user: userEvent.setup(), input: screen.getByRole('combobox', { name: 'País' }) };
}

const optionNames = () => screen.getAllByRole('option').map((o) => o.textContent);

describe('CountryCombobox (DX-312, spec §6.3)', () => {
  it('the picker offers every country of the shared list', async () => {
    const { user, input } = setup();
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveAttribute('placeholder', 'Escribe el nombre o el código del país');
    await user.click(input);
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const listbox = screen.getByRole('listbox');
    expect(input).toHaveAttribute('aria-controls', listbox.id);
    expect(within(listbox).getAllByRole('option')).toHaveLength(250);
    expect(optionNames()).toEqual(COUNTRIES.map((c) => c.name));
  });

  it('searching «venez» offers Venezuela and choosing it sets VE', async () => {
    const { user, input, onChange } = setup();
    await user.type(input, 'venez');
    expect(optionNames()).toEqual(['Venezuela']);
    await user.click(screen.getByRole('option', { name: 'Venezuela' }));
    expect(onChange).toHaveBeenLastCalledWith('VE');
    expect(input).toHaveValue('Venezuela');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('searching ignores accents and case', async () => {
    const { user, input } = setup();
    await user.type(input, 'PERU');
    expect(optionNames()).toContain('Perú');
    await user.clear(input);
    await user.type(input, 'japon');
    expect(optionNames()).toEqual(['Japón']);
  });

  it('typing the code VE offers Venezuela first', async () => {
    const { user, input, onChange } = setup();
    await user.type(input, 'VE');
    expect(optionNames()[0]).toBe('Venezuela');
    // La primera opción queda resaltada: Intro la elige.
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('VE');
  });

  it('no match shows «Ningún país coincide.» as a disabled option', async () => {
    const { user, input, onChange } = setup();
    await user.type(input, 'zzzz');
    const none = screen.getByRole('option', { name: 'Ningún país coincide.' });
    expect(none).toHaveAttribute('aria-disabled', 'true');
    expect(countryComboboxCopy.noMatch).toBe('Ningún país coincide.');
    // No es un error: el campo no se marca inválido.
    expect(input).not.toHaveAttribute('aria-invalid');
    await user.click(none);
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('arrows, Home, End, Enter and Escape move and choose as a combobox', async () => {
    const { user, input, onChange } = setup();
    input.focus();
    // Tabular hasta el campo no abre la lista.
    expect(input).toHaveAttribute('aria-expanded', 'false');
    await user.keyboard('{ArrowDown}');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const options = () => screen.getAllByRole('option');
    const active = () => input.getAttribute('aria-activedescendant');
    expect(active()).toBe(options()[0].id);
    expect(options()[0]).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(active()).toBe(options()[2].id);
    await user.keyboard('{ArrowUp}');
    expect(active()).toBe(options()[1].id);
    await user.keyboard('{End}');
    expect(active()).toBe(options()[249].id);
    await user.keyboard('{Home}');
    expect(active()).toBe(options()[0].id);
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith(COUNTRIES[1].code);
    expect(input).toHaveValue(COUNTRIES[1].name);
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-activedescendant');

    // Escape cierra la lista y deja el país elegido.
    await user.type(input, 'x');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard('{Escape}');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).toHaveValue(COUNTRIES[1].name);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('Enter while the list is open never submits the form', async () => {
    const submit = jest.fn((e: Event) => e.preventDefault());
    const { user, input } = setup();
    input.closest('form')!.addEventListener('submit', submit);
    await user.type(input, 'zzzz{Enter}');
    expect(submit).not.toHaveBeenCalled();
  });

  it('leaving the field with text that is not a country keeps the previous choice', async () => {
    const { user, input, onChange } = setup({ initial: 'ES' });
    expect(input).toHaveValue('España');
    await user.clear(input);
    await user.type(input, 'Atlántida');
    await user.tab();
    expect(input).toHaveValue('España');
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('leaving an empty field with no previous choice leaves it empty', async () => {
    const { user, input, onChange } = setup();
    await user.type(input, 'venez');
    await user.tab();
    expect(input).toHaveValue('');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('the field shows the chosen country\'s name', () => {
    const { input } = setup({ initial: 'VE' });
    expect(input).toHaveValue('Venezuela');
  });

  it('an invalid field is marked and described by its error', () => {
    const { input } = setup({ invalid: true });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-required', 'true');
    expect(input).toHaveAccessibleDescription('Elige el país de la sede.');
  });

  it('the field and its options are 44 px tall on a phone and the list scrolls on its own', async () => {
    const { user, input } = setup();
    expect(input.className).toMatch(/(^|\s)h-11(\s|$)/);
    expect(input.className).toContain('sm:h-10');
    await user.click(input);
    const listbox = screen.getByRole('listbox');
    expect(listbox.className).toMatch(/max-h-/);
    expect(listbox.className).toContain('overflow-y-auto');
    expect(screen.getAllByRole('option')[0].className).toContain('min-h-11');
  });
});
