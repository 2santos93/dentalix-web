import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceiptsSummaryDialog } from './receipts-summary-dialog';
import { ApiError } from '@/lib/api/client';
import { getReceiptsSummary, sendReceiptsSummary } from '@/lib/payments/receipts-summary-api';
import { SUMMARY_PRESETS, defaultSummaryRange, summaryRangeCopy } from '@/lib/payments/receipts-summary-range';
import { todayDate } from '@/lib/dates/iso';
import { receiptsSummaryFixture } from '@/lib/test/receipts-summary';
import { typeDate } from '@/components/patients/date-test-utils';

jest.mock('../../lib/payments/receipts-summary-api', () => ({
  ...jest.requireActual('../../lib/payments/receipts-summary-api'),
  getReceiptsSummary: jest.fn(),
  sendReceiptsSummary: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/locations').clinicLocation()]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([]),
}));

const mockedGet = getReceiptsSummary as jest.MockedFunction<typeof getReceiptsSummary>;
const mockedSend = sendReceiptsSummary as jest.MockedFunction<typeof sendReceiptsSummary>;

// La sede de prueba está en America/Caracas: «hoy» es el de allí.
const today = todayDate('America/Caracas');
const preset = (id: string) => SUMMARY_PRESETS.find((p) => p.id === id)!.range(today);

// Los espacios duros de Intl (U+00A0) como espacios normales.
function text(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\s/g, ' ');
}

beforeEach(() => {
  mockedGet.mockReset();
  mockedSend.mockReset();
});

async function openDialog() {
  const user = userEvent.setup();
  render(<ReceiptsSummaryDialog token="tok" patientId="pat-1" open onOpenChange={() => undefined} />);
  const dialog = await screen.findByRole('dialog', { name: 'Resumen de recibos' });
  return { user, dialog };
}

it('por defecto pide del día 1 del mes de la sede a hoy y lista los recibos', async () => {
  mockedGet.mockResolvedValue(receiptsSummaryFixture());
  const { dialog } = await openDialog();
  await within(dialog).findByTestId('receipts-summary-preview');
  expect(mockedGet).toHaveBeenCalledWith('tok', 'pat-1', defaultSummaryRange(today));
  const rows = within(dialog).getAllByTestId('receipts-summary-row');
  expect(rows).toHaveLength(4);
  expect(rows[0]).toHaveTextContent('PRI-000101');
  expect(rows[0]).toHaveTextContent('03/11/2026');
  expect(rows[0]).toHaveTextContent('Sede principal');
  expect(rows[0]).toHaveTextContent('Efectivo');
  expect(text(rows[0])).toContain('USD 125,00');
  expect(within(dialog).getByText('Este resumen no es factura ni documento fiscal.')).toBeInTheDocument();
  // «Este mes» queda marcado.
  expect(within(dialog).getByRole('button', { name: 'Este mes' })).toHaveAttribute('aria-pressed', 'true');
});

it('el anulado sale marcado con su motivo y fuera del total; los totales van por moneda', async () => {
  mockedGet.mockResolvedValue(receiptsSummaryFixture());
  const { dialog } = await openDialog();
  await within(dialog).findByTestId('receipts-summary-preview');
  const voided = within(dialog).getAllByTestId('receipts-summary-row')[3];
  expect(voided).toHaveAttribute('data-voided', 'true');
  expect(within(voided).getByText('Anulado')).toBeInTheDocument();
  expect(voided).toHaveTextContent('Motivo: Cobro duplicado en caja');
  expect(within(voided).getByText(/USD\s40,00/).className).toMatch(/line-through/);

  // Nunca se suman monedas distintas: una fila por moneda.
  expect(text(within(dialog).getByTestId('receipts-summary-total-USD'))).toBe('USD 205,00');
  expect(text(within(dialog).getByTestId('receipts-summary-total-VES'))).toBe('VES 1.500,00');
  expect(within(dialog).getByText('1 recibo anulado: no cuenta en el total.')).toBeInTheDocument();
});

it('los atajos cambian el periodo y el enlace de imprimir lo lleva', async () => {
  mockedGet.mockResolvedValue(receiptsSummaryFixture());
  const { user, dialog } = await openDialog();
  await within(dialog).findByTestId('receipts-summary-preview');

  await user.click(within(dialog).getByRole('button', { name: 'Mes anterior' }));
  const previous = preset('previousMonth');
  await waitFor(() => expect(mockedGet).toHaveBeenLastCalledWith('tok', 'pat-1', previous));
  expect(within(dialog).getByRole('button', { name: 'Mes anterior' })).toHaveAttribute('aria-pressed', 'true');

  await user.click(within(dialog).getByRole('button', { name: 'Este año' }));
  const year = preset('thisYear');
  expect(year.from).toBe(`${today.year}-01-01`);
  await waitFor(() => expect(mockedGet).toHaveBeenLastCalledWith('tok', 'pat-1', year));
  await within(dialog).findByTestId('receipts-summary-preview');
  const print = within(dialog).getByRole('link', { name: /imprimir/i });
  expect(print).toHaveAttribute(
    'href',
    `/print/patients/pat-1/receipts-summary?from=${year.from}&to=${year.to}`,
  );
  expect(print).toHaveAttribute('target', '_blank');
});

it('«Desde» posterior a «Hasta» se dice junto al campo y no se pide nada', async () => {
  mockedGet.mockResolvedValue(receiptsSummaryFixture());
  const { user, dialog } = await openDialog();
  await within(dialog).findByTestId('receipts-summary-preview');
  mockedGet.mockClear();

  const next = today.add({ days: 1 }).toString();
  await typeDate(user, within(dialog).getByRole('group', { name: 'Desde' }), next);
  expect(await within(dialog).findByText(summaryRangeCopy.fromAfterTo)).toBeInTheDocument();
  expect(mockedGet).not.toHaveBeenCalled();
  expect(within(dialog).getByRole('button', { name: /imprimir/i })).toBeDisabled();
  expect(within(dialog).getByRole('button', { name: 'Enviar por email' })).toBeDisabled();
});

it('un periodo de más de 366 días se rechaza junto a «Hasta»', async () => {
  mockedGet.mockResolvedValue(receiptsSummaryFixture());
  const { user, dialog } = await openDialog();
  await within(dialog).findByTestId('receipts-summary-preview');
  mockedGet.mockClear();

  await typeDate(user, within(dialog).getByRole('group', { name: 'Desde' }), today.subtract({ days: 366 }).toString());
  expect(await within(dialog).findByText(summaryRangeCopy.tooLong)).toBeInTheDocument();
  expect(mockedGet).not.toHaveBeenCalled();

  // 366 días justos (hoy incluido) sí valen.
  await typeDate(user, within(dialog).getByRole('group', { name: 'Desde' }), today.subtract({ days: 365 }).toString());
  await waitFor(() => expect(mockedGet).toHaveBeenCalledTimes(1));
  expect(within(dialog).queryByText(summaryRangeCopy.tooLong)).not.toBeInTheDocument();
});

it('sin recibos en el periodo: estado vacío y email deshabilitado', async () => {
  mockedGet.mockResolvedValue(receiptsSummaryFixture({ receipts: [], totals: [], voidedCount: 0 }));
  const { dialog } = await openDialog();
  expect(await within(dialog).findByText('No hay abonos en ese periodo')).toBeInTheDocument();
  expect(within(dialog).getByRole('button', { name: 'Enviar por email' })).toBeDisabled();
});

it('con sedes restringidas avisa de que solo incluye las suyas', async () => {
  mockedGet.mockResolvedValue(receiptsSummaryFixture({ restrictedToLocations: true }));
  const { dialog } = await openDialog();
  expect(await within(dialog).findByText('Solo incluye los abonos de tus sedes.')).toBeInTheDocument();
});

it('enviar por email muestra el destino enmascarado', async () => {
  mockedGet.mockResolvedValue(receiptsSummaryFixture());
  mockedSend.mockResolvedValue({ sentTo: 'ca***@example.com', sentToResponsible: false });
  const { user, dialog } = await openDialog();
  await within(dialog).findByTestId('receipts-summary-preview');
  await user.click(within(dialog).getByRole('button', { name: 'Enviar por email' }));
  expect(await within(dialog).findByTestId('receipts-summary-sent')).toHaveTextContent('Enviado a ca***@example.com.');
  expect(mockedSend).toHaveBeenCalledWith('tok', 'pat-1', defaultSummaryRange(today));
});

it('si va al responsable, lo dice', async () => {
  mockedGet.mockResolvedValue(receiptsSummaryFixture());
  mockedSend.mockResolvedValue({ sentTo: 'ma***@example.com', sentToResponsible: true });
  const { user, dialog } = await openDialog();
  await within(dialog).findByTestId('receipts-summary-preview');
  await user.click(within(dialog).getByRole('button', { name: 'Enviar por email' }));
  expect(await within(dialog).findByTestId('receipts-summary-sent')).toHaveTextContent(
    'Enviado al responsable del paciente (ma***@example.com).',
  );
});

it.each([
  [422, 'El paciente no tiene un email registrado.'],
  [429, 'Ya se enviaron demasiados resúmenes a este paciente hoy.'],
])('un %i al enviar muestra el mensaje de la API junto a la acción', async (status, message) => {
  mockedGet.mockResolvedValue(receiptsSummaryFixture());
  mockedSend.mockRejectedValue(new ApiError(status, message));
  const { user, dialog } = await openDialog();
  await within(dialog).findByTestId('receipts-summary-preview');
  await user.click(within(dialog).getByRole('button', { name: 'Enviar por email' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(message);
  // La vista previa sigue en pantalla.
  expect(within(dialog).getByTestId('receipts-summary-preview')).toBeInTheDocument();
});

it('un 403 al cargar es un aviso de acceso, sin reintento', async () => {
  mockedGet.mockRejectedValue(new ApiError(403, 'Tu rol no tiene acceso a los recibos de caja'));
  const { dialog } = await openDialog();
  expect(await within(dialog).findByText('Tu rol no tiene acceso a los recibos de caja.')).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
});

it('un fallo de carga es un error de sección con reintento', async () => {
  mockedGet.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  mockedGet.mockResolvedValueOnce(receiptsSummaryFixture());
  const { user, dialog } = await openDialog();
  const alert = await within(dialog).findByRole('alert');
  await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
  expect(await within(dialog).findByTestId('receipts-summary-preview')).toBeInTheDocument();
});
