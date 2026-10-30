import { render, screen, waitFor, within } from '@testing-library/react';
import { ExchangeRateSettingsView, exchangeRateCopy, rateFormCopy } from './exchange-rate-settings';
import {
  getExchangeRateSettings,
  listManualExchangeRates,
  RATE_INPUT_COPY,
  registerManualExchangeRate,
  saveExchangeRateSettings,
  type ManualExchangeRate,
} from '@/lib/exchange/exchange-settings-api';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { ApiError } from '@/lib/api/api-error';
import { regionalFormat } from '@/lib/format/regional-format';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/exchange/exchange-settings-api', () => ({
  ...jest.requireActual('../../lib/exchange/exchange-settings-api'),
  getExchangeRateSettings: jest.fn(),
  saveExchangeRateSettings: jest.fn(),
  listManualExchangeRates: jest.fn(),
  registerManualExchangeRate: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
jest.mock('../../lib/locations/use-sede-time-zone', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-time-zone'),
  useSedeTimeZone: jest.fn(() => ({ status: 'ready', timeZone: 'America/Caracas' })),
  sedeToday: () => '2026-10-30',
}));
jest.mock('../../lib/locations/use-sede-format', () => ({
  ...jest.requireActual('../../lib/locations/use-sede-format'),
  useSedeFormat: jest.fn(() => ({
    status: 'ready',
    fmt: jest.requireActual('../../lib/format/regional-format').regionalFormat({ locale: 'es-VE', hourCycle: 'h12' }),
  })),
}));

const mockedGet = jest.mocked(getExchangeRateSettings);
const mockedSave = jest.mocked(saveExchangeRateSettings);
const mockedList = jest.mocked(listManualExchangeRates);
const mockedRegister = jest.mocked(registerManualExchangeRate);
const mockedCurrencies = jest.mocked(listCurrencies);
const copy = exchangeRateCopy;
const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
const AUTO = { source: 'AUTOMATIC', manualSince: null, baseCurrency: 'USD' } as const;
const MANUAL = { source: 'MANUAL', manualSince: '2026-10-30', baseCurrency: 'USD' } as const;
const rateLabel = rateFormCopy.rate('USD');

const ves: ManualExchangeRate = {
  id: 'r-ves',
  date: '2026-10-29',
  currency: 'VES',
  rate: 36.12345678,
  createdBy: { userId: 'u1', fullName: 'Dra. Admin' },
  createdAt: '2026-10-29T13:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedCurrencies.mockResolvedValue([
    { code: 'USD', name: 'Dólar', symbol: '$' },
    { code: 'VES', name: 'Bolívar', symbol: 'Bs.' },
    { code: 'EUR', name: 'Euro', symbol: '€' },
  ]);
});

function renderView(allowed = true) {
  render(<ExchangeRateSettingsView token="tok" allowed={allowed} />);
}

describe('ExchangeRateSettingsView (DX-374)', () => {
  it('sin permiso enseña el candado y no llama a la API', () => {
    renderView(false);
    expect(screen.getByText(copy.forbiddenTitle)).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('mientras carga, un estado de carga', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined));
    mockedList.mockReturnValue(new Promise(() => undefined));
    renderView();
    expect(screen.getByRole('status', { name: copy.loading })).toBeInTheDocument();
  });

  it('si falla la carga, error de sección con reintento que vuelve a pedir', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom')).mockResolvedValueOnce(AUTO);
    mockedList.mockResolvedValue([]);
    const user = setupUser();
    renderView();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(copy.loadError);
    await user.click(within(alert).getByRole('button'));
    expect(await screen.findByTestId('exchange-rate-source')).toHaveTextContent('Automática');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('sin tasas: estado vacío con «Registrar tasa» y la nota de la fuente automática', async () => {
    mockedGet.mockResolvedValue(AUTO);
    mockedList.mockResolvedValue([]);
    renderView();
    expect(await screen.findByText(copy.emptyTitle)).toBeInTheDocument();
    expect(screen.getByText(copy.ratesAutomaticNote)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.register })).toBeInTheDocument();
  });

  it('lista las últimas tasas con fecha, moneda, tasa y autor en el formato de la sede', async () => {
    mockedGet.mockResolvedValue(MANUAL);
    mockedList.mockResolvedValue([ves]);
    renderView();
    const table = await screen.findByRole('table', { name: copy.ratesHeading });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent(fmt.civilDate('2026-10-29'));
    expect(row).toHaveTextContent('VES');
    expect(row).toHaveTextContent(fmt.number(36.12345678, { min: 0, max: 8 }));
    expect(row).toHaveTextContent('Dra. Admin');
    expect(screen.queryByText(copy.ratesAutomaticNote)).not.toBeInTheDocument();
    // La fuente manual dice desde qué día rige, en el formato de la sede.
    expect(screen.getByTestId('exchange-rate-source')).toHaveTextContent(
      copy.manualSince(fmt.civilDate('2026-10-30')),
    );
  });

  it('cambia la fuente a manual en un modal accesible', async () => {
    mockedGet.mockResolvedValue(AUTO);
    mockedList.mockResolvedValue([]);
    mockedSave.mockResolvedValue(MANUAL);
    const user = setupUser();
    renderView();
    await user.click(await screen.findByRole('button', { name: copy.change }));
    const dialog = await screen.findByRole('dialog', { name: copy.sourceDialogTitle });
    expect(within(dialog).getByRole('radio', { name: /Automática/ })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: /Manual/ }));
    await user.click(within(dialog).getByRole('button', { name: copy.save }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', 'MANUAL'));
    expect(await screen.findByTestId('exchange-rate-source')).toHaveTextContent(
      copy.manualSince(fmt.civilDate('2026-10-30')),
    );
    expect(screen.getByText(copy.sourceSaved)).toBeInTheDocument();
  });

  it('registra la tasa del día: hoy de la sede por defecto y como máximo, coma decimal y sin la moneda base', async () => {
    mockedGet.mockResolvedValue(MANUAL);
    mockedList.mockResolvedValue([]);
    mockedRegister.mockResolvedValue({ ...ves, id: 'r-new', date: '2026-10-30', rate: 36.5 });
    const user = setupUser();
    renderView();
    await user.click(await screen.findByRole('button', { name: copy.register }));
    const dialog = await screen.findByRole('dialog', { name: rateFormCopy.title });
    const date = within(dialog).getByLabelText(rateFormCopy.date);
    expect(date).toHaveValue('2026-10-30');
    // Hoy de la sede es el máximo: el selector no ofrece días futuros.
    expect(date).toHaveAttribute('max', '2026-10-30');
    const select = within(dialog).getByLabelText(rateFormCopy.currency);
    await waitFor(() => expect(within(select).getByRole('option', { name: /Bolívar/ })).toBeInTheDocument());
    // La moneda base (la da la API) no se ofrece.
    expect(within(select).queryByRole('option', { name: /Dólar/ })).not.toBeInTheDocument();
    await user.selectOptions(select, 'VES');
    await user.type(within(dialog).getByLabelText(rateLabel), '36,5');
    await user.click(within(dialog).getByRole('button', { name: rateFormCopy.submit }));
    await waitFor(() =>
      expect(mockedRegister).toHaveBeenCalledWith('tok', { date: '2026-10-30', currency: 'VES', rate: 36.5 }),
    );
    expect(await screen.findByRole('table', { name: copy.ratesHeading })).toBeInTheDocument();
    expect(screen.getByText(copy.rateSaved('VES'))).toBeInTheDocument();
  });

  it('valida en el modal antes de enviar: moneda y tasa', async () => {
    mockedGet.mockResolvedValue(MANUAL);
    mockedList.mockResolvedValue([]);
    const user = setupUser();
    renderView();
    await user.click(await screen.findByRole('button', { name: copy.register }));
    const dialog = await screen.findByRole('dialog', { name: rateFormCopy.title });
    await user.type(within(dialog).getByLabelText(rateLabel), '0');
    await user.click(within(dialog).getByRole('button', { name: rateFormCopy.submit }));
    expect(await within(dialog).findByText(rateFormCopy.currencyMissing)).toBeInTheDocument();
    expect(within(dialog).getByText(RATE_INPUT_COPY.notPositive)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(rateLabel)).toHaveAttribute('aria-invalid', 'true');
    expect(mockedRegister).not.toHaveBeenCalled();
  });

  it('un 400 de la API con `field` va junto a su campo', async () => {
    mockedGet.mockResolvedValue(MANUAL);
    mockedList.mockResolvedValue([]);
    const tooBig = 'La tasa tiene que ser un número mayor que 0, con hasta 8 decimales y menos de 10.000.000.';
    mockedRegister.mockRejectedValue(new ApiError(400, tooBig, { field: 'rate' }));
    const user = setupUser();
    renderView();
    await user.click(await screen.findByRole('button', { name: copy.register }));
    const dialog = await screen.findByRole('dialog', { name: rateFormCopy.title });
    const select = within(dialog).getByLabelText(rateFormCopy.currency);
    await waitFor(() => expect(within(select).getByRole('option', { name: /Bolívar/ })).toBeInTheDocument());
    await user.selectOptions(select, 'VES');
    await user.type(within(dialog).getByLabelText(rateLabel), '1');
    await user.click(within(dialog).getByRole('button', { name: rateFormCopy.submit }));
    expect(await within(dialog).findByText(tooBig)).toBeInTheDocument();
    expect(within(dialog).getByLabelText(rateLabel)).toHaveAttribute('aria-invalid', 'true');
  });

  it('un 409 (ya hay tasa ese día) se enseña arriba del modal con el texto de la API', async () => {
    mockedGet.mockResolvedValue(MANUAL);
    mockedList.mockResolvedValue([]);
    const conflict = 'Ya hay una tasa registrada para esa moneda en ese día. Por ahora no se puede cambiar.';
    mockedRegister.mockRejectedValue(new ApiError(409, conflict));
    const user = setupUser();
    renderView();
    await user.click(await screen.findByRole('button', { name: copy.register }));
    const dialog = await screen.findByRole('dialog', { name: rateFormCopy.title });
    const select = within(dialog).getByLabelText(rateFormCopy.currency);
    await waitFor(() => expect(within(select).getByRole('option', { name: /Bolívar/ })).toBeInTheDocument());
    await user.selectOptions(select, 'VES');
    await user.type(within(dialog).getByLabelText(rateLabel), '40');
    await user.click(within(dialog).getByRole('button', { name: rateFormCopy.submit }));
    expect(await within(dialog).findByText(conflict)).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: rateFormCopy.title })).toBeInTheDocument();
  });

  it('ningún texto de la pantalla nombra un país ni un banco central', () => {
    const texts = JSON.stringify({
      exchangeRateCopy,
      rateFormCopy,
      RATE_INPUT_COPY,
      fns: [copy.ratesHint('USD'), copy.colRate('USD'), rateFormCopy.rateHint('USD'), copy.manualSince('30/10/2026')],
    });
    expect(texts).not.toMatch(/venezuela|colombia|españa|méxico|banco central|bcv|estadounidense/i);
  });
});
