import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ApiError } from '@/lib/api/api-error';
import {
  getPublicPrescriptionVerification,
  type PublicPrescriptionVerification,
} from '@/lib/prescriptions/prescription-verification';
import { PublicPrescriptionVerificationView } from './public-prescription-verification-view';

jest.mock('../../lib/prescriptions/prescription-verification', () => ({
  ...jest.requireActual('../../lib/prescriptions/prescription-verification'),
  getPublicPrescriptionVerification: jest.fn(),
}));

const mockedGet = getPublicPrescriptionVerification as jest.MockedFunction<
  typeof getPublicPrescriptionVerification
>;

const CARACAS = { timeZone: 'America/Caracas', locale: 'es-VE', hourCycle: 'h23' } as const;

function verification(overrides: Partial<PublicPrescriptionVerification> = {}): PublicPrescriptionVerification {
  return {
    state: 'VALID',
    issuedAt: '2026-10-16T15:00:00.000Z',
    voidedAt: null,
    professionalName: 'Dra. Laura Ruiz',
    professionalLicense: 'MP-55555',
    clinicName: 'Clínica Sonrisas',
    patientInitials: 'A. P. G.',
    regional: CARACAS,
    ...overrides,
  };
}

const EMPTY = {
  issuedAt: null,
  voidedAt: null,
  professionalName: null,
  professionalLicense: null,
  clinicName: null,
  patientInitials: null,
};

describe('PublicPrescriptionVerificationView (DX-467)', () => {
  beforeEach(() => mockedGet.mockReset());

  it('cargando y luego «Receta válida» con fecha, profesional, registro, clínica e iniciales', async () => {
    mockedGet.mockResolvedValue(verification());
    render(<PublicPrescriptionVerificationView code="k7m2-p9qr-t4xw" />);
    // Una sola región viva desde el principio: anuncia la carga y luego el veredicto.
    const live = screen.getByRole('status');
    expect(live).toHaveTextContent('Comprobando la receta…');
    expect(screen.queryByText('K7M2-P9QR-T4XW')).not.toBeInTheDocument();
    expect(await screen.findByRole('heading', { level: 1, name: 'Receta válida' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toBe(live);
    expect(live).toHaveTextContent('Receta válida');
    // Normalizado antes de pedirlo y de pintarlo.
    expect(mockedGet).toHaveBeenCalledWith('K7M2P9QRT4XW');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const field = (label: string) => screen.getByText(label).nextElementSibling;
    // La fecha en el formato de la sede de la receta (es-VE), no del navegador.
    expect(field('Fecha de emisión')).toHaveTextContent('16/10/2026');
    expect(field('Profesional')).toHaveTextContent('Dra. Laura Ruiz');
    expect(field('Nº de registro profesional')).toHaveTextContent('MP-55555');
    expect(field('Clínica')).toHaveTextContent('Clínica Sonrisas');
    expect(field('Paciente')).toHaveTextContent('A. P. G.');
    expect(screen.getByText('K7M2-P9QR-T4XW')).toBeInTheDocument();
  });

  it('anulada: «Receta anulada el DD/MM/AAAA», sin motivo ni datos de la receta', async () => {
    mockedGet.mockResolvedValue(
      verification({ ...EMPTY, state: 'VOIDED', voidedAt: '2026-10-20T13:00:00.000Z' }),
    );
    render(<PublicPrescriptionVerificationView code="K7M2P9QRT4XW" />);
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Receta anulada el 20/10/2026' }),
    ).toBeInTheDocument();
    expect(screen.getByText('No es válida para dispensar.')).toBeInTheDocument();
    expect(screen.queryByText('Profesional')).not.toBeInTheDocument();
    expect(screen.queryByText('Receta válida')).not.toBeInTheDocument();
  });

  it('anulada en una sede sin formato: la fecha sale «—», nunca otro formato', async () => {
    mockedGet.mockResolvedValue(
      verification({
        ...EMPTY,
        state: 'VOIDED',
        voidedAt: '2026-10-20T13:00:00.000Z',
        regional: { timeZone: null, locale: null, hourCycle: null },
      }),
    );
    render(<PublicPrescriptionVerificationView code="K7M2P9QRT4XW" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Receta anulada el —' })).toBeInTheDocument();
  });

  it('hash que no casa: «No se puede verificar; contacte con la clínica» y nada más', async () => {
    mockedGet.mockResolvedValue(verification({ ...EMPTY, state: 'UNVERIFIABLE', regional: null }));
    render(<PublicPrescriptionVerificationView code="K7M2P9QRT4XW" />);
    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: 'No se puede verificar; contacte con la clínica',
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Profesional')).not.toBeInTheDocument();
    expect(screen.queryByText('Receta válida')).not.toBeInTheDocument();
  });

  it('404 (inexistente o de otra clínica): «Receta no encontrada», sin reintento', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'No encontramos ninguna receta con este código.'));
    render(<PublicPrescriptionVerificationView code="ZZZZZZZZZZZZ" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Receta no encontrada' })).toBeInTheDocument();
    expect(screen.getByText(/Revise que el código esté completo/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Receta no encontrada');
    expect(screen.queryByText(/ZZZZ/)).not.toBeInTheDocument();
  });

  it('lo que no puede ser un código no se pide ni se refleja en la página', async () => {
    const probe = '<script>alert(1)</script>';
    render(<PublicPrescriptionVerificationView code={probe} />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Receta no encontrada' })).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain('alert');
    // Con caracteres ambiguos (O en vez de 0) tampoco.
    render(<PublicPrescriptionVerificationView code="K7M2P9QRT4XO" />);
    expect(mockedGet).not.toHaveBeenCalled();
  });

  it('429: aviso de esperar, sin pedir de nuevo sola', async () => {
    mockedGet.mockRejectedValue(new ApiError(429, 'Demasiadas solicitudes'));
    render(<PublicPrescriptionVerificationView code="K7M2P9QRT4XW" />);
    expect(await screen.findByText(/Demasiadas comprobaciones/)).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('error de red: sección con «Reintentar» que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(verification());
    render(<PublicPrescriptionVerificationView code="K7M2P9QRT4XW" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos comprobar la receta.');
    expect(screen.getByRole('heading', { level: 1, name: 'No pudimos comprobar la receta.' })).toBeInTheDocument();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Receta válida' })).toBeInTheDocument();
    await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(2));
  });
});
