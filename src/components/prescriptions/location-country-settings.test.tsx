import { render, screen, waitFor } from '@testing-library/react';
import { LocationCountrySettings } from './location-country-settings';
import { listLocations } from '@/lib/locations/locations-api';
import { updateLocationCountry } from '@/lib/prescriptions/prescriptions-api';
import { notifyError } from '@/components/errors/notify';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/prescriptions/prescriptions-api', () => ({
  ...jest.requireActual('../../lib/prescriptions/prescriptions-api'),
  updateLocationCountry: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedUpdate = updateLocationCountry as jest.MockedFunction<typeof updateLocationCountry>;

const sede = {
  id: 'loc1',
  name: 'Sede Principal',
  address: null,
  country: 'CO' as const,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('LocationCountrySettings', () => {
  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue([sede]);
    mockedUpdate.mockReset();
  });

  it('cambia el país de una sede', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue(undefined);
    render(<LocationCountrySettings token="tok" />);
    const select = await screen.findByRole('combobox', { name: 'País de Sede Principal' });
    expect(select).toHaveValue('CO');
    await user.selectOptions(select, 'ES');
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'loc1', 'ES'));
    expect(select).toHaveValue('ES');
  });

  it('si falla, deshace el cambio y avisa con reintento (toast)', async () => {
    const user = setupUser();
    mockedUpdate.mockRejectedValue(new Error('x'));
    render(<LocationCountrySettings token="tok" />);
    const select = await screen.findByRole('combobox', { name: 'País de Sede Principal' });
    await user.selectOptions(select, 'ES');
    await waitFor(() => expect(select).toHaveValue('CO'));
    expect(notifyError).toHaveBeenCalledWith(
      'No pudimos cambiar el país de «Sede Principal».',
      expect.objectContaining({ onRetry: expect.any(Function) as unknown }),
    );
  });
});
