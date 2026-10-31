import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PublicSignedCopyView, publicSignedCopyCopy } from './public-signed-copy-view';
import {
  downloadPublicSignedPdfCopy,
  getPublicSignedPdfCopy,
  type PublicSignedPdfCopy,
} from '../../lib/signature-requests/signature-requests-api';
import { startDownload } from '../../lib/patient-documents/download';
import { ApiError } from '../../lib/api/client';

// jest.mock no reescribe alias: rutas relativas (ver otros *.test.tsx).
jest.mock('../../lib/signature-requests/signature-requests-api', () => ({
  getPublicSignedPdfCopy: jest.fn(),
  downloadPublicSignedPdfCopy: jest.fn(),
  SIGNED_PDF_COPY_LINK_USED: 'SIGNED_PDF_COPY_LINK_USED',
}));
jest.mock('../../lib/patient-documents/download', () => ({ startDownload: jest.fn() }));
jest.mock('../../lib/api/client', () => ({
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

const get = getPublicSignedPdfCopy as jest.Mock;
const download = downloadPublicSignedPdfCopy as jest.Mock;
const start = startDownload as jest.Mock;

const CLINIC = { name: 'Clínica Sonrisa', primaryColor: '#7C3AED', logoUrl: null };

function copyOf(overrides: Partial<PublicSignedPdfCopy> = {}): PublicSignedPdfCopy {
  return {
    state: 'AVAILABLE',
    message: 'Tu copia del documento firmado está lista para descargar',
    clinic: CLINIC,
    expiresAt: '2026-11-07T13:00:00.000Z',
    ...overrides,
  };
}

describe('PublicSignedCopyView (DX-443)', () => {
  beforeEach(() => {
    get.mockReset();
    download.mockReset();
    start.mockReset();
  });

  it('muestra cargando y luego la copia lista, sin gastar el enlace al abrirlo', async () => {
    get.mockResolvedValueOnce(copyOf());
    render(<PublicSignedCopyView token="tok-1" />);
    expect(screen.getByRole('status')).toHaveTextContent(publicSignedCopyCopy.loading);
    expect(await screen.findByRole('heading', { name: 'Clínica Sonrisa' })).toBeInTheDocument();
    expect(screen.getByText('Tu copia del documento firmado está lista para descargar')).toBeInTheDocument();
    expect(screen.getByText(publicSignedCopyCopy.onceHint)).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('tok-1');
    expect(download).not.toHaveBeenCalled();
  });

  it('«Descargar PDF» gasta el enlace, arranca la descarga y avisa de que ya no sirve', async () => {
    get.mockResolvedValueOnce(copyOf());
    download.mockResolvedValueOnce({
      url: 'https://api.example/files/signed?x=1',
      expiresAt: '2026-10-31T13:01:00.000Z',
      fileName: 'Consentimiento.pdf',
    });
    render(<PublicSignedCopyView token="tok-1" />);
    fireEvent.click(await screen.findByRole('button', { name: publicSignedCopyCopy.download }));
    await waitFor(() => expect(start).toHaveBeenCalledWith('https://api.example/files/signed?x=1'));
    expect(download).toHaveBeenCalledWith('tok-1');
    expect(await screen.findByText(publicSignedCopyCopy.downloadedTitle)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: publicSignedCopyCopy.download })).not.toBeInTheDocument();
  });

  it('un enlace ya usado dice «enlace usado» sin botón', async () => {
    get.mockResolvedValueOnce(copyOf({ state: 'USED', message: 'Este enlace ya se usó' }));
    render(<PublicSignedCopyView token="tok-1" />);
    expect(await screen.findByText('Este enlace ya se usó')).toBeInTheDocument();
    expect(screen.getByText(publicSignedCopyCopy.usedMessage)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: publicSignedCopyCopy.download })).not.toBeInTheDocument();
  });

  it('si otra pestaña lo gastó antes (410), pasa a «enlace usado»', async () => {
    get.mockResolvedValueOnce(copyOf());
    download.mockRejectedValueOnce(
      new ApiError(410, 'Gone', { code: 'SIGNED_PDF_COPY_LINK_USED' }),
    );
    render(<PublicSignedCopyView token="tok-1" />);
    fireEvent.click(await screen.findByRole('button', { name: publicSignedCopyCopy.download }));
    expect(await screen.findByText(publicSignedCopyCopy.usedTitle)).toBeInTheDocument();
    expect(start).not.toHaveBeenCalled();
  });

  it('404 (caducado, inválido o de otra clínica): «Enlace no válido»', async () => {
    get.mockRejectedValueOnce(new ApiError(404, 'Not found'));
    render(<PublicSignedCopyView token="tok-1" />);
    expect(await screen.findByText(publicSignedCopyCopy.invalidTitle)).toBeInTheDocument();
    expect(screen.getByText(publicSignedCopyCopy.invalidMessage)).toBeInTheDocument();
  });

  it('error de red al cargar: error de sección con reintento', async () => {
    get.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(copyOf());
    render(<PublicSignedCopyView token="tok-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(publicSignedCopyCopy.loadError);
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('button', { name: publicSignedCopyCopy.download })).toBeInTheDocument();
  });

  it('error de red al descargar: mensaje junto al botón y se puede volver a intentar', async () => {
    get.mockResolvedValueOnce(copyOf());
    download.mockRejectedValueOnce(new Error('offline'));
    render(<PublicSignedCopyView token="tok-1" />);
    const button = await screen.findByRole('button', { name: publicSignedCopyCopy.download });
    fireEvent.click(button);
    expect(await screen.findByRole('alert')).toHaveTextContent(publicSignedCopyCopy.downloadError);
    expect(screen.getByRole('button', { name: publicSignedCopyCopy.download })).toBeEnabled();
  });
});
