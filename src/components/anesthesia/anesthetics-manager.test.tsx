import { render, screen, waitFor, within } from '@testing-library/react';
import { AnestheticsManager } from './anesthetics-manager';
import {
  createAnesthetic,
  listAnesthetics,
  loadSampleAnesthetics,
  updateAnesthetic,
  type AnestheticProduct,
} from '@/lib/anesthesia/anesthesia-api';
import { ApiError } from '@/lib/api/client';
import { notifyError } from '@/components/errors/notify';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/anesthesia/anesthesia-api', () => ({
  ...jest.requireActual('../../lib/anesthesia/anesthesia-api'),
  listAnesthetics: jest.fn(),
  loadSampleAnesthetics: jest.fn(),
  createAnesthetic: jest.fn(),
  updateAnesthetic: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = listAnesthetics as jest.MockedFunction<typeof listAnesthetics>;
const mockedSamples = loadSampleAnesthetics as jest.MockedFunction<typeof loadSampleAnesthetics>;
const mockedCreate = createAnesthetic as jest.MockedFunction<typeof createAnesthetic>;
const mockedUpdate = updateAnesthetic as jest.MockedFunction<typeof updateAnesthetic>;

const lido: AnestheticProduct = {
  id: 'a1',
  name: 'Lidocaína 2 % con epinefrina 1:100.000',
  activeIngredient: 'Lidocaína',
  concentrationPct: 2,
  vasoconstrictor: 'Epinefrina 1:100.000',
  mlPerCarpule: 1.8,
  maxMgPerKg: 7,
  maxAbsoluteMg: 500,
  pediatricMaxMgPerKg: 4.4,
  minAgeYears: null,
  epinephrineMgPerCarpule: 0.018,
  sampleCode: 'LIDOCAINE_2_EPI',
  active: true,
  createdAt: '2026-11-01T00:00:00.000Z',
  updatedAt: '2026-11-01T00:00:00.000Z',
};

describe('AnestheticsManager (DX-408)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([lido]);
  });

  it('solo ADMIN: otro rol ve el aviso y no se pide nada', () => {
    render(<AnestheticsManager token="tok" allowed={false} />);
    expect(screen.getByText(/solo administración gestiona el catálogo/i)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lista activos e inactivos con concentración, vasoconstrictor, carpule, mg/kg y tope', async () => {
    render(<AnestheticsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Anestésicos' });
    const row = within(table).getAllByRole('row')[1];
    for (const text of ['Lidocaína 2 %', '2 %', 'Epinefrina 1:100.000', '1,8 ml', '7 mg/kg', '500 mg', 'Activo']) {
      expect(row).toHaveTextContent(text);
    }
    expect(mockedList).toHaveBeenCalledWith('tok', true);
    expect(screen.getByText('1 anestésico')).toBeInTheDocument();
  });

  it('carga: esqueleto mientras llega el catálogo', () => {
    mockedList.mockReturnValue(new Promise(() => {}));
    render(<AnestheticsManager token="tok" allowed />);
    expect(screen.getByRole('status', { name: 'Cargando' })).toBeInTheDocument();
  });

  it('error de carga con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render(<AnestheticsManager token="tok" allowed />);
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('table', { name: 'Anestésicos' })).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('vacío: «Cargar sugeridos» llama a la API y pinta los creados', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedSamples.mockResolvedValue([lido]);
    render(<AnestheticsManager token="tok" allowed />);
    expect(await screen.findByText('Todavía no hay anestésicos en el catálogo.')).toBeInTheDocument();
    // Lista vacía: sin contador ni «Nuevo» arriba; la primaria vive en el vacío.
    expect(screen.queryByRole('button', { name: 'Nuevo anestésico' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cargar sugeridos' }));
    expect(mockedSamples).toHaveBeenCalledWith('tok');
    expect(await screen.findByRole('table', { name: 'Anestésicos' })).toHaveTextContent('Lidocaína 2 %');
  });

  it('vacío: si fallan los sugeridos, aviso con reintento (escalón 3)', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([]);
    mockedSamples.mockRejectedValue(new ApiError(500, 'Caído'));
    render(<AnestheticsManager token="tok" allowed />);
    await user.click(await screen.findByRole('button', { name: 'Cargar sugeridos' }));
    await waitFor(() =>
      expect(notifyError).toHaveBeenCalledWith('No pudimos cargar los anestésicos sugeridos.', expect.anything()),
    );
  });

  it('alta: valida en español antes de enviar y añade la fila', async () => {
    const user = setupUser();
    const mepi = { ...lido, id: 'a2', name: 'Mepivacaína 3 %', activeIngredient: 'Mepivacaína', vasoconstrictor: null };
    mockedCreate.mockResolvedValue(mepi);
    render(<AnestheticsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Anestésicos' });

    await user.click(screen.getByRole('button', { name: 'Nuevo anestésico' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir anestésico' }));
    expect(await within(dialog).findByText('Escribe el nombre comercial o de presentación.')).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Concentración (%)')).toHaveAttribute('aria-invalid', 'true');
    expect(mockedCreate).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Nombre'), 'Mepivacaína 3 %');
    await user.type(within(dialog).getByLabelText('Principio activo'), 'Mepivacaína');
    await user.type(within(dialog).getByLabelText('Concentración (%)'), '3');
    await user.type(within(dialog).getByLabelText('Volumen del carpule (ml)'), '1,8');
    await user.type(within(dialog).getByLabelText('Dosis máxima (mg/kg)'), '6,6');
    await user.type(within(dialog).getByLabelText('Tope absoluto (mg)'), '400');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir anestésico' }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Mepivacaína 3 %',
        activeIngredient: 'Mepivacaína',
        vasoconstrictor: null,
        concentrationPct: 3,
        mlPerCarpule: 1.8,
        maxMgPerKg: 6.6,
        maxAbsoluteMg: 400,
        pediatricMaxMgPerKg: null,
        minAgeYears: null,
      }),
    );
    expect(await screen.findByText('2 anestésicos')).toBeInTheDocument();
  });

  it('edición: avisa de que lo registrado no cambia y envía solo lo cambiado', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...lido, maxAbsoluteMg: 300 });
    render(<AnestheticsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Anestésicos' });
    await user.click(within(table).getByRole('button', { name: `Acciones de ${lido.name}` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/no cambia las anestesias ya registradas/)).toBeInTheDocument();
    const absolute = within(dialog).getByLabelText('Tope absoluto (mg)');
    await user.clear(absolute);
    await user.type(absolute, '300');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'a1', { maxAbsoluteMg: 300 }));
    expect(await within(table).findByText('300 mg')).toBeInTheDocument();
  });

  it('desactivar: PATCH active=false y la fila queda «Inactivo»; activar la devuelve', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValueOnce({ ...lido, active: false }).mockResolvedValueOnce(lido);
    render(<AnestheticsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Anestésicos' });
    await user.click(within(table).getByRole('button', { name: `Acciones de ${lido.name}` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'a1', { active: false }));
    expect(await within(table).findByText('Inactivo')).toBeInTheDocument();

    await user.click(within(table).getByRole('button', { name: `Acciones de ${lido.name}` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Activar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenLastCalledWith('tok', 'a1', { active: true }));
  });

  it('si falla desactivar, aviso con reintento y la fila no cambia', async () => {
    const user = setupUser();
    mockedUpdate.mockRejectedValue(new ApiError(500, 'Caído'));
    render(<AnestheticsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Anestésicos' });
    await user.click(within(table).getByRole('button', { name: `Acciones de ${lido.name}` }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    await waitFor(() => expect(notifyError).toHaveBeenCalled());
    expect(within(table).queryByText('Inactivo')).not.toBeInTheDocument();
  });
});
