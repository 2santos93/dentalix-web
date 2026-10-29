/** Cliente de los nombres locales de cada tipo de documento (DX-327, R16). */
import {
  canManageDocumentTypeNames,
  getDocumentTypeNames,
  updateDocumentTypeNames,
} from './document-type-names-api';

describe('document-type-names-api', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(body: unknown) {
    const spy = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => body,
      text: async () => JSON.stringify(body),
    });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  const names = {
    NATIONAL_ID: 'ID local',
    PASSPORT: null,
    RESIDENCE_PERMIT: null,
    TAX_ID: 'Documento A',
    OTHER: null,
  };

  it('reads and writes the five names', async () => {
    const spy = mockFetch({ names });
    await expect(getDocumentTypeNames('tok')).resolves.toEqual(names);
    expect(new URL(String(spy.mock.calls[0][0]), 'http://x').pathname).toMatch(
      /\/patients\/document-type-names$/,
    );
    await expect(updateDocumentTypeNames('tok', names)).resolves.toEqual(names);
    const [url, init] = spy.mock.calls[1];
    expect(new URL(String(url), 'http://x').pathname).toMatch(/\/patients\/document-type-names$/);
    expect(init.method).toBe('PUT');
    expect(JSON.parse(init.body)).toEqual({ names });
  });

  it('a missing name reads as null', async () => {
    mockFetch({ names: { NATIONAL_ID: 'ID local' } });
    await expect(getDocumentTypeNames('tok')).resolves.toEqual({
      NATIONAL_ID: 'ID local',
      PASSPORT: null,
      RESIDENCE_PERMIT: null,
      TAX_ID: null,
      OTHER: null,
    });
  });

  it('only ADMIN can manage them', () => {
    expect(canManageDocumentTypeNames('ADMIN')).toBe(true);
    expect(canManageDocumentTypeNames('RECEPTION')).toBe(false);
    expect(canManageDocumentTypeNames('DENTIST')).toBe(false);
    expect(canManageDocumentTypeNames(null)).toBe(false);
  });
});
