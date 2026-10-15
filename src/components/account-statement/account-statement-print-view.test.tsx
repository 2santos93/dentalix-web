import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountStatementPrintView } from './account-statement-print-view';
import { getAccountStatement } from '@/lib/account-statement/account-statement-api';
import { accountStatementFixture } from '@/lib/test/account-statement';

jest.mock('../../lib/account-statement/account-statement-api', () => ({
  ...jest.requireActual('../../lib/account-statement/account-statement-api'),
  getAccountStatement: jest.fn(),
}));

const mockedGet = getAccountStatement as jest.MockedFunction<typeof getAccountStatement>;
let printSpy: jest.SpyInstance;

beforeEach(() => {
  mockedGet.mockReset();
  printSpy = jest.spyOn(window, 'print').mockImplementation(() => undefined);
});

afterEach(() => {
  printSpy.mockRestore();
});

it('carga el documento y abre el diálogo de impresión una sola vez', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementPrintView token="tok" patientId="pat-1" />);

  expect(await screen.findByRole('heading', { level: 1, name: /estado de cuenta/i })).toBeInTheDocument();
  await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  expect(mockedGet).toHaveBeenCalledWith('tok', 'pat-1');
});

it('la barra de acciones queda fuera de lo impreso y vuelve a imprimir', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  render(<AccountStatementPrintView token="tok" patientId="pat-1" />);

  const toolbar = await screen.findByRole('toolbar');
  expect(toolbar.className).toMatch(/print:hidden/);
  await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  await userEvent.click(within(toolbar).getByRole('button', { name: /imprimir/i }));
  expect(printSpy).toHaveBeenCalledTimes(2);
});

it('un fallo de carga deja un error con reintento y no imprime', async () => {
  mockedGet.mockRejectedValueOnce(new TypeError('Failed to fetch'));
  mockedGet.mockResolvedValueOnce(accountStatementFixture());
  render(<AccountStatementPrintView token="tok" patientId="pat-1" />);

  const alert = await screen.findByRole('alert');
  expect(printSpy).not.toHaveBeenCalled();
  await userEvent.click(within(alert).getByRole('button', { name: /reintentar/i }));
  expect(await screen.findByRole('heading', { level: 1, name: /estado de cuenta/i })).toBeInTheDocument();
});
