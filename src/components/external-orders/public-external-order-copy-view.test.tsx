import { render, screen, waitFor } from '@testing-library/react';
import { PublicExternalOrderCopyView, publicExternalOrderCopyCopy as copy } from './public-external-order-copy-view';
import {
  downloadPublicExternalOrderCopy,
  getPublicExternalOrderCopy,
  type PublicExternalOrderCopy,
} from '@/lib/external-orders/external-orders-api';
import { saveBlob } from '@/lib/files/save-blob';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/external-orders/external-orders-api', () => ({
  ...jest.requireActual('../../lib/external-orders/external-orders-api'),
  getPublicExternalOrderCopy: jest.fn(),
  downloadPublicExternalOrderCopy: jest.fn(),
}));
jest.mock('../../lib/files/save-blob', () => ({ saveBlob: jest.fn() }));

const get = jest.mocked(getPublicExternalOrderCopy);
const download = jest.mocked(downloadPublicExternalOrderCopy);
const TOKEN = 'A'.repeat(43);

const BASE: PublicExternalOrderCopy = {
  status: 'AVAILABLE',
  clinic: { name: 'Clínica Dental Ávila', primaryColor: null, logoUrl: null },
  numberLabel: '000123',
  kind: 'IMAGING',
  issuedAt: '2026-11-10T14:00:00.000Z',
  expiresAt: '2026-11-17T14:00:00.000Z',
  format: { timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h12' },
};

describe('PublicExternalOrderCopyView (DX-572)', () => {
  beforeEach(() => {
    get.mockReset();
    download.mockReset();
    jest.mocked(saveBlob).mockReset();
  });

  it('mientras carga, lo anuncia', () => {
    get.mockReturnValue(new Promise(() => undefined));
    render(<PublicExternalOrderCopyView token={TOKEN} />);
    expect(screen.getByRole('status')).toHaveTextContent(copy.loading);
  });

  it('disponible: clínica, nº, tipo, fechas de la sede, aviso de una sola vez y «Descargar PDF» (gasta el enlace)', async () => {
    const user = setupUser();
    get.mockResolvedValue(BASE);
    download.mockResolvedValue({ blob: new Blob(['%PDF'], { type: 'application/pdf' }), fileName: 'orden-000123.pdf' });
    render(<PublicExternalOrderCopyView token={TOKEN} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Orden de estudios de imagen nº 000123' })).toBeInTheDocument();
    expect(screen.getByText('Clínica Dental Ávila')).toBeInTheDocument();
    expect(screen.getByText('10/11/2026')).toBeInTheDocument();
    expect(screen.getByText('17/11/2026')).toBeInTheDocument();
    expect(screen.getByText(copy.onceHint)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Descargar PDF/ }));
    await waitFor(() => expect(download).toHaveBeenCalledWith(TOKEN));
    expect(saveBlob).toHaveBeenCalledWith(expect.any(Blob), 'orden-000123.pdf');
    expect(await screen.findByTestId('public-external-order-copy-downloaded')).toHaveTextContent(copy.downloadedTitle);
    expect(screen.queryByRole('button', { name: /Descargar PDF/ })).not.toBeInTheDocument();
  });

  it('ya usado al abrir: «Este enlace ya se usó» sin descarga', async () => {
    get.mockResolvedValue({ ...BASE, status: 'USED' });
    render(<PublicExternalOrderCopyView token={TOKEN} />);
    expect(await screen.findByTestId('public-external-order-copy-used')).toHaveTextContent(copy.usedMessage);
    expect(screen.queryByRole('button', { name: /Descargar PDF/ })).not.toBeInTheDocument();
  });

  it('410 al descargar (otra pestaña lo gastó): pasa a «ya se usó»', async () => {
    const user = setupUser();
    get.mockResolvedValue(BASE);
    download.mockRejectedValue(new ApiError(410, 'Usado', { code: 'EXTERNAL_ORDER_COPY_LINK_USED' }));
    render(<PublicExternalOrderCopyView token={TOKEN} />);
    await user.click(await screen.findByRole('button', { name: /Descargar PDF/ }));
    expect(await screen.findByTestId('public-external-order-copy-used')).toBeInTheDocument();
  });

  it('404: el aviso genérico, sin nada de la orden', async () => {
    get.mockRejectedValue(new ApiError(404, 'No'));
    render(<PublicExternalOrderCopyView token={TOKEN} />);
    expect(await screen.findByRole('heading', { level: 1, name: copy.notFoundTitle })).toBeInTheDocument();
  });

  it('sin red: escalón 1 con reintento', async () => {
    const user = setupUser();
    get.mockRejectedValueOnce(new Error('red')).mockResolvedValueOnce(BASE);
    render(<PublicExternalOrderCopyView token={TOKEN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.loadError);
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('button', { name: /Descargar PDF/ })).toBeInTheDocument();
  });
});
