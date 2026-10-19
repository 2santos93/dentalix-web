import { act, renderHook, waitFor } from '@testing-library/react';
import { useRdaReadiness } from './use-rda-readiness';
import { getRdaReadiness } from '@/lib/patients/clinical-api';
import { ApiError } from '@/lib/api/client';

jest.mock('../patients/clinical-api', () => ({
  ...jest.requireActual('../patients/clinical-api'),
  getRdaReadiness: jest.fn(),
}));
const mocked = getRdaReadiness as jest.MockedFunction<typeof getRdaReadiness>;
const ok = { notApplicable: false, ready: true, missing: [], pending: [] };

describe('useRdaReadiness (DX-212)', () => {
  beforeEach(() => mocked.mockReset());

  it('una petición por evolución, también al añadir una nueva', async () => {
    mocked.mockResolvedValue(ok);
    const { result, rerender } = renderHook(({ ids }) => useRdaReadiness('tok', ids), {
      initialProps: { ids: ['e1', 'e2'] },
    });
    await waitFor(() => expect(result.current.stateOf('e2').status).toBe('loaded'));
    rerender({ ids: ['e3', 'e1', 'e2'] });
    await waitFor(() => expect(result.current.stateOf('e3').status).toBe('loaded'));
    expect(mocked.mock.calls.map((c) => c[1])).toEqual(['e1', 'e2', 'e3']);
  });

  it('403 = sin permiso; otro fallo = error y retry lo repite', async () => {
    mocked.mockRejectedValueOnce(new ApiError(403, 'Forbidden'));
    mocked.mockRejectedValueOnce(new Error('red'));
    const { result } = renderHook(() => useRdaReadiness('tok', ['e1', 'e2']));
    await waitFor(() => expect(result.current.stateOf('e2').status).toBe('error'));
    expect(result.current.stateOf('e1').status).toBe('forbidden');
    mocked.mockResolvedValue(ok);
    act(() => result.current.retry('e2'));
    await waitFor(() => expect(result.current.stateOf('e2').status).toBe('loaded'));
  });
});
