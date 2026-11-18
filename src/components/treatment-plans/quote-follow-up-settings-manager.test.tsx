import { render, screen, waitFor, within } from '@testing-library/react';
import { QuoteFollowUpSettingsManager } from './quote-follow-up-settings-manager';
import {
  listQuoteFollowUpSettings,
  updateQuoteFollowUpSettings,
  type LocationQuoteFollowUpSettings,
} from '@/lib/treatment-plans/quote-follow-up-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/treatment-plans/quote-follow-up-api', () => ({
  ...jest.requireActual('../../lib/treatment-plans/quote-follow-up-api'),
  listQuoteFollowUpSettings: jest.fn(),
  updateQuoteFollowUpSettings: jest.fn(),
}));
// Las horas, con el reloj de CADA sede: Caracas en 12 h, Norte en 24 h.
jest.mock('../../lib/locations/use-locations-state', () => {
  const { caracasSede } = jest.requireActual('../../lib/test/sede-clock');
  return {
    useLocationsState: () => ({
      status: 'ready',
      activeLocationId: null,
      retry: () => undefined,
      locations: [
        caracasSede({ id: 'loc-1', name: 'Sede principal' }),
        caracasSede({ id: 'loc-2', name: 'Sede Norte', hourCycle: 'h23' }),
      ],
    }),
  };
});

const mockedList = jest.mocked(listQuoteFollowUpSettings);
const mockedUpdate = jest.mocked(updateQuoteFollowUpSettings);

const principal: LocationQuoteFollowUpSettings = {
  locationId: 'loc-1',
  locationName: 'Sede principal',
  enabled: true,
  offsetsDays: [3, 10, 21],
  sendFromHour: 9,
  sendUntilHour: 19,
  updatedAt: '2026-11-10T12:00:00.000Z',
};
const norte: LocationQuoteFollowUpSettings = {
  locationId: 'loc-2',
  locationName: 'Sede Norte',
  enabled: false,
  offsetsDays: [3, 10, 21],
  sendFromHour: 9,
  sendUntilHour: 19,
  updatedAt: null,
};

const flat = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

async function openNorte(user: ReturnType<typeof setupUser>) {
  const table = await screen.findByRole('table', { name: 'Seguimiento automático por sede' });
  await user.click(within(table).getByRole('button', { name: 'Configurar el seguimiento de Sede Norte' }));
  return screen.findByRole('dialog');
}

describe('QuoteFollowUpSettingsManager (DX-561)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([principal, norte]);
  });

  it('solo ADMIN: otro rol ve el aviso y no se pide nada', () => {
    render(<QuoteFollowUpSettingsManager token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración configura el seguimiento automático.')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('una fila por sede con su estado, los días y la franja con el reloj de esa sede; y qué lleva el aviso', async () => {
    render(<QuoteFollowUpSettingsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Seguimiento automático por sede' });
    const [, first, second] = within(table).getAllByRole('row');
    expect(first).toHaveTextContent('Activo');
    expect(flat(first.textContent)).toMatch(/A los 3, 10 y 21 días · de 9:00 a\. ?m\. a 7:00 p\. ?m\./);
    expect(second).toHaveTextContent('Desactivado');
    expect(flat(second.textContent)).toContain('de 09:00 a 19:00');
    expect(screen.getByText('2 sedes · 1 con seguimiento')).toBeInTheDocument();
    const about = screen.getByRole('region', { name: 'Qué lleva el aviso' });
    expect(about).toHaveTextContent('Sin importes ni tratamientos.');
    expect(about).toHaveTextContent('caduca a las 72 horas');
    expect(about).toHaveTextContent(/aceptar, rechazar, agendar una cita, vencer el presupuesto o darse de baja/);
    expect(about).toHaveTextContent(
      'Los avisos usan como mucho la mitad de los emails diarios de la clínica; el resto se envía en los días siguientes.',
    );
  });

  it('activa una sede con 3/10/21 de 9 a 19 y lo anuncia', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...norte, enabled: true, updatedAt: '2026-11-18T12:00:00.000Z' });
    render(<QuoteFollowUpSettingsManager token="tok" allowed />);
    const dialog = await openNorte(user);
    expect(within(dialog).getByRole('heading', { name: 'Seguimiento automático en Sede Norte' })).toBeInTheDocument();
    expect(dialog).toHaveTextContent('no lleva importes ni tratamientos');
    expect(within(dialog).getByLabelText('Aviso 1: días después', { exact: true })).toHaveValue(3);
    await user.click(within(dialog).getByRole('checkbox', { name: /Enviar avisos de seguimiento por email/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'loc-2', {
        enabled: true,
        offsetsDays: [3, 10, 21],
        sendFromHour: 9,
        sendUntilHour: 19,
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByText('Seguimiento automático activado en Sede Norte.')).toBeInTheDocument();
  });

  it('días no crecientes: error junto a los días y no se guarda', async () => {
    const user = setupUser();
    render(<QuoteFollowUpSettingsManager token="tok" allowed />);
    const dialog = await openNorte(user);
    const second = within(dialog).getByLabelText('Aviso 2: días después', { exact: true });
    await user.clear(second);
    await user.type(second, '2');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    const error = await within(dialog).findByText(
      'Los días de los avisos van de menor a mayor y sin repetirse (por ejemplo, 3, 10 y 21).',
    );
    expect(second).toHaveAttribute('aria-invalid', 'true');
    expect(second.getAttribute('aria-describedby')).toBe(error.closest('[id]')?.id);
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('franja al revés: error junto a «Hasta»', async () => {
    const user = setupUser();
    render(<QuoteFollowUpSettingsManager token="tok" allowed />);
    const dialog = await openNorte(user);
    await user.selectOptions(within(dialog).getByLabelText('De', { exact: true }), '20');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    const until = within(dialog).getByLabelText('Hasta', { exact: true });
    expect(
      await within(dialog).findByText('La franja horaria debe terminar después de empezar (por ejemplo, de 9 a 19).'),
    ).toBeInTheDocument();
    expect(until).toHaveAttribute('aria-invalid', 'true');
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('quita y añade avisos (hasta 3); el último no se puede quitar', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue(norte);
    render(<QuoteFollowUpSettingsManager token="tok" allowed />);
    const dialog = await openNorte(user);
    expect(within(dialog).queryByRole('button', { name: 'Añadir aviso' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Quitar el aviso 3' }));
    await user.click(within(dialog).getByRole('button', { name: 'Quitar el aviso 2' }));
    expect(within(dialog).queryByRole('button', { name: 'Quitar el aviso 1' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Añadir aviso' }));
    await user.type(within(dialog).getByLabelText('Aviso 2: días después', { exact: true }), '15');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'loc-2', expect.objectContaining({ offsetsDays: [3, 15] })),
    );
  });

  it('un 400 de la API va junto a su campo; otro error, arriba del formulario', async () => {
    const user = setupUser();
    const message = 'Cada aviso sale de 1 a 90 días después de presentar el presupuesto.';
    mockedUpdate.mockRejectedValueOnce(new ApiError(400, message, { messages: [message] }));
    render(<QuoteFollowUpSettingsManager token="tok" allowed />);
    const dialog = await openNorte(user);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Aviso 1: días después', { exact: true })).toHaveAttribute('aria-invalid', 'true');

    mockedUpdate.mockRejectedValueOnce(new ApiError(404, 'Sede no encontrada', { messages: ['Sede no encontrada'] }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('Sede no encontrada')).toBeInTheDocument();
  });
  it('409 LOCATION_TIMEZONE_REQUIRED: el aviso de la sede sin zona dentro del modal, con reintento', async () => {
    const user = setupUser();
    const message = 'La sede no tiene zona horaria: configúrala en Ajustes › Sedes para activar el seguimiento.';
    mockedUpdate
      .mockRejectedValueOnce(
        new ApiError(409, message, { messages: [message], code: 'LOCATION_TIMEZONE_REQUIRED', locationId: 'loc-2' }),
      )
      .mockResolvedValueOnce({ ...norte, enabled: true });
    render(<QuoteFollowUpSettingsManager token="tok" allowed />);
    const dialog = await openNorte(user);
    await user.click(within(dialog).getByRole('checkbox', { name: /Enviar avisos de seguimiento por email/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Reintentar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
