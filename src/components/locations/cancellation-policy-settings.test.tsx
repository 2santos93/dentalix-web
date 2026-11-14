import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CancellationPolicySettings } from './cancellation-policy-settings';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import {
  createCancellationPolicyVersion,
  getCancellationPolicy,
  getReminderEmailPreview,
  type CancellationPolicyVersion,
} from '@/lib/cancellations/cancellation-policy-api';
import { listCurrencies } from '@/lib/reference/currencies-api';
import { ApiError } from '@/lib/api/client';
import { clinicLocation } from '@/lib/test/locations';
import { dateTimeIn, STAMP_FORMATS, STAMP_SEDES } from '@/lib/test/stamp';
import { moneyWithCode } from '@/lib/format/sede-number';

jest.mock('../../lib/locations/locations-api', () => ({
  ...jest.requireActual('../../lib/locations/locations-api'),
  listLocations: jest.fn(),
}));
jest.mock('../../lib/cancellations/cancellation-policy-api', () => ({
  ...jest.requireActual('../../lib/cancellations/cancellation-policy-api'),
  getCancellationPolicy: jest.fn(),
  createCancellationPolicyVersion: jest.fn(),
  getReminderEmailPreview: jest.fn(),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn(),
}));
jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));

const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedGet = getCancellationPolicy as jest.MockedFunction<typeof getCancellationPolicy>;
const mockedCreate = createCancellationPolicyVersion as jest.MockedFunction<
  typeof createCancellationPolicyVersion
>;
const mockedPreview = getReminderEmailPreview as jest.MockedFunction<typeof getReminderEmailPreview>;
const mockedCurrencies = listCurrencies as jest.MockedFunction<typeof listCurrencies>;

const SEDE: ClinicLocation = clinicLocation({
  id: 'loc-1',
  name: 'Sede principal',
  address: null,
  country: 'VE',
  isActive: true,
  currency: 'VES',
  timeZone: 'America/Caracas',
  createdAt: '2026-01-01T00:00:00.000Z',
});

function version(n: number, overrides: Partial<CancellationPolicyVersion> = {}): CancellationPolicyVersion {
  return {
    id: `v${n}`,
    locationId: 'loc-1',
    version: n,
    noticeHours: 24,
    suggestedFee: null,
    currency: null,
    patientText: 'Avísanos con 24 horas.',
    receptionCanCharge: false,
    createdAt: '2026-10-20T15:00:00.000Z',
    createdById: 'u1',
    createdByName: 'Dra. Admin',
    ...overrides,
  };
}

describe('CancellationPolicySettings (DX-279)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedLocations.mockResolvedValue([SEDE]);
    mockedCurrencies.mockResolvedValue([
      { code: 'VES', name: 'Bolívar venezolano', symbol: 'VES' },
      { code: 'USD', name: 'Dólar', symbol: 'US$' },
    ]);
  });

  it('sin política lo dice y ofrece configurarla', async () => {
    mockedGet.mockResolvedValue({ locationId: 'loc-1', current: null, versions: [] });
    render(<CancellationPolicySettings token="tok" />);
    expect(
      await screen.findByText('Sin política: ninguna cancelación cuenta como tardía.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Configurar la política de Sede principal' })).toBeInTheDocument();
    expect(screen.queryByText('Historial de versiones')).not.toBeInTheDocument();
  });

  it('muestra la vigente y el historial de versiones', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({
      locationId: 'loc-1',
      current: version(2, { noticeHours: 48, suggestedFee: 50000, currency: 'VES' }),
      versions: [version(2, { noticeHours: 48, suggestedFee: 50000, currency: 'VES' }), version(1)],
    });
    render(<CancellationPolicySettings token="tok" />);
    expect(await screen.findByTestId('policy-summary-loc-1')).toHaveTextContent('48 h de aviso · versión 2');
    expect(screen.getByText(/Importe sugerido:/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Historial de versiones/ }));
    const list = screen.getByRole('list', { name: 'Historial de versiones · Sede principal' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(2);
    expect(within(list).getByText(/Versión 1 · .* · Dra. Admin/)).toBeInTheDocument();
  });

  it('guardar valida en el formulario y crea la versión siguiente', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ locationId: 'loc-1', current: version(1), versions: [version(1)] });
    mockedCreate.mockResolvedValue(version(2, { noticeHours: 12, suggestedFee: 30000, currency: 'VES' }));
    render(<CancellationPolicySettings token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Cambiar la política de Sede principal' }));
    const dialog = screen.getByRole('dialog', { name: 'Política de cancelación · Sede principal' });
    const hours = within(dialog).getByLabelText('Horas de aviso');
    await user.clear(hours);
    await user.type(hours, '200');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar versión nueva' }));
    expect(within(dialog).getByText('Escribe un número entero de 0 a 168.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
    // QA D3: el foco va al campo inválido.
    expect(hours).toHaveFocus();

    await user.clear(hours);
    await user.type(hours, '12');
    await user.type(within(dialog).getByLabelText('Importe sugerido (opcional)'), '30.000');
    const text = within(dialog).getByLabelText('Texto para el paciente');
    await user.clear(text);
    await user.type(text, 'Avísanos');
    expect(within(dialog).getByText('8/1000')).toBeInTheDocument();
    // DX-291: recepción puede cobrar.
    await user.click(within(dialog).getByLabelText('Recepción puede generar o condonar el cargo'));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar versión nueva' }));
    expect(mockedCreate).toHaveBeenCalledWith('tok', 'loc-1', {
      noticeHours: 12,
      suggestedFee: 30000,
      currency: 'VES',
      patientText: 'Avísanos',
      receptionCanCharge: true,
    });
    expect(await screen.findByTestId('policy-summary-loc-1')).toHaveTextContent('12 h de aviso · versión 2');
  });

  it('un 400 de la API se queda en el modal', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ locationId: 'loc-1', current: null, versions: [] });
    mockedCreate.mockRejectedValue(
      new ApiError(400, 'El texto para el paciente admite como mucho 1000 caracteres.'),
    );
    render(<CancellationPolicySettings token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Configurar la política de Sede principal' }));
    await user.click(screen.getByRole('button', { name: 'Guardar versión nueva' }));
    expect(
      await screen.findByText('El texto para el paciente admite como mucho 1000 caracteres.'),
    ).toBeInTheDocument();
  });

  it('si la política de una sede no carga, lo dice con reintento', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValueOnce(new Error('red')).mockResolvedValue({
      locationId: 'loc-1',
      current: null,
      versions: [],
    });
    render(<CancellationPolicySettings token="tok" />);
    expect(await screen.findByText('Política sin cargar')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(
      await screen.findByText('Sin política: ninguna cancelación cuenta como tardía.'),
    ).toBeInTheDocument();
  });

  it('DX-291: «Vista previa del email» muestra el recordatorio en un iframe sin permisos', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ locationId: 'loc-1', current: version(1), versions: [version(1)] });
    mockedPreview.mockResolvedValue({
      subject: 'Recordatorio de tu cita en Clínica Sonrisa',
      html: '<p>Política de cancelación: avísanos con 24 h</p>',
      text: 'Política de cancelación',
    });
    render(<CancellationPolicySettings token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Vista previa del recordatorio de Sede principal' }));
    const dialog = await screen.findByRole('dialog', { name: 'Recordatorio por email · Sede principal' });
    expect(await within(dialog).findByText('Asunto: Recordatorio de tu cita en Clínica Sonrisa')).toBeInTheDocument();
    const frame = within(dialog).getByTitle('Contenido del email de recordatorio');
    expect(frame).toHaveAttribute('sandbox', '');
    expect(frame.getAttribute('srcdoc')).toContain('Política de cancelación');
    expect(mockedPreview).toHaveBeenCalledWith('tok', 'loc-1');
  });

  it('DX-291: sin política no hay vista previa', async () => {
    mockedGet.mockResolvedValue({ locationId: 'loc-1', current: null, versions: [] });
    render(<CancellationPolicySettings token="tok" />);
    await screen.findByRole('button', { name: 'Configurar la política de Sede principal' });
    expect(screen.queryByRole('button', { name: /Vista previa/ })).not.toBeInTheDocument();
  });
});

describe('CancellationPolicySettings: moneda de la sede (GLOBAL-G1)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedCurrencies.mockResolvedValue([
      { code: 'JPY', name: 'Yen japonés', symbol: '¥' },
      { code: 'EUR', name: 'Euro', symbol: '€' },
    ]);
    mockedGet.mockResolvedValue({ locationId: 'loc-1', current: null, versions: [] });
  });

  it('JPY location shows JPY without decimals', async () => {
    const user = userEvent.setup();
    // País VE a propósito: la moneda del importe sale de la sede.
    mockedLocations.mockResolvedValue([{ ...SEDE, currency: 'JPY', timeZone: 'Asia/Tokyo' }]);
    mockedCreate.mockResolvedValue(version(1, { suggestedFee: 3000, currency: 'JPY' }));
    render(<CancellationPolicySettings token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Configurar la política de Sede principal' }));
    const dialog = screen.getByRole('dialog', { name: 'Política de cancelación · Sede principal' });
    expect(within(dialog).getByLabelText('Moneda')).toHaveValue('JPY');
    await user.type(within(dialog).getByLabelText('Importe sugerido (opcional)'), '3000');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar versión nueva' }));
    expect(mockedCreate).toHaveBeenCalledWith('tok', 'loc-1', expect.objectContaining({ suggestedFee: 3000, currency: 'JPY' }));
    // «Importe sugerido: JPY 3.000», sin decimales y con el formato de la sede (es-VE).
    expect(await screen.findByText(/Importe sugerido: JPY\s3\.000$/)).toBeInTheDocument();
  });

  it('location without currency shows SedeConfigError and never a currency of its country', async () => {
    const user = userEvent.setup();
    mockedLocations.mockResolvedValue([{ ...SEDE, country: 'VE', currency: null }]);
    render(<CancellationPolicySettings token="tok" />);
    await user.click(await screen.findByRole('button', { name: 'Configurar la política de Sede principal' }));
    const dialog = screen.getByRole('dialog', { name: 'Política de cancelación · Sede principal' });
    expect(within(dialog).getByText('Sin moneda de sede')).toBeInTheDocument();
    expect(within(dialog).queryByText(/USD|VES/)).not.toBeInTheDocument();

    // Un importe sin moneda no se envía…
    await user.type(within(dialog).getByLabelText('Importe sugerido (opcional)'), '3000');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar versión nueva' }));
    expect(within(dialog).getByText(/El importe necesita la moneda de la sede/)).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();

    // …y Reintentar relee las sedes sin cerrar el modal.
    mockedLocations.mockResolvedValue([{ ...SEDE, currency: 'EUR' }]);
    await user.click(within(dialog).getByRole('button', { name: /reintentar/i }));
    expect(await within(dialog).findByLabelText('Moneda')).toHaveValue('EUR');
  });
});

describe('CancellationPolicySettings: cada versión con el formato de SU sede (DX-354b)', () => {
  const norm = (text: string | null) => (text ?? '').replace(/\s/g, ' ');
  const fee = (locationId: string, currency: string) =>
    version(1, { locationId, suggestedFee: 1234.5, currency, createdAt: '2026-11-03T03:30:00.000Z' });

  it.each([
    ['sede-caracas', 'caracas', 'VES', 'VES 1.234,50'],
    ['sede-berlin', 'berlin', 'EUR', '1.234,50 EUR'],
    ['sede-miami', 'miami', 'USD', 'USD 1,234.50'],
  ] as const)('la sede %s pinta su importe sugerido y la fecha de su versión con su formato', async (id, key, currency, expected) => {
    const user = userEvent.setup();
    mockedLocations.mockResolvedValue([STAMP_SEDES.caracas, STAMP_SEDES.berlin, STAMP_SEDES.miami]);
    mockedGet.mockImplementation(async (_token, locationId) => ({
      locationId,
      current: fee(locationId, locationId === id ? currency : 'USD'),
      versions: [fee(locationId, locationId === id ? currency : 'USD')],
    }));
    render(<CancellationPolicySettings token="tok" locationId={id} />);
    const line = await screen.findByText(/Importe sugerido:/);
    expect(norm(line.textContent)).toContain(norm(moneyWithCode(1234.5, currency, STAMP_FORMATS[key])));
    expect(norm(line.textContent)).toContain(expected);
    await user.click(screen.getByRole('button', { name: /Historial de versiones/ }));
    const version1 = await screen.findByText(/Versión 1 ·/);
    expect(norm(version1.textContent)).toContain(norm(dateTimeIn(key, '2026-11-03T03:30:00.000Z')));
  });

  it('la lista de todas las sedes mezcla formatos fila a fila y muestra un solo aviso si una sede no tiene formato', async () => {
    mockedLocations.mockResolvedValue([STAMP_SEDES.caracas, clinicLocation({ id: 'sede-rota', name: 'Rota', locale: null, hourCycle: null })]);
    mockedGet.mockImplementation(async (_token, locationId) => ({
      locationId,
      current: fee(locationId, 'USD'),
      versions: [fee(locationId, 'USD')],
    }));
    render(<CancellationPolicySettings token="tok" />);
    expect(await screen.findAllByRole('button', { name: 'Reintentar' })).toHaveLength(1);
  });
});
