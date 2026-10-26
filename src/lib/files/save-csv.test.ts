import { saveCsv } from './save-csv';

/** jsdom no implementa `Blob.text()` ni `arrayBuffer()`: se lee con FileReader. */
function bytesOf(blob: Blob): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve([...new Uint8Array(reader.result as ArrayBuffer)]);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe('saveCsv', () => {
  let blobs: Blob[];
  const revoke = jest.fn();
  const click = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

  beforeEach(() => {
    blobs = [];
    revoke.mockClear();
    click.mockClear();
    Object.assign(URL, {
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return 'blob:csv';
      },
      revokeObjectURL: revoke,
    });
  });

  afterAll(() => click.mockRestore());

  it('descarga el texto tal cual con el nombre pedido y suelta la URL', async () => {
    saveCsv('a;b\r\n1;2', 'gastos.csv');
    expect(click).toHaveBeenCalledTimes(1);
    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('gastos.csv');
    expect(link.isConnected).toBe(false);
    expect(revoke).toHaveBeenCalledWith('blob:csv');
    expect(blobs[0].type).toBe('text/csv;charset=utf-8');
    expect(await bytesOf(blobs[0])).toEqual([...Buffer.from('a;b\r\n1;2')]);
  });

  it('con `bom` antepone el BOM una sola vez', async () => {
    saveCsv('a;b', 'x.csv', { bom: true });
    saveCsv('﻿a;b', 'y.csv', { bom: true });
    const withBom = [0xef, 0xbb, 0xbf, ...Buffer.from('a;b')];
    expect(await bytesOf(blobs[0])).toEqual(withBom);
    expect(await bytesOf(blobs[1])).toEqual(withBom);
  });
});
