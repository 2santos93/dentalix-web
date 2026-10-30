import { render, screen, waitFor, within } from '@testing-library/react';
import { ExchangeRateSettingsView, correctRateCopy, exchangeRateCopy, rateFormCopy } from './exchange-rate-settings';
import {
  getExchangeRateSettings,
  listManualExchangeRates,
  correctManualExchangeRate,
  RATE_INPUT_COPY,
  registerManualExchangeRate,
  saveExchangeRateSettings,
  type ManualExchangeRate,
} from '@/lib/exchange/exchange-settings-api';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { getRateBacklogDay } from '@/lib/payments/rate-backlog-api';
import { ApiError } from '@/lib/api/api-error';
import { regionalFormat } from '@/lib/format/regional-format';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/exchange/exchange-settings-api', () => ({
  ...jest.requireActual('../../lib/exchange/exchange-settings-api'),
  getExchangeRateSettings: jest.fn(),
  saveExchangeRateSettings: jest.fn(),
  listManualExchangeRates: jest.fn(),
  registerManualExchangeRate: jest.fn(),
  correctManualExchangeRate: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({ listCurrencies: jest.fn() }));
jest.mock('../../lib/payments/rate-backlog-api', () => ({
  ...jest.requireActual('../../lib/payments/rate-backlog-api'),
  getRateBacklogDay: jest.fn(),
}));
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
const mockedCorrect = jest.mocked(correctManualExchangeRate);
const mockedCurrencies = jest.mocked(listCurrencies);
const mockedDay = jest.mocked(getRateBacklogDay);
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
  inUse: false,
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
    const conflict = 'Ya hay una tasa registrada para esa moneda en ese día. Si ningún abono la usó, corrígela en la lista.';
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

  // DX-375: una tasa que ningún abono usó se corrige; una usada lo dice y no
  // ofrece corregirla (la API respondería 409).
  it('una tasa usada por abonos lo dice y no se puede corregir; una sin usar sí', async () => {
    mockedGet.mockResolvedValue(MANUAL);
    const eur: ManualExchangeRate = {
      ...ves,
      id: 'r-eur',
      currency: 'EUR',
      rate: 0.91,
      inUse: true,
    };
    mockedList.mockResolvedValue([eur, ves]);
    renderView();
    const table = await screen.findByRole('table', { name: copy.ratesHeading });
    const [, eurRow, vesRow] = within(table).getAllByRole('row');
    expect(eurRow).toHaveTextContent(copy.inUse);
    expect(within(eurRow).queryByRole('button')).not.toBeInTheDocument();
    expect(
      within(vesRow).getByRole('button', {
        name: copy.correctFor('VES', fmt.civilDate('2026-10-29')),
      }),
    ).toBeInTheDocument();
  });

  it('corrige una tasa sin usar en un modal con el día y la moneda fijos', async () => {
    mockedGet.mockResolvedValue(MANUAL);
    mockedList.mockResolvedValue([ves]);
    mockedCorrect.mockResolvedValue({ ...ves, rate: 36.75 });
    const user = setupUser();
    renderView();
    await user.click(
      await screen.findByRole('button', {
        name: copy.correctFor('VES', fmt.civilDate('2026-10-29')),
      }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: correctRateCopy.title('VES', fmt.civilDate('2026-10-29')),
    });
    const input = within(dialog).getByLabelText(rateLabel);
    await user.clear(input);
    await user.type(input, '36,75');
    await user.click(within(dialog).getByRole('button', { name: correctRateCopy.submit }));
    await waitFor(() => expect(mockedCorrect).toHaveBeenCalledWith('tok', 'r-ves', 36.75));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const table = screen.getByRole('table', { name: copy.ratesHeading });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(fmt.number(36.75, { min: 0, max: 8 }));
    expect(screen.getByText(copy.rateCorrected('VES'))).toBeInTheDocument();
  });

  it('si un abono la usó entretanto, el 409 se enseña arriba del modal', async () => {
    mockedGet.mockResolvedValue(MANUAL);
    mockedList.mockResolvedValue([ves]);
    const inUse =
      'Esta tasa ya la usa al menos un abono y no se puede cambiar: el saldo de esos abonos se calculó con ella.';
    mockedCorrect.mockRejectedValue(new ApiError(409, inUse));
    const user = setupUser();
    renderView();
    await user.click(
      await screen.findByRole('button', {
        name: copy.correctFor('VES', fmt.civilDate('2026-10-29')),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText(rateLabel));
    await user.type(within(dialog).getByLabelText(rateLabel), '37');
    await user.click(within(dialog).getByRole('button', { name: correctRateCopy.submit }));
    expect(await within(dialog).findByText(inUse)).toBeInTheDocument();
  });

  // Revisión DX-375: tras el 409 la lista deja de ofrecer «Corregir» en esa
  // fila (al cerrar el modal no se puede volver a intentar en vano).
  it('tras el 409 «en uso», la fila pasa a «Usada en abonos»', async () => {
    mockedGet.mockResolvedValue(MANUAL);
    mockedList.mockResolvedValue([ves]);
    const inUse = 'Esta tasa ya la usa al menos un abono y no se puede cambiar.';
    mockedCorrect.mockRejectedValue(new ApiError(409, inUse, { code: 'MANUAL_EXCHANGE_RATE_IN_USE' }));
    const user = setupUser();
    renderView();
    await user.click(
      await screen.findByRole('button', {
        name: copy.correctFor('VES', fmt.civilDate('2026-10-29')),
      }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.clear(within(dialog).getByLabelText(rateLabel));
    await user.type(within(dialog).getByLabelText(rateLabel), '37');
    await user.click(within(dialog).getByRole('button', { name: correctRateCopy.submit }));
    expect(await within(dialog).findByText(inUse)).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const table = screen.getByRole('table', { name: copy.ratesHeading });
    const row = within(table).getAllByRole('row')[1];
    expect(row).toHaveTextContent(copy.inUse);
    expect(within(row).queryByRole('button')).not.toBeInTheDocument();
  });

  it('ningún texto de la pantalla nombra un país ni un banco central', () => {
    const backup = rateFormCopy.backup;
    const texts = JSON.stringify({
      exchangeRateCopy,
      rateFormCopy,
      RATE_INPUT_COPY,
      correctRateCopy,
      fns: [
        copy.ratesHint('USD'),
        copy.colRate('USD'),
        rateFormCopy.rateHint('USD'),
        copy.manualSince('30/10/2026'),
        backup.heading('30/10/2026'),
        backup.applies(1, 'VES'),
        backup.applies(3, 'VES'),
        backup.none('VES'),
        backup.otherMissing(1, ['EUR']),
        backup.otherMissing(2, ['EUR', 'COP']),
        backup.onlyOther(1, 'VES', ['EUR']),
        backup.onlyOther(2, 'VES', ['EUR']),
      ],
    });
    expect(texts).not.toMatch(/venezuela|colombia|españa|méxico|banco central|bcv|estadounidense/i);
  });
});

// DX-402: la tasa manual de un día anterior a «manual desde» sirve de respaldo
// a los abonos de ese día que siguen sin tasa. El formulario lo dice, con
// cuántos abonos la tomarán, o avisa de que no se usará.
describe('Registrar una tasa de un día anterior a «manual desde» (DX-402)', () => {
  const backup = rateFormCopy.backup;
  const SINCE = fmt.civilDate('2026-10-30');
  const NO_OTHER = { count: 0, currencies: [] };

  async function openForm(settings: typeof MANUAL | typeof AUTO = MANUAL) {
    mockedGet.mockResolvedValue(settings);
    mockedList.mockResolvedValue([]);
    const user = setupUser();
    renderView();
    await user.click(await screen.findByRole('button', { name: copy.register }));
    const dialog = await screen.findByRole('dialog', { name: rateFormCopy.title });
    const select = within(dialog).getByLabelText(rateFormCopy.currency);
    await waitFor(() => expect(within(select).getByRole('option', { name: /Bolívar/ })).toBeInTheDocument());
    const date = within(dialog).getByLabelText(rateFormCopy.date);
    return { user, dialog, select, date };
  }

  it('el día de inicio o posterior no lleva aviso ni pide nada', async () => {
    const { user, dialog, select } = await openForm();
    await user.selectOptions(select, 'VES');
    expect(within(dialog).queryByText(backup.heading(SINCE))).not.toBeInTheDocument();
    expect(mockedDay).not.toHaveBeenCalled();
  });

  it('con un día anterior y sin moneda explica la regla y pide la moneda', async () => {
    const { user, dialog, date } = await openForm();
    await user.clear(date);
    await user.type(date, '2026-10-28');
    const notice = within(dialog).getByTestId('manual-rate-backup-notice');
    expect(notice).toHaveTextContent(backup.heading(SINCE));
    expect(notice).toHaveTextContent(backup.pickCurrency);
    expect(mockedDay).not.toHaveBeenCalled();
  });

  it('dice a cuántos abonos sin tasa de ese día se aplicará', async () => {
    mockedDay.mockResolvedValue({ date: '2026-10-28', currency: 'VES', count: 2, providerRateSaved: false, otherRatesMissing: NO_OTHER });
    const { user, dialog, date, select } = await openForm();
    await user.clear(date);
    await user.type(date, '2026-10-28');
    await user.selectOptions(select, 'VES');
    const notice = within(dialog).getByTestId('manual-rate-backup-notice');
    expect(notice).toHaveAttribute('role', 'status');
    await waitFor(() => expect(notice).toHaveTextContent(backup.applies(2, 'VES')));
    expect(notice).toHaveTextContent(backup.heading(SINCE));
    expect(mockedDay).toHaveBeenLastCalledWith('tok', '2026-10-28', 'VES');
  });

  it('sin abonos pendientes ese día, avisa de que la tasa no se usará', async () => {
    mockedDay.mockResolvedValue({ date: '2026-10-28', currency: 'VES', count: 0, providerRateSaved: false, otherRatesMissing: NO_OTHER });
    const { user, dialog, date, select } = await openForm();
    await user.clear(date);
    await user.type(date, '2026-10-28');
    await user.selectOptions(select, 'VES');
    await waitFor(() =>
      expect(within(dialog).getByTestId('manual-rate-backup-notice')).toHaveTextContent(backup.none('VES')),
    );
  });

  it('entre dos monedas sin la otra tasa del día, dice cuál falta además de a cuántos se aplicará', async () => {
    mockedDay.mockResolvedValue({
      date: '2026-10-28',
      currency: 'VES',
      count: 1,
      providerRateSaved: false,
      otherRatesMissing: { count: 2, currencies: ['COP', 'EUR'] },
    });
    const { user, dialog, date, select } = await openForm();
    await user.clear(date);
    await user.type(date, '2026-10-28');
    await user.selectOptions(select, 'VES');
    const notice = within(dialog).getByTestId('manual-rate-backup-notice');
    await waitFor(() => expect(notice).toHaveTextContent(backup.applies(1, 'VES')));
    expect(notice).toHaveTextContent(backup.otherMissing(2, ['COP', 'EUR']));
  });

  it('si todos sus abonos necesitan además otra tasa, avisa de que no se usará hasta registrarla', async () => {
    mockedDay.mockResolvedValue({
      date: '2026-10-28',
      currency: 'VES',
      count: 0,
      providerRateSaved: false,
      otherRatesMissing: { count: 1, currencies: ['EUR'] },
    });
    const { user, dialog, date, select } = await openForm();
    await user.clear(date);
    await user.type(date, '2026-10-28');
    await user.selectOptions(select, 'VES');
    const notice = within(dialog).getByTestId('manual-rate-backup-notice');
    await waitFor(() => expect(notice).toHaveTextContent(backup.onlyOther(1, 'VES', ['EUR'])));
    expect(notice).not.toHaveTextContent(backup.none('VES'));
  });

  it('si el proveedor ya tiene la tasa de ese día, avisa de que no se usará', async () => {
    mockedDay.mockResolvedValue({ date: '2026-10-28', currency: 'VES', count: 1, providerRateSaved: true, otherRatesMissing: NO_OTHER });
    const { user, dialog, date, select } = await openForm();
    await user.clear(date);
    await user.type(date, '2026-10-28');
    await user.selectOptions(select, 'VES');
    await waitFor(() =>
      expect(within(dialog).getByTestId('manual-rate-backup-notice')).toHaveTextContent(backup.provider),
    );
  });

  it('si no se puede comprobar, explica la regla sin prometer nada', async () => {
    mockedDay.mockRejectedValue(new ApiError(500, 'boom'));
    const { user, dialog, date, select } = await openForm();
    await user.clear(date);
    await user.type(date, '2026-10-28');
    await user.selectOptions(select, 'VES');
    await waitFor(() =>
      expect(within(dialog).getByTestId('manual-rate-backup-notice')).toHaveTextContent(backup.unknown),
    );
  });

  it('con la fuente automática dice que la tasa no se usa y no pide nada', async () => {
    const { user, dialog, date, select } = await openForm(AUTO);
    await user.clear(date);
    await user.type(date, '2026-10-28');
    await user.selectOptions(select, 'VES');
    expect(within(dialog).getByText(rateFormCopy.automaticNote)).toBeInTheDocument();
    expect(mockedDay).not.toHaveBeenCalled();
  });

  it('los textos de la fuente no prometen que la fuente nueva resuelva todo abono sin tasa', () => {
    expect(copy.sourceDialogDescription).not.toMatch(/la toman de la fuente nueva/);
    expect(copy.sourceDialogDescription).toMatch(/respaldo/);
    expect(copy.sourceHints.MANUAL).toMatch(/respaldo/);
    expect(copy.ratesHint('USD')).toMatch(/respaldo/);
  });
});
