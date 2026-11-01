import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CurrencyTextsForm } from './currency-texts-form';
import { getCurrencyTexts, saveCurrencyTexts } from '@/lib/exchange/currency-texts-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { clinicCurrencyTexts, setClinicCurrencyTexts } from '@/lib/format/clinic-currency-texts';
import { ApiError } from '@/lib/api/api-error';

const refresh = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
jest.mock('../../lib/exchange/currency-texts-api', () => ({
  ...jest.requireActual('../../lib/exchange/currency-texts-api'),
  getCurrencyTexts: jest.fn(),
  saveCurrencyTexts: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  ...jest.requireActual('../../lib/reference/currencies-api'),
  listCurrencies: jest.fn(),
}));
const mockedGet = jest.mocked(getCurrencyTexts);
const mockedSave = jest.mocked(saveCurrencyTexts);

// Datos de la prueba: una sede en VES con formato es-VE y otra en EUR (de-DE).
const SEDES = [
  { id: 'l1', name: 'Sede Centro', currency: 'VES', locale: 'es-VE', hourCycle: 'h12', isActive: true },
  { id: 'l2', name: 'Sede Berlín', currency: 'EUR', locale: 'de-DE', hourCycle: 'h23', isActive: true },
] as unknown as ClinicLocation[];

const bar = () => screen.queryByRole('region', { name: 'Cambios sin guardar' });

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(listLocations).mockResolvedValue(SEDES);
  jest.mocked(listCurrencies).mockResolvedValue([
    { code: 'EUR', name: 'Euro', symbol: '€' },
    { code: 'USD', name: 'Dólar estadounidense', symbol: '$' },
    { code: 'VES', name: 'Bolívar venezolano', symbol: 'Bs.S' },
  ]);
});
afterEach(() => setClinicCurrencyTexts({}));

describe('Ajustes › Monedas (DX-517)', () => {
  it('sin configurar: una fila por moneda de las sedes, vacía, con el código de ejemplo y sin barra', async () => {
    mockedGet.mockResolvedValue({ entries: [] });
    render(<CurrencyTextsForm token="tok" allowed />);
    const ves = await screen.findByRole('textbox', { name: 'Texto de VES' });
    expect(ves).toHaveValue('');
    expect(ves).toHaveAttribute('placeholder', 'VES');
    expect(screen.getByText('Moneda de Sede Centro.')).toBeInTheDocument();
    expect(screen.getByText('Así se verá: VES 1.234,50')).toBeInTheDocument();
    expect(screen.getByText('Así se verá: 1.234,50 EUR')).toBeInTheDocument();
    expect(bar()).not.toBeInTheDocument();
  });

  it('escribir «Bs.» lo previsualiza con el formato de la sede y guardar lo aplica a toda la pestaña', async () => {
    mockedGet.mockResolvedValue({ entries: [] });
    mockedSave.mockResolvedValue({ entries: [{ currency: 'VES', text: 'Bs.' }] });
    const user = userEvent.setup();
    render(<CurrencyTextsForm token="tok" allowed />);
    await user.type(await screen.findByRole('textbox', { name: 'Texto de VES' }), ' Bs. ');
    expect(screen.getByText('Así se verá: Bs. 1.234,50')).toBeInTheDocument();
    expect(bar()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar el texto de las monedas' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', [{ currency: 'VES', text: 'Bs.' }]));
    await waitFor(() => expect(bar()).not.toBeInTheDocument());
    expect(clinicCurrencyTexts()).toEqual({ VES: 'Bs.' });
    expect(refresh).toHaveBeenCalled();
  });

  it('un texto de más de 8 caracteres no se manda: el campo dice por qué', async () => {
    mockedGet.mockResolvedValue({ entries: [] });
    const user = userEvent.setup();
    render(<CurrencyTextsForm token="tok" allowed />);
    const ves = await screen.findByRole('textbox', { name: 'Texto de VES' });
    await user.type(ves, 'Bolívares');
    await user.click(screen.getByRole('button', { name: 'Guardar el texto de las monedas' }));
    expect(await screen.findByText('De 1 a 8 caracteres, en una línea.')).toBeInTheDocument();
    expect(ves).toHaveAttribute('aria-invalid', 'true');
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('el 400 de la API va al campo de su moneda', async () => {
    mockedGet.mockResolvedValue({ entries: [] });
    mockedSave.mockRejectedValue(new ApiError(400, 'El texto de VES admite de 1 a 8 caracteres en una línea.'));
    const user = userEvent.setup();
    render(<CurrencyTextsForm token="tok" allowed />);
    await user.type(await screen.findByRole('textbox', { name: 'Texto de VES' }), 'Bs.');
    await user.click(screen.getByRole('button', { name: 'Guardar el texto de las monedas' }));
    expect(await screen.findByText('El texto de VES admite de 1 a 8 caracteres en una línea.')).toBeInTheDocument();
  });

  it('otra moneda se añade como fila; vaciar un texto guardado lo quita', async () => {
    mockedGet.mockResolvedValue({ entries: [{ currency: 'EUR', text: '€' }] });
    mockedSave.mockResolvedValue({ entries: [{ currency: 'USD', text: 'US$' }] });
    const user = userEvent.setup();
    render(<CurrencyTextsForm token="tok" allowed />);
    expect(await screen.findByRole('textbox', { name: 'Texto de EUR' })).toHaveValue('€');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Otra moneda' }), 'USD');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    await user.type(screen.getByRole('textbox', { name: 'Texto de USD' }), 'US$');
    expect(screen.getByText('Añadida aquí.')).toBeInTheDocument();
    await user.clear(screen.getByRole('textbox', { name: 'Texto de EUR' }));
    await user.click(screen.getByRole('button', { name: 'Guardar el texto de las monedas' }));
    await waitFor(() => expect(mockedSave).toHaveBeenCalledWith('tok', [{ currency: 'USD', text: 'US$' }]));
  });

  it('sin permiso: estado bloqueado, sin llamar a la API', () => {
    render(<CurrencyTextsForm token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración cambia cómo se escribe cada moneda.')).toBeInTheDocument();
    expect(mockedGet).not.toHaveBeenCalled();
  });
});
