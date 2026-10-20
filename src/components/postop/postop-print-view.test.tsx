import { fireEvent, render, screen, within } from '@testing-library/react';
import { PostOpPrintView } from './postop-print-view';
import { PostOpDocument } from './postop-document';
import { ApiError } from '@/lib/api/api-error';
import {
  getPatientPostOpDelivery,
  type PostOpDeliveryDocument,
} from '@/lib/postop/postop-api';

jest.mock('../../lib/postop/postop-api', () => ({
  ...jest.requireActual('../../lib/postop/postop-api'),
  getPatientPostOpDelivery: jest.fn(),
}));

const mockedGet = getPatientPostOpDelivery as jest.MockedFunction<typeof getPatientPostOpDelivery>;

function documentFixture(overrides: Partial<PostOpDeliveryDocument> = {}): PostOpDeliveryDocument {
  return {
    id: 'del-1',
    patientId: 'pat-1',
    appointmentId: 'apt-1',
    templateId: 'tpl-1',
    templateCode: 'POI-EXO',
    templateTitle: 'Tras una extracción',
    templateVersion: 2,
    channel: 'PRINT',
    // Mediodía UTC: el mismo día civil en cualquier zona del continente.
    deliveredAt: '2026-10-16T15:00:00.000Z',
    deliveredByName: 'Dra. Laura Gómez',
    recipientMasked: null,
    sentToResponsible: false,
    firstOpenedAt: null,
    linkExpiresAt: null,
    renderedText: 'Hola Ana:\n\nMuerde la gasa 30 minutos.\nLlama al 601 555 0000.',
    clinic: { name: 'Clínica Sonrisas', logoUrl: 'https://cdn.example.com/logo.png', primaryColor: '#0f766e' },
    locationName: 'Sede Norte',
    locationPhone: '601 555 0000',
    patientName: 'Ana Pérez',
    ...overrides,
  };
}

describe('PostOpDocument', () => {
  it('pinta cabecera de la clínica y la sede, título, texto y pie con código, versión, fecha y autor', () => {
    render(<PostOpDocument delivery={documentFixture()} />);
    const header = screen.getByTestId('postop-header');
    expect(within(header).getByRole('img', { name: 'Clínica Sonrisas' })).toHaveAttribute(
      'src',
      'https://cdn.example.com/logo.png',
    );
    expect(within(header).getByRole('img', { name: 'Clínica Sonrisas' })).toHaveAttribute(
      'referrerpolicy',
      'no-referrer',
    );
    expect(within(header).getByText('Clínica Sonrisas')).toBeInTheDocument();
    expect(within(header).getByText(/Sede Norte/)).toBeInTheDocument();
    expect(within(header).getByText(/601 555 0000/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Tras una extracción' })).toBeInTheDocument();
    const text = screen.getByText(/Muerde la gasa 30 minutos\./);
    expect(text).toHaveClass('whitespace-pre-line');
    expect(screen.getByText('POI-EXO · v2 · entregada el 16/10/2026 por Dra. Laura Gómez')).toBeInTheDocument();
    expect(document.querySelector('.postop-print-root')).toBeInTheDocument();
  });

  it('sin logo ni teléfono de la sede no deja huecos', () => {
    render(
      <PostOpDocument
        delivery={documentFixture({
          clinic: { name: 'Clínica Sonrisas', logoUrl: null, primaryColor: null },
          locationPhone: null,
        })}
      />,
    );
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Sede Norte')).toBeInTheDocument();
    expect(screen.queryByText(/Tel\./)).not.toBeInTheDocument();
  });
});

describe('PostOpPrintView', () => {
  let print: jest.SpyInstance;
  beforeEach(() => {
    mockedGet.mockReset();
    print = jest.spyOn(window, 'print').mockImplementation(() => undefined);
  });
  afterEach(() => print.mockRestore());

  it('carga la entrega, pinta código y versión y abre el diálogo de impresión una vez', async () => {
    mockedGet.mockResolvedValue(documentFixture());
    render(<PostOpPrintView token="tok" patientId="pat-1" deliveryId="del-1" />);
    expect(await screen.findByTestId('postop-header')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('tok', 'pat-1', 'del-1');
    expect(screen.getByText(/POI-EXO · v2/)).toBeInTheDocument();
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('link', { name: /volver a la ficha/i })).toHaveAttribute(
      'href',
      '/patients/pat-1?tab=clinical-history',
    );
    expect(screen.getByRole('button', { name: /imprimir o guardar como pdf/i })).toBeEnabled();
  });

  it('404 es un aviso sin reintento y no imprime', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'Entrega no encontrada'));
    render(<PostOpPrintView token="tok" patientId="pat-1" deliveryId="del-1" />);
    expect(await screen.findByText('No encontramos la entrega.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
  });

  it('una entrega de otro paciente que el de la URL se trata como no encontrada', async () => {
    mockedGet.mockResolvedValue(documentFixture({ patientId: 'pat-otro' }));
    render(<PostOpPrintView token="tok" patientId="pat-1" deliveryId="del-1" />);
    expect(await screen.findByText('No encontramos la entrega.')).toBeInTheDocument();
    expect(screen.queryByTestId('postop-header')).not.toBeInTheDocument();
    expect(print).not.toHaveBeenCalled();
  });

  it('403 o sin permiso: aviso de acceso', async () => {
    const { unmount } = render(
      <PostOpPrintView token="tok" patientId="pat-1" deliveryId="del-1" allowed={false} />,
    );
    expect(screen.getByText(/tu rol no tiene acceso/i)).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
    unmount();

    mockedGet.mockRejectedValue(new ApiError(403, 'Prohibido'));
    render(<PostOpPrintView token="tok" patientId="pat-1" deliveryId="del-1" />);
    expect(await screen.findByText(/tu rol no tiene acceso/i)).toBeInTheDocument();
  });

  it('otro error: SectionError con reintento que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce(documentFixture());
    render(<PostOpPrintView token="tok" patientId="pat-1" deliveryId="del-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las indicaciones.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByTestId('postop-header')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
