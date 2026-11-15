import { render, screen } from '@testing-library/react';
import {
  PublicPrescriptionCopyView,
  publicPrescriptionCopyCopy as copy,
} from './public-prescription-copy-view';
import {
  getPublicPrescriptionCopy,
  PRESCRIPTION_COPY_EXPIRED_CODE,
  type PublicPrescriptionCopy,
} from '@/lib/prescriptions/prescription-copy';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makePrescriptionDocument } from '@/lib/test/prescriptions';

jest.mock('../../lib/prescriptions/prescription-copy', () => ({
  ...jest.requireActual('../../lib/prescriptions/prescription-copy'),
  getPublicPrescriptionCopy: jest.fn(),
}));

const get = getPublicPrescriptionCopy as jest.MockedFunction<typeof getPublicPrescriptionCopy>;
const TOKEN = 'A'.repeat(43);
const FOOTER = 'Copia para el paciente. Para retirar el medicamento presente la receta impresa y firmada.';

const BASE: PublicPrescriptionCopy = {
  status: 'AVAILABLE',
  clinic: { name: 'Clínica Dental Los Palos Grandes', primaryColor: null, logoUrl: null },
  expiresAt: '2026-12-15T15:00:00.000Z',
  footer: FOOTER,
  prescription: makePrescriptionDocument(),
  voidedOn: null,
  locale: 'es-VE',
  hourCycle: 'h12',
};

describe('PublicPrescriptionCopyView (DX-468)', () => {
  beforeEach(() => {
    get.mockReset();
    window.print = jest.fn();
  });

  it('mientras carga, lo anuncia', () => {
    get.mockReturnValue(new Promise(() => undefined));
    render(<PublicPrescriptionCopyView token={TOKEN} />);
    expect(screen.getByRole('status')).toHaveTextContent(copy.loading);
    expect(get).toHaveBeenCalledWith(TOKEN);
  });

  it('vigente: la receta con su QR de verificación, el pie de la clínica y «Imprimir o guardar como PDF» (sin abrir la impresión sola)', async () => {
    get.mockResolvedValue(BASE);
    const user = setupUser();
    render(<PublicPrescriptionCopyView token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: 'Receta' })).toBeInTheDocument();
    expect(screen.getByTestId('prescription-verification-qr')).toBeInTheDocument();
    expect(screen.getByTestId('prescription-copy-footer')).toHaveTextContent(FOOTER);
    expect(screen.getByRole('heading', { name: copy.informativeTitle, level: 1 })).toBeInTheDocument();
    expect(window.print).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: copy.print }));
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('anulada después del envío: «Esta receta fue anulada» con el día, sin receta ni descarga', async () => {
    get.mockResolvedValue({ ...BASE, status: 'VOIDED', prescription: null, footer: null, voidedOn: '2026-11-20' });
    render(<PublicPrescriptionCopyView token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: copy.voidedTitle, level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/La clínica la anuló el 20\/11\/2026/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.print })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Receta' })).not.toBeInTheDocument();
  });

  it('caducado (410 con su código): «Este enlace caducó»', async () => {
    get.mockRejectedValue(new ApiError(410, 'Gone', { code: PRESCRIPTION_COPY_EXPIRED_CODE }));
    render(<PublicPrescriptionCopyView token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: copy.expiredTitle })).toBeInTheDocument();
  });

  it('inválido o de otra clínica (404): aviso genérico sin reintento', async () => {
    get.mockRejectedValue(new ApiError(404, 'Not Found'));
    render(<PublicPrescriptionCopyView token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: copy.notFoundTitle })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('hash alterado: no la muestra', async () => {
    get.mockResolvedValue({ ...BASE, status: 'UNVERIFIABLE', prescription: null, footer: null });
    render(<PublicPrescriptionCopyView token={TOKEN} />);
    expect(await screen.findByRole('heading', { name: copy.unverifiableTitle })).toBeInTheDocument();
  });

  it('sin red: error de sección con reintento que vuelve a pedirla', async () => {
    get.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    get.mockResolvedValueOnce(BASE);
    const user = setupUser();
    render(<PublicPrescriptionCopyView token={TOKEN} />);
    expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Receta' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(2);
  });

  it('429: «Demasiados intentos»', async () => {
    get.mockRejectedValue(new ApiError(429, 'Too Many Requests'));
    render(<PublicPrescriptionCopyView token={TOKEN} />);
    expect(await screen.findByText(copy.tooManyMessage)).toBeInTheDocument();
  });
});
