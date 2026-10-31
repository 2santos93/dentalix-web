import { render, screen, waitFor, within } from '@testing-library/react';
import { ReminderSettingsManager } from './reminder-settings-manager';
import {
  listReminderSettings,
  updateReminderSettings,
  type LocationReminderSettings,
} from '@/lib/reminders/reminders-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/reminders/reminders-api', () => ({
  ...jest.requireActual('../../lib/reminders/reminders-api'),
  listReminderSettings: jest.fn(),
  updateReminderSettings: jest.fn(),
}));

const mockedList = listReminderSettings as jest.MockedFunction<typeof listReminderSettings>;
const mockedUpdate = updateReminderSettings as jest.MockedFunction<typeof updateReminderSettings>;

const principal: LocationReminderSettings = {
  locationId: 'loc-1',
  locationName: 'Sede principal',
  enabled: true,
  leadHours: [48, 2],
  updatedAt: '2026-10-10T12:00:00.000Z',
};
const norte: LocationReminderSettings = {
  locationId: 'loc-2',
  locationName: 'Sede Norte',
  enabled: false,
  leadHours: [],
  updatedAt: null,
};

async function openNorte(user: ReturnType<typeof setupUser>) {
  const table = await screen.findByRole('table', { name: 'Recordatorios por sede' });
  await user.click(
    within(table).getByRole('button', { name: 'Configurar los recordatorios de Sede Norte' }),
  );
  return screen.findByRole('dialog');
}

/** Fuerza el modo teléfono de `DataList` (jsdom no tiene `matchMedia`). */
function mockPhone() {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

describe('ReminderSettingsManager (DX-026)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([principal, norte]);
  });

  it('solo ADMIN: otro rol ve el aviso y no se pide nada', () => {
    render(<ReminderSettingsManager token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración configura los recordatorios.')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('carga con skeleton y lista cada sede con su estado y sus antelaciones', async () => {
    render(<ReminderSettingsManager token="tok" allowed />);
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
    const table = await screen.findByRole('table', { name: 'Recordatorios por sede' });
    const [, first, second] = within(table).getAllByRole('row');
    expect(first).toHaveTextContent('Sede principal');
    expect(first).toHaveTextContent('Activos');
    expect(first).toHaveTextContent('2 días y 2 h antes');
    expect(second).toHaveTextContent('Sede Norte');
    expect(second).toHaveTextContent('Desactivados');
    expect(screen.getByText('2 sedes · 1 con recordatorios')).toBeInTheDocument();
  });

  it('teléfono: una tarjeta por sede, toda ella abre su configuración', async () => {
    const restore = mockPhone();
    try {
      const user = setupUser();
      render(<ReminderSettingsManager token="tok" allowed />);
      const cards = await screen.findByRole('list', { name: 'Recordatorios por sede' });
      const items = within(cards).getAllByRole('listitem');
      expect(items).toHaveLength(2);
      expect(items[1]).toHaveTextContent('Sede Norte');
      expect(items[1]).toHaveTextContent('Desactivados');
      // Sin un «—» suelto: dice que no hay recordatorios.
      expect(items[1]).toHaveTextContent('Sin recordatorios');
      // En la tarjeta el botón es toda ella: su nombre empieza por la acción.
      await user.click(within(items[1]).getByRole('button', { name: /^Configurar los recordatorios de Sede Norte/ }));
      expect(await screen.findByRole('dialog')).toBeInTheDocument();
    } finally {
      restore();
    }
  });

  it('vacío: sin sedes', async () => {
    mockedList.mockResolvedValueOnce([]);
    render(<ReminderSettingsManager token="tok" allowed />);
    expect(await screen.findByText('Todavía no hay sedes.')).toBeInTheDocument();
  });

  it('error de carga con reintento (escalón 1)', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render(<ReminderSettingsManager token="tok" allowed />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar los recordatorios de las sedes.');
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('table', { name: 'Recordatorios por sede' })).toBeInTheDocument();
  });

  it('activa una sede: propone 48 h y 2 h, guarda y actualiza la fila', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...norte, enabled: true, leadHours: [48, 2] });
    render(<ReminderSettingsManager token="tok" allowed />);
    const dialog = await openNorte(user);

    expect(within(dialog).getByLabelText('Recordatorio 1: horas antes')).toHaveValue(48);
    expect(within(dialog).getByLabelText('Recordatorio 2: horas antes')).toHaveValue(2);
    await user.click(within(dialog).getByLabelText('Enviar recordatorios por email'));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    expect(mockedUpdate).toHaveBeenCalledWith('tok', 'loc-2', { enabled: true, leadHours: [48, 2] });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const table = screen.getByRole('table', { name: 'Recordatorios por sede' });
    expect(within(table).getAllByRole('row')[2]).toHaveTextContent('Activos');
    expect(screen.getByText('Recordatorios activados en Sede Norte.')).toBeInTheDocument();
  });

  it('valida en español antes de enviar: rango, repetidas y activar sin antelaciones', async () => {
    const user = setupUser();
    render(<ReminderSettingsManager token="tok" allowed />);
    const dialog = await openNorte(user);
    await user.click(within(dialog).getByLabelText('Enviar recordatorios por email'));

    const first = within(dialog).getByLabelText('Recordatorio 1: horas antes');
    await user.clear(first);
    await user.type(first, '200');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Cada recordatorio debe ser de 1 a 168 horas antes (7 días).',
    );

    await user.clear(first);
    await user.type(first, '2');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('No repitas la misma antelación');

    await user.click(within(dialog).getByRole('button', { name: 'Quitar el recordatorio 2' }));
    await user.click(within(dialog).getByRole('button', { name: 'Quitar el recordatorio 1' }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Para activar los recordatorios elige al menos una antelación.',
    );
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('como mucho 3 antelaciones: «Añadir» desaparece al llegar al tope', async () => {
    const user = setupUser();
    render(<ReminderSettingsManager token="tok" allowed />);
    const dialog = await openNorte(user);
    await user.click(within(dialog).getByRole('button', { name: 'Añadir recordatorio' }));
    expect(within(dialog).getByLabelText('Recordatorio 3: horas antes')).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'Añadir recordatorio' })).not.toBeInTheDocument();
  });

  it('un 403 de la API se muestra en el formulario, en español', async () => {
    const user = setupUser();
    mockedUpdate.mockRejectedValue(
      new ApiError(403, 'Solo un administrador puede ver y cambiar los recordatorios.'),
    );
    render(<ReminderSettingsManager token="tok" allowed />);
    const dialog = await openNorte(user);
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Solo un administrador puede ver y cambiar los recordatorios.',
    );
  });
});
