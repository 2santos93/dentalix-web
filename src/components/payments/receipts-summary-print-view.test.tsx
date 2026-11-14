import { render, screen, waitFor, within } from '@testing-library/react';
import { ReceiptsSummaryPrintView } from './receipts-summary-print-view';
import { printReceiptsSummary } from '@/lib/payments/receipts-summary-api';
import { summaryRangeCopy } from '@/lib/payments/receipts-summary-range';
import { receiptsSummaryFixture } from '@/lib/test/receipts-summary';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/payments/receipts-summary-api', () => ({
  ...jest.requireActual('../../lib/payments/receipts-summary-api'),
  printReceiptsSummary: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest.fn().mockResolvedValue([jest.requireActual('../../lib/test/locations').clinicLocation()]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([]),
}));

const mockedPrint = printReceiptsSummary as jest.MockedFunction<typeof printReceiptsSummary>;
let printSpy: jest.SpyInstance;

const RANGE = { from: '2026-11-01', to: '2026-11-11' };

function text(el: HTMLElement): string {
  return (el.textContent ?? '').replace(/\s/g, ' ');
}

beforeEach(() => {
  mockedPrint.mockReset();
  printSpy = jest.spyOn(window, 'print').mockImplementation(() => undefined);
});

afterEach(() => {
  printSpy.mockRestore();
});

it('pide la impresión (auditada) del periodo, pinta el documento y abre el diálogo de impresión una vez', async () => {
  mockedPrint.mockResolvedValue(receiptsSummaryFixture());
  render(<ReceiptsSummaryPrintView token="tok" patientId="pat-1" {...RANGE} />);

  const doc = await screen.findByTestId('receipts-summary-document');
  await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  expect(mockedPrint).toHaveBeenCalledTimes(1);
  expect(mockedPrint).toHaveBeenCalledWith('tok', 'pat-1', RANGE);

  expect(within(doc).getByRole('heading', { level: 1, name: 'Resumen de recibos' })).toBeInTheDocument();
  expect(doc).toHaveTextContent('Clínica Demo');
  expect(doc).toHaveTextContent('RIF J-12345678-9');
  expect(doc).toHaveTextContent('Carolina Pérez');
  expect(doc).toHaveTextContent('Documento de identidad ****5678');
  expect(doc).toHaveTextContent('Del 01/11/2026 al 11/11/2026');
  expect(within(doc).getByTestId('receipts-summary-notice')).toHaveTextContent(
    'Este resumen no es factura ni documento fiscal.',
  );

  // Totales por moneda, sin sumar monedas; el anulado fuera.
  const totals = within(doc).getByRole('table', { name: 'Totales por moneda' });
  expect(text(within(totals).getByRole('row', { name: /USD/ }))).toContain('USD 205,00');
  expect(text(within(totals).getByRole('row', { name: /VES/ }))).toContain('VES 1.500,00');
  expect(doc).toHaveTextContent('1 recibo anulado: no cuenta en el total.');

  // La tabla (pantalla ancha e impresión) marca el anulado con su motivo.
  const table = within(doc).getByRole('table', { name: 'Recibos del periodo' });
  const voided = within(table).getByRole('row', { name: /PRI-000104/ });
  expect(voided).toHaveTextContent('Anulado');
  expect(voided).toHaveTextContent('Motivo: Cobro duplicado en caja');

  // En el teléfono, la misma lista apilada (sin tabla) y fuera del papel.
  const stacked = within(doc).getByRole('list', { name: 'Recibos del periodo' });
  expect(stacked.className).toMatch(/sm:hidden/);
  expect(stacked.className).toMatch(/print:hidden/);
  expect(within(stacked).getAllByRole('listitem')).toHaveLength(4);

  // Cobro dividido: la segunda forma de pago, bajo el mismo recibo (sin repetir número).
  const split = within(table).getAllByRole('row').filter((row) => /PRI-000102|Mismo recibo/.test(row.textContent ?? ''));
  expect(split).toHaveLength(2);
  expect(split[1]).toHaveTextContent('Mismo recibo');
  expect(split[1]).not.toHaveTextContent('PRI-000102');

  const toolbar = screen.getByRole('toolbar');
  expect(toolbar.className).toMatch(/print:hidden/);
  expect(within(toolbar).getByRole('link', { name: /volver a la ficha/i })).toHaveAttribute(
    'href',
    '/patients/pat-1?tab=account-statement',
  );
});

it('con sedes restringidas lo dice en el documento', async () => {
  mockedPrint.mockResolvedValue(receiptsSummaryFixture({ restrictedToLocations: true }));
  render(<ReceiptsSummaryPrintView token="tok" patientId="pat-1" {...RANGE} />);
  expect(await screen.findByTestId('receipts-summary-document')).toHaveTextContent(
    'Solo incluye los abonos de tus sedes.',
  );
});

it('un periodo inválido en el enlace no pide nada y lo explica', async () => {
  render(<ReceiptsSummaryPrintView token="tok" patientId="pat-1" from="2026-11-12" to="2026-11-01" />);
  expect(await screen.findByText('El periodo del enlace no es válido.')).toBeInTheDocument();
  expect(screen.getByText(summaryRangeCopy.fromAfterTo)).toBeInTheDocument();
  expect(mockedPrint).not.toHaveBeenCalled();
});

it('un rol sin permiso no pide nada y ve el aviso', () => {
  render(<ReceiptsSummaryPrintView token="tok" patientId="pat-1" {...RANGE} allowed={false} />);
  expect(screen.getByText('Tu rol no tiene acceso a los recibos de caja.')).toBeInTheDocument();
  expect(mockedPrint).not.toHaveBeenCalled();
});

it('sin documento no pinta el tipo', async () => {
  const base = receiptsSummaryFixture();
  mockedPrint.mockResolvedValue(receiptsSummaryFixture({ patient: { ...base.patient, documentMasked: null } }));
  render(<ReceiptsSummaryPrintView token="tok" patientId="pat-1" {...RANGE} />);
  const doc = await screen.findByTestId('receipts-summary-document');
  expect(doc).not.toHaveTextContent('Documento de identidad');
});

it('un 404 es un aviso sin reintento', async () => {
  mockedPrint.mockRejectedValue(new ApiError(404, 'Patient not found'));
  render(<ReceiptsSummaryPrintView token="tok" patientId="pat-1" {...RANGE} />);
  expect(await screen.findByText('No encontramos este paciente.')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  expect(printSpy).not.toHaveBeenCalled();
});
