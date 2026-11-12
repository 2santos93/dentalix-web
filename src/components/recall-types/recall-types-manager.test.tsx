import { render, screen, waitFor, within } from '@testing-library/react';
import { RecallTypesManager, mergeRecallTypes } from './recall-types-manager';
import {
  createRecallType,
  listRecallTypes,
  retireRecallType,
  setRecallTypeTriggers,
  updateRecallType,
  type RecallType,
} from '@/lib/recall/recall-api';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import { ApiError } from '@/lib/api/client';
import { notifyError } from '@/components/errors/notify';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/recall/recall-api', () => ({
  ...jest.requireActual('../../lib/recall/recall-api'),
  listRecallTypes: jest.fn(),
  createRecallType: jest.fn(),
  updateRecallType: jest.fn(),
  retireRecallType: jest.fn(),
  setRecallTypeTriggers: jest.fn(),
}));
jest.mock('../../lib/odontogram/catalog-api', () => ({ listCatalogItems: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = jest.mocked(listRecallTypes);
const mockedCreate = jest.mocked(createRecallType);
const mockedUpdate = jest.mocked(updateRecallType);
const mockedRetire = jest.mocked(retireRecallType);
const mockedTriggers = jest.mocked(setRecallTypeTriggers);
const mockedCatalog = jest.mocked(listCatalogItems);
const mockedNotify = jest.mocked(notifyError);

const type = (over: Partial<RecallType> & Pick<RecallType, 'id' | 'name'>): RecallType => ({
  defaultIntervalMonths: 6,
  active: true,
  sortOrder: 10,
  systemKey: null,
  exclusionGroup: null,
  triggerCatalogItemIds: [],
  triggers: [],
  ...over,
});
const hyg = type({
  id: 't-hyg',
  name: 'Higiene',
  systemKey: 'HYGIENE',
  exclusionGroup: 'HYGIENE_PERIO',
  triggerCatalogItemIds: ['c-pro'],
  triggers: [{ catalogItemId: 'c-pro', code: 'PREV-PROFILAXIS', name: 'Profilaxis' }],
});
const ctl = type({ id: 't-ctl', name: 'Control', systemKey: 'CHECKUP', sortOrder: 20, defaultIntervalMonths: 12 });
const perio = type({
  id: 't-perio',
  name: 'Mantenimiento periodontal',
  sortOrder: 30,
  defaultIntervalMonths: 3,
  exclusionGroup: 'HYGIENE_PERIO',
});
const TYPES = [hyg, ctl, perio];

const procedure = (id: string, code: string, labelEs: string): DentalCatalogItem => ({
  id,
  tenantId: 't1',
  code,
  category: null,
  kind: 'PROCEDURE',
  labelEs,
  labelEn: null,
  labelPt: null,
  color: '#0E7490',
  defaultPrice: null,
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
});
const CATALOG = [
  procedure('c-pro', 'PREV-PROFILAXIS', 'Profilaxis'),
  procedure('c-orto', 'ORTO-CONTROL', 'Control de ortodoncia'),
];

async function table() {
  return screen.findByRole('table', { name: 'Tipos de recall' });
}

function rowOf(t: HTMLElement, name: string): HTMLElement {
  return within(t)
    .getAllByRole('row')
    .find((r) => within(r).queryAllByRole('cell')[0]?.textContent?.startsWith(name))!;
}

/** La fila se abre por su celda principal (un botón con el nombre). */
function primaryOf(t: HTMLElement, name: string): HTMLElement {
  return within(t).getByRole('button', { name: new RegExp(`^${name}`) });
}

describe('RecallTypesManager (DX-015-bis)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // El grupo nuevo de la exclusión sale de aquí: `G_` + 8 caracteres.
    jest.spyOn(crypto, 'randomUUID').mockReturnValue('test0001-0000-4000-8000-000000000000');
    mockedList.mockResolvedValue(TYPES);
    mockedCatalog.mockResolvedValue(CATALOG);
  });

  it('solo ADMIN: otro rol ve el aviso y no se pide nada', () => {
    render(<RecallTypesManager token="tok" allowed={false} />);
    expect(screen.getByText(/solo administración gestiona los tipos de recall/i)).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lista en el orden de la API con intervalo, disparadores, estado y exclusión', async () => {
    mockedList.mockResolvedValue([hyg, ctl, { ...perio, active: false }]);
    render(<RecallTypesManager token="tok" allowed />);
    const t = await table();
    const rows = within(t).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'HigieneExcluyente con Mantenimiento periodontal',
      'Control',
      'Mantenimiento periodontalExcluyente con Higiene',
    ]);
    expect(rows[0]).toHaveTextContent('6 meses');
    expect(rows[0]).toHaveTextContent('Profilaxis');
    expect(rows[0]).toHaveTextContent('Activo');
    expect(rows[1]).toHaveTextContent('12 meses');
    expect(rows[1]).toHaveTextContent('Ninguno');
    expect(rows[2]).toHaveTextContent('Inactivo');
  });

  it('error de carga con reintento', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render(<RecallTypesManager token="tok" allowed />);
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await table()).toBeInTheDocument();
  });

  it('Higiene y Control (del sistema) no se retiran; uno propio sí, con confirmación', async () => {
    const user = setupUser();
    mockedRetire.mockResolvedValue(undefined);
    render(<RecallTypesManager token="tok" allowed />);
    const t = await table();

    await user.click(within(t).getByRole('button', { name: 'Acciones de Higiene' }));
    expect(await screen.findByRole('menuitem', { name: 'Desactivar' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Retirar' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(within(t).getByRole('button', { name: 'Acciones de Mantenimiento periodontal' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Retirar' }));
    await user.click(await screen.findByRole('button', { name: 'Retirar tipo' }));
    await waitFor(() => expect(mockedRetire).toHaveBeenCalledWith('tok', 't-perio'));
    await waitFor(() => expect(within(t).queryByText('Mantenimiento periodontal', { exact: true })).not.toBeInTheDocument());
  });

  it('desactivar un tipo del sistema es un PATCH de activo', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...ctl, active: false });
    render(<RecallTypesManager token="tok" allowed />);
    const t = await table();
    await user.click(within(t).getByRole('button', { name: 'Acciones de Control' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 't-ctl', { active: false }));
    await waitFor(() => expect(rowOf(t, 'Control')).toHaveTextContent('Inactivo'));
  });

  it('crea un tipo con un disparador y excluyente con otro sin grupo: grupo nuevo y PATCH de los dos', async () => {
    const user = setupUser();
    const created = type({ id: 't-orto', name: 'Retención de ortodoncia', sortOrder: 40, defaultIntervalMonths: 4, exclusionGroup: 'G_TEST0001' });
    mockedCreate.mockResolvedValue(created);
    mockedTriggers.mockResolvedValue({
      ...created,
      triggerCatalogItemIds: ['c-orto'],
      triggers: [{ catalogItemId: 'c-orto', code: 'ORTO-CONTROL', name: 'Control de ortodoncia' }],
    });
    mockedUpdate.mockResolvedValue({ ...ctl, exclusionGroup: 'G_TEST0001' });
    render(<RecallTypesManager token="tok" allowed />);
    await table();

    await user.click(screen.getByRole('button', { name: 'Nuevo tipo' }));
    const dialog = await screen.findByRole('dialog');
    // Validación propia antes de enviar.
    const months = within(dialog).getByLabelText('Intervalo por defecto (meses)');
    await user.clear(months);
    await user.type(months, '40');
    await user.click(within(dialog).getByRole('button', { name: 'Crear tipo' }));
    expect(await within(dialog).findByText(/escribe un nombre/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/entre 1 y 36/)).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Nombre'), 'Retención de ortodoncia');
    await user.clear(months);
    await user.type(months, '4');
    await user.selectOptions(within(dialog).getByLabelText('Excluyente con'), 't-ctl');
    expect(
      within(dialog).getByText(/Se aplica al próximo procedimiento de cada paciente; no cambia los recalls de hoy/),
    ).toBeInTheDocument();
    await user.click(await within(dialog).findByRole('checkbox', { name: /Control de ortodoncia/ }));
    expect(within(dialog).getByText('1 elegido')).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Crear tipo' }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Retención de ortodoncia',
        defaultIntervalMonths: 4,
        active: true,
        exclusionGroup: 'G_TEST0001',
      }),
    );
    await waitFor(() => expect(mockedTriggers).toHaveBeenCalledWith('tok', 't-orto', ['c-orto']));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 't-ctl', { exclusionGroup: 'G_TEST0001' }));
    // El otro tipo va primero: si fallara, no se habría creado nada.
    expect(mockedUpdate.mock.invocationCallOrder[0]).toBeLessThan(mockedCreate.mock.invocationCallOrder[0]);
    expect(mockedCreate.mock.invocationCallOrder[0]).toBeLessThan(mockedTriggers.mock.invocationCallOrder[0]);
    const t = await table();
    await waitFor(() => expect(rowOf(t, 'Retención de ortodoncia')).toHaveTextContent('Excluyente con Control'));
    expect(rowOf(t, 'Retención de ortodoncia')).toHaveTextContent('Control de ortodoncia');
    expect(rowOf(t, 'Retención de ortodoncia')).toHaveTextContent('4 meses');
  });

  it('al editar: aviso del intervalo, «Ninguno» quita el grupo y los disparadores no viajan si no cambian', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...perio, exclusionGroup: null, defaultIntervalMonths: 4 });
    render(<RecallTypesManager token="tok" allowed />);
    const t = await table();
    await user.click(primaryOf(t, 'Mantenimiento periodontal'));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Solo se aplica a los recalls que se creen a partir de ahora.')).toBeInTheDocument();
    const select = within(dialog).getByLabelText('Excluyente con');
    expect(select).toHaveValue('t-hyg');
    await user.selectOptions(select, '');
    const months = within(dialog).getByLabelText('Intervalo por defecto (meses)');
    await user.clear(months);
    await user.type(months, '4');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 't-perio', {
        name: 'Mantenimiento periodontal',
        defaultIntervalMonths: 4,
        active: true,
        exclusionGroup: null,
      }),
    );
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(mockedTriggers).not.toHaveBeenCalled();
  });

  it('excluyente con un tipo que ya tiene grupo: usa el suyo y no toca al otro', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...ctl, exclusionGroup: 'HYGIENE_PERIO' });
    render(<RecallTypesManager token="tok" allowed />);
    const t = await table();
    await user.click(primaryOf(t, 'Control'));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Excluyente con'), 't-hyg');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 't-ctl', expect.objectContaining({ exclusionGroup: 'HYGIENE_PERIO' })),
    );
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
  });

  it('si falla el PATCH del otro tipo no se guarda nada: Higiene conserva su exclusión con Perio', async () => {
    const user = setupUser();
    mockedUpdate.mockRejectedValue(new ApiError(500, 'Caído'));
    render(<RecallTypesManager token="tok" allowed />);
    const t = await table();
    await user.click(primaryOf(t, 'Higiene'));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Excluyente con'), 't-ctl');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialog).findByText(/No pudimos marcar «Control» como excluyente: no se guardó nada/)).toBeInTheDocument();
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 't-ctl', { exclusionGroup: 'G_TEST0001' });
    expect(mockedTriggers).not.toHaveBeenCalled();
    // La tabla está tras el modal (aria-hidden): se lee su texto.
    expect(t).toHaveTextContent('HigieneExcluyente con Mantenimiento periodontal');
  });

  it('si el otro tipo se guardó y este falla, el reintento reutiliza su grupo sin otro PATCH', async () => {
    const user = setupUser();
    mockedUpdate.mockImplementation(async (_tok, id, input) => {
      if (id === 't-ctl') return { ...ctl, exclusionGroup: input.exclusionGroup ?? null };
      throw new ApiError(500, 'Caído');
    });
    render(<RecallTypesManager token="tok" allowed />);
    const t = await table();
    await user.click(primaryOf(t, 'Higiene'));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Excluyente con'), 't-ctl');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    expect(await within(dialog).findByText(/No pudimos guardar el tipo de recall/)).toBeInTheDocument();

    mockedUpdate.mockClear();
    mockedUpdate.mockResolvedValueOnce({ ...hyg, exclusionGroup: 'G_TEST0001' });
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 't-hyg', expect.objectContaining({ exclusionGroup: 'G_TEST0001' })),
    );
    expect(mockedUpdate).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(rowOf(t, 'Higiene')).toHaveTextContent('Excluyente con Control'));
  });

  it('si fallan los disparadores, la exclusión pendiente ya quedó guardada y el aviso solo nombra los disparadores', async () => {
    const user = setupUser();
    mockedUpdate.mockImplementation(async (_tok, id, input) =>
      id === 't-ctl' ? { ...ctl, exclusionGroup: input.exclusionGroup ?? null } : { ...perio, exclusionGroup: 'G_TEST0001' },
    );
    mockedTriggers.mockRejectedValue(new ApiError(500, 'Caído'));
    render(<RecallTypesManager token="tok" allowed />);
    const t = await table();
    await user.click(primaryOf(t, 'Mantenimiento periodontal'));
    const dialog = await screen.findByRole('dialog');
    await user.selectOptions(within(dialog).getByLabelText('Excluyente con'), 't-ctl');
    await user.click(await within(dialog).findByRole('checkbox', { name: /Profilaxis/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockedNotify).toHaveBeenCalled());
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 't-ctl', { exclusionGroup: 'G_TEST0001' });
    expect(mockedUpdate).toHaveBeenCalledWith('tok', 't-perio', expect.objectContaining({ exclusionGroup: 'G_TEST0001' }));
    const [message, opts] = mockedNotify.mock.calls[0];
    expect(message).toMatch(/^Se guardó «Mantenimiento periodontal», pero no sus disparadores\./);
    expect(message).toMatch(/desde «Editar»/);
    expect(opts?.onRetry).toEqual(expect.any(Function));
    await waitFor(() => expect(rowOf(t, 'Control')).toHaveTextContent('Excluyente con Mantenimiento periodontal'));
  });

  it('un 409 de nombre repetido se queda en el modal (escalón 4)', async () => {
    const user = setupUser();
    mockedCreate.mockRejectedValue(new ApiError(409, 'Ya existe un tipo de recall con ese nombre.'));
    render(<RecallTypesManager token="tok" allowed />);
    await table();
    await user.click(screen.getByRole('button', { name: 'Nuevo tipo' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText('Nombre'), 'higiene');
    await user.click(within(dialog).getByRole('button', { name: 'Crear tipo' }));
    expect(await within(dialog).findByText('Ya existe un tipo de recall con ese nombre.')).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('un 422 de disparadores tras guardar el tipo: se cierra, la lista lo muestra y un aviso reintenta', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValue({ ...ctl, name: 'Control anual' });
    mockedTriggers.mockRejectedValue(
      new ApiError(422, 'Algún procedimiento no es un procedimiento vivo del catálogo de esta clínica.'),
    );
    render(<RecallTypesManager token="tok" allowed />);
    const t = await table();
    await user.click(primaryOf(t, 'Control'));
    const dialog = await screen.findByRole('dialog');
    const name = within(dialog).getByLabelText('Nombre');
    await user.clear(name);
    await user.type(name, 'Control anual');
    await user.click(await within(dialog).findByRole('checkbox', { name: /Profilaxis/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(mockedNotify).toHaveBeenCalled());
    const [message, opts] = mockedNotify.mock.calls[0];
    expect(message).toMatch(/^Se guardó «Control anual», pero no sus disparadores\./);
    expect(opts?.onRetry).toEqual(expect.any(Function));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(rowOf(t, 'Control anual')).toBeTruthy();

    mockedTriggers.mockResolvedValueOnce({ ...ctl, name: 'Control anual', triggerCatalogItemIds: ['c-pro'], triggers: hyg.triggers });
    opts!.onRetry!();
    await waitFor(() => expect(mockedTriggers).toHaveBeenLastCalledWith('tok', 't-ctl', ['c-pro']));
    await waitFor(() => expect(rowOf(t, 'Control anual')).toHaveTextContent('Profilaxis'));
  });

  it('si el catálogo no carga, el campo de disparadores da su error con reintento', async () => {
    const user = setupUser();
    mockedCatalog.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render(<RecallTypesManager token="tok" allowed />);
    await table();
    await user.click(screen.getByRole('button', { name: 'Nuevo tipo' }));
    const dialog = await screen.findByRole('dialog');
    const status = await within(dialog).findByRole('status');
    expect(status).toHaveTextContent('No cargó el catálogo');
    await user.click(within(status).getByRole('button', { name: /reintentar/i }));
    expect(await within(dialog).findByRole('checkbox', { name: /Profilaxis/ })).toBeInTheDocument();
  });

  it('mergeRecallTypes sustituye en su sitio y añade al final', () => {
    const merged = mergeRecallTypes(TYPES, [{ ...ctl, name: 'Control anual' }, type({ id: 't-new', name: 'Nuevo' })]);
    expect(merged.map((t) => t.name)).toEqual(['Higiene', 'Control anual', 'Mantenimiento periodontal', 'Nuevo']);
  });
});
