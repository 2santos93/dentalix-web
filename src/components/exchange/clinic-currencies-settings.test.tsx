import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { clearSessionStore } from '@/lib/session/session-store';
import { saveClinicCurrencies, type ExchangeRateSettings } from '@/lib/exchange/exchange-settings-api';
import { ApiError } from '@/lib/api/client';
import { ClinicCurrenciesSettings, clinicCurrenciesCopy as copy } from './clinic-currencies-settings';

jest.mock('../../lib/exchange/exchange-settings-api', () => ({
  ...jest.requireActual('../../lib/exchange/exchange-settings-api'),
  saveClinicCurrencies: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
    { code: 'VES', name: 'Bolívar', symbol: 'Bs.' },
  ]),
}));
const mockedSave = jest.mocked(saveClinicCurrencies);

const BASE: ExchangeRateSettings = {
  source: 'AUTOMATIC',
  manualSince: null,
  manualRateMaxAgeDays: 3,
  baseCurrency: 'USD',
  acceptedCurrencies: [],
  rateReferenceCurrency: null,
  showRateInHeader: null,
};

beforeEach(() => {
  clearSessionStore();
  mockedSave.mockReset();
  // La sede cobra en USD: VES no es de ninguna sede.
  jest.mocked(listLocations).mockResolvedValue([clinicLocation({ currency: 'USD' })]);
});

function renderSection(settings: ExchangeRateSettings = BASE) {
  const onSaved = jest.fn();
  render(<ClinicCurrenciesSettings token="tok" settings={settings} onSaved={onSaved} />);
  return { onSaved, user: userEvent.setup() };
}

describe('ClinicCurrenciesSettings (DX-584)', () => {
  it('una clínica nueva: cualquier moneda, la de la sede activa y automático, por defecto', () => {
    renderSection();
    const region = screen.getByRole('region', { name: copy.heading });
    expect(within(region).getByTestId('clinic-accepted-currencies')).toHaveTextContent(copy.accepted.any);
    expect(within(region).getByTestId('clinic-rate-reference')).toHaveTextContent(copy.reference.sede);
    expect(within(region).getByTestId('clinic-show-rate')).toHaveTextContent('Automático');
    expect(within(region).getAllByText('Por defecto')).toHaveLength(3);
  });

  it('añade USD y VES, sube VES y guarda la lista en ese orden', async () => {
    const { user, onSaved } = renderSection();
    const saved = { ...BASE, acceptedCurrencies: ['VES', 'USD'] };
    mockedSave.mockResolvedValue(saved);
    await user.click(screen.getByRole('button', { name: copy.accepted.changeLabel }));
    const dialog = await screen.findByRole('dialog', { name: copy.accepted.dialogTitle });
    expect(within(dialog).getByText(copy.accepted.none)).toBeInTheDocument();
    const add = within(dialog).getByLabelText(copy.accepted.addField);
    await within(add).findByRole('option', { name: 'Bolívar (Bs.)' });
    await user.selectOptions(add, 'USD');
    await user.click(within(dialog).getByRole('button', { name: copy.accepted.add }));
    await user.selectOptions(add, 'VES');
    await user.click(within(dialog).getByRole('button', { name: copy.accepted.add }));
    // Una moneda ya elegida no se vuelve a ofrecer.
    expect(within(add).queryByRole('option', { name: 'Bolívar (Bs.)' })).toBeNull();
    await user.click(within(dialog).getByRole('button', { name: copy.accepted.up('VES') }));
    const list = within(dialog).getByRole('list', { name: copy.accepted.listLabel });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent?.slice(0, 3)),
    ).toEqual(['VES', 'USD']);
    await user.click(within(dialog).getByRole('button', { name: copy.save }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', { acceptedCurrencies: ['VES', 'USD'] }));
    expect(onSaved).toHaveBeenCalledWith(saved);
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getByText(copy.accepted.saved)).toBeInTheDocument();
  });

  it('quitar la moneda de referencia (que no es de ninguna sede) avisa y la manda a null en el mismo cambio', async () => {
    const { user } = renderSection({ ...BASE, acceptedCurrencies: ['USD', 'VES'], rateReferenceCurrency: 'VES' });
    mockedSave.mockResolvedValue({ ...BASE, acceptedCurrencies: ['USD'] });
    await user.click(screen.getByRole('button', { name: copy.accepted.changeLabel }));
    const dialog = await screen.findByRole('dialog', { name: copy.accepted.dialogTitle });
    await user.click(within(dialog).getByRole('button', { name: copy.accepted.remove('VES') }));
    expect(await within(dialog).findByText(copy.accepted.referenceDropped('VES'))).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: copy.save }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', { acceptedCurrencies: ['USD'], rateReferenceCurrency: null }),
    );
  });

  it('el 400 de la API se queda en el modal, en español', async () => {
    const { user } = renderSection({ ...BASE, acceptedCurrencies: ['USD'] });
    mockedSave.mockRejectedValue(new ApiError(400, 'La clínica puede aceptar 8 monedas como mucho.', {}));
    await user.click(screen.getByRole('button', { name: copy.accepted.changeLabel }));
    const dialog = await screen.findByRole('dialog', { name: copy.accepted.dialogTitle });
    await user.click(within(dialog).getByRole('button', { name: copy.accepted.remove('USD') }));
    await user.click(within(dialog).getByRole('button', { name: copy.save }));
    expect(await within(dialog).findByText('La clínica puede aceptar 8 monedas como mucho.')).toBeInTheDocument();
  });

  it('moneda de referencia: ofrece las aceptadas y las de las sedes, y «La de la sede activa»', async () => {
    const { user } = renderSection({ ...BASE, acceptedCurrencies: ['EUR', 'VES'] });
    mockedSave.mockResolvedValue({ ...BASE, acceptedCurrencies: ['EUR', 'VES'], rateReferenceCurrency: 'VES' });
    await user.click(screen.getByRole('button', { name: copy.reference.changeLabel }));
    const dialog = await screen.findByRole('dialog', { name: copy.reference.dialogTitle });
    const select = within(dialog).getByLabelText(copy.reference.field) as HTMLSelectElement;
    await waitFor(() => expect(Array.from(select.options).map((o) => o.value)).toEqual(['', 'EUR', 'VES', 'USD']));
    await user.selectOptions(select, 'VES');
    await user.click(within(dialog).getByRole('button', { name: copy.save }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', { rateReferenceCurrency: 'VES' }));
  });

  it('«Mostrar la tasa en el menú»: Siempre = true, Nunca = false', async () => {
    const { user } = renderSection();
    mockedSave.mockResolvedValue({ ...BASE, showRateInHeader: false });
    await user.click(screen.getByRole('button', { name: copy.show.changeLabel }));
    const dialog = await screen.findByRole('dialog', { name: copy.show.dialogTitle });
    await user.click(within(dialog).getByRole('radio', { name: /Nunca/ }));
    await user.click(within(dialog).getByRole('button', { name: copy.save }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', { showRateInHeader: false }));
  });
});
