import { render, screen, waitFor, within } from '@testing-library/react';
import { OnlineRequestsView } from './online-requests-view';
import {
  acceptOnlineRequest,
  declineOnlineRequest,
  listOnlineRequests,
  type OnlineRequest,
} from '../../lib/online-booking/online-booking-api';
import { ApiError } from '../../lib/api/client';
import { clearSessionStore } from '../../lib/session/session-store';
import { setupUser } from '../../lib/test/user';

jest.mock('../../lib/locations/locations-api', () => {
  const { caracasSede } = jest.requireActual('../../lib/test/sede-clock');
  return { listLocations: jest.fn().mockResolvedValue([caracasSede({ id: 'loc-1', name: 'Sede Chacao' })]) };
});
jest.mock('../../lib/online-booking/online-booking-api', () => ({
  ...jest.requireActual('../../lib/online-booking/online-booking-api'),
  listOnlineRequests: jest.fn(),
  acceptOnlineRequest: jest.fn(),
  declineOnlineRequest: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

const list = jest.mocked(listOnlineRequests);
const accept = jest.mocked(acceptOnlineRequest);
const decline = jest.mocked(declineOnlineRequest);

function request(overrides: Partial<OnlineRequest> = {}): OnlineRequest {
  return {
    id: 'req-1',
    status: 'PENDING',
    mode: 'REQUEST',
    patientKind: 'NEW',
    possibleDuplicate: true,
    // 10:00 en Caracas.
    start: '2026-12-03T14:00:00.000Z',
    end: '2026-12-03T14:45:00.000Z',
    createdAt: '2026-12-01T12:00:00.000Z',
    decidedAt: null,
    contactEmail: 'luisa.hernandez@example.com',
    contactPhone: '0412 555 1234',
    appointmentId: null,
    location: { id: 'loc-1', name: 'Sede Chacao', timeZone: 'America/Caracas' },
    provider: { id: 'p-1', fullName: 'Dra. María Rodríguez' },
    appointmentType: { id: 't-1', name: 'Limpieza dental', color: '#0E7490' },
    patient: { id: 'pat-1', fullName: 'Luisa Hernández' },
    ...overrides,
  };
}

describe('OnlineRequestsView (DX-016)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSessionStore();
  });

  it('pide «Por revisar» y pinta paciente, contacto, tipo, profesional, aviso de duplicado y estado', async () => {
    list.mockResolvedValue({ items: [request()], total: 1 });
    render(<OnlineRequestsView token="tok" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Solicitudes online' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Solicitudes de la reserva online' });
    expect(list).toHaveBeenCalledWith('tok', { status: 'PENDING', page: 1, pageSize: 20 });
    const [, row] = within(table).getAllByRole('row');
    expect(within(row).getByRole('link', { name: 'Luisa Hernández' })).toHaveAttribute('href', '/patients/pat-1');
    expect(row).toHaveTextContent('luisa.hernandez@example.com · 0412 555 1234');
    expect(row).toHaveTextContent('Limpieza dental');
    expect(row).toHaveTextContent('Dra. María Rodríguez');
    expect(row).toHaveTextContent('Nuevo');
    expect(within(row).getByTestId('online-request-duplicate')).toHaveTextContent('Posible duplicado: comprueba la ficha');
    expect(row).toHaveTextContent('Por revisar');
    // Hora en el reloj de la sede (Caracas), no del navegador.
    await waitFor(() => expect(row).toHaveTextContent(/10:00/));
  });

  it('el filtro «Todas» pide sin estado', async () => {
    const user = setupUser();
    list.mockResolvedValue({ items: [], total: 0 });
    render(<OnlineRequestsView token="tok" />);
    expect(await screen.findByText('No hay solicitudes por revisar')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Todas' }));
    await waitFor(() => expect(list).toHaveBeenLastCalledWith('tok', { status: null, page: 1, pageSize: 20 }));
  });

  it('Aceptar pide confirmación, avisa del duplicado y recarga la lista', async () => {
    const user = setupUser();
    list.mockResolvedValueOnce({ items: [request()], total: 1 }).mockResolvedValueOnce({ items: [], total: 0 });
    accept.mockResolvedValueOnce(request({ status: 'ACCEPTED' }));
    render(<OnlineRequestsView token="tok" />);
    await user.click(await screen.findByRole('button', { name: /Acciones de Luisa Hernández/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Aceptar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Aceptar la solicitud' });
    expect(dialog).toHaveTextContent('Antes de aceptar, abre la ficha y comprueba que es la misma persona.');
    await user.click(within(dialog).getByRole('button', { name: 'Aceptar y agendar' }));
    await waitFor(() => expect(accept).toHaveBeenCalledWith('tok', 'req-1'));
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('409 al aceptar (la hora ya se ocupó): el mensaje en el diálogo y la lista se recarga', async () => {
    const user = setupUser();
    list.mockResolvedValue({ items: [request()], total: 1 });
    accept.mockRejectedValueOnce(new ApiError(409, 'Ya hay una cita para ese profesional en ese horario.'));
    render(<OnlineRequestsView token="tok" />);
    await user.click(await screen.findByRole('button', { name: /Acciones de Luisa Hernández/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Aceptar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Aceptar y agendar' }));
    expect(await within(dialog).findByText('Ya hay una cita para ese profesional en ese horario.')).toBeInTheDocument();
    await waitFor(() => expect(list).toHaveBeenCalledTimes(2));
  });

  it('Rechazar va en rojo y llama a la API', async () => {
    const user = setupUser();
    list.mockResolvedValue({ items: [request({ possibleDuplicate: false })], total: 1 });
    decline.mockResolvedValueOnce(request({ status: 'DECLINED' }));
    render(<OnlineRequestsView token="tok" />);
    await user.click(await screen.findByRole('button', { name: /Acciones de Luisa Hernández/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rechazar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rechazar la solicitud' });
    await user.click(within(dialog).getByRole('button', { name: 'Rechazar' }));
    await waitFor(() => expect(decline).toHaveBeenCalledWith('tok', 'req-1'));
  });

  it('una solicitud ya resuelta no ofrece acciones', async () => {
    list.mockResolvedValue({ items: [request({ status: 'BOOKED' })], total: 1 });
    render(<OnlineRequestsView token="tok" />);
    const table = await screen.findByRole('table');
    expect(table).toHaveTextContent('Reservada');
    expect(screen.queryByRole('button', { name: /Acciones de/ })).not.toBeInTheDocument();
  });
});
