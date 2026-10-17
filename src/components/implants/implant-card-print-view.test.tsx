import { render, screen, within } from '@testing-library/react';
import { ImplantCardPrintView } from './implant-card-print-view';
import { getImplantCard, printImplantCard } from '@/lib/implants/implants-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeImplantCard, tokenFor } from '@/lib/test/implants';

jest.mock('../../lib/implants/implants-api', () => ({
  ...jest.requireActual('../../lib/implants/implants-api'),
  getImplantCard: jest.fn(),
  printImplantCard: jest.fn(),
}));

const mockedGet = getImplantCard as jest.MockedFunction<typeof getImplantCard>;
const mockedPrint = printImplantCard as jest.MockedFunction<typeof printImplantCard>;
const RECEPTION = tokenFor('RECEPTION', 'u-rec');

describe('ImplantCardPrintView (DX-191)', () => {
  const realPrint = window.print;
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPrint.mockReset();
    window.print = jest.fn();
  });
  afterAll(() => {
    window.print = realPrint;
  });

  it('la tarjeta lleva nombre y documento, centro, fecha y los dos componentes; el anulado, marcado', async () => {
    mockedGet.mockResolvedValue(makeImplantCard());
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
    const card = await screen.findByRole('article');
    expect(card).toHaveTextContent('Lucía Gómez');
    expect(card).toHaveTextContent('CC 52000001');
    expect(card).toHaveTextContent('Clínica Demo');
    expect(card).toHaveTextContent('Sede principal');
    expect(card).toHaveTextContent('10/10/2026');
    expect(card).toHaveTextContent('Dra. Laura Ruiz');
    const items = within(card).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Implante · Diente 36');
    expect(items[0]).toHaveTextContent('021.5310');
    expect(items[0]).toHaveTextContent('LOT-AB12');
    expect(items[0]).toHaveTextContent('4,1 × 10 mm');
    expect(items[1]).toHaveAttribute('data-voided', 'true');
    expect(items[1]).toHaveTextContent('ANULADO');
    expect(card).toHaveTextContent('Entrega pendiente de registrar.');
    // No abre el diálogo sola: la entrega se registra al pulsar «Imprimir».
    expect(window.print).not.toHaveBeenCalled();
  });

  it('«Imprimir» registra la entrega y después abre el diálogo', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(makeImplantCard());
    mockedPrint.mockResolvedValue(makeImplantCard({ deliveredAt: '2026-10-17T15:00:00.000Z' }));
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
    await screen.findByRole('article');
    await user.click(screen.getByRole('button', { name: /imprimir y registrar la entrega/i }));
    expect(mockedPrint).toHaveBeenCalledWith(RECEPTION, 'p1', '2026-10-10');
    expect(await screen.findByText(/Tarjeta entregada al paciente el/)).toBeInTheDocument();
    expect(window.print).toHaveBeenCalledTimes(1);
  });

  it('sin implantes ese día: aviso, sin reintento', async () => {
    mockedGet.mockRejectedValue(new ApiError(404, 'No hay implantes'));
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2020-01-01" />);
    expect(await screen.findByText('No hay implantes registrados en esa fecha.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
  });

  it('error de red con «Reintentar»', async () => {
    const user = setupUser();
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Se cayó'));
    mockedGet.mockResolvedValueOnce(makeImplantCard());
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('article')).toBeInTheDocument();
  });
});
