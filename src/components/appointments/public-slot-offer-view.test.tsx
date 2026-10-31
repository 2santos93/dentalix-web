import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PublicSlotOfferView } from './public-slot-offer-view';
import {
  acceptPublicSlotOffer,
  declinePublicSlotOffer,
  getPublicSlotOffer,
  type PublicSlotOffer,
} from '../../lib/appointments/slot-offers-api';
import { ApiError } from '../../lib/api/client';

// jest.mock no reescribe alias: rutas relativas (ver otros *.test.tsx).
jest.mock('../../lib/appointments/slot-offers-api', () => ({
  getPublicSlotOffer: jest.fn(),
  acceptPublicSlotOffer: jest.fn(),
  declinePublicSlotOffer: jest.fn(),
}));
jest.mock('../../lib/api/client', () => ({
  ApiError: jest.requireActual('../../lib/api/api-error').ApiError,
}));

const get = getPublicSlotOffer as jest.Mock;
const accept = acceptPublicSlotOffer as jest.Mock;
const decline = declinePublicSlotOffer as jest.Mock;

const CLINIC = { name: 'Clínica Sonrisa', primaryColor: '#7C3AED', logoUrl: null };
const DETAILS = {
  patientFirstName: 'Ana',
  // 10:00 en Bogotá.
  start: '2026-10-20T15:00:00.000Z',
  end: '2026-10-20T15:30:00.000Z',
  timeZone: 'America/Bogota',
  locale: 'es-CO',
  hourCycle: 'h23',
  providerName: 'Dra. Pérez',
  locationName: 'Sede Norte',
  locationAddress: 'Calle 100 # 15-20',
  currentAppointmentStart: null,
  expiresAt: '2026-10-20T15:00:00.000Z',
};

function offer(overrides: Partial<PublicSlotOffer> = {}): PublicSlotOffer {
  return {
    state: 'OPEN',
    message: 'Este hueco está libre para ti',
    clinic: CLINIC,
    offer: DETAILS,
    ...overrides,
  };
}

describe('PublicSlotOfferView (DX-435)', () => {
  beforeEach(() => {
    get.mockReset();
    accept.mockReset();
    decline.mockReset();
  });

  it('muestra cargando y luego el hueco: día y hora de la sede, profesional y sede, sin aceptar nada', async () => {
    get.mockResolvedValueOnce(offer());
    render(<PublicSlotOfferView token="tok-1" />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);
    expect(await screen.findByRole('heading', { name: 'Clínica Sonrisa' })).toBeInTheDocument();
    expect(screen.getByText(/hola ana/i)).toBeInTheDocument();
    expect(screen.getByText(/martes, 20 de octubre/i)).toBeInTheDocument();
    expect(screen.getByText(/10:00/)).toBeInTheDocument();
    expect(screen.getByText('Dra. Pérez')).toBeInTheDocument();
    expect(screen.getByText('Sede Norte')).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith('tok-1');
    expect(accept).not.toHaveBeenCalled();
  });

  it('aceptar: confirma que el hueco es suyo', async () => {
    get.mockResolvedValueOnce(offer());
    accept.mockResolvedValueOnce(offer({ state: 'ACCEPTED', message: 'Listo: el hueco es tuyo' }));
    render(<PublicSlotOfferView token="tok-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /aceptar el hueco/i }));
    expect(await screen.findByText('Listo: el hueco es tuyo')).toBeInTheDocument();
    expect(accept).toHaveBeenCalledWith('tok-1');
    expect(screen.queryByRole('button', { name: /aceptar el hueco/i })).not.toBeInTheDocument();
  });

  it('si otro llegó antes: «Este hueco ya se ocupó» sin el detalle del hueco', async () => {
    get.mockResolvedValueOnce(offer());
    accept.mockResolvedValueOnce(offer({ state: 'TAKEN', message: 'Este hueco ya se ocupó', offer: null }));
    render(<PublicSlotOfferView token="tok-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /aceptar el hueco/i }));
    expect(await screen.findByRole('heading', { name: 'Este hueco ya se ocupó' })).toBeInTheDocument();
    expect(screen.queryByText('Sede Norte')).not.toBeInTheDocument();
  });

  it('caducada o no disponible al abrir: lo dice y no ofrece botones', async () => {
    get.mockResolvedValueOnce(offer({ state: 'EXPIRED', message: 'Este enlace ya no está disponible', offer: null }));
    render(<PublicSlotOfferView token="tok-1" />);
    expect(await screen.findByRole('heading', { name: 'Este enlace ya no está disponible' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('rechazar deja constancia', async () => {
    get.mockResolvedValueOnce(offer());
    decline.mockResolvedValueOnce(offer({ state: 'DECLINED', message: 'Rechazaste esta oferta', offer: null }));
    render(<PublicSlotOfferView token="tok-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /no me viene bien/i }));
    expect(await screen.findByRole('heading', { name: 'Rechazaste esta oferta' })).toBeInTheDocument();
  });

  it('token inválido o de otra clínica: enlace no válido', async () => {
    get.mockRejectedValueOnce(new ApiError(404, 'El enlace no existe'));
    render(<PublicSlotOfferView token="tok-x" />);
    expect(await screen.findByRole('heading', { name: /enlace no válido/i })).toBeInTheDocument();
  });

  it('error de red al cargar: escalera de errores con reintento', async () => {
    get.mockRejectedValueOnce(new Error('offline'));
    get.mockResolvedValueOnce(offer());
    render(<PublicSlotOfferView token="tok-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /reintentar|intentar/i }));
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Sede Norte')).toBeInTheDocument();
  });

  it('error de red al aceptar: mensaje en línea y se puede volver a intentar', async () => {
    get.mockResolvedValueOnce(offer());
    accept.mockRejectedValueOnce(new Error('offline'));
    render(<PublicSlotOfferView token="tok-1" />);
    fireEvent.click(await screen.findByRole('button', { name: /aceptar el hueco/i }));
    expect(await screen.findByText(/no pudimos enviar tu respuesta/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /aceptar el hueco/i })).toBeEnabled();
  });
});
