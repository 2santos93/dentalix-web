import { BLOB_URL_LIFETIME_MS, saveBlob } from './save-blob';

describe('saveBlob (DX-339)', () => {
  const revoke = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  let created: Blob[];

  beforeEach(() => {
    jest.useFakeTimers();
    created = [];
    revoke.mockClear();
    click.mockClear();
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        created.push(blob);
        return 'blob:pdf';
      },
      revokeObjectURL: revoke,
    });
  });

  afterEach(() => jest.useRealTimers());
  afterAll(() => click.mockRestore());

  it('descarga el blob tal cual con el nombre pedido, sin dejar el enlace en el DOM', () => {
    const pdf = new Blob(['%PDF-1.3'], { type: 'application/pdf' });
    saveBlob(pdf, 'agenda.pdf');
    expect(created).toEqual([pdf]);
    expect(click).toHaveBeenCalledTimes(1);
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('agenda.pdf');
    expect(link.href).toBe('blob:pdf');
    expect(link.isConnected).toBe(false);
  });

  it('DX-181: la URL NO se revoca en el mismo tick del clic (WebKit) y se suelta pasado el plazo', () => {
    saveBlob(new Blob(['a,b'], { type: 'text/csv' }), 'cartera.csv');
    expect(revoke).not.toHaveBeenCalled();
    jest.advanceTimersByTime(BLOB_URL_LIFETIME_MS - 1);
    expect(revoke).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(revoke).toHaveBeenCalledWith('blob:pdf');
  });
});
