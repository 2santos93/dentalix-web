import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CityCombobox, type CitySelection } from './city-combobox';
import { searchCities } from '@/lib/reference/cities-api';

jest.mock('../../lib/reference/cities-api', () => ({ searchCities: jest.fn() }));
const mocked = searchCities as jest.MockedFunction<typeof searchCities>;

// A minimal real parent that owns `value`/`countryCode` the way Task 13's
// patient-form will: `onChange` calls `setState`. This is what actually
// surfaces React's "Cannot update a component while rendering a different
// component" warning if CityCombobox ever calls `onChange` synchronously
// during its own render — a plain `jest.fn()` onChange (as in the other
// tests) would never trigger that warning, since it doesn't itself setState.
function CountryChangingParent() {
  const [countryCode, setCountryCode] = useState('CO');
  const [value, setValue] = useState<CitySelection | null>({ id: 1, name: 'Bogotá' });
  return (
    <>
      <button type="button" onClick={() => setCountryCode('MX')}>
        change country
      </button>
      <CityCombobox id="city" token="tok" countryCode={countryCode} value={value} onChange={setValue} />
    </>
  );
}

describe('CityCombobox', () => {
  beforeEach(() => {
    mocked.mockReset().mockResolvedValue([
      { id: 1, name: 'Bogotá', region: 'Bogota D.C.' },
      { id: 2, name: 'Bogotá Chico', region: 'Bogota D.C.' },
    ]);
  });

  it('is disabled without a countryCode', () => {
    render(<CityCombobox id="city" token="tok" countryCode={null} value={null} onChange={() => {}} />);
    expect(screen.getByRole('combobox')).toBeDisabled();
  });

  it('queries and lets the user pick a city', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<CityCombobox id="city" token="tok" countryCode="CO" value={null} onChange={onChange} />);
    await user.type(screen.getByRole('combobox'), 'bog');
    await waitFor(() =>
      expect(mocked).toHaveBeenCalledWith('tok', { countryCode: 'CO', q: 'bog', limit: 50 }),
    );
    const option = await screen.findByText('Bogotá');
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith({ id: 1, name: 'Bogotá' });
  });

  it('does not reopen the dropdown after a city is picked', async () => {
    const onChange = jest.fn();
    const user = userEvent.setup();
    render(<CityCombobox id="city" token="tok" countryCode="CO" value={null} onChange={onChange} />);
    await user.type(screen.getByRole('combobox'), 'bog');
    await waitFor(() =>
      expect(mocked).toHaveBeenCalledWith('tok', { countryCode: 'CO', q: 'bog', limit: 50 }),
    );
    const option = await screen.findByText('Bogotá');
    await user.click(option);

    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    mocked.mockClear();

    // Wait well past the 250ms debounce window that setting `text` to the
    // picked city's name would otherwise schedule a search on.
    await new Promise((resolve) => setTimeout(resolve, 400));

    expect(mocked).not.toHaveBeenCalled();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('clears the selection when countryCode changes, without a React render-phase warning', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const user = userEvent.setup();
    render(<CountryChangingParent />);
    expect(screen.getByRole('combobox')).toHaveValue('Bogotá');

    await user.click(screen.getByRole('button', { name: /change country/i }));

    await waitFor(() => expect(screen.getByRole('combobox')).toHaveValue(''));
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  // DX-063 / FE-013: un fallo de la búsqueda no se disfraza de «sin resultados».
  it('si la búsqueda falla, muestra un FieldError con reintento y vuelve a buscar', async () => {
    mocked.mockReset()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce([{ id: 1, name: 'Bogotá', region: 'Bogota D.C.' }]);
    const user = userEvent.setup();
    render(<CityCombobox id="city" token="tok" countryCode="CO" value={null} onChange={() => {}} />);

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('Ciudades no disponibles');
    expect(status).toHaveClass('h-10', 'w-full');
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    const input = await screen.findByRole('combobox');
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(2));
    await user.click(input);
    expect(await screen.findByText('Bogotá')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  // Revisión M-4: si la búsqueda falla mientras se escribe, el foco no se pierde
  // (pasa al Reintentar, que hereda el id del campo para su <label>), y vuelve
  // al campo al reintentar.
  it('si falla con el foco en el campo, el foco pasa al Reintentar y vuelve al campo', async () => {
    mocked.mockReset()
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue([{ id: 1, name: 'Bogotá', region: 'Bogota D.C.' }]);
    const user = userEvent.setup();
    render(<CityCombobox id="city" token="tok" countryCode="CO" value={null} onChange={() => {}} />);
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(1));
    await user.type(screen.getByRole('combobox'), 'b');

    const retry = await screen.findByRole('button', { name: 'Reintentar' });
    expect(retry).toHaveAttribute('id', 'city');
    expect(retry).toHaveFocus();

    await user.click(retry);
    expect(await screen.findByRole('combobox')).toHaveFocus();
    expect(screen.getByRole('combobox')).toHaveValue('b');
  });
});
