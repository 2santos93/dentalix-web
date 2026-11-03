import { dateIn, dateTimeIn, STAMP_SEDES } from '@/lib/test/stamp';
import { listLocations } from '@/lib/locations/locations-api';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { PatientPostOpDeliveries } from './patient-postop-deliveries';
import { ApiError } from '@/lib/api/api-error';
import {
  listPatientPostOpDeliveries,
  type PostOpDeliverySummary,
} from '@/lib/postop/postop-api';

jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede()]),
}));

jest.mock('../../lib/postop/postop-api', () => ({
  ...jest.requireActual('../../lib/postop/postop-api'),
  listPatientPostOpDeliveries: jest.fn(),
}));

const mockedList = listPatientPostOpDeliveries as jest.MockedFunction<
  typeof listPatientPostOpDeliveries
>;

function delivery(overrides: Partial<PostOpDeliverySummary> = {}): PostOpDeliverySummary {
  return {
    id: 'del-1',
    patientId: 'pat-1',
    appointmentId: 'apt-1',
    templateId: 'tpl-1',
    templateCode: 'POI-EXO',
    templateTitle: 'Tras una extracción',
    templateVersion: 2,
    channel: 'WHATSAPP_LINK',
    deliveredAt: '2026-10-16T15:00:00.000Z',
    deliveredByName: 'Dra. Laura Gómez',
    recipientMasked: null,
    sentToResponsible: false,
    firstOpenedAt: '2026-10-16T18:00:00.000Z',
    linkExpiresAt: '2026-11-15T15:00:00.000Z',
    ...overrides,
  };
}

describe('PatientPostOpDeliveries', () => {
  beforeEach(() => mockedList.mockReset());

  it('vacío: lo dice', async () => {
    mockedList.mockResolvedValue([]);
    render(<PatientPostOpDeliveries token="tok" patientId="pat-1" />);
    expect(await screen.findByText('Todavía no se han entregado indicaciones')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', 'pat-1');
  });

  it('error: SectionError con reintento que vuelve a pedir', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedList.mockResolvedValueOnce([]);
    render(<PatientPostOpDeliveries token="tok" patientId="pat-1" />);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Todavía no se han entregado indicaciones')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('lista en el orden de la API con código y versión, canal, fecha, autor, «Abierto» y enlace a la vista imprimible', async () => {
    mockedList.mockResolvedValue([
      delivery(),
      delivery({
        id: 'del-0',
        templateCode: 'POI-BLA',
        templateTitle: 'Tras un blanqueamiento',
        templateVersion: 1,
        channel: 'PRINT',
        deliveredAt: '2026-10-10T15:00:00.000Z',
        deliveredByName: 'Recepción Marta',
        firstOpenedAt: null,
        linkExpiresAt: null,
      }),
      delivery({ id: 'del-e', channel: 'EMAIL', firstOpenedAt: null, templateCode: 'POI-END' }),
    ]);
    render(<PatientPostOpDeliveries token="tok" patientId="pat-1" />);

    const table = await screen.findByRole('table', { name: 'Indicaciones entregadas' });
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('POI-EXO · v2');
    expect(rows[0]).toHaveTextContent('Tras una extracción');
    expect(rows[0]).toHaveTextContent('WhatsApp');
    expect(rows[0]).toHaveTextContent('16/10/2026');
    expect(rows[0]).toHaveTextContent('Dra. Laura Gómez');
    expect(within(rows[0]).getByText('Abierto')).toBeInTheDocument();
    expect(rows[1]).toHaveTextContent('POI-BLA · v1');
    expect(rows[1]).toHaveTextContent('Impresa');
    expect(within(rows[1]).queryByText('Abierto')).not.toBeInTheDocument();
    expect(rows[2]).toHaveTextContent('Email');

    const link = within(rows[0]).getByRole('link', { name: /ver e imprimir/i });
    expect(link).toHaveAttribute('href', '/print/patients/pat-1/indicaciones/del-1');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener');
    expect(link).toHaveTextContent('se abre en otra pestaña');

  });

  it('en el teléfono, tarjetas con los mismos enlaces', async () => {
    const original = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
    try {
      mockedList.mockResolvedValue([
        delivery(),
        delivery({ id: 'del-0', templateCode: 'POI-BLA', templateVersion: 1, channel: 'PRINT', firstOpenedAt: null }),
        delivery({ id: 'del-e', channel: 'EMAIL', firstOpenedAt: null, templateCode: 'POI-END' }),
      ]);
      render(<PatientPostOpDeliveries token="tok" patientId="pat-1" />);
      const cards = await screen.findByRole('list', { name: 'Indicaciones entregadas' });
      expect(screen.queryByRole('table')).not.toBeInTheDocument();
      const items = within(cards).getAllByRole('listitem');
      expect(items).toHaveLength(3);
      expect(items[0]).toHaveTextContent('POI-EXO · v2');
      expect(within(items[0]).getByText('Abierto')).toBeInTheDocument();
      expect(within(cards).getAllByRole('link', { name: /ver e imprimir/i })[1]).toHaveAttribute(
        'href',
        '/print/patients/pat-1/indicaciones/del-0',
      );
    } finally {
      window.matchMedia = original;
    }
  });
});

describe('PatientPostOpDeliveries con cada sede (DX-354b)', () => {
  const mockedSedes = listLocations as jest.Mock;
  afterEach(() => mockedSedes.mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede()]));
  const DELIVERED = '2026-10-17T03:30:00.000Z';

  beforeEach(() => mockedList.mockReset());

  it.each([['caracas'], ['berlin']] as const)('con la pantalla en %s: la fecha de entrega y el «Abierto» con su formato', async (key) => {
    mockedSedes.mockResolvedValue([STAMP_SEDES[key]]);
    mockedList.mockResolvedValue([delivery({ deliveredAt: DELIVERED, firstOpenedAt: DELIVERED })]);
    render(<PatientPostOpDeliveries token="tok" patientId="pat-1" />);
    const table = await screen.findByRole('table');
    await waitFor(() => expect(within(table).getAllByRole('row')[1]).toHaveTextContent(dateIn(key, DELIVERED)));
    expect(screen.getByText('Abierto')).toHaveAttribute('title', expect.stringContaining(dateTimeIn(key, DELIVERED)));
  });

  it('sin formato: «—» en la fecha, sin título en «Abierto» y un solo aviso', async () => {
    mockedSedes.mockRejectedValue(new Error('red'));
    mockedList.mockResolvedValue([delivery()]);
    render(<PatientPostOpDeliveries token="tok" patientId="pat-1" />);
    const table = await screen.findByRole('table');
    await waitFor(() => expect(screen.getAllByText(/No se pudo saber el formato regional/)).toHaveLength(1));
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent('Sin dato');
    expect(screen.getByText('Abierto')).not.toHaveAttribute('title');
  });
});
