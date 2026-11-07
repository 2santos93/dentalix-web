import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CatalogCurrencySetting, catalogCurrencyCopy as copy } from './catalog-currency-setting';
import { getClinicSettings, updateClinicSettings, type ClinicSettings } from '@/lib/clinic/clinic-settings-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { ApiError } from '@/lib/api/api-error';
import { toast } from 'sonner';

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

jest.mock('../../lib/clinic/clinic-settings-api', () => ({
  ...jest.requireActual('../../lib/clinic/clinic-settings-api'),
  getClinicSettings: jest.fn(),
  updateClinicSettings: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  ...jest.requireActual('../../lib/reference/currencies-api'),
  listCurrencies: jest.fn(),
}));
const mockedGet = jest.mocked(getClinicSettings);
const mockedSave = jest.mocked(updateClinicSettings);

// Datos de la prueba: una clínica con una sede en USD y otra en VES (sin
// moneda común), y otra con dos sedes en VES.
const MIXED = [
  { id: 'l1', name: 'Sede Principal', currency: 'USD', isActive: true },
  { id: 'l2', name: 'Sede Caracas', currency: 'VES', isActive: true },
] as unknown as ClinicLocation[];
const ALL_VES = [
  { id: 'l1', name: 'Sede Centro', currency: 'VES', isActive: true },
  { id: 'l2', name: 'Sede Norte', currency: 'VES', isActive: true },
] as unknown as ClinicLocation[];

function settings(catalogCurrency: string | null): ClinicSettings {
  return {
    name: 'Clínica Sonrisas',
    legalName: null,
    taxId: null,
    taxIdLabel: null,
    fiscalAddress: null,
    contactEmail: null,
    contactPhone: null,
    primaryColor: '#0E7490',
    logoUrl: null,
    fiscalDataPending: true,
    catalogCurrency,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listLocations).mockResolvedValue(MIXED);
  jest.mocked(listCurrencies).mockResolvedValue([
    { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
    { code: 'VES', name: 'Bolívar venezolano', symbol: 'Bs.S' },
  ]);
});

describe('Ajustes › Monedas: moneda del catálogo (DX-502-bis)', () => {
  it('sin fijar y con sedes en monedas distintas: lo dice, con el chip «Por defecto» y sin cifra inventada', async () => {
    mockedGet.mockResolvedValue(settings(null));
    render(<CatalogCurrencySetting token="tok" />);
    const section = await screen.findByRole('region', { name: copy.heading });
    expect(within(section).getByText(copy.support)).toBeInTheDocument();
    expect(await within(section).findByTestId('catalog-currency')).toHaveTextContent(copy.unset);
    expect(within(section).getByText('Por defecto')).toBeInTheDocument();
    expect(within(section).getByText(copy.unsetMixed)).toBeInTheDocument();
  });

  it('sin fijar y con una moneda común: dice cuál se usa', async () => {
    jest.mocked(listLocations).mockResolvedValue(ALL_VES);
    mockedGet.mockResolvedValue(settings(null));
    render(<CatalogCurrencySetting token="tok" />);
    expect(await screen.findByText(copy.unsetCommon('VES'))).toBeInTheDocument();
  });

  it('fijada: enseña el código y el nombre, y que solo afecta a los ítems nuevos', async () => {
    mockedGet.mockResolvedValue(settings('USD'));
    render(<CatalogCurrencySetting token="tok" />);
    expect(await screen.findByTestId('catalog-currency')).toHaveTextContent('USD · Dólar estadounidense');
    expect(screen.queryByText('Por defecto')).not.toBeInTheDocument();
    expect(screen.getByText(copy.setHint)).toBeInTheDocument();
  });

  it('el ADMIN la fija en el diálogo: solo envía la moneda, avisa y explica que no toca lo ya creado', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(settings(null));
    mockedSave.mockResolvedValueOnce(settings('USD'));
    render(<CatalogCurrencySetting token="tok" />);
    await user.click(await screen.findByRole('button', { name: copy.change }));
    const dialog = await screen.findByRole('dialog', { name: copy.dialogTitle });
    expect(within(dialog).getByText(copy.dialogDescription)).toBeInTheDocument();
    // DX-513: avisa de que, en planes de otra moneda, no hay descuento frente al catálogo.
    expect(within(dialog).getByText(copy.discountNote)).toBeInTheDocument();
    // DX-513-bis (F1): el catálogo en otra moneda se convierte; ya no «deja de contar».
    expect(copy.discountNote).toBe(
      'En los planes en otra moneda, el precio de catálogo se convierte con la tasa del día al añadir cada ítem; una rebaja frente a él cuenta como descuento.',
    );
    const select = within(dialog).getByLabelText(copy.fieldLabel);
    expect(select).toHaveValue('');
    await user.selectOptions(select, 'USD');
    await user.click(within(dialog).getByRole('button', { name: copy.save }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', { catalogCurrency: 'USD' }));
    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(screen.getByTestId('catalog-currency')).toHaveTextContent('USD · Dólar estadounidense');
    expect(toast.success).toHaveBeenCalledWith(copy.saved);
  });

  it('mientras guarda, Escape no cierra el diálogo', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(settings(null));
    let resolve: (value: ClinicSettings) => void = () => undefined;
    mockedSave.mockReturnValueOnce(new Promise<ClinicSettings>((r) => (resolve = r)));
    render(<CatalogCurrencySetting token="tok" />);
    await user.click(await screen.findByRole('button', { name: copy.change }));
    const dialog = await screen.findByRole('dialog', { name: copy.dialogTitle });
    await user.selectOptions(within(dialog).getByLabelText(copy.fieldLabel), 'USD');
    await user.click(within(dialog).getByRole('button', { name: copy.save }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalled());
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: copy.dialogTitle })).toBeInTheDocument();
    resolve(settings('USD'));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('catalog-currency')).toHaveTextContent('USD · Dólar estadounidense');
  });

  it('«Sin fijar» la quita (null) y vuelve la regla de las sedes', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(settings('USD'));
    mockedSave.mockResolvedValueOnce(settings(null));
    render(<CatalogCurrencySetting token="tok" />);
    await user.click(await screen.findByRole('button', { name: copy.change }));
    const dialog = await screen.findByRole('dialog', { name: copy.dialogTitle });
    await user.selectOptions(within(dialog).getByLabelText(copy.fieldLabel), '');
    await user.click(within(dialog).getByRole('button', { name: copy.save }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', { catalogCurrency: null }));
    expect(await screen.findByText(copy.unsetMixed)).toBeInTheDocument();
  });

  it('un 400 de la API se queda en el diálogo con su mensaje y no cambia el valor', async () => {
    const user = userEvent.setup();
    const message = 'La moneda del catálogo debe ser una moneda admitida, con su código ISO 4217 de tres letras.';
    mockedGet.mockResolvedValue(settings(null));
    mockedSave.mockRejectedValueOnce(new ApiError(400, message));
    render(<CatalogCurrencySetting token="tok" />);
    await user.click(await screen.findByRole('button', { name: copy.change }));
    const dialog = await screen.findByRole('dialog', { name: copy.dialogTitle });
    await user.selectOptions(within(dialog).getByLabelText(copy.fieldLabel), 'VES');
    await user.click(within(dialog).getByRole('button', { name: copy.save }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(screen.getByTestId('catalog-currency')).toHaveTextContent(copy.unset);
  });

  it('si no carga, el error de sección con reintento', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'Internal server error')).mockResolvedValueOnce(settings('USD'));
    render(<CatalogCurrencySetting token="tok" />);
    expect(await screen.findByText(copy.loadError)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByTestId('catalog-currency')).toHaveTextContent('USD');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });
});
