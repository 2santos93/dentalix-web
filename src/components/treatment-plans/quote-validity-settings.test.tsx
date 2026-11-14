import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { QuoteValiditySettingsSection } from './quote-validity-settings';
import { getQuoteSettings, saveQuoteSettings } from '@/lib/treatment-plans/quote-settings-api';
import { ApiError } from '@/lib/api/api-error';

jest.mock('../../lib/treatment-plans/quote-settings-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/quote-settings-api'),
  getQuoteSettings: jest.fn(),
  saveQuoteSettings: jest.fn(),
}));

const mockedGet = jest.mocked(getQuoteSettings);
const mockedSave = jest.mocked(saveQuoteSettings);
/** axe estructural en jsdom (sin colores ni geometría: los cubre el e2e). */
async function violations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}
const INVALID = 'La validez del presupuesto tiene que ser un número entero de días entre 1 y 365.';

async function openDialog(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: 'Cambiar la validez del presupuesto' }));
  await screen.findByRole('dialog', { name: 'Cambiar la validez del presupuesto' });
}
async function typeDays(user: ReturnType<typeof userEvent.setup>, value: string) {
  const field = screen.getByLabelText('Días');
  await user.clear(field);
  if (value) await user.type(field, value);
}

describe('QuoteValiditySettingsSection (DX-379)', () => {
  beforeEach(() => {
    mockedGet.mockReset();
    mockedSave.mockReset();
  });

  it('enseña los días con «Por defecto» y explica qué hace', async () => {
    mockedGet.mockResolvedValue({ validityDays: 30 });
    render(<QuoteValiditySettingsSection token="tok" allowed />);
    expect(await screen.findByTestId('quote-validity-days')).toHaveTextContent('30 días');
    expect(screen.getByText('Por defecto')).toBeInTheDocument();
    expect(
      screen.getByText(/Los presupuestos nuevos indican hasta qué día valen sus precios\. Cambiarlo no afecta a los ya presentados\./),
    ).toBeInTheDocument();
  });

  it('ADMIN cambia a 45 días y guarda', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ validityDays: 30 });
    mockedSave.mockResolvedValue({ validityDays: 45 });
    render(<QuoteValiditySettingsSection token="tok" allowed />);
    await openDialog(user);
    expect(screen.getByLabelText('Días')).toHaveValue(30);
    await typeDays(user, '45');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mockedSave).toHaveBeenCalledWith('tok', { validityDays: 45 });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByTestId('quote-validity-days')).toHaveTextContent('45 días');
    expect(screen.queryByText('Por defecto')).not.toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Validez guardada: 45 días.');
  });

  it('un día se escribe en singular', async () => {
    mockedGet.mockResolvedValue({ validityDays: 1 });
    render(<QuoteValiditySettingsSection token="tok" allowed />);
    expect(await screen.findByTestId('quote-validity-days')).toHaveTextContent(/^1 día$/);
  });

  it.each(['0', '366', '', '-3'])('«%s» no se envía: el mismo mensaje que la API', async (value) => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ validityDays: 30 });
    render(<QuoteValiditySettingsSection token="tok" allowed />);
    await openDialog(user);
    await typeDays(user, value);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(mockedSave).not.toHaveBeenCalled();
    expect(screen.getByText(INVALID)).toBeInTheDocument();
    expect(screen.getByLabelText('Días')).toHaveAttribute('aria-invalid', 'true');
  });

  it('1 y 365 son válidos', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ validityDays: 30 });
    mockedSave.mockImplementation((_t, input) => Promise.resolve(input));
    render(<QuoteValiditySettingsSection token="tok" allowed />);
    for (const days of [1, 365]) {
      await openDialog(user);
      await typeDays(user, String(days));
      await user.click(screen.getByRole('button', { name: 'Guardar' }));
      await waitFor(() => expect(mockedSave).toHaveBeenLastCalledWith('tok', { validityDays: days }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    }
  });

  it('el 403 del servidor se enseña dentro del diálogo y no lo cierra', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ validityDays: 30 });
    mockedSave.mockRejectedValue(
      new ApiError(403, 'Solo un administrador puede cambiar la validez de los presupuestos.'),
    );
    render(<QuoteValiditySettingsSection token="tok" allowed />);
    await openDialog(user);
    await typeDays(user, '45');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('Solo un administrador puede cambiar la validez de los presupuestos.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByTestId('quote-validity-days')).toHaveTextContent('30 días');
  });

  it('un 500 al guardar da el texto de la pantalla, no el del servidor', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ validityDays: 30 });
    mockedSave.mockRejectedValue(new ApiError(500, 'boom interno'));
    render(<QuoteValiditySettingsSection token="tok" allowed />);
    await openDialog(user);
    await typeDays(user, '45');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('No pudimos guardar la validez del presupuesto. Intenta de nuevo.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('boom interno')).not.toBeInTheDocument();
  });

  it('otro rol ve el valor en solo lectura, sin «Cambiar»', async () => {
    mockedGet.mockResolvedValue({ validityDays: 45 });
    render(<QuoteValiditySettingsSection token="tok" allowed={false} />);
    expect(await screen.findByTestId('quote-validity-days')).toHaveTextContent('45 días');
    expect(screen.getByText('Lo cambia administración.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Cambiar/ })).not.toBeInTheDocument();
  });

  it('si no carga, error de sección con «Reintentar»', async () => {
    const user = userEvent.setup();
    mockedGet.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ validityDays: 30 });
    render(<QuoteValiditySettingsSection token="tok" allowed />);
    await user.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByTestId('quote-validity-days')).toHaveTextContent('30 días');
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('axe limpio: fila de ADMIN, solo lectura y el diálogo con el error del campo', async () => {
    const user = userEvent.setup();
    mockedGet.mockResolvedValue({ validityDays: 30 });
    const readOnly = render(<QuoteValiditySettingsSection token="tok" allowed={false} />);
    await screen.findByTestId('quote-validity-days');
    expect(await violations(readOnly.container)).toEqual([]);
    readOnly.unmount();

    const admin = render(<QuoteValiditySettingsSection token="tok" allowed />);
    await screen.findByTestId('quote-validity-days');
    expect(await violations(admin.container)).toEqual([]);
    await openDialog(user);
    await typeDays(user, '0');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await screen.findByText(INVALID);
    expect(await violations(screen.getByRole('dialog'))).toEqual([]);
  });
});
