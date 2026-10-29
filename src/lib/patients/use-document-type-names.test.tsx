/** DX-327 (pre-flight M15): la ficha y los formularios piden los nombres de la clínica. */
import { act, renderHook, waitFor } from '@testing-library/react';
import { getDocumentTypeNames } from './document-type-names-api';
import { useDocumentTypeNames } from './use-document-type-names';

jest.mock('./document-type-names-api', () => ({ getDocumentTypeNames: jest.fn() }));
const mockedGet = getDocumentTypeNames as jest.MockedFunction<typeof getDocumentTypeNames>;

const NAMES = {
  NATIONAL_ID: 'ID local',
  PASSPORT: null,
  RESIDENCE_PERMIT: null,
  TAX_ID: null,
  OTHER: null,
};

describe('useDocumentTypeNames', () => {
  beforeEach(() => mockedGet.mockReset());

  it("loads the clinic's names and falls back to generic ones", async () => {
    mockedGet.mockResolvedValue(NAMES);
    const loaded = renderHook(() => useDocumentTypeNames('tok'));
    expect(loaded.result.current).toEqual({});
    await waitFor(() => expect(loaded.result.current).toEqual(NAMES));
    expect(mockedGet).toHaveBeenCalledWith('tok');

    mockedGet.mockRejectedValue(new Error('down'));
    const failed = renderHook(() => useDocumentTypeNames('tok'));
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
    await Promise.resolve();
    expect(failed.result.current).toEqual({});
  });

  it('a response for a previous token never overwrites the current one', async () => {
    const pending: Record<string, (names: typeof NAMES) => void> = {};
    mockedGet.mockImplementation(
      (token) => new Promise((resolve) => {
        pending[token] = resolve;
      }),
    );
    const { result, rerender } = renderHook(({ token }) => useDocumentTypeNames(token), {
      initialProps: { token: 'old' },
    });
    rerender({ token: 'new' });
    await waitFor(() => expect(pending.new).toBeDefined());

    await act(async () => pending.new({ ...NAMES, NATIONAL_ID: 'Documento A' }));
    expect(result.current.NATIONAL_ID).toBe('Documento A');
    // La respuesta tardía del token anterior llega después: se descarta.
    await act(async () => pending.old(NAMES));
    expect(result.current.NATIONAL_ID).toBe('Documento A');
  });

  it('a response that arrives after unmount updates nothing', async () => {
    let resolve: (names: typeof NAMES) => void = () => {};
    mockedGet.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useDocumentTypeNames('tok'));
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));
    unmount();
    await act(async () => resolve(NAMES));
    expect(result.current).toEqual({});
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('without a session it asks nothing', () => {
    const { result } = renderHook(() => useDocumentTypeNames(null));
    expect(result.current).toEqual({});
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
