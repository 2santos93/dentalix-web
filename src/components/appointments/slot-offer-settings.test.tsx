import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { SlotOfferSettingsSection } from './slot-offer-settings';
import { getSlotOfferSettings, saveSlotOfferSettings } from '@/lib/appointments/slot-offer-settings-api';
import { ApiError } from '@/lib/api/api-error';

jest.mock('../../lib/appointments/slot-offer-settings-api', () => ({
  ...jest.requireActual('../../lib/appointments/slot-offer-settings-api'),
  getSlotOfferSettings: jest.fn(),
  saveSlotOfferSettings: jest.fn(),
}));

const mockedGet = jest.mocked(getSlotOfferSettings);
const mockedSave = jest.mocked(saveSlotOfferSettings);
async function violations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}
const DEFAULTS = { expiryLeadMinutes: 0, minLeadMinutes: 20, defaultExpiryLeadMinutes: 0, defaultMinLeadMinutes: 20 };
const EXPIRY_INVALID = 'La caducidad anticipada de la oferta tiene que ser un número entero de minutos entre 0 y 240.';
const MIN_INVALID = 'La antelación mínima para ofrecer un hueco tiene que ser un número entero de minutos entre 5 y 240.';
const FORBIDDEN = 'Solo un administrador puede cambiar los ajustes de las ofertas de hueco.';

async function openDialog(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name }));
  await screen.findByRole('dialog', { name });
}
async function typeMinutes(user: ReturnType<typeof userEvent.setup>, value: string) {
  const field = screen.getByLabelText('Minutos');
  await user.clear(field);
  if (value) await user.type(field, value);
}

describe('SlotOfferSettingsSection (DX-448)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
  });

  it('cargando: esqueleto con estado; luego los dos valores con «Por defecto»', async () => {
    let resolve: (v: typeof DEFAULTS) => void = () => {};
    mockedGet.mockReturnValue(new Promise((r) => (resolve = r)));
    render(<SlotOfferSettingsSection token="tok" allowed />);
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    resolve(DEFAULTS);
    expect(await screen.findByTestId('slot-offer-expiryLeadMinutes')).toHaveTextContent('Al empezar el hueco');
    expect(screen.getByTestId('slot-offer-minLeadMinutes')).toHaveTextContent('20 minutos');
    expect(screen.getAllByText('Por defecto')).toHaveLength(2);
  });

  it('ADMIN cambia la caducidad a 60 min: guarda los dos valores y avisa', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(DEFAULTS);
    mockedSave.mockResolvedValue({ ...DEFAULTS, expiryLeadMinutes: 60 });
    render(<SlotOfferSettingsSection token="tok" allowed />);
    await openDialog(user, 'Cambiar la caducidad del enlace');
    expect(screen.getByLabelText('Minutos')).toHaveValue(0);
    await typeMinutes(user, '60');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mockedSave).toHaveBeenCalledWith('tok', { expiryLeadMinutes: 60, minLeadMinutes: 20 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('slot-offer-expiryLeadMinutes')).toHaveTextContent('60 minutos antes del hueco');
    expect(screen.getByText('Caducidad guardada: 60 minutos antes del hueco.')).toBeInTheDocument();
    expect(screen.getAllByText('Por defecto')).toHaveLength(1);
  });

  it('ADMIN cambia la antelación mínima', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ ...DEFAULTS, expiryLeadMinutes: 60 });
    mockedSave.mockResolvedValue({ ...DEFAULTS, expiryLeadMinutes: 60, minLeadMinutes: 45 });
    render(<SlotOfferSettingsSection token="tok" allowed />);
    await openDialog(user, 'Cambiar la antelación mínima');
    await typeMinutes(user, '45');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mockedSave).toHaveBeenCalledWith('tok', { expiryLeadMinutes: 60, minLeadMinutes: 45 });
    expect(await screen.findByText('Antelación mínima guardada: 45 minutos.')).toBeInTheDocument();
  });

  it.each([
    ['Cambiar la caducidad del enlace', '241', EXPIRY_INVALID],
    ['Cambiar la caducidad del enlace', '', EXPIRY_INVALID],
    ['Cambiar la antelación mínima', '4', MIN_INVALID],
  ])('%s con «%s»: error en el campo y no llama a la API', async (dialog, value, message) => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(DEFAULTS);
    render(<SlotOfferSettingsSection token="tok" allowed />);
    await openDialog(user, dialog);
    await typeMinutes(user, value);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(message)).toBeInTheDocument();
    expect(screen.getByLabelText('Minutos')).toHaveAttribute('aria-invalid', 'true');
    expect(mockedSave).not.toHaveBeenCalled();
  });

  it('el 403 del servidor se enseña dentro del diálogo y no lo cierra', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(DEFAULTS);
    mockedSave.mockRejectedValue(new ApiError(403, FORBIDDEN));
    render(<SlotOfferSettingsSection token="tok" allowed />);
    await openDialog(user, 'Cambiar la caducidad del enlace');
    await typeMinutes(user, '30');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText(FORBIDDEN)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('slot-offer-expiryLeadMinutes')).toHaveTextContent('Al empezar el hueco');
  });

  it('un 500 al guardar da el texto de la pantalla, no el del servidor', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(DEFAULTS);
    mockedSave.mockRejectedValue(new ApiError(500, 'boom interno'));
    render(<SlotOfferSettingsSection token="tok" allowed />);
    await openDialog(user, 'Cambiar la caducidad del enlace');
    await typeMinutes(user, '30');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('No pudimos guardar el ajuste. Intenta de nuevo.')).toBeInTheDocument();
    expect(screen.queryByText('boom interno')).not.toBeInTheDocument();
  });

  it('otro rol ve los valores en solo lectura, sin «Cambiar»', async () => {
    mockedGet.mockResolvedValue({ ...DEFAULTS, expiryLeadMinutes: 1, minLeadMinutes: 30 });
    render(<SlotOfferSettingsSection token="tok" allowed={false} />);
    expect(await screen.findByTestId('slot-offer-expiryLeadMinutes')).toHaveTextContent('1 minuto antes del hueco');
    expect(screen.getByTestId('slot-offer-minLeadMinutes')).toHaveTextContent('30 minutos');
    expect(screen.getAllByText('Lo cambia administración.')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Cambiar/ })).not.toBeInTheDocument();
  });

  it('si no carga, error de sección con «Reintentar»', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce(DEFAULTS);
    render(<SlotOfferSettingsSection token="tok" allowed />);
    expect(await screen.findByText('No pudimos cargar los ajustes de las ofertas de hueco.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByTestId('slot-offer-minLeadMinutes')).toHaveTextContent('20 minutos');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('axe limpio: filas de ADMIN y el diálogo con el error del campo', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue(DEFAULTS);
    const view = render(<SlotOfferSettingsSection token="tok" allowed />);
    await screen.findByTestId('slot-offer-expiryLeadMinutes');
    expect(await violations(view.container)).toEqual([]);
    await openDialog(user, 'Cambiar la caducidad del enlace');
    await typeMinutes(user, '999');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText(EXPIRY_INVALID);
    expect(await violations(screen.getByRole('dialog'))).toEqual([]);
  });
});
