import { render, screen, waitFor, within } from '@testing-library/react';
import { RadiologyDueSection, radiologyDueCopy as copy } from './radiology-due-section';
import { getRadiologyDue, type RadiologyDue } from '@/lib/radiology/radiology-api';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { radiologyDueFixture } from '@/lib/test/radiology';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/radiology/radiology-api', () => ({
  ...jest.requireActual('../../lib/radiology/radiology-api'),
  getRadiologyDue: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));

const mockedDue = jest.mocked(getRadiologyDue);
const norte = clinicLocation({ id: 'norte', name: 'Sede Norte', locale: 'es-VE', hourCycle: 'h23' });
const principal = clinicLocation({ id: 'principal', name: 'Sede principal', locale: 'es-VE', hourCycle: 'h23' });

function due(items: RadiologyDue['items'], total = items.length): RadiologyDue {
  return { generatedAt: '2026-11-06T16:00:00.000Z', items, total };
}

const OVERDUE = radiologyDueFixture({ id: 'qc', reference: 'QC-0917' });
const SOON = radiologyDueFixture({
  id: 'lic',
  kind: 'LICENSE',
  category: 'I',
  reference: 'LIC-0042',
  locationId: 'principal',
  locationName: 'Sede principal',
  equipmentId: 'rx',
  equipmentName: 'Rayos X periapical',
  expiresOn: '2026-12-21',
  status: 'DUE_SOON',
  daysUntilExpiry: 45,
});

describe('RadiologyDueSection (DX-544)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(listLocations).mockResolvedValue([principal, norte]);
  });

  it('lista vencidos y por vencer con tipo, sede, equipo, fecha de su sede, «Venció hace» / «Vence en» y enlace al expediente', async () => {
    mockedDue.mockResolvedValue(due([OVERDUE, SOON]));
    render(<RadiologyDueSection token="tok" scopeKey="all" />);
    const section = screen.getByRole('region', { name: copy.heading });
    const list = await within(section).findByRole('list', { name: copy.listLabel });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('Control de calidad QC-0917');
    expect(rows[0]).toHaveTextContent('Sede Norte');
    expect(rows[0]).toHaveTextContent('Venció hace 12 días');
    expect(within(rows[0]).getByText('Vencido')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('Licencia · Cat. I LIC-0042');
    expect(rows[1]).toHaveTextContent('Sede principal · Rayos X periapical');
    expect(rows[1]).toHaveTextContent('Vence en 45 días');
    expect(within(rows[1]).getByText('Vence pronto')).toBeInTheDocument();
    await waitFor(() => expect(within(rows[1]).getByText('21/12/2026')).toBeInTheDocument());
    expect(within(rows[1]).getByText('21/12/2026').closest('time')).toHaveAttribute('dateTime', '2026-12-21');
    expect(
      within(rows[0]).getByRole('link', { name: 'Control de calidad QC-0917 (abrir el expediente de rayos X)' }),
    ).toHaveAttribute('href', '/settings/rayos-x');
    expect(within(section).getByRole('link', { name: copy.allLink })).toHaveAttribute('href', '/settings/rayos-x');
    expect(within(section).getByText(copy.count(2))).toBeInTheDocument();
    expect(mockedDue).toHaveBeenCalledWith('tok', { limit: 5 });
  });

  it('dice cuántos hay de más cuando no caben', async () => {
    mockedDue.mockResolvedValue(due([OVERDUE], 7));
    render(<RadiologyDueSection token="tok" scopeKey="all" />);
    expect(await screen.findByText(copy.showing(1, 7))).toBeInTheDocument();
  });

  it('sin avisos, una línea discreta', async () => {
    mockedDue.mockResolvedValue(due([]));
    render(<RadiologyDueSection token="tok" scopeKey="all" />);
    expect(await screen.findByText(copy.emptyTitle)).toBeInTheDocument();
  });

  it('mientras carga, esqueleto anunciado', () => {
    mockedDue.mockReturnValue(new Promise(() => undefined));
    render(<RadiologyDueSection token="tok" scopeKey="all" />);
    expect(screen.getByRole('status', { name: copy.loading })).toBeInTheDocument();
  });

  it('si falla, su propio escalón 1 con Reintentar', async () => {
    mockedDue.mockRejectedValueOnce(new Error('network')).mockResolvedValue(due([OVERDUE]));
    render(<RadiologyDueSection token="tok" scopeKey="all" />);
    expect(await screen.findByRole('alert')).toHaveTextContent(copy.error);
    await setupUser().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Control de calidad QC-0917')).toBeInTheDocument();
  });

  it('sigue al selector de sede: otra sede vuelve a pedir', async () => {
    mockedDue.mockResolvedValue(due([OVERDUE]));
    const view = render(<RadiologyDueSection token="tok" scopeKey="all" />);
    await screen.findByText('Control de calidad QC-0917');
    view.rerender(<RadiologyDueSection token="tok" scopeKey="norte" />);
    await waitFor(() => expect(mockedDue).toHaveBeenCalledTimes(2));
  });
});
