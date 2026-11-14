import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReceiptSettingsForm } from './receipt-settings-form';
import { ExternalInvoiceModal } from './external-invoice-modal';
import { LocationReceiptLegendForm } from '@/components/locations/location-receipt-legend-form';
import {
  getReceiptSettings,
  saveExternalInvoiceNumber,
  saveLocationReceiptLegend,
  saveReceiptSettings,
  type ReceiptSettings,
} from '@/lib/payments/receipt-settings-api';
import { ApiError } from '@/lib/api/api-error';

jest.mock('sonner', () => ({ toast: { success: jest.fn() } }));
jest.mock('../../lib/payments/receipt-settings-api', () => ({
  ...jest.requireActual('../../lib/payments/receipt-settings-api'),
  getReceiptSettings: jest.fn(),
  saveReceiptSettings: jest.fn(),
  saveLocationReceiptLegend: jest.fn(),
  saveExternalInvoiceNumber: jest.fn(),
}));
const mockedGet = jest.mocked(getReceiptSettings);
const mockedSave = jest.mocked(saveReceiptSettings);
const mockedSaveLocation = jest.mocked(saveLocationReceiptLegend);
const mockedInvoice = jest.mocked(saveExternalInvoiceNumber);

function settings(overrides: Partial<ReceiptSettings> = {}): ReceiptSettings {
  return {
    title: null,
    legend: null,
    locations: [{ locationId: 'l1', name: 'Sede principal', isActive: true, override: false, legend: null }],
    ...overrides,
  };
}

const bar = () => screen.queryByRole('region', { name: 'Cambios sin guardar' });

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Ajustes › Caja › Recibo de caja (DX-515)', () => {
  it('sin configurar: campos vacíos, «Recibo de caja» de marcador, sugerencia genérica y sin barra', async () => {
    mockedGet.mockResolvedValue(settings());
    render(<ReceiptSettingsForm token="tok" />);
    const title = await screen.findByLabelText('Título del recibo');
    expect(title).toHaveValue('');
    expect(title).toHaveAttribute('placeholder', 'Recibo de caja');
    expect(title).toHaveAttribute('maxLength', '60');
    expect(screen.getByLabelText('Leyenda del recibo')).toHaveAttribute('maxLength', '250');
    expect(screen.getByRole('button', { name: 'Usar «Este recibo no es una factura»' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Sedes' })).toHaveAttribute('href', '/settings/sedes');
    expect(bar()).not.toBeInTheDocument();
  });

  it('la sugerencia rellena la leyenda; guardar manda los textos recortados (vacío = null)', async () => {
    mockedGet.mockResolvedValue(settings());
    mockedSave.mockResolvedValue({ title: 'Recibo de pago', legend: 'Este recibo no es una factura' });
    const user = userEvent.setup();
    render(<ReceiptSettingsForm token="tok" />);
    await user.click(await screen.findByRole('button', { name: /Usar «Este recibo/ }));
    expect(screen.getByLabelText('Leyenda del recibo')).toHaveValue('Este recibo no es una factura');
    await user.type(screen.getByLabelText('Título del recibo'), '  Recibo de pago ');
    expect(bar()).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Guardar el título y la leyenda del recibo' }));
    await waitFor(() =>
      expect(mockedSave).toHaveBeenCalledWith('tok', {
        title: 'Recibo de pago',
        legend: 'Este recibo no es una factura',
      }),
    );
    await waitFor(() => expect(bar()).not.toBeInTheDocument());
  });

  it('un 400 de la API va junto al campo', async () => {
    mockedGet.mockResolvedValue(settings({ title: 'Recibo de pago' }));
    mockedSave.mockRejectedValue(
      new ApiError(400, 'La leyenda del recibo admite hasta 250 caracteres en una línea.'),
    );
    const user = userEvent.setup();
    render(<ReceiptSettingsForm token="tok" />);
    await user.type(await screen.findByLabelText('Leyenda del recibo'), 'x');
    await user.click(screen.getByRole('button', { name: 'Guardar el título y la leyenda del recibo' }));
    expect(await screen.findByText(/admite hasta 250/)).toBeInTheDocument();
    expect(screen.getByLabelText('Leyenda del recibo')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('Ficha de la sede › Leyenda del recibo (DX-515)', () => {
  it('sin leyenda propia dice cuál hereda de la clínica', async () => {
    mockedGet.mockResolvedValue(settings({ legend: 'Este recibo no es una factura' }));
    render(<LocationReceiptLegendForm token="tok" locationId="l1" locationName="Sede principal" />);
    expect(await screen.findByTestId('inherited-legend')).toHaveTextContent(
      'Usa la de la clínica: «Este recibo no es una factura».',
    );
    expect(screen.queryByLabelText('Leyenda de esta sede')).not.toBeInTheDocument();
  });

  it('con leyenda propia vacía guarda override sin leyenda (la sede no imprime ninguna)', async () => {
    mockedGet.mockResolvedValue(settings());
    mockedSaveLocation.mockResolvedValue({
      locationId: 'l1',
      name: 'Sede principal',
      isActive: true,
      override: true,
      legend: null,
    });
    const user = userEvent.setup();
    render(<LocationReceiptLegendForm token="tok" locationId="l1" locationName="Sede principal" />);
    await user.click(await screen.findByRole('checkbox', { name: 'Usar una leyenda propia en esta sede' }));
    expect(screen.getByLabelText('Leyenda de esta sede')).toHaveAccessibleDescription(
      expect.stringContaining('Vacía: esta sede no imprime ninguna.'),
    );
    await user.click(screen.getByRole('button', { name: 'Guardar la leyenda del recibo de Sede principal' }));
    await waitFor(() =>
      expect(mockedSaveLocation).toHaveBeenCalledWith('tok', 'l1', { override: true, legend: null }),
    );
  });
});

describe('ExternalInvoiceModal (DX-515)', () => {
  const target = { paymentId: 'p1', subject: 'Ana · 10,00 USD', externalInvoiceNumber: null };

  it('anota el nº tal cual (sin formato) y avisa si va en todas las líneas de un cobro', async () => {
    mockedInvoice.mockResolvedValue({ paymentId: 'p1', externalInvoiceNumber: 'A/2026 #7', paymentIds: ['p1', 'p2'] });
    const onSaved = jest.fn();
    const user = userEvent.setup();
    render(<ExternalInvoiceModal token="tok" target={target} onOpenChange={jest.fn()} onSaved={onSaved} />);
    const field = screen.getByLabelText('Nº de factura');
    expect(field).toHaveAttribute('maxLength', '64');
    await user.type(field, ' A/2026 #7 ');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockedInvoice).toHaveBeenCalledWith('tok', 'p1', 'A/2026 #7'));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ paymentIds: ['p1', 'p2'] }));
  });

  it('vacío lo quita (null)', async () => {
    mockedInvoice.mockResolvedValue({ paymentId: 'p1', externalInvoiceNumber: null, paymentIds: ['p1'] });
    const user = userEvent.setup();
    render(
      <ExternalInvoiceModal
        token="tok"
        target={{ ...target, externalInvoiceNumber: 'F-1' }}
        onOpenChange={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    const field = screen.getByLabelText('Nº de factura');
    expect(field).toHaveValue('F-1');
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockedInvoice).toHaveBeenCalledWith('tok', 'p1', null));
  });

  it('un 409 (abono anulado) se enseña en el diálogo', async () => {
    mockedInvoice.mockRejectedValue(
      new ApiError(409, 'Ese abono está anulado: ya no se le anota el nº de factura externa.'),
    );
    const user = userEvent.setup();
    render(<ExternalInvoiceModal token="tok" target={target} onOpenChange={jest.fn()} onSaved={jest.fn()} />);
    await user.type(screen.getByLabelText('Nº de factura'), 'F-2');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(/Ese abono está anulado/)).toBeInTheDocument();
  });
});
