/**
 * @jest-environment jsdom
 */
import {
  canDownloadContingencyAgenda,
  contingencyFallbackFileName,
  downloadContingencyAgenda,
  downloadContingencyNightly,
  getContingencyNightly,
} from './contingency-agenda-api';

const LOCATION = '22222222-2222-4222-8222-222222222222';

describe('contingency-agenda-api (DX-339)', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  function mockFetch(response: Record<string, unknown>) {
    const spy = jest.fn().mockResolvedValue({ ok: true, status: 200, ...response });
    global.fetch = spy as unknown as typeof fetch;
    return spy;
  }

  it('solo ADMIN y RECEPTION la descargan (CONTINGENCY_AGENDA_ROLES)', () => {
    expect(canDownloadContingencyAgenda('ADMIN')).toBe(true);
    expect(canDownloadContingencyAgenda('RECEPTION')).toBe(true);
    expect(canDownloadContingencyAgenda('DENTIST')).toBe(false);
    expect(canDownloadContingencyAgenda('ASSISTANT')).toBe(false);
    expect(canDownloadContingencyAgenda(null)).toBe(false);
  });

  it('descarga la de ahora por la ruta de la sede, con el nombre de la API', async () => {
    const blob = new Blob(['%PDF']);
    const spy = mockFetch({
      blob: async () => blob,
      headers: new Headers({ 'Content-Disposition': 'attachment; filename="agenda-contingencia-norte-2026-11-02.pdf"' }),
    });
    await expect(downloadContingencyAgenda('T', LOCATION)).resolves.toEqual({
      blob,
      fileName: 'agenda-contingencia-norte-2026-11-02.pdf',
    });
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(`/api/v1/locations/${LOCATION}/contingency-agenda`);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe('Bearer T');
  });

  it('sin nombre en la respuesta usa uno propio', async () => {
    mockFetch({ blob: async () => new Blob(['%PDF']), headers: new Headers() });
    await expect(downloadContingencyNightly('T', LOCATION)).resolves.toMatchObject({
      fileName: contingencyFallbackFileName(),
    });
    expect(contingencyFallbackFileName()).toBe('agenda-contingencia.pdf');
  });

  it('la copia nocturna: estado y PDF por sus rutas', async () => {
    const info = { available: true, current: true, forDate: '2026-11-02', generatedAt: '2026-11-02T07:10:00.000Z', appointmentCount: 3 };
    const spy = mockFetch({ json: async () => info });
    await expect(getContingencyNightly('T', LOCATION)).resolves.toEqual(info);
    expect(spy.mock.calls[0][0]).toBe(`/api/v1/locations/${LOCATION}/contingency-agenda/nightly`);
    const pdf = mockFetch({ blob: async () => new Blob(['%PDF']), headers: new Headers() });
    await downloadContingencyNightly('T', LOCATION);
    expect(pdf.mock.calls[0][0]).toBe(`/api/v1/locations/${LOCATION}/contingency-agenda/nightly/pdf`);
  });
});
