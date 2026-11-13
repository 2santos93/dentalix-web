import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  PublicPrescriptionVerificationView,
  publicPrescriptionVerificationCopy as copy,
} from './public-prescription-verification-view';
import {
  getPublicPrescriptionVerification,
  type PublicPrescriptionVerification,
} from '../../lib/prescriptions/prescription-verification';
import { ApiError } from '../../lib/api/client';

// jest.mock no reescribe alias: rutas relativas (ver otros *.test.tsx).
jest.mock('../../lib/prescriptions/prescription-verification', () => ({
  ...jest.requireActual('../../lib/prescriptions/prescription-verification'),
  getPublicPrescriptionVerification: jest.fn(),
}));
jest.mock('../../lib/api/client', () => ({
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

const get = getPublicPrescriptionVerification as jest.Mock;
const CODE = 'K7M3QH9XRT2W';

const EMPTY: PublicPrescriptionVerification = {
  status: 'UNVERIFIABLE',
  issuedOn: null,
  voidedOn: null,
  professionalName: null,
  professionalLicense: null,
  clinicName: null,
  patientInitials: null,
  locale: null,
  hourCycle: null,
};

const VALID: PublicPrescriptionVerification = {
  ...EMPTY,
  status: 'VALID',
  issuedOn: '2026-11-14',
  professionalName: 'Dra. Andreína Salazar',
  professionalLicense: 'MPPS 45678',
  clinicName: 'Clínica Dental Los Palos Grandes',
  patientInitials: 'M. J. P. R.',
  locale: 'es-VE',
  hourCycle: 'h12',
};

describe('PublicPrescriptionVerificationView (DX-467)', () => {
  beforeEach(() => get.mockReset());

  it('mientras comprueba muestra un estado de carga accesible', () => {
    get.mockReturnValue(new Promise(() => {}));
    render(<PublicPrescriptionVerificationView code={CODE} />);
    expect(screen.getByRole('status')).toHaveTextContent(copy.loading);
  });

  it('válida: solo fecha, profesional, registro, clínica e iniciales, con el código agrupado', async () => {
    get.mockResolvedValue(VALID);
    render(<PublicPrescriptionVerificationView code="k7m3-qh9x-rt2w" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Receta válida' })).toBeInTheDocument();
    const verdict = screen.getByTestId('rx-verification');
    expect(verdict).toHaveTextContent('Fecha de emisión14/11/2026');
    expect(verdict).toHaveTextContent('ProfesionalDra. Andreína Salazar');
    expect(verdict).toHaveTextContent('Registro profesionalMPPS 45678');
    expect(verdict).toHaveTextContent('ClínicaClínica Dental Los Palos Grandes');
    expect(verdict).toHaveTextContent('PacienteM. J. P. R.');
    expect(screen.getByText('K7M3-QH9X-RT2W')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('k7m3-qh9x-rt2w');
  });

  it('anulada: «Receta anulada el DD/MM/AAAA», sin motivo ni datos de la receta', async () => {
    get.mockResolvedValue({ ...EMPTY, status: 'VOIDED', voidedOn: '2026-11-19', locale: 'es-VE', hourCycle: 'h12' });
    render(<PublicPrescriptionVerificationView code={CODE} />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Receta anulada el 19/11/2026' }),
    ).toBeInTheDocument();
    expect(screen.getByText(copy.voidedMessage)).toBeInTheDocument();
    expect(screen.queryByText(copy.professional)).toBeNull();
  });

  it('anulada sin formato de sede: la frase pierde la fecha, nunca «—»', async () => {
    get.mockResolvedValue({ ...EMPTY, status: 'VOIDED', voidedOn: '2026-11-19', locale: null });
    render(<PublicPrescriptionVerificationView code={CODE} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Receta anulada' })).toBeInTheDocument();
  });

  it('hash alterado: «No se puede verificar; contacte con la clínica», sin datos', async () => {
    get.mockResolvedValue(EMPTY);
    render(<PublicPrescriptionVerificationView code={CODE} />);
    expect(await screen.findByRole('heading', { level: 1, name: copy.unverifiableTitle })).toBeInTheDocument();
    expect(screen.getByText(/No se puede verificar; contacte con la clínica/)).toBeInTheDocument();
    expect(screen.queryByText(copy.professional)).toBeNull();
  });

  it('código inexistente (404): la página genérica, sin el código', async () => {
    get.mockRejectedValue(new ApiError(404, 'Receta no encontrada'));
    render(<PublicPrescriptionVerificationView code={CODE} />);
    expect(await screen.findByRole('heading', { level: 1, name: copy.notFoundTitle })).toBeInTheDocument();
    expect(screen.queryByText('K7M3-QH9X-RT2W')).toBeNull();
  });

  it('fallo de red: error de sección con reintento que vuelve a preguntar', async () => {
    get.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(VALID);
    render(<PublicPrescriptionVerificationView code={CODE} />);
    expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Receta válida' })).toBeInTheDocument();
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
  });

  it('demasiadas consultas (429): lo dice y deja reintentar', async () => {
    get.mockRejectedValue(new ApiError(429, 'Demasiadas solicitudes'));
    render(<PublicPrescriptionVerificationView code={CODE} />);
    expect(await screen.findByText(copy.tooManyMessage)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
