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
});
