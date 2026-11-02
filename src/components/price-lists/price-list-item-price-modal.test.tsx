import { render, screen, waitFor, within } from '@testing-library/react';
import { PriceListItemPriceModal } from './price-list-item-price-modal';
import { replacePriceListItems, type PriceListItemRow } from '@/lib/price-lists/price-lists-api';
import { setupUser } from '@/lib/test/user';
import { listLocations } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../../lib/price-lists/price-lists-api', () => ({
  ...jest.requireActual('../../lib/price-lists/price-lists-api'),
  replacePriceListItems: jest.fn(),
}));
const mockedReplace = replacePriceListItems as jest.MockedFunction<typeof replacePriceListItems>;

const row: PriceListItemRow = {
  catalogItemId: 'c-1',
  code: 'PROF',
  labelEs: 'Profilaxis',
  category: null,
  defaultPrice: 80000,
  price: null,
};

function setup(overrides: Partial<PriceListItemRow> = {}, currency = 'COP') {
  const onSaved = jest.fn();
  const onOpenChange = jest.fn();
  render(
    <PriceListItemPriceModal
      open
      onOpenChange={onOpenChange}
      token="tok"
      priceListId="pl-1"
      currency={currency}
      row={{ ...row, ...overrides }}
      onSaved={onSaved}
    />,
  );
  return { onSaved, onOpenChange, dialog: screen.getByRole('dialog') };
}

describe('PriceListItemPriceModal (DX-105)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (listLocations as jest.Mock).mockResolvedValue([clinicLocation({ locale: 'es-CO' })]);
    mockedReplace.mockResolvedValue({ upserted: 1, removed: 0 });
  });

  it('nombra el procedimiento y su precio de catálogo, con el código y el formato de la sede (DX-522)', async () => {
    const { dialog } = setup();
    expect(await within(dialog).findByText(/Profilaxis\. Precio de catálogo: COP\s80\.000,00/)).toBeInTheDocument();
  });

  it.each([
    ['es-VE', 'VES', /Precio de catálogo: VES\s80\.000,00/],
    ['en-US', 'USD', /Precio de catálogo: USD\s80,000\.00/],
    ['de-DE', 'EUR', /Precio de catálogo: 80\.000,00\sEUR/],
  ])('con la sede %s pinta el catálogo en %s con su formato', async (locale, currency, expected) => {
    (listLocations as jest.Mock).mockResolvedValue([clinicLocation({ locale, currency })]);
    const { dialog } = setup({}, currency);
    expect(await within(dialog).findByText(expected)).toBeInTheDocument();
  });

  it('mientras la sede no tiene formato pinta «—», nunca otro formato', () => {
    (listLocations as jest.Mock).mockReturnValue(new Promise(() => {}));
    const { dialog } = setup();
    expect(within(dialog).getByText(/Precio de catálogo: —/)).toBeInTheDocument();
  });

  it('sin precio de catálogo lo dice', () => {
    const { dialog } = setup({ defaultPrice: null });
    expect(within(dialog).getByText(/Precio de catálogo: sin precio\./)).toBeInTheDocument();
  });

  it('guarda UNA fila con el importe leído en la moneda de la lista', async () => {
    const user = setupUser();
    const { dialog, onSaved, onOpenChange } = setup({}, 'EUR');
    await user.type(within(dialog).getByLabelText('Precio de lista'), '75,5');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedReplace).toHaveBeenCalledWith('tok', 'pl-1', [{ catalogItemId: 'c-1', price: 75.5 }]),
    );
    expect(onSaved).toHaveBeenCalledWith('c-1', 75.5);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('un importe ilegible no se envía', async () => {
    const user = setupUser();
    const { dialog } = setup();
    await user.type(within(dialog).getByLabelText('Precio de lista'), 'abc');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByRole('alert')).toBeInTheDocument();
    expect(mockedReplace).not.toHaveBeenCalled();
  });
});
