import { render, screen } from '@testing-library/react';
import { PatientImportScreen } from './patient-import-screen';
import { listImports } from '@/lib/patient-imports/patient-imports-api';
import { listLocations } from '@/lib/locations/locations-api';
import { batchFixture } from '@/lib/test/patient-imports';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/patient-imports/patient-imports-api', () => ({
  ...jest.requireActual('../../lib/patient-imports/patient-imports-api'),
  listImports: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const mockedImports = listImports as jest.MockedFunction<typeof listImports>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

const done = batchFixture({
  status: 'COMPLETED',
  progress: {
    preparedRows: 2000,
    processedRows: 2000,
    createdCount: 1234,
    updatedCount: 766,
    skippedCount: 0,
    failedCount: 0,
    percent: 100,
  },
  totals: { totalRows: 2000, validRows: 1234, duplicateRows: 0, errorRows: 0 },
});

describe('PatientImportScreen: formato de la sede (G1-B)', () => {
  beforeEach(() => {
    mockedImports.mockReset().mockResolvedValue({ items: [done], total: 1, page: 1, pageSize: 20 } as never);
  });

  it('los recuentos del historial van con el formato de la sede de la pantalla', async () => {
    mockedLocations.mockReset().mockResolvedValue([clinicLocation({ locale: 'en-US', hourCycle: 'h12' })]);
    render(<PatientImportScreen token="tok" allowed />);
    expect(await screen.findByText(/1,234 creados · 766 actualizados/)).toBeInTheDocument();
    expect(screen.getByText(/hasta 5 MB y 10,000 pacientes/)).toBeInTheDocument();
  });

  it('mientras cargan las sedes, el aviso de subida es un esqueleto, no «— pacientes»', async () => {
    mockedLocations.mockReset().mockReturnValue(new Promise(() => {}));
    render(<PatientImportScreen token="tok" allowed />);
    expect(screen.getByRole('status', { name: 'Cargando el aviso de subida…' })).toBeInTheDocument();
    expect(screen.queryByText(/pacientes\. Si vienes/)).not.toBeInTheDocument();
    await screen.findByText(/creados · .* actualizados/);
  });

  it('import screens without format show — and the notice', async () => {
    mockedLocations.mockReset().mockResolvedValue([clinicLocation({ locale: null, hourCycle: null })]);
    render(<PatientImportScreen token="tok" allowed />);
    expect(
      await screen.findByText(
        'No se pudo saber el formato regional o el reloj de la sede. Vuelve a intentarlo o revisa la sede en Ajustes → Sedes.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(await screen.findByText('— creados · — actualizados · — duplicados o con error')).toBeInTheDocument();
    expect(screen.getByText(/hasta 5 MB y — pacientes/)).toBeInTheDocument();
  });
});
