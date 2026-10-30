import { act, render, screen, waitFor, within } from '@testing-library/react';
import { toast } from 'sonner';
import { tokenForRole } from '@/lib/test/data-consents';
import { clinicLocation } from '@/lib/test/locations';
import { listLocations } from '@/lib/locations/locations-api';
import { getRateBacklog } from '@/lib/payments/rate-backlog-api';
import { RateBacklogNotice, rateBacklogCopy } from './rate-backlog-notice';

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
}));
jest.mock('../../lib/payments/rate-backlog-api', () => ({
  ...jest.requireActual('../../lib/payments/rate-backlog-api'),
  getRateBacklog: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { error: jest.fn() } }));
const mockedLocations = jest.mocked(listLocations);
const mockedBacklog = jest.mocked(getRateBacklog);

beforeEach(() => {
  jest.clearAllMocks();
  window.localStorage.clear();
  // Sede en Bogotá (UTC-5) con formato es-CO.
  mockedLocations.mockResolvedValue([clinicLocation()]);
});

describe('RateBacklogNotice (DX-380)', () => {
  it('al ADMIN le dice cuántos abonos llevan más de 24 h sin tasa, desde qué día de la sede y adónde ir', async () => {
    // 02:00 UTC del 29 = 21:00 del 28 en Bogotá: el día es el de la sede.
    mockedBacklog.mockResolvedValue({ count: 3, oldestSince: '2026-10-29T02:00:00.000Z' });
    render(<RateBacklogNotice token={tokenForRole('ADMIN')} />);

    const notice = await screen.findByRole('region', { name: rateBacklogCopy.label });
    await waitFor(() => expect(notice).toHaveTextContent('3 abonos sin tasa desde el 28/10/2026'));
    expect(notice).toHaveTextContent(rateBacklogCopy.body);
    const link = within(notice).getByRole('link', { name: rateBacklogCopy.link });
    expect(link).toHaveAttribute('href', '/settings/tasa-de-cambio');
    // Sin datos del paciente ni importes: solo el recuento y el día.
    expect(notice).not.toHaveTextContent(/\$|USD|COP/);
  });

  it('en singular con un abono', async () => {
    mockedBacklog.mockResolvedValue({ count: 1, oldestSince: '2026-10-28T15:00:00.000Z' });
    render(<RateBacklogNotice token={tokenForRole('ADMIN')} />);
    expect(
      await screen.findByText('1 abono sin tasa desde el 28/10/2026'),
    ).toBeInTheDocument();
  });

  it('sin formato de la sede todavía, el recuento sin día (nunca otro formato)', async () => {
    mockedLocations.mockReturnValue(new Promise(() => {}));
    mockedBacklog.mockResolvedValue({ count: 2, oldestSince: '2026-10-28T15:00:00.000Z' });
    render(<RateBacklogNotice token={tokenForRole('ADMIN')} />);
    expect(await screen.findByText(rateBacklogCopy.title(2, null))).toBeInTheDocument();
    expect(rateBacklogCopy.title(2, null)).toBe('2 abonos sin tasa desde hace más de 24 h');
  });

  it('sin abonos atascados no pinta nada', async () => {
    mockedBacklog.mockResolvedValue({ count: 0, oldestSince: null });
    const { container } = render(<RateBacklogNotice token={tokenForRole('ADMIN')} />);
    await waitFor(() => expect(mockedBacklog).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'])('%s no lo ve ni lo pide', (role) => {
    const { container } = render(<RateBacklogNotice token={tokenForRole(role)} />);
    expect(container).toBeEmptyDOMElement();
    expect(mockedBacklog).not.toHaveBeenCalled();
  });

  it('si no se puede leer, un aviso en segundo plano con reintento, sin ocupar la pantalla', async () => {
    mockedBacklog.mockRejectedValueOnce(new Error('red'));
    mockedBacklog.mockResolvedValueOnce({ count: 1, oldestSince: '2026-10-28T15:00:00.000Z' });
    const { container } = render(<RateBacklogNotice token={tokenForRole('ADMIN')} />);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
    const [message, options] = jest.mocked(toast.error).mock.calls[0] as [
      string,
      { action: { label: string; onClick: () => void } },
    ];
    expect(message).toBe(rateBacklogCopy.loadError);
    expect(options.action.label).toBe('Reintentar');

    act(() => options.action.onClick());
    expect(await screen.findByText('1 abono sin tasa desde el 28/10/2026')).toBeInTheDocument();
  });

  // DX-402: el remedio del aviso es el que resuelve el caso (pasar a manual y
  // registrar la tasa de ese día, que sirve de respaldo).
  it('el texto propone lo que resuelve el caso: la tasa manual de ese día como respaldo', () => {
    expect(rateBacklogCopy.body).toMatch(/respaldo/);
    expect(rateBacklogCopy.body).not.toMatch(/cambia la fuente/);
    // No da por hecho que servirá: el proveedor puede tener ya la tasa de ese
    // día o el abono necesitar otra moneda; el formulario dice a cuántos.
    expect(rateBacklogCopy.body).not.toMatch(/servirá de respaldo a esos abonos/);
    expect(rateBacklogCopy.body).toMatch(/a cuántos/);
  });
});
