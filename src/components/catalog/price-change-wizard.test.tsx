import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { ApiError } from '@/lib/api/api-error';
import { STAMP_SEDES, testStamp } from '@/lib/test/stamp';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import {
  applyCatalogPriceChange,
  previewCatalogPriceChange,
  type CatalogPriceChangePreview,
} from '@/lib/catalog/price-changes-api';
import { PriceChangeWizard } from './price-change-wizard';

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
jest.mock('../../lib/odontogram/catalog-api', () => ({
  ...jest.requireActual('../../lib/odontogram/catalog-api'),
  listCatalogItems: jest.fn(),
}));
jest.mock('../../lib/catalog/price-changes-api', () => ({
  ...jest.requireActual('../../lib/catalog/price-changes-api'),
  previewCatalogPriceChange: jest.fn(),
  applyCatalogPriceChange: jest.fn(),
}));

const mockedItems = jest.mocked(listCatalogItems);
const mockedPreview = jest.mocked(previewCatalogPriceChange);
const mockedApply = jest.mocked(applyCatalogPriceChange);

function catalogItem(id: string, category: string | null): DentalCatalogItem {
  return {
    id,
    tenantId: 't1',
    code: id.toUpperCase(),
    category,
    kind: 'PROCEDURE',
    labelEs: `Prestación ${id}`,
    labelEn: null,
    labelPt: null,
    color: '#0E7490',
    defaultPrice: 100,
    active: true,
    createdAt: '2026-10-01T00:00:00.000Z',
    updatedAt: '2026-10-01T00:00:00.000Z',
  };
}

const HASH = 'a'.repeat(64);

const PREVIEW: CatalogPriceChangePreview = {
  currency: 'VES',
  previewHash: HASH,
  lines: [
    {
      itemId: 'i1',
      code: 'PRE-01',
      labelEs: 'Profilaxis',
      category: 'Prevención',
      kind: 'PROCEDURE',
      active: true,
      before: 1840,
      after: 1900,
      difference: 60,
    },
    {
      itemId: 'i2',
      code: 'PRE-02',
      labelEs: 'Sellante',
      category: 'Prevención',
      kind: 'PROCEDURE',
      active: true,
      before: 2000,
      after: 2100,
      difference: 100,
    },
  ],
  skipped: [
    {
      itemId: 'i3',
      code: 'PRE-03',
      labelEs: 'Flúor',
      category: 'Prevención',
      kind: 'PROCEDURE',
      active: true,
      before: null,
      reason: 'NO_PRICE',
    },
  ],
  totals: { before: 3840, after: 4000, difference: 160 },
};

function setup(overrides: Partial<React.ComponentProps<typeof PriceChangeWizard>> = {}) {
  const onApplied = jest.fn();
  const onOpenChange = jest.fn();
  const user = userEvent.setup({ pointerEventsCheck: 0 });
  render(
    <PriceChangeWizard
      open
      onOpenChange={onOpenChange}
      token="tok"
      currency="VES"
      stamp={testStamp([STAMP_SEDES.caracas])}
      onApplied={onApplied}
      {...overrides}
    />,
  );
  return { user, onApplied, onOpenChange };
}

async function fillFivePercentPrevencion(user: ReturnType<typeof userEvent.setup>) {
  const category = await screen.findByRole('combobox', { name: 'Categoría' });
  await user.selectOptions(category, 'Prevención');
  await user.type(screen.getByLabelText('Porcentaje (%)'), '5');
  await user.selectOptions(screen.getByRole('combobox', { name: 'Redondeo' }), '100');
  await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
}

describe('PriceChangeWizard (DX-205)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedItems.mockResolvedValue([
      catalogItem('i1', 'Prevención'),
      catalogItem('i2', ' prevención'),
      catalogItem('i4', 'Cirugía'),
      catalogItem('i5', null),
    ]);
  });

  it('ofrece las categorías del catálogo sin repetir y manda +5 % redondeado a 100', async () => {
    mockedPreview.mockResolvedValue(PREVIEW);
    const { user } = setup();
    const category = await screen.findByRole('combobox', { name: 'Categoría' });
    expect(within(category).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Todas las categorías',
      'Cirugía',
      'Prevención',
    ]);
    await fillFivePercentPrevencion(user);
    await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(1));
    expect(mockedPreview).toHaveBeenCalledWith('tok', {
      category: 'Prevención',
      activeOnly: true,
      mode: 'PERCENT',
      value: 5,
      roundTo: 100,
    });
  });

  it('una bajada manda el valor negativo y no ofrece la subida mínima', async () => {
    mockedPreview.mockResolvedValue(PREVIEW);
    const { user } = setup();
    await screen.findByRole('combobox', { name: 'Categoría' });
    expect(screen.getByLabelText('Subida mínima')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Bajar' }));
    expect(screen.queryByLabelText('Subida mínima')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('Porcentaje (%)'), '10');
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    await waitFor(() => expect(mockedPreview).toHaveBeenCalled());
    expect(mockedPreview.mock.calls[0][1]).toMatchObject({ mode: 'PERCENT', value: -10 });
  });

  it('sin valor no pide la vista previa y lo dice junto al campo', async () => {
    const { user } = setup();
    await screen.findByRole('combobox', { name: 'Categoría' });
    await user.click(screen.getByRole('button', { name: 'Ver vista previa' }));
    expect(await screen.findByText('Escribe cuánto cambia el precio.')).toBeInTheDocument();
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  it('muestra la carga, luego anterior / nuevo / diferencia, los omitidos y los totales', async () => {
    let resolve: (value: CatalogPriceChangePreview) => void = () => undefined;
    mockedPreview.mockReturnValue(new Promise((r) => (resolve = r)));
    const { user } = setup();
    await fillFivePercentPrevencion(user);
    expect(await screen.findByTestId('price-change-loading')).toBeInTheDocument();
    resolve(PREVIEW);
    const table = await screen.findByRole('table', { name: 'Precios que cambian' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Profilaxis');
    expect(rows[1]).toHaveTextContent('Sube');
    expect(screen.getByText('No tiene precio por defecto.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Totales' })).toHaveTextContent('Total nuevo');
  });

  it('estado vacío: ningún ítem cumple el filtro y se puede volver a los filtros', async () => {
    mockedPreview.mockResolvedValue({ ...PREVIEW, lines: [], skipped: [], totals: { before: 0, after: 0, difference: 0 } });
    const { user } = setup();
    await fillFivePercentPrevencion(user);
    expect(await screen.findByText('Ningún ítem cumple el filtro')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Continuar' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cambiar los filtros' }));
    expect(await screen.findByRole('combobox', { name: 'Categoría' })).toBeInTheDocument();
  });

  it('estado de error: la vista previa que falla se reintenta', async () => {
    mockedPreview.mockRejectedValueOnce(new ApiError(500, 'Fallo')).mockResolvedValueOnce(PREVIEW);
    const { user } = setup();
    await fillFivePercentPrevencion(user);
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: 'Precios que cambian' })).toBeInTheDocument();
    expect(mockedPreview).toHaveBeenCalledTimes(2);
  });

  it('confirma y aplica con la huella y una Idempotency-Key estable entre reintentos', async () => {
    mockedPreview.mockResolvedValue(PREVIEW);
    mockedApply
      .mockRejectedValueOnce(new ApiError(503, 'No disponible'))
      .mockResolvedValueOnce({
        batchId: 'b1',
        appliedAt: '2027-01-05T12:00:00.000Z',
        replayed: false,
        currency: 'VES',
        itemCount: 2,
        totals: { before: 3840, after: 4000, difference: 160 },
      });
    const { user, onApplied, onOpenChange } = setup();
    await fillFivePercentPrevencion(user);
    await screen.findByRole('table', { name: 'Precios que cambian' });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(await screen.findByText(/Los ítems que se agreguen desde ahora/)).toBeInTheDocument();
    const submit = screen.getByRole('button', { name: 'Aplicar 2 precios' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await screen.findByText('No pudimos aplicar los precios. Intenta de nuevo.');
    await user.click(screen.getByRole('button', { name: 'Aplicar 2 precios' }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(mockedApply).toHaveBeenCalledTimes(2);
    const [firstCall, secondCall] = mockedApply.mock.calls;
    expect(firstCall[1]).toMatchObject({ category: 'Prevención', value: 5, roundTo: 100, previewHash: HASH });
    expect(firstCall[2]).toMatch(/^[0-9a-f-]{36}$/);
    expect(secondCall[2]).toBe(firstCall[2]);
    expect(toast.success).toHaveBeenCalledWith('2 precios actualizados');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('una vista previa vieja (409) no se reaplica: ofrece volver a calcularla', async () => {
    mockedPreview.mockResolvedValue(PREVIEW);
    mockedApply.mockRejectedValueOnce(
      new ApiError(409, 'Los precios del catálogo cambiaron desde la vista previa.', {
        code: 'PRICE_CHANGE_PREVIEW_STALE',
      }),
    );
    const { user } = setup();
    await fillFivePercentPrevencion(user);
    await screen.findByRole('table', { name: 'Precios que cambian' });
    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    const submit = screen.getByRole('button', { name: 'Aplicar 2 precios' });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await screen.findByRole('button', { name: 'Ver la vista previa de nuevo' });
    expect(screen.getByRole('button', { name: 'Aplicar 2 precios' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Ver la vista previa de nuevo' }));
    await waitFor(() => expect(mockedPreview).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('table', { name: 'Precios que cambian' })).toBeInTheDocument();
  });

  it('las categorías que no cargan no rompen el paso: se reintentan en su campo', async () => {
    mockedItems.mockRejectedValueOnce(new Error('red'));
    const { user } = setup();
    const retry = await screen.findByRole('button', { name: /Reintentar/ });
    await user.click(retry);
    expect(await screen.findByRole('combobox', { name: 'Categoría' })).toBeInTheDocument();
  });
});
