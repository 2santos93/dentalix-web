import { useState } from 'react';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { COMBOBOX_NONE, CountryCombobox, countryComboboxCopy, phoneRegionComboboxCopy } from './country-combobox';
import { COUNTRIES } from '@/lib/locations/countries';
import { PHONE_REGIONS, phoneRegionLabel, searchPhoneRegions, type PhoneRegionOption } from '@/lib/locations/phone-regions';

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
    // Sin país elegido, ninguna opción está seleccionada: resaltar no es elegir.
    expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toEqual([]);
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

  it('the chosen country is the selected option, wherever the highlight moves', async () => {
    const { user, input } = setup({ initial: 'VE' });
    await user.click(input);
    const venezuela = screen.getByRole('option', { name: 'Venezuela' });
    const selected = () => screen.getAllByRole('option', { selected: true });
    expect(selected()).toEqual([venezuela]);
    expect(input).toHaveAttribute('aria-activedescendant', venezuela.id);
    await user.keyboard('{Home}');
    expect(input).not.toHaveAttribute('aria-activedescendant', venezuela.id);
    expect(selected()).toEqual([venezuela]);
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

  it('the list has a name and the result count is announced while typing', async () => {
    const { user, input } = setup();
    const status = screen.getByRole('status');
    await user.click(input);
    expect(screen.getByRole('listbox', { name: 'Países' })).toBeInTheDocument();
    // Abrir la lista completa no anuncia nada.
    expect(status).toHaveTextContent('');
    await user.type(input, 'venez');
    expect(status).toHaveTextContent('1 país');
    await user.clear(input);
    await user.type(input, 'gu');
    expect(status).toHaveTextContent(/^\d+ países$/);
    await user.type(input, 'zzzz');
    expect(status).toHaveTextContent('Ningún país coincide.');
    expect(input).toHaveAccessibleDescription(expect.stringContaining('Ningún país coincide.'));
    await user.tab();
    expect(status).toHaveTextContent('');
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

function PhoneHarness({ initial = COMBOBOX_NONE, onChange }: { initial?: string; onChange: (code: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <form aria-label="sede">
      <label htmlFor="prefijo">Prefijo telefónico por defecto</label>
      <CountryCombobox<PhoneRegionOption>
        id="prefijo"
        value={value}
        onChange={(code) => {
          onChange(code);
          setValue(code);
        }}
        options={PHONE_REGIONS}
        search={searchPhoneRegions}
        formatOption={(r) => phoneRegionLabel(r.code) ?? r.code}
        copy={phoneRegionComboboxCopy}
        noneOption={{ label: 'Sin prefijo por defecto' }}
      />
    </form>
  );
}

function setupPhone(initial?: string) {
  const onChange = jest.fn();
  render(<PhoneHarness initial={initial} onChange={onChange} />);
  return {
    onChange,
    user: userEvent.setup(),
    input: screen.getByRole('combobox', { name: 'Prefijo telefónico por defecto' }),
  };
}

describe('CountryCombobox with phone regions (DX-329, spec §6.3)', () => {
  it('with phone regions it shows the calling code and offers no prefix first', async () => {
    const { user, input } = setupPhone('VE');
    expect(input).toHaveValue('Venezuela (+58)');
    await user.click(input);
    const names = optionNames();
    expect(names[0]).toBe('Sin prefijo por defecto');
    expect(names.slice(1)).toEqual(PHONE_REGIONS.map((r) => `${r.name} (+${r.callingCode})`));
    expect(screen.getByRole('option', { name: 'Venezuela (+58)' })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Escape}');
    // Escribiendo un indicativo, la lista solo trae las regiones que lo comparten: la primera queda resaltada.
    await user.clear(input);
    await user.type(input, '+58');
    expect(optionNames()).toEqual(['Venezuela (+58)']);
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
  });

  it('the phone copy names no country', async () => {
    const { user, input } = setupPhone();
    expect(input).toHaveAttribute('placeholder', 'Busca por nombre, código o prefijo (+…)');
    await user.click(input);
    expect(screen.getByRole('listbox', { name: 'Prefijos telefónicos' })).toBeInTheDocument();
    await user.type(input, 'zzzz');
    expect(screen.getByRole('option', { name: 'Ningún prefijo coincide.' })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Ningún prefijo coincide.');
    await user.clear(input);
    await user.type(input, '+1');
    expect(screen.getByRole('status')).toHaveTextContent(/^\d+ prefijos$/);
    expect(phoneRegionComboboxCopy.results(1)).toBe('1 prefijo');
    expect(phoneRegionComboboxCopy.results(3)).toBe('3 prefijos');
    const copyText = Object.values(phoneRegionComboboxCopy)
      .map((v) => (typeof v === 'function' ? v(2) : v))
      .join(' ');
    expect(copyText).not.toMatch(/\+\d|pa[ií]s/i);
    // Sin `copy`, el selector de país conserva sus textos.
    expect(countryComboboxCopy.placeholder).toBe('Escribe el nombre o el código del país');
  });

  it('choosing no prefix shows it in the field and reports its own value', async () => {
    const { user, input, onChange } = setupPhone('VE');
    await user.click(input);
    const none = screen.getByRole('option', { name: 'Sin prefijo por defecto' });
    expect(none).toHaveAttribute('aria-selected', 'false');
    await user.click(none);
    expect(onChange).toHaveBeenLastCalledWith(COMBOBOX_NONE);
    expect(COMBOBOX_NONE).not.toBe('');
    expect(input).toHaveValue('Sin prefijo por defecto');
    // Elegida, es la opción seleccionada y se anuncia como tal.
    await user.click(input);
    expect(screen.getAllByRole('option', { selected: true })).toEqual([
      screen.getByRole('option', { name: 'Sin prefijo por defecto' }),
    ]);
    expect(input).toHaveAttribute('aria-activedescendant', screen.getAllByRole('option')[0].id);
    // Solo con la lista entera: al escribir no aparece.
    await user.clear(input);
    expect(optionNames()[0]).toBe('Sin prefijo por defecto');
    await user.type(input, '58');
    expect(optionNames()).not.toContain('Sin prefijo por defecto');
  });

  it('typing a code or name never highlights the none option first', async () => {
    const { user, input, onChange } = setupPhone();
    // «de» está dentro de «Sin prefijo por defecto»: el código exacto va primero y se elige.
    await user.clear(input);
    await user.type(input, 'de');
    expect(optionNames()[0]).toBe(phoneRegionLabel('DE'));
    expect(optionNames()).not.toContain('Sin prefijo por defecto');
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('DE');
    expect(input).toHaveValue(phoneRegionLabel('DE'));

    await user.clear(input);
    await user.type(input, 'p');
    expect(optionNames()).not.toContain('Sin prefijo por defecto');
    await user.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalledWith(COMBOBOX_NONE);
    expect(onChange).toHaveBeenLastCalledWith(searchPhoneRegions('p')[0].code);
  });

  it('the result count leaves out the none row', async () => {
    const { user, input } = setupPhone();
    await user.clear(input);
    await user.type(input, '+44');
    const regions = searchPhoneRegions('+44').length;
    expect(screen.getByRole('status')).toHaveTextContent(phoneRegionComboboxCopy.results(regions));
    expect(screen.getAllByRole('option')).toHaveLength(regions);
  });
});
