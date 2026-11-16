import { render, screen, waitFor, within } from '@testing-library/react';
import { OrthoFollowUpView } from './ortho-follow-up-view';
import { listOrthoFollowUp } from '@/lib/ortho/ortho-api';
import { useOrthoSettings } from '@/lib/ortho/ortho-settings';
import { ApiError } from '@/lib/api/client';
import { listStaff } from '@/lib/appointments/staff-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { tokenFor } from '@/lib/test/implants';
import { makeFollowUpRow } from '@/lib/test/ortho';
import { setupUser } from '@/lib/test/user';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/ortho/ortho-api', () => ({
  ...jest.requireActual('../../lib/ortho/ortho-api'),
  listOrthoFollowUp: jest.fn(),
}));
jest.mock('../../lib/ortho/ortho-settings', () => ({
  ...jest.requireActual('../../lib/ortho/ortho-settings'),
  useOrthoSettings: jest.fn(),
}));
jest.mock('../../lib/appointments/staff-api', () => ({ listStaff: jest.fn() }));
jest.mock('../../lib/clinic-branding', () => ({ fetchClinicName: jest.fn().mockResolvedValue('Clínica Ávila') }));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedList = listOrthoFollowUp as jest.MockedFunction<typeof listOrthoFollowUp>;
const mockedSettings = useOrthoSettings as jest.MockedFunction<typeof useOrthoSettings>;
const mockedStaff = listStaff as jest.MockedFunction<typeof listStaff>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const RECEPTION = tokenFor('RECEPTION', 'u-rec');

const page = (items = [makeFollowUpRow()]) => ({ items, total: items.length, page: 1, pageSize: 50 });

describe('OrthoFollowUpView (DX-190)', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedSettings.mockReset().mockReturnValue({ status: 'ready', settings: { enabled: true, wireGauges: ['0.016'] } });
    mockedStaff.mockReset().mockResolvedValue([
      { userId: 'u-dentist', fullName: 'Dra. Rivas', role: 'DENTIST', locationIds: null },
      { userId: 'u-rec', fullName: 'Recepción', role: 'RECEPTION', locationIds: null },
    ]);
    mockedLocations.mockReset().mockResolvedValue([clinicLocation()]);
  });

  it('RECEPTION ve al atrasado y sin próxima cita, con Llamar (tel: y WhatsApp) y Agendar control', async () => {
    mockedList.mockResolvedValue(page());
    render(<OrthoFollowUpView token={RECEPTION} />);
    expect(await screen.findByText('Valentina Pérez')).toBeInTheDocument();
    const list = screen.getByRole('table', { name: 'Casos de ortodoncia activos' });
    expect(within(list).getByText('Atrasado')).toBeInTheDocument();
    expect(within(list).getByText('Sin próxima cita')).toBeInTheDocument();
    expect(screen.getByText('Hace 50 días')).toBeInTheDocument();
    expect(screen.getByText('1 inasistencia')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Llamar a Valentina Pérez' })).toHaveAttribute('href', 'tel:+584121234567');
    expect(screen.getByRole('link', { name: /^Escribir a Valentina Pérez por WhatsApp/ }).getAttribute('href')).toMatch(
      /^https:\/\/wa\.me\/584121234567\?text=.*Cl%C3%ADnica%20%C3%81vila/,
    );
    expect(screen.getByRole('button', { name: 'Agendar control · Valentina Pérez' })).toBeInTheDocument();
    // El filtro de profesional solo ofrece a quien atiende.
    expect(screen.getByRole('option', { name: 'Dra. Rivas' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Recepción' })).not.toBeInTheDocument();
  });

  it('«Atrasados» vacío: «No hay pacientes atrasados»', async () => {
    mockedList.mockResolvedValueOnce(page()).mockResolvedValueOnce(page([]));
    const user = setupUser();
    render(<OrthoFollowUpView token={RECEPTION} />);
    await screen.findByText('Valentina Pérez');
    await user.click(screen.getByRole('radio', { name: 'Atrasados' }));
    expect(await screen.findByText('No hay pacientes atrasados')).toBeInTheDocument();
    expect(mockedList).toHaveBeenLastCalledWith(RECEPTION, { filter: 'OVERDUE', providerId: undefined, page: 1 });
  });

  it('error con «Reintentar»', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Fallo')).mockResolvedValue(page());
    const user = setupUser();
    render(<OrthoFollowUpView token={RECEPTION} />);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Valentina Pérez')).toBeInTheDocument();
  });

  it('con el módulo apagado no pide la lista', async () => {
    mockedSettings.mockReturnValue({ status: 'ready', settings: { enabled: false, wireGauges: ['0.016'] } });
    render(<OrthoFollowUpView token={RECEPTION} />);
    expect(await screen.findByText('La ortodoncia no está activada en esta clínica.')).toBeInTheDocument();
    await waitFor(() => expect(mockedList).not.toHaveBeenCalled());
  });
});
