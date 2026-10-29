/** DX-327 (pre-flight M15): la ficha y los formularios piden los nombres de la clínica. */
import { renderHook, waitFor } from '@testing-library/react';
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

  it('without a session it asks nothing', () => {
    const { result } = renderHook(() => useDocumentTypeNames(null));
    expect(result.current).toEqual({});
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
