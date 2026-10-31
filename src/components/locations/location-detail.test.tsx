import { render, screen, within } from '@testing-library/react';
import { LocationDetail } from './location-detail';
import { listLocations } from '@/lib/locations/locations-api';
import { getCancellationPolicy } from '@/lib/cancellations/cancellation-policy-api';
import { clinicLocation } from '@/lib/test/locations';
import { tokenFor } from '@/lib/test/prescriptions';

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
}));
jest.mock('../../lib/cancellations/cancellation-policy-api', () => ({
  ...jest.requireActual('../../lib/cancellations/cancellation-policy-api'),
  getCancellationPolicy: jest.fn(),
}));

const norte = clinicLocation({
  id: 'norte',
  name: 'Sede Norte',
  country: 'ES',
  currency: 'EUR',
  timeZone: 'Europe/Madrid',
  locale: 'es-ES',
  hourCycle: 'h23',
  healthRegistrationNumber: 'NRS-1',
});
const sur = clinicLocation({ id: 'sur', name: 'Sede Sur', isActive: false });

beforeEach(() => {
  jest.mocked(listLocations).mockResolvedValue([norte, sur]);
  jest.mocked(getCancellationPolicy).mockResolvedValue({ locationId: 'norte', current: null, versions: [] });
});

describe('LocationDetail (B6)', () => {
  it('ADMIN: la sede como título, sus datos legibles y una sección por tema', async () => {
    render(<LocationDetail token={tokenFor('ADMIN', 'u1')} locationId="norte" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Sede Norte' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sedes' })).toHaveAttribute('href', '/settings/sedes');
    const data = screen.getByRole('region', { name: 'Datos de la sede' });
    expect(data).toHaveTextContent('Madrid');
    expect(data).not.toHaveTextContent('Europe/Madrid');
    expect(within(data).getByRole('button', { name: 'Editar Sede Norte' })).toBeInTheDocument();
    expect(screen.getByLabelText(/Nº de registro sanitario · Sede Norte/)).toHaveValue('NRS-1');
    expect(await screen.findByRole('region', { name: 'Política de cancelación' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Calendario Sede Norte' })).toHaveAttribute(
      'href',
      '/settings/calendario?sede=norte',
    );
    // Sin cambios no hay ningún «Guardar» a la vista.
    expect(screen.queryByRole('button', { name: /^Guardar/ })).not.toBeInTheDocument();
  });

  it('sin ser ADMIN: lectura, sin política ni calendario', async () => {
    render(<LocationDetail token={tokenFor('RECEPTION', 'u2')} locationId="sur" />);
    expect(await screen.findByRole('heading', { level: 1, name: 'Sede Sur' })).toBeInTheDocument();
    expect(screen.getByText('Inactiva')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Sede Sur' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Política de cancelación' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Calendario/ })).not.toBeInTheDocument();
  });

  it('una sede que no existe lo dice y lleva a la lista', async () => {
    render(<LocationDetail token={tokenFor('ADMIN', 'u1')} locationId="borrada" />);
    expect(await screen.findByText('No encontramos esta sede')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver las sedes' })).toHaveAttribute('href', '/settings/sedes');
  });
});
