import { inspectFile, uploadBalances, validateImport } from './patient-imports-api';
import { uploadImportFile } from './import-upload';

jest.mock('./import-upload', () => ({ uploadImportFile: jest.fn() }));

const mockedUpload = uploadImportFile as jest.MockedFunction<typeof uploadImportFile>;
const file = () => new File(['doc\n1'], 'pacientes.csv', { type: 'text/csv' });

beforeEach(() => {
  mockedUpload.mockReset();
  mockedUpload.mockResolvedValue({});
});

describe('subida de la importación (DX-107 × DX-259)', () => {
  it('inspectFile sube el archivo por la ruta de subida «inspect» con el progreso', async () => {
    const onProgress = jest.fn();
    const chosen = file();
    await inspectFile('tok', chosen, onProgress);

    expect(mockedUpload).toHaveBeenCalledWith('inspect', expect.any(FormData), { token: 'tok', onProgress });
    const form = mockedUpload.mock.calls[0][1];
    expect([...form.keys()]).toEqual(['file']);
    expect(form.get('file')).toBeInstanceOf(File);
    expect((form.get('file') as File).name).toBe('pacientes.csv');
  });

  it('validateImport manda el mapeo y el tipo por defecto ANTES del archivo, por la ruta «validate»', async () => {
    const onProgress = jest.fn();
    await validateImport('tok', file(), { docNumber: 'Cédula' }, 'CC', onProgress);

    expect(mockedUpload).toHaveBeenCalledWith('validate', expect.any(FormData), { token: 'tok', onProgress });
    const form = mockedUpload.mock.calls[0][1];
    expect([...form.keys()]).toEqual(['mapping', 'defaultDocType', 'file']);
    expect(form.get('mapping')).toBe('{"docNumber":"Cédula"}');
    expect(form.get('defaultDocType')).toBe('CC');
  });

  it('sin tipo por defecto no manda el campo', async () => {
    await validateImport('tok', file(), {}, null);
    const form = mockedUpload.mock.calls[0][1];
    expect([...form.keys()]).toEqual(['mapping', 'file']);
  });

  it('uploadBalances (DX-262) sube la hoja de saldos por la ruta del lote', async () => {
    const onProgress = jest.fn();
    await uploadBalances('tok', 'batch-1', file(), onProgress);
    expect(mockedUpload).toHaveBeenCalledWith({ balancesOf: 'batch-1' }, expect.any(FormData), {
      token: 'tok',
      onProgress,
    });
    expect([...mockedUpload.mock.calls[0][1].keys()]).toEqual(['file']);
  });

  it('uploadBalances (QA D1) manda «Añadir aunque ya tenga saldo migrado» antes del archivo', async () => {
    await uploadBalances('tok', 'batch-1', file(), undefined, true);
    const form = mockedUpload.mock.calls[0][1];
    expect([...form.keys()]).toEqual(['addToExisting', 'file']);
    expect(form.get('addToExisting')).toBe('true');
  });
});
