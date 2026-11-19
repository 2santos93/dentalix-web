import { ApiError } from '@/lib/api/api-error';
import {
  clearPhoneReview,
  createDefaultPatientRecall,
  createRecallContactsBatch,
  isRecallAlreadySet,
  listRecallDue,
  listRecallSettings,
  updateRecallSettings,
} from './recall-api';
import { apiFetch } from '../api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn(), apiFetchOrNull: jest.fn() }));
const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('createDefaultPatientRecall (DX-015-bis D15)', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({ recalls: [], contacts: [], recallUpdates: [] } as never);
  });

  it('desde la salida (D16) manda la cita que se despide: la base del recall es ella', async () => {
    await createDefaultPatientRecall('tok', 'p1', 't-hyg', 'a1');
    expect(mockedFetch).toHaveBeenCalledWith('/patients/p1/recalls/default', {
      token: 'tok',
      method: 'POST',
      body: { recallTypeId: 't-hyg', appointmentId: 'a1' },
    });
  });

  it('desde «Sin recall configurado» (D17) no manda `appointmentId`', async () => {
    await createDefaultPatientRecall('tok', 'p1', 't-hyg');
    const body = mockedFetch.mock.calls[0][1]!.body;
    expect(body).toEqual({ recallTypeId: 't-hyg' });
    expect(body).not.toHaveProperty('appointmentId');
  });
});

describe('isRecallAlreadySet', () => {
  it('el 409 de duplicado sí; el de la sede sin zona horaria y otros estados, no', () => {
    expect(isRecallAlreadySet(new ApiError(409, 'Ya tiene un recall de ese tipo.'))).toBe(true);
    expect(isRecallAlreadySet(new ApiError(409, 'Sin zona', { code: 'LOCATION_TIMEZONE_REQUIRED' }))).toBe(false);
    expect(isRecallAlreadySet(new ApiError(422, 'Cita no válida'))).toBe(false);
    expect(isRecallAlreadySet(new Error('red'))).toBe(false);
  });
});

describe('cliente de intentos (DX-465)', () => {
  beforeEach(() => {
    mockedFetch.mockReset();
    mockedFetch.mockResolvedValue({} as never);
  });

  it('los filtros de intentos solo viajan encendidos', async () => {
    await listRecallDue('tok', { includeContacted: true, exhausted: false, page: 1 });
    expect(mockedFetch).toHaveBeenCalledWith('/recall/due?includeContacted=true&page=1', { token: 'tok' });
    await listRecallDue('tok', { exhausted: true });
    expect(mockedFetch).toHaveBeenLastCalledWith('/recall/due?exhausted=true', { token: 'tok' });
  });

  it('el lote, los ajustes por sede y «Ya está corregido» van a sus rutas', async () => {
    const batch = { items: [{ recallId: 'r1' }], channel: 'CALL' as const, outcome: 'CALL_BACK' as const, callbackOn: '2026-12-01' };
    await createRecallContactsBatch('tok', batch);
    expect(mockedFetch).toHaveBeenLastCalledWith('/recall/contacts/batch', { token: 'tok', method: 'POST', body: batch });
    await listRecallSettings('tok');
    expect(mockedFetch).toHaveBeenLastCalledWith('/recall-settings', { token: 'tok' });
    await updateRecallSettings('tok', 'l1', { hideDays: 10, maxAttempts: 4 });
    expect(mockedFetch).toHaveBeenLastCalledWith('/recall-settings/l1', {
      token: 'tok',
      method: 'PUT',
      body: { hideDays: 10, maxAttempts: 4 },
    });
    await clearPhoneReview('tok', 'p1');
    expect(mockedFetch).toHaveBeenLastCalledWith('/patients/p1/phone-review/clear', { token: 'tok', method: 'POST' });
  });
});
