import { apiFetch } from '@/lib/api/client';
import { listCurrencies } from './currencies-api';
import { listCountries } from './countries-api';
import { searchCities } from './cities-api';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
const mockedApiFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('reference fetchers', () => {
  beforeEach(() => mockedApiFetch.mockReset().mockResolvedValue([] as never));

  it('listCurrencies calls GET /currencies with the token', async () => {
    await listCurrencies('tok');
    expect(mockedApiFetch).toHaveBeenCalledWith('/currencies', { token: 'tok' });
  });

  it('listCountries calls GET /countries with the token', async () => {
    await listCountries('tok');
    expect(mockedApiFetch).toHaveBeenCalledWith('/countries', { token: 'tok' });
  });

  it('searchCities builds the querystring (countryCode required, q + limit optional)', async () => {
    await searchCities('tok', { countryCode: 'CO', q: 'bog', limit: 10 });
    expect(mockedApiFetch).toHaveBeenCalledWith(
      '/cities?countryCode=CO&q=bog&limit=10',
      { token: 'tok' },
    );
  });

  it('searchCities omits q and limit when absent', async () => {
    await searchCities('tok', { countryCode: 'CO' });
    expect(mockedApiFetch).toHaveBeenCalledWith('/cities?countryCode=CO', { token: 'tok' });
  });
});
