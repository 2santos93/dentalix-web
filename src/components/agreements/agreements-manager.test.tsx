import { render, screen, waitFor, within } from '@testing-library/react';
import { AgreementsManager } from './agreements-manager';
import {
  createAgreement,
  deleteAgreement,
  listAgreements,
  updateAgreement,
  type Agreement,
} from '@/lib/agreements/agreements-api';
import { listPayers, type Payer } from '@/lib/payers/payers-api';
import { listPriceLists } from '@/lib/price-lists/price-lists-api';
import { listCatalogItems, type DentalCatalogItem } from '@/lib/odontogram/catalog-api';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';
import { notifyError } from '../errors/notify';
import { clinicLocation } from '@/lib/test/locations';

jest.mock('../../lib/agreements/agreements-api', () => ({
  ...jest.requireActual('../../lib/agreements/agreements-api'),
  listAgreements: jest.fn(),
  createAgreement: jest.fn(),
  updateAgreement: jest.fn(),
  deleteAgreement: jest.fn(),
}));
jest.mock('../../lib/payers/payers-api', () => ({
  ...jest.requireActual('../../lib/payers/payers-api'),
  listPayers: jest.fn(),
}));
jest.mock('../../lib/price-lists/price-lists-api', () => ({
  ...jest.requireActual('../../lib/price-lists/price-lists-api'),
  listPriceLists: jest.fn(),
}));
jest.mock('../../lib/odontogram/catalog-api', () => ({
  ...jest.requireActual('../../lib/odontogram/catalog-api'),
  listCatalogItems: jest.fn(),
}));
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = listAgreements as jest.MockedFunction<typeof listAgreements>;
const mockedCreate = createAgreement as jest.MockedFunction<typeof createAgreement>;
const mockedUpdate = updateAgreement as jest.MockedFunction<typeof updateAgreement>;
const mockedDelete = deleteAgreement as jest.MockedFunction<typeof deleteAgreement>;
const mockedPayers = listPayers as jest.MockedFunction<typeof listPayers>;
const mockedPriceLists = listPriceLists as jest.MockedFunction<typeof listPriceLists>;
const mockedCatalog = listCatalogItems as jest.MockedFunction<typeof listCatalogItems>;
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;
const mockedNotify = notifyError as jest.MockedFunction<typeof notifyError>;

const sanavidaPayer: Payer = {
  id: 'payer-1',
  name: 'Sanavida',
  type: 'PUBLIC_SYSTEM',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const norte: ClinicLocation = clinicLocation({
  id: 'loc-1',
  name: 'Sede Norte',
  address: null,
  country: 'CO',
  isActive: true,
  timeZone: 'America/Bogota',
  createdAt: '2026-01-01T00:00:00Z',
});

const porcentaje: Agreement = {
  id: 'ag-1',
  name: 'Convenio Sanavida',
  payer: { id: 'payer-1', name: 'Sanavida', type: 'PREPAID_PLAN' },
  kind: 'PERCENT_DISCOUNT',
  percent: 15,
  percentByCategory: { Preventiva: 20, Endodoncia: 5 },
  priceList: null,
  locationId: null,
  validFrom: '2026-01-01',
  validTo: '2026-12-31',
  active: true,
  assignedCount: 3,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const lista: Agreement = {
  ...porcentaje,
  id: 'ag-2',
  name: 'Surco tarifas',
  kind: 'PRICE_LIST',
  percent: null,
  percentByCategory: null,
  priceList: { id: 'pl-1', name: 'Lista Surco 2026', currency: 'COP' },
  locationId: 'loc-1',
  validFrom: null,
  validTo: null,
  assignedCount: 0,
};
const inactivo: Agreement = { ...porcentaje, id: 'ag-3', name: 'Antiguo', active: false, validFrom: null };

function catalogItem(id: string, category: string | null): DentalCatalogItem {
  return {
    id,
    tenantId: 't1',
    code: id,
    category,
    kind: 'PROCEDURE',
    labelEs: id,
    labelEn: null,
    labelPt: null,
    color: '#0E7490',
    defaultPrice: 1000,
    active: true,
    createdAt: '2026-07-31T10:00:00.000Z',
    updatedAt: '2026-07-31T10:00:00.000Z',
  };
}

/** Teléfono: `DataList` pinta tarjetas cuando `matchMedia` dice que sí. */
let restorePhone: (() => void) | null = null;
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
  restorePhone = () => {
    window.matchMedia = original;
    restorePhone = null;
  };
}
afterEach(() => restorePhone?.());

/** Abre el «⋯» de la fila y elige la acción. */
async function rowAction(user: ReturnType<typeof setupUser>, row: string, action: string) {
  await user.click(screen.getByRole('button', { name: `Acciones de ${row}` }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
}

describe('AgreementsManager (DX-105)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([porcentaje, lista, inactivo]);
    mockedPayers.mockResolvedValue([sanavidaPayer]);
    mockedPriceLists.mockResolvedValue([]);
    mockedCatalog.mockResolvedValue([
      catalogItem('a', 'Preventiva'),
      catalogItem('b', 'Endodoncia'),
      catalogItem('c', 'Preventiva'),
      catalogItem('d', null),
    ]);
    mockedLocations.mockResolvedValue([norte]);
  });

  it('solo ADMIN: otro rol ve el aviso y no se pide nada', () => {
    render(<AgreementsManager token="tok" allowed={false} />);
    expect(screen.getByText('Solo administración gestiona los convenios.')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lista con pagador, condición (que dice el tipo), sede, vigencia y pacientes', async () => {
    render(<AgreementsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Convenios' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Convenio Sanavida');
    expect(rows[1]).toHaveTextContent('Sanavida');
    // DX-378 (FE-078): el % con el formato de la sede (es-CO: «15%»), no con «es» («15 %»).
    expect(rows[1]).toHaveTextContent('15% de descuento · 2 categorías con porcentaje propio');
    expect(rows[1]).toHaveTextContent('Toda la clínica');
    expect(rows[1]).toHaveTextContent('01/01/2026 – 31/12/2026');
    expect(rows[1]).toHaveTextContent('3');
    // El estado solo se ve cuando es la excepción.
    expect(rows[1]).not.toHaveTextContent('Activo');
    expect(rows[2]).toHaveTextContent('Lista: Lista Surco 2026');
    expect(rows[2]).toHaveTextContent('Sede Norte');
    expect(rows[2]).toHaveTextContent('Sin límite');
    expect(rows[3]).toHaveTextContent('Inactivo');
    expect(rows[3]).toHaveTextContent('Hasta 31/12/2026');
    expect(screen.getByText('3 convenios')).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { includeInactive: true });
    expect(mockedPayers).toHaveBeenCalledWith('tok');
    expect(mockedPriceLists).toHaveBeenCalledWith('tok');
    expect(mockedCatalog).toHaveBeenCalledWith('tok', { kind: 'PROCEDURE' });
  });

  it('SEC-047: un convenio de pagador OTHER avisa de que solo lo asigna un administrador', async () => {
    mockedList.mockResolvedValue([
      porcentaje,
      { ...porcentaje, id: 'ag-9', name: 'Cortesía socios', payer: { id: 'payer-9', name: 'Cortesía', type: 'OTHER' } },
    ]);
    render(<AgreementsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Convenios' });
    const rows = within(table).getAllByRole('row');
    const warning =
      'Solo un administrador podrá asignarlo. Si es una aseguradora o una empresa, reclasifica el pagador.';
    expect(rows[1]).not.toHaveTextContent(warning);
    expect(rows[2]).toHaveTextContent(warning);
  });

  it('teléfono: la tarjeta conserva el aviso de SEC-047 y el número de pacientes', async () => {
    mockPhone();
    mockedList.mockResolvedValue([
      porcentaje,
      { ...porcentaje, id: 'ag-9', name: 'Cortesía socios', payer: { id: 'payer-9', name: 'Cortesía', type: 'OTHER' } },
    ]);
    render(<AgreementsManager token="tok" allowed />);
    const list = await screen.findByRole('list', { name: 'Convenios' });
    const cards = within(list).getAllByRole('listitem');
    expect(
      within(cards[1]).getByText(
        'Solo un administrador podrá asignarlo. Si es una aseguradora o una empresa, reclasifica el pagador.',
      ),
    ).toBeInTheDocument();
    expect(cards[0]).toHaveTextContent('3 pacientes');
    expect(cards[0]).toHaveTextContent('Sanavida · 15% de descuento');
    expect(within(cards[0]).getByRole('button', { name: 'Acciones de Convenio Sanavida' })).toBeInTheDocument();
  });

  // Excepción G5.3 (DX-334): tipo de pagador anterior a DX-326.
  it('legacy: un convenio de pagador OTRO de una API anterior sigue avisando de que es interno', async () => {
    mockedList.mockResolvedValue([
      { ...porcentaje, id: 'ag-9', name: 'Cortesía socios', payer: { id: 'payer-9', name: 'Cortesía', type: 'OTRO' as never } },
    ]);
    render(<AgreementsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Convenios' });
    expect(within(table).getAllByRole('row')[1]).toHaveTextContent(
      'Solo un administrador podrá asignarlo. Si es una aseguradora o una empresa, reclasifica el pagador.',
    );
  });

  it('vacío: enseña qué hacer', async () => {
    mockedList.mockResolvedValue([]);
    render(<AgreementsManager token="tok" allowed />);
    expect(await screen.findByText('Todavía no hay convenios.')).toBeInTheDocument();
    expect(screen.queryByText('0 convenios')).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Nuevo convenio' })).toHaveLength(1);
  });

  it('si falla cualquier carga, error con reintento', async () => {
    const user = setupUser();
    mockedPayers.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    render(<AgreementsManager token="tok" allowed />);
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByRole('table', { name: 'Convenios' })).toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledTimes(2);
  });

  it('crea un convenio: el selector ofrece las categorías distintas del catálogo', async () => {
    const user = setupUser();
    mockedCreate.mockResolvedValue({ ...porcentaje, id: 'ag-9', name: 'Beta' });
    render(<AgreementsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Convenios' });

    await user.click(screen.getByRole('button', { name: 'Nuevo convenio' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir categoría' }));
    expect(
      within(within(dialog).getByLabelText('Categoría 1'))
        .getAllByRole('option')
        .map((o) => o.textContent),
    ).toEqual(['Elige una categoría', 'Endodoncia', 'Preventiva']);

    await user.type(within(dialog).getByLabelText('Nombre'), 'Beta');
    await user.selectOptions(within(dialog).getByLabelText('Pagador'), 'payer-1');
    await user.type(within(dialog).getByLabelText('Descuento general (%)'), '10');
    await user.click(within(dialog).getByRole('button', { name: 'Quitar la categoría 1' }));
    await user.click(within(dialog).getByRole('button', { name: 'Crear convenio' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        name: 'Beta',
        payerId: 'payer-1',
        kind: 'PERCENT_DISCOUNT',
        percent: 10,
      }),
    );
    const table = await screen.findByRole('table', { name: 'Convenios' });
    const names = within(table)
      .getAllByRole('row')
      .slice(1)
      .map((r) => within(r).getAllByRole('cell')[0].textContent);
    expect(names).toEqual(['AntiguoInactivoSanavida', 'BetaSanavida', 'Convenio SanavidaSanavida', 'Surco tarifasSanavida']);
  });

  it('desactiva y, si falla, avisa con reintento sin cambiar la lista', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValueOnce({ ...porcentaje, active: false });
    render(<AgreementsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Convenios' });

    await rowAction(user, 'Convenio Sanavida', 'Desactivar');
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'ag-1', { active: false }));
    await waitFor(() => expect(within(table).getAllByText('Inactivo')).toHaveLength(2));

    mockedUpdate.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    await rowAction(user, 'Antiguo', 'Reactivar');
    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify.mock.calls[0][0]).toBe('No pudimos cambiar el estado de «Antiguo».');
    expect(mockedNotify.mock.calls[0][1]).toEqual({ onRetry: expect.any(Function) });
    expect(within(table).getAllByText('Inactivo')).toHaveLength(2);
  });

  it('retira con confirmación y el foco pasa a «Nuevo convenio»', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([inactivo]);
    mockedDelete.mockResolvedValue(undefined);
    render(<AgreementsManager token="tok" allowed />);
    await screen.findByRole('table', { name: 'Convenios' });

    await rowAction(user, 'Antiguo', 'Retirar');
    await user.click(await screen.findByRole('button', { name: 'Retirar convenio' }));
    await waitFor(() => expect(mockedDelete).toHaveBeenCalledWith('tok', 'ag-3'));
    await waitFor(() => expect(screen.queryByRole('table', { name: 'Convenios' })).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Nuevo convenio' })).toHaveFocus());
  });

  it('el 409 por pacientes asignados se muestra en el diálogo y el convenio sigue', async () => {
    const user = setupUser();
    const message = 'Este convenio tiene pacientes asignados; desactívalo en lugar de retirarlo.';
    mockedDelete.mockRejectedValue(new ApiError(409, message));
    render(<AgreementsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Convenios' });

    await rowAction(user, 'Convenio Sanavida', 'Retirar');
    const dialog = await screen.findByRole('dialog');
    // La confirmación dice la consecuencia con el número de pacientes.
    expect(
      within(dialog).getByText(
        'Tiene 3 pacientes asignados: no se puede retirar mientras los tenga. Desactívalo para que deje de aplicarse.',
      ),
    ).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Retirar convenio' }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(table).getByText('Convenio Sanavida')).toBeInTheDocument();
  });
});
