import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CityCombobox } from './city-combobox';
import { searchCities } from '@/lib/reference/cities-api';

jest.mock('../../lib/reference/cities-api', () => ({ searchCities: jest.fn() }));
const mocked = searchCities as jest.MockedFunction<typeof searchCities>;

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
    await waitFor(() => expect(mocked).toHaveBeenCalledWith('tok', { countryCode: 'CO', q: 'bog' }));
    const option = await screen.findByText('Bogotá');
    await user.click(option);
    expect(onChange).toHaveBeenCalledWith({ id: 1, name: 'Bogotá' });
  });
});
