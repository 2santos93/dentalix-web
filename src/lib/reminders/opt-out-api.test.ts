import { confirmPublicReminderOptOut, getPublicReminderOptOut } from './opt-out-api';
import { apiFetch } from '../api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('opt-out-api (DX-128)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('abrir el enlace solo lee (GET, sin sesión)', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await getPublicReminderOptOut('a/b');
    expect(mockedFetch).toHaveBeenCalledWith('/public/reminder-opt-outs/a%2Fb');
  });

  it('confirmar la baja es un POST', async () => {
    mockedFetch.mockResolvedValue({} as never);
    await confirmPublicReminderOptOut('tok');
    expect(mockedFetch).toHaveBeenCalledWith('/public/reminder-opt-outs/tok', { method: 'POST' });
  });
});
