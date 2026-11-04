import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AccountStatementPrintView } from './account-statement-print-view';
import { getAccountStatement } from '@/lib/account-statement/account-statement-api';
import { accountStatementFixture } from '@/lib/test/account-statement';
import { ApiError } from '@/lib/api/client';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';

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

it('un rol sin acceso ve el aviso sin pedir nada ni imprimir', async () => {
  render(<AccountStatementPrintView token="tok" patientId="pat-1" allowed={false} />);

  expect(screen.getByRole('status')).toHaveTextContent(/tu rol no tiene acceso/i);
  expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /imprimir/i })).toBeDisabled();
  expect(mockedGet).not.toHaveBeenCalled();
  expect(printSpy).not.toHaveBeenCalled();
});

it('un 403 de la API se muestra como aviso de acceso, sin reintento', async () => {
  mockedGet.mockRejectedValue(new ApiError(403, 'Forbidden'));
  render(<AccountStatementPrintView token="tok" patientId="pat-1" />);

  expect(await screen.findByText(/tu rol no tiene acceso/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
});

it('un 404 dice que no hay tal paciente, sin un reintento que no lo arreglaría', async () => {
  mockedGet.mockRejectedValue(new ApiError(404, 'Paciente no encontrado'));
  render(<AccountStatementPrintView token="tok" patientId="pat-1" />);

  expect(await screen.findByText(/no encontramos este paciente/i)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /reintentar/i })).not.toBeInTheDocument();
  expect(printSpy).not.toHaveBeenCalled();
});

it('DX-354: usa el formato de la sede del estado de cuenta; sin él, «—» y el aviso de la sede (solo en pantalla)', async () => {
  mockedGet.mockResolvedValueOnce(accountStatementFixture({ regional: null }));
  mockedGet.mockResolvedValueOnce(
    accountStatementFixture({ regional: { timeZone: 'America/New_York', locale: 'en-US', hourCycle: 'h12' } }),
  );
  render(<AccountStatementPrintView token="tok" patientId="pat-1" />);

  expect(await screen.findByTestId('statement-header')).toHaveTextContent(/emisión\s*—/i);
  const note = screen.getByText(SEDE_LOCALE_ERROR).closest('[role="status"]');
  expect(note?.closest('.print\\:hidden')).not.toBeNull();
  // Sin formato no se abre el diálogo de impresión solo, y el botón espera.
  expect(printSpy).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: /imprimir/i })).toBeDisabled();

  await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await waitFor(() => expect(printSpy).toHaveBeenCalledTimes(1));
  // 15:30 UTC es 11:30 en Nueva York.
  await waitFor(() => expect(screen.getByTestId('statement-header')).toHaveTextContent('10/15/2026 11:30 a. m.'));
  expect(screen.queryByText(SEDE_LOCALE_ERROR)).not.toBeInTheDocument();
});

// DX-047: la hoja en blanco final venía de dar `page: statement` a un elemento
// interior (fuerza un salto antes y después). La página con nombre va en `html`
// vía `:has(.statement-print-page)` y el envoltorio no impone altura mínima.
it('el envoltorio marca la página de impresión y no fuerza altura al imprimir', async () => {
  mockedGet.mockResolvedValue(accountStatementFixture());
  const { container } = render(<AccountStatementPrintView token="tok" patientId="pat-1" />);
  await screen.findByRole('heading', { level: 1, name: /estado de cuenta/i });
  const page = container.querySelector('.statement-print-page');
  expect(page).not.toBeNull();
  expect(page?.className).toMatch(/print:min-h-0/);
});

it('el CSS de impresión no pone `page` en el documento interior', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const css = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../app/globals.css'), 'utf8') as string;
  expect(css).toMatch(/html:has\(\.statement-print-page\)\s*{\s*page: statement;/);
  expect(css).not.toMatch(/\.statement-print-root\s*{\s*page:/);
});
