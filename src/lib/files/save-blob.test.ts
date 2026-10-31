import { saveBlob } from './save-blob';

describe('saveBlob (DX-339)', () => {
  const revoke = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
  let created: Blob[];

  beforeEach(() => {
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

  afterAll(() => click.mockRestore());

  it('descarga el blob tal cual con el nombre pedido, sin dejar el enlace en el DOM, y suelta la URL', () => {
    const pdf = new Blob(['%PDF-1.3'], { type: 'application/pdf' });
    saveBlob(pdf, 'agenda.pdf');
    expect(created).toEqual([pdf]);
    expect(click).toHaveBeenCalledTimes(1);
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('agenda.pdf');
    expect(link.href).toBe('blob:pdf');
    expect(link.isConnected).toBe(false);
    expect(revoke).toHaveBeenCalledWith('blob:pdf');
  });
});
