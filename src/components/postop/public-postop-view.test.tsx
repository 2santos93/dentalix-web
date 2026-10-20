import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { PublicPostOpView } from './public-postop-view';
import { ApiError } from '@/lib/api/api-error';
import {
  getPublicPostOp,
  markPublicPostOpOpened,
  type PublicPostOp,
} from '@/lib/postop/postop-api';

jest.mock('../../lib/postop/postop-api', () => ({
  ...jest.requireActual('../../lib/postop/postop-api'),
  getPublicPostOp: jest.fn(),
  markPublicPostOpOpened: jest.fn(),
}));

const mockedGet = getPublicPostOp as jest.MockedFunction<typeof getPublicPostOp>;
const mockedOpened = markPublicPostOpOpened as jest.MockedFunction<typeof markPublicPostOpOpened>;

function publicFixture(overrides: Partial<PublicPostOp> = {}): PublicPostOp {
  return {
    clinic: { name: 'Clínica Sonrisas', logoUrl: null, primaryColor: '#7C3AED' },
    locationPhone: '601 555 0000',
    title: 'Tras una extracción',
    code: 'POI-EXO',
    version: 2,
    renderedText: 'Hola Ana:\n\nMuerde la gasa 30 minutos.',
    deliveredAt: '2026-10-16T15:00:00.000Z',
    ...overrides,
  };
}

describe('PublicPostOpView', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedOpened.mockReset();
    mockedOpened.mockResolvedValue(undefined);
  });

  it('muestra cargando, luego marca, título, texto, teléfono y pie; marca la apertura una sola vez', async () => {
    mockedGet.mockResolvedValue(publicFixture());
    const { rerender } = render(<PublicPostOpView linkToken="tok-1" />);
    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i);

    expect(await screen.findByRole('heading', { level: 1, name: 'Clínica Sonrisas' })).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledWith('tok-1');
    expect(screen.getByRole('heading', { level: 2, name: 'Tras una extracción' })).toBeInTheDocument();
    expect(screen.getByText(/Muerde la gasa 30 minutos\./)).toHaveClass('whitespace-pre-line');
    expect(screen.getByRole('link', { name: /601 555 0000/ })).toHaveAttribute('href', 'tel:6015550000');
    expect(screen.getByText('POI-EXO · v2')).toBeInTheDocument();

    await waitFor(() => expect(mockedOpened).toHaveBeenCalledTimes(1));
    expect(mockedOpened).toHaveBeenCalledWith('tok-1');
    rerender(<PublicPostOpView linkToken="tok-1" />);
    expect(mockedOpened).toHaveBeenCalledTimes(1);
  });

  it('si marcar la apertura falla, el paciente sigue viendo las indicaciones', async () => {
    mockedGet.mockResolvedValue(publicFixture());
    mockedOpened.mockRejectedValue(new ApiError(500, 'boom'));
    render(<PublicPostOpView linkToken="tok-1" />);
    expect(await screen.findByText(/Muerde la gasa/)).toBeInTheDocument();
    await waitFor(() => expect(mockedOpened).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText(/Muerde la gasa/)).toBeInTheDocument();
  });

  it('sin teléfono de la sede no muestra la línea de llamada', async () => {
    mockedGet.mockResolvedValue(publicFixture({ locationPhone: null }));
    render(<PublicPostOpView linkToken="tok-1" />);
    expect(await screen.findByText(/Muerde la gasa/)).toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('404 → enlace no válido, sin marcar apertura', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'Enlace no encontrado'));
    render(<PublicPostOpView linkToken="tok-1" />);
    expect(await screen.findByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'No encontramos este enlace. Revisa que esté completo o pide a la clínica que te lo envíe de nuevo.',
      ),
    ).toBeInTheDocument();
    expect(mockedOpened).not.toHaveBeenCalled();
  });

  it('410 → caducado, sin marcar apertura', async () => {
    mockedGet.mockRejectedValue(new ApiError(410, 'Este enlace ya no es válido'));
    render(<PublicPostOpView linkToken="tok-1" />);
    expect(await screen.findByRole('heading', { name: 'Este enlace ya no es válido' })).toBeInTheDocument();
    expect(
      screen.getByText('Caducó a los 30 días. Si necesitas las indicaciones, llama a la clínica.'),
    ).toBeInTheDocument();
    expect(mockedOpened).not.toHaveBeenCalled();
  });

  it('otro error → SectionError con reintento que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce(publicFixture());
    render(<PublicPostOpView linkToken="tok-1" />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar las indicaciones.');
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Muerde la gasa/)).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
