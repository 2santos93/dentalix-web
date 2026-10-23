import { act, renderHook, waitFor } from '@testing-library/react';
import { useRdaReadiness } from './use-rda-readiness';
import { getRdaReadinessBatch } from '@/lib/patients/clinical-api';
import { ApiError } from '@/lib/api/client';
import { setActiveLocationId } from '@/lib/locations/location-store';

jest.mock('../patients/clinical-api', () => ({
  ...jest.requireActual('../patients/clinical-api'),
  getRdaReadinessBatch: jest.fn(),
}));
const mocked = getRdaReadinessBatch as jest.MockedFunction<typeof getRdaReadinessBatch>;
const ok = { notApplicable: false, ready: true, missing: [], pending: [] };
const response = (ids: readonly string[]) => ids.map((entryId) => ({ entryId, ...ok }));

describe('useRdaReadiness (DX-232)', () => {
  beforeEach(() => { mocked.mockReset(); localStorage.clear(); });
  it('40 evoluciones hacen una petición y nuevas solo una más', async () => {
    mocked.mockImplementation(async (_token, _patient, ids) => response(ids));
    const ids = Array.from({ length: 40 }, (_, i) => `e${i}`);
    const { result, rerender } = renderHook(({ ids }) => useRdaReadiness('tok', 'p1', ids), { initialProps: { ids } });
    await waitFor(() => expect(result.current.stateOf('e39').status).toBe('loaded'));
    expect(mocked).toHaveBeenCalledTimes(1);
    expect(mocked).toHaveBeenCalledWith('tok', 'p1', ids);
    rerender({ ids: ['new', ...ids] });
    await waitFor(() => expect(result.current.stateOf('new').status).toBe('loaded'));
    expect(mocked.mock.calls[1][2]).toEqual(['new']);
  });
  it('más de50 se agrupan sin exceder el contrato', async () => {
    mocked.mockImplementation(async (_token, _patient, ids) => response(ids));
    const { result } = renderHook(() => useRdaReadiness('tok', 'p1', Array.from({ length: 101 }, (_, i) => `e${i}`)));
    await waitFor(() => expect(result.current.stateOf('e100').status).toBe('loaded'));
    expect(mocked.mock.calls.map((c) => c[2].length)).toEqual([50, 50, 1]);
  });
  it('403 oculta todos los chips del lote; otro fallo permite reintentar uno', async () => {
    mocked.mockRejectedValueOnce(new ApiError(403, 'Forbidden'));
    const { result } = renderHook(() => useRdaReadiness('tok', 'p1', ['e1', 'e2']));
    await waitFor(() => expect(result.current.stateOf('e2').status).toBe('forbidden'));
    expect(result.current.stateOf('e1').status).toBe('forbidden');
    mocked.mockRejectedValueOnce(new Error('red'));
    act(() => result.current.retry('e2'));
    await waitFor(() => expect(result.current.stateOf('e2').status).toBe('error'));
    mocked.mockImplementation(async (_token, _patient, ids) => response(ids));
    act(() => result.current.retry('e2'));
    await waitFor(() => expect(result.current.stateOf('e2').status).toBe('loaded'));
  });
  it('cambio de paciente/token/sede reinicia datos y descarta la respuesta anterior', async () => {
    let resolveOld!: (value: ReturnType<typeof response>) => void;
    mocked.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    mocked.mockImplementation(async (_token, _patient, ids) => response(ids));
    const { result, rerender } = renderHook(({ token, patient }) => useRdaReadiness(token, patient, ['e1']), { initialProps: { token: 'tok', patient: 'p1' } });
    expect(result.current.stateOf('e1').status).toBe('loading');
    rerender({ token: 'new', patient: 'p2' });
    await waitFor(() => expect(result.current.stateOf('e1').status).toBe('loaded'));
    act(() => resolveOld([{ entryId: 'e1', ...ok, ready: false }]));
    await waitFor(() => expect(result.current.stateOf('e1')).toEqual({ status: 'loaded', data: ok }));
    act(() => setActiveLocationId('B'));
    await waitFor(() => expect(mocked).toHaveBeenCalledTimes(3));
  });
});
