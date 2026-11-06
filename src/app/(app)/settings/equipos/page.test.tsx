import { render, screen } from '@testing-library/react';
import EquipmentPage from './page';
import EquipmentLifeSheetPage from './[id]/page';
import { useAuthStore } from '@/lib/auth/auth-store';
import { listLocations } from '@/lib/locations/locations-api';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { tokenFor } from '@/lib/test/prescriptions';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn(), push: jest.fn() }),
  usePathname: () => '/settings/equipos',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: 'e1' }),
}));
jest.mock('../../../../components/equipment/equipment-manager', () => ({
  ...jest.requireActual('../../../../components/equipment/equipment-manager'),
  EquipmentManager: ({ locations }: { locations: ClinicLocation[] }) => (
    <p data-testid="manager-locations">{locations.map((l) => l.id).join(',')}</p>
  ),
}));
jest.mock('../../../../components/equipment/equipment-detail-view', () => ({
  EquipmentDetailView: ({ locations }: { locations: ClinicLocation[] }) => (
    <p data-testid="detail-locations">{locations.map((l) => l.id).join(',')}</p>
  ),
}));
jest.mock('../../../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const norte = clinicLocation({ id: 'norte', name: 'Sede Norte' });
const vieja = clinicLocation({ id: 'vieja', name: 'Sede Vieja', isActive: false });

/**
 * DX-546 · FE-112: la API lista también los equipos de una sede desactivada
 * («Todas las sedes»); la pantalla tiene que conocer esa sede para su «hoy» y
 * su moneda. Las páginas pasan TODAS las sedes; los componentes deciden qué
 * se puede elegir (solo activas, más la actual del equipo).
 */
describe('Ajustes → Equipos: las sedes que reciben los componentes (DX-546 · FE-112)', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: tokenFor('ADMIN', 'u-admin'), _hasHydrated: true });
    (listLocations as jest.MockedFunction<typeof listLocations>).mockResolvedValue([norte, vieja]);
  });

  it('la lista recibe también la sede desactivada', async () => {
    render(<EquipmentPage />);
    expect(await screen.findByTestId('manager-locations')).toHaveTextContent('norte,vieja');
  });

  it('la hoja de vida recibe también la sede desactivada', async () => {
    render(<EquipmentLifeSheetPage />);
    expect(await screen.findByTestId('detail-locations')).toHaveTextContent('norte,vieja');
  });
});
