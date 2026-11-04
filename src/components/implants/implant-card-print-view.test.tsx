import { render, screen, waitFor, within } from '@testing-library/react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { ImplantCardPrintView } from './implant-card-print-view';
import { getImplantCard, printImplantCard } from '@/lib/implants/implants-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { makeImplantCard, tokenFor } from '@/lib/test/implants';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { citesLaw } from '@/architecture/law-citation';
import { REGIONAL_DE, REGIONAL_US } from '@/lib/test/document-regional';

jest.mock('../../lib/implants/implants-api', () => ({
  ...jest.requireActual('../../lib/implants/implants-api'),
  getImplantCard: jest.fn(),
  printImplantCard: jest.fn(),
}));

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedGet = getImplantCard as jest.MockedFunction<typeof getImplantCard>;
const mockedPrint = printImplantCard as jest.MockedFunction<typeof printImplantCard>;
const RECEPTION = tokenFor('RECEPTION', 'u-rec');

describe('ImplantCardPrintView (DX-191)', () => {
  const realPrint = window.print;
  beforeEach(() => {
    mockedGet.mockReset();
    mockedPrint.mockReset();
    mockedLocations.mockReset().mockResolvedValue([clinicLocation({ locale: 'de-DE', hourCycle: 'h23' })]);
    window.print = jest.fn();
  });
  afterAll(() => {
    window.print = realPrint;
  });

  it('formatImplantSize en-US is 4.1 × 10 mm: la medida con el formato de la sede de la tarjeta', async () => {
    mockedGet.mockResolvedValue(makeImplantCard({ regional: REGIONAL_US }));
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
    const card = await screen.findByRole('article');
    expect(await within(card).findByText('4.1 × 10 mm')).toBeInTheDocument();
  });

  it('el tamaño y las fechas usan la misma sede del documento, no la activa', async () => {
    // La sede activa de la pantalla es alemana (24 h, coma decimal); la tarjeta es de una sede en-US.
    mockedLocations.mockResolvedValue([clinicLocation({ locale: 'de-DE', hourCycle: 'h23' })]);
    mockedGet.mockResolvedValue(
      makeImplantCard({ regional: REGIONAL_US, deliveredAt: '2027-05-03T19:05:00.000Z', placedOn: '2027-05-03' }),
    );
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2027-05-03" />);
    const card = await screen.findByRole('article');
    expect(within(card).getAllByRole('listitem')[0]).toHaveTextContent('4.1 × 10 mm');
    expect(card).toHaveTextContent('05/03/2027');
    expect(card).toHaveTextContent('05/03/2027 3:05 p. m.');
    expect(card).not.toHaveTextContent('03.05.2027');
  });

  it('B: sede de-DE, las fechas y el tamaño en el orden y los separadores alemanes', async () => {
    mockedGet.mockResolvedValue(
      makeImplantCard({ regional: REGIONAL_DE, deliveredAt: '2027-05-03T19:05:00.000Z', placedOn: '2027-05-03' }),
    );
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2027-05-03" />);
    const card = await screen.findByRole('article');
    expect(within(card).getAllByRole('listitem')[0]).toHaveTextContent('4,1 × 10 mm');
    expect(card).toHaveTextContent('03.05.2027 21:05');
  });

  it('«Configurar sede» abre la sede de la tarjeta sin formato, no la lista', async () => {
    useAuthStore.setState({ accessToken: tokenFor('ADMIN') });
    try {
      mockedGet.mockResolvedValue(makeImplantCard({ regional: null }));
      render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
      expect(await screen.findByRole('link', { name: 'Configurar sede' })).toHaveAttribute(
        'href',
        '/settings/sedes?sede=loc-1',
      );
    } finally {
      useAuthStore.setState({ accessToken: null });
    }
  });

  it('sin formato de la sede: la medida y las fechas «—» y el aviso, fuera de la impresión', async () => {
    mockedGet.mockResolvedValue(makeImplantCard({ regional: null, deliveredAt: '2026-10-17T15:00:00.000Z' }));
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
    const note = await screen.findByText(/No se pudo saber el formato regional o el reloj de la sede/);
    expect(note.closest('.print\\:hidden')).not.toBeNull();
    const card = screen.getByRole('article');
    const items = within(card).getAllByRole('listitem');
    expect(items[0]).not.toHaveTextContent('mm');
    expect(items[0]).toHaveTextContent('—');
    expect(card.textContent).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
  });

  it('sin formato de la sede no se imprime ni se registra la entrega (las medidas saldrían «—»)', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(makeImplantCard({ regional: null }));
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
    await screen.findByText(/No se pudo saber el formato regional o el reloj de la sede/);
    const print = screen.getByRole('button', { name: /imprimir y registrar la entrega/i });
    expect(print).toBeDisabled();
    await user.click(print);
    expect(mockedPrint).not.toHaveBeenCalled();
    expect(window.print).not.toHaveBeenCalled();
  });

  it('DX-354b (E7.2, criterio 9): la región de estado del aviso se monta siempre; vacía con formato, con el aviso sin él', async () => {
    const noteRegion = () => screen.getAllByRole('status').find((r) => r.classList.contains('print:hidden'));
    mockedGet.mockResolvedValueOnce(makeImplantCard({ regional: REGIONAL_US }));
    const first = render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
    await screen.findByRole('article');
    expect(noteRegion()).toBeDefined();
    expect(noteRegion()).toBeEmptyDOMElement();
    first.unmount();

    mockedGet.mockResolvedValueOnce(makeImplantCard({ regional: null }));
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
    await screen.findByRole('article');
    expect(noteRegion()).toHaveTextContent('No se pudo saber el formato regional o el reloj de la sede');
  });

  it('Reintentar vuelve a leer la tarjeta, que trae el formato de su sede', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValueOnce(makeImplantCard({ regional: null }));
    mockedGet.mockResolvedValueOnce(makeImplantCard({ regional: REGIONAL_US }));
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('4.1 × 10 mm')).toBeInTheDocument();
    expect(screen.queryByText(/No se pudo saber el formato regional/)).not.toBeInTheDocument();
  });

  it('la tarjeta lleva nombre y documento, centro, fecha y los dos componentes; el anulado, marcado', async () => {
    mockedGet.mockResolvedValue(makeImplantCard());
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
    const card = await screen.findByRole('article');
    expect(card).toHaveTextContent('Lucía Gómez');
    expect(card).toHaveTextContent('Documento nacional DOC-0002');
    expect(card).toHaveTextContent('Clínica Demo');
    expect(card).toHaveTextContent('Sede principal');
    expect(card).toHaveTextContent('10/10/2026');
    expect(card).toHaveTextContent('Dra. Laura Ruiz');
    const items = within(card).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent('Implante · Diente 36');
    expect(items[0]).toHaveTextContent('021.5310');
    expect(items[0]).toHaveTextContent('LOT-AB12');
    expect(await within(items[0]).findByText('4,1 × 10 mm')).toBeInTheDocument();
    expect(items[1]).toHaveAttribute('data-voided', 'true');
    expect(items[1]).toHaveTextContent('ANULADO');
    expect(card).toHaveTextContent('Entrega pendiente de registrar.');
    // DX-323: la tarjeta no cita la base legal de ningún país.
    expect(citesLaw(card.textContent ?? '')).toBe(false);
    // No abre el diálogo sola: la entrega se registra al pulsar «Imprimir».
    expect(window.print).not.toHaveBeenCalled();
  });

  it('«Imprimir» registra la entrega y después abre el diálogo', async () => {
    const user = setupUser();
    mockedGet.mockResolvedValue(makeImplantCard());
    mockedPrint.mockResolvedValue(makeImplantCard({ deliveredAt: '2026-10-17T15:00:00.000Z' }));
    render(<ImplantCardPrintView token={RECEPTION} patientId="p1" date="2026-10-10" />);
    await screen.findByRole('article');
    const print = screen.getByRole('button', { name: /imprimir y registrar la entrega/i });
    await waitFor(() => expect(print).toBeEnabled());
    await user.click(print);
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
