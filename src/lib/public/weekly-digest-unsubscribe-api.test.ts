import { confirmWeeklyDigestUnsubscribe, getWeeklyDigestUnsubscribe } from './weekly-digest-unsubscribe-api';
import { apiFetch } from '../api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('weekly-digest-unsubscribe-api (DX-568)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('abrir el enlace solo lee (GET, sin sesión) y codifica el token', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await getWeeklyDigestUnsubscribe('a/b?c');
    expect(mockedFetch).toHaveBeenCalledWith('/public/weekly-digest-unsubscribe/a%2Fb%3Fc');
  });

  it('confirmar la baja es un POST sin sesión', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await confirmWeeklyDigestUnsubscribe('tok_-1');
    expect(mockedFetch).toHaveBeenCalledWith('/public/weekly-digest-unsubscribe/tok_-1', { method: 'POST' });
  });
});
