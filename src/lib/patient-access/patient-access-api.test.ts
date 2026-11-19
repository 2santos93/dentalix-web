import { apiFetch } from '../api/client';
import { ApiError, NetworkError } from '../api/api-error';
import {
  acceptPortalPlan,
  PORTAL_QUOTE_CHANGED,
  PORTAL_QUOTE_NOT_ACCEPTABLE,
  portalAcceptFailure,
} from './patient-access-api';

jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  apiFetch: jest.fn(),
}));

const mockedFetch = apiFetch as jest.MockedFunction<typeof apiFetch>;

describe('acceptPortalPlan (DX-101-bis)', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('POST a me/plans/:planId/accept con el cuerpo tal cual, sin Bearer (la cookie va sola)', async () => {
    mockedFetch.mockResolvedValue({ id: 'plan-b', status: 'ACCEPTED' });
    const body = {
      signerName: 'María José Pérez',
      signature: 'data:image/png;base64,AAAA',
      contentHash: 'c'.repeat(64),
      consent: true as const,
    };
    await expect(acceptPortalPlan('plan/b', body)).resolves.toEqual({ id: 'plan-b', status: 'ACCEPTED' });
    expect(mockedFetch).toHaveBeenCalledWith('/public/patient-access/me/plans/plan%2Fb/accept', {
      method: 'POST',
      body,
    });
    expect(mockedFetch.mock.calls[0][1]).not.toHaveProperty('token');
  });

  it('propaga el ApiError (la pantalla decide con portalAcceptFailure)', async () => {
    const err = new ApiError(409, 'x', { code: PORTAL_QUOTE_CHANGED });
    mockedFetch.mockRejectedValue(err);
    await expect(
      acceptPortalPlan('p', { signerName: 'A', signature: 's', contentHash: 'h', consent: true }),
    ).rejects.toBe(err);
  });
});

describe('portalAcceptFailure', () => {
  it.each([
    [new ApiError(409, 'x', { code: PORTAL_QUOTE_CHANGED }), 'changed'],
    [new ApiError(409, 'x', { code: PORTAL_QUOTE_NOT_ACCEPTABLE }), 'notAcceptable'],
    [new ApiError(409, 'x'), 'notAcceptable'],
    [new ApiError(404, 'No encontramos ese presupuesto.'), 'notAcceptable'],
    [new ApiError(403, 'x', { code: 'PATIENT_ACCESS_SCOPE_REQUIRED' }), 'notAcceptable'],
    [new ApiError(410, 'x', { code: 'PATIENT_ACCESS_GONE' }), 'session'],
    [new ApiError(401, 'x', { code: 'PATIENT_ACCESS_SESSION_REQUIRED' }), 'session'],
    [new ApiError(429, 'x', { retryAfterSeconds: 60 }), 'rateLimited'],
    [new ApiError(400, 'Escribe tu nombre para firmar.'), 'invalid'],
    [new ApiError(500, 'x'), 'failed'],
    [new NetworkError(new TypeError('fetch')), 'failed'],
    [new Error('x'), 'failed'],
  ])('%p → %s', (err, kind) => {
    expect(portalAcceptFailure(err)).toBe(kind);
  });
});
