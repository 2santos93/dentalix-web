import { act, render, screen } from '@testing-library/react';
import { useCallback } from 'react';
import { SingleFileField, useSingleFileUpload } from './single-file-field';
import { prepareSingleFile, uploadSingleFile, type SingleFileRules } from '@/lib/files/upload-single-file';
import { HeicConversionError } from '@/lib/patient-documents/heic';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/files/upload-single-file', () => ({
  ...jest.requireActual('../../lib/files/upload-single-file'),
  prepareSingleFile: jest.fn(),
  uploadSingleFile: jest.fn(),
}));

const mockedPrepare = prepareSingleFile as jest.MockedFunction<typeof prepareSingleFile>;
const mockedUpload = uploadSingleFile as jest.MockedFunction<typeof uploadSingleFile>;

const RULES: SingleFileRules = {
  maxBytes: 1024,
  extensions: ['pdf', 'jpg', 'heic'],
  mimeTypes: ['application/pdf', 'image/jpeg', 'image/heic'],
  messages: { tooLarge: 'Demasiado grande.', empty: 'Vacío.', unsupported: 'Tipo no admitido.' },
};

function Harness() {
  const requestTicket = useCallback(
    async () => ({ uploadId: 'never', target: { method: 'POST' as const, url: '', fields: {} } }),
    [],
  );
  const upload = useSingleFileUpload(RULES, requestTicket);
  return (
    <>
      <SingleFileField id="receipt" label="Soporte" hint="PDF o JPG." accept=".pdf,.jpg,.heic" upload={upload} />
      <output data-testid="upload-id">{upload.uploadId ?? ''}</output>
    </>
  );
}

const pdf = () => new File(['%PDF-'], 'luz.pdf', { type: 'application/pdf' });

describe('SingleFileField', () => {
  beforeEach(() => {
    mockedPrepare.mockReset().mockImplementation(async (file) => file);
    mockedUpload.mockReset().mockResolvedValue('up-1');
  });

  it('sube al elegir, con progreso, y deja el uploadId', async () => {
    const user = setupUser();
    let report: ((fraction: number) => void) | undefined;
    let finish: (id: string) => void = () => undefined;
    mockedUpload.mockImplementation(
      (_file, _ticket, opts) =>
        new Promise((resolve) => {
          report = opts?.onProgress;
          finish = resolve;
        }),
    );
    render(<Harness />);
    expect(screen.getByText('PDF o JPG.')).toBeInTheDocument();
    await user.upload(screen.getByLabelText('Soporte'), pdf());
    const bar = await screen.findByRole('progressbar', { name: 'Subida de luz.pdf' });
    act(() => report?.(0.5));
    expect(bar).toHaveAttribute('aria-valuenow', '50');
    await act(async () => finish('up-1'));
    expect(await screen.findByText('Subido')).toBeInTheDocument();
    expect(screen.getByTestId('upload-id')).toHaveTextContent('up-1');
    await user.click(screen.getByRole('button', { name: 'Quitar el archivo' }));
    expect(screen.getByTestId('upload-id')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Elegir archivo' })).toBeInTheDocument();
  });

  it('cancelar aborta la subida', async () => {
    const user = setupUser();
    let signal: AbortSignal | undefined;
    mockedUpload.mockImplementation((_file, _ticket, opts) => {
      signal = opts?.signal;
      return new Promise(() => undefined);
    });
    render(<Harness />);
    await user.upload(screen.getByLabelText('Soporte'), pdf());
    await user.click(await screen.findByRole('button', { name: 'Cancelar la subida' }));
    expect(signal?.aborted).toBe(true);
    expect(screen.queryByText('luz.pdf')).not.toBeInTheDocument();
  });

  it('un fichero que no vale se dice junto al campo y no se sube', async () => {
    const user = setupUser();
    render(<Harness />);
    await user.upload(screen.getByLabelText('Soporte'), new File([''], 'vacio.pdf', { type: 'application/pdf' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Vacío.');
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Elegir archivo' })).toBeInTheDocument();
  });

  it('una HEIC que no se convierte se dice en español y se puede reintentar', async () => {
    const user = setupUser();
    mockedPrepare.mockRejectedValueOnce(new HeicConversionError(new Error('wasm')));
    render(<Harness />);
    await user.upload(screen.getByLabelText('Soporte'), new File(['x'], 'IMG_1.heic', { type: 'image/heic' }));
    expect(await screen.findByText('No pudimos convertir la foto HEIC; expórtala como JPG.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Subido')).toBeInTheDocument();
  });

  it('tras fallar la conversión HEIC permite quitar el archivo y elegir de nuevo', async () => {
    const user = setupUser();
    mockedPrepare.mockRejectedValueOnce(new HeicConversionError(new Error('wasm')));
    render(<Harness />);
    await user.upload(screen.getByLabelText('Soporte'), new File(['x'], 'IMG_1.heic', { type: 'image/heic' }));
    await screen.findByText('No pudimos convertir la foto HEIC; expórtala como JPG.');
    await user.click(screen.getByRole('button', { name: 'Quitar el archivo' }));
    expect(screen.queryByText('IMG_1.heic')).not.toBeInTheDocument();
    expect(screen.getByTestId('upload-id')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Elegir archivo' })).toBeInTheDocument();
  });

  it('un fallo de red o del almacén deja reintentar', async () => {
    const user = setupUser();
    mockedUpload.mockRejectedValueOnce(new TypeError('boom'));
    render(<Harness />);
    await user.upload(screen.getByLabelText('Soporte'), pdf());
    expect(await screen.findByText('No pudimos subir el archivo.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Subido')).toBeInTheDocument();
    expect(mockedUpload).toHaveBeenCalledTimes(2);
  });
});
