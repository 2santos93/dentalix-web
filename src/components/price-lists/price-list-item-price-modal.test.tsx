import { render, screen, waitFor, within } from '@testing-library/react';
import { PriceListItemPriceModal } from './price-list-item-price-modal';
import { replacePriceListItems, type PriceListItemRow } from '@/lib/price-lists/price-lists-api';
import { setupUser } from '@/lib/test/user';

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
    mockedReplace.mockResolvedValue({ upserted: 1, removed: 0 });
  });

  it('nombra el procedimiento y su precio de catálogo', () => {
    const { dialog } = setup();
    expect(within(dialog).getByText(/Profilaxis\. Precio de catálogo: .*80\.000/)).toBeInTheDocument();
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
