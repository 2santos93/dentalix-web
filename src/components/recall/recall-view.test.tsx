import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ApiError } from '@/lib/api/client';
import { listRecallDue, type RecallDueItem, type RecallDuePage } from '@/lib/recall/recall-api';
import { overdueLabel, recallMessage } from '@/lib/recall/presentation';
import { RecallView, recallCopy } from './recall-view';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('../../lib/clinic-branding', () => ({ fetchClinicName: jest.fn().mockResolvedValue('Clínica Sol') }));
jest.mock('../../lib/recall/recall-api', () => ({ listRecallDue: jest.fn(), createRecallContact: jest.fn() }));
const mockedList = listRecallDue as jest.MockedFunction<typeof listRecallDue>;

const item = (over: Partial<RecallDueItem> = {}): RecallDueItem => ({
  recallId: 'r1',
  patientId: 'p1',
  patientName: 'Ana Pérez',
  patientPhone: '+58 412 555 0101',
  patientWhatsApp: '584125550101',
  reminderOptedOut: false,
  kind: 'CHECKUP',
  intervalMonths: 6,
  baseDate: '2026-04-10',
  dueAt: '2026-10-10',
  daysOverdue: 22,
  locationId: 'l1',
  lastContact: null,
  ...over,
});
const page = (items: RecallDueItem[]): RecallDuePage => ({ items, total: items.length, page: 1, pageSize: 20 });

describe('RecallView (DX-015)', () => {
  beforeEach(() => mockedList.mockReset());

  it('vacío: «Nadie pendiente de control»', async () => {
    mockedList.mockResolvedValue(page([]));
    render(<RecallView token="tok" />);
    expect(await screen.findByText(recallCopy.emptyTitle)).toBeInTheDocument();
  });

  it('error con «Reintentar» que vuelve a cargar', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedList.mockResolvedValueOnce(page([item()]));
    render(<RecallView token="tok" />);
    await userEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Ana Pérez')).toBeInTheDocument();
  });

  it('403: el aviso en español, sin filtros', async () => {
    mockedList.mockRejectedValue(new ApiError(403, 'no'));
    render(<RecallView token="tok" />);
    expect(await screen.findByText(recallCopy.forbiddenTitle)).toBeInTheDocument();
    expect(screen.queryByLabelText(recallCopy.kindLabel)).not.toBeInTheDocument();
  });

  it('pinta la fila con llamar, WhatsApp sin datos clínicos, vencimiento y último contacto', async () => {
    mockedList.mockResolvedValue(
      page([
        item({ lastContact: { channel: 'CALL', outcome: 'NO_ANSWER', createdAt: '2026-10-20T15:00:00.000Z' } }),
      ]),
    );
    render(<RecallView token="tok" />);
    const row = (await screen.findByText('Ana Pérez')).closest('tr')!;
    expect(within(row).getByText('Hace 22 días')).toBeInTheDocument();
    expect(within(row).getByText('Llamada · No contesta')).toBeInTheDocument();
    expect(within(row).getByRole('link', { name: /^Llamar a Ana Pérez/ })).toHaveAttribute('href', 'tel:+584125550101');
    await waitFor(() =>
      expect(within(row).getByRole('link', { name: /WhatsApp/ }).getAttribute('href')).toContain('Cl%C3%ADnica%20Sol'),
    );
  });

  it('con baja de avisos no ofrece llamar ni WhatsApp, pero sí agendar', async () => {
    mockedList.mockResolvedValue(page([item({ reminderOptedOut: true, patientPhone: null, patientWhatsApp: null })]));
    render(<RecallView token="tok" />);
    const row = (await screen.findByText('Ana Pérez')).closest('tr')!;
    expect(within(row).getByText(recallCopy.optedOut)).toBeInTheDocument();
    expect(within(row).queryByRole('link', { name: /Llamar|WhatsApp/ })).not.toBeInTheDocument();
    await userEvent.click(within(row).getByRole('button', { name: 'Acciones de Ana Pérez' }));
    expect(await screen.findByRole('menuitem', { name: recallCopy.schedule })).toBeInTheDocument();
  });

  it('filtra por tipo, ventana y orden, volviendo a la página 1', async () => {
    mockedList.mockResolvedValue(page([item()]));
    render(<RecallView token="tok" />);
    await screen.findByText('Ana Pérez');
    await userEvent.selectOptions(screen.getByLabelText(recallCopy.kindLabel), 'HYGIENE');
    await userEvent.selectOptions(screen.getByLabelText(recallCopy.windowLabel), 'soon');
    await userEvent.selectOptions(screen.getByLabelText(recallCopy.sortLabel), 'LEAST_OVERDUE');
    await waitFor(() =>
      expect(mockedList).toHaveBeenLastCalledWith('tok', {
        kind: 'HYGIENE',
        withinDays: 30,
        sort: 'LEAST_OVERDUE',
        page: 1,
      }),
    );
  });
});

describe('presentación del recall', () => {
  it('días de vencido en palabras', () => {
    expect(overdueLabel(0)).toBe('Vence hoy');
    expect(overdueLabel(1)).toBe('Hace 1 día');
    expect(overdueLabel(-5)).toBe('Vence en 5 días');
  });
  it('el mensaje no lleva datos clínicos y cae en «la clínica»', () => {
    expect(recallMessage('Ana Pérez', null)).toBe(
      'Hola Ana, te escribimos de la clínica. Ya te toca tu control. ¿Te ayudamos a agendar tu cita?',
    );
  });
});
