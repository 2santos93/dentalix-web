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

const sanitasPayer: Payer = {
  id: 'payer-1',
  name: 'Sanitas',
  type: 'EPS_CO',
  country: 'CO',
  active: true,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};
const norte: ClinicLocation = {
  id: 'loc-1',
  name: 'Sede Norte',
  address: null,
  country: 'CO',
  isActive: true,
  timeZone: 'America/Bogota',
  createdAt: '2026-01-01T00:00:00Z',
};

const porcentaje: Agreement = {
  id: 'ag-1',
  name: 'Convenio Sanitas',
  payer: { id: 'payer-1', name: 'Sanitas', type: 'PREPAGADA_CO' },
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
  name: 'Sura tarifas',
  kind: 'PRICE_LIST',
  percent: null,
  percentByCategory: null,
  priceList: { id: 'pl-1', name: 'Lista Sura 2026', currency: 'COP' },
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

describe('AgreementsManager (DX-105)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue([porcentaje, lista, inactivo]);
    mockedPayers.mockResolvedValue([sanitasPayer]);
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

  it('lista con pagador, tipo, condición, sede, vigencia, pacientes y estado', async () => {
    render(<AgreementsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Convenios' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Convenio Sanitas');
    expect(rows[1]).toHaveTextContent('Sanitas');
    expect(rows[1]).toHaveTextContent('Descuento porcentual');
    expect(rows[1]).toHaveTextContent('15 % · 2 categorías con porcentaje propio');
    expect(rows[1]).toHaveTextContent('Toda la clínica');
    expect(rows[1]).toHaveTextContent('01/01/2026 – 31/12/2026');
    expect(rows[1]).toHaveTextContent('3');
    expect(rows[1]).toHaveTextContent('Activo');
    expect(rows[2]).toHaveTextContent('Lista de precios');
    expect(rows[2]).toHaveTextContent('Lista Sura 2026');
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

  it('vacío: enseña qué hacer', async () => {
    mockedList.mockResolvedValue([]);
    render(<AgreementsManager token="tok" allowed />);
    expect(await screen.findByText('Todavía no hay convenios.')).toBeInTheDocument();
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
    expect(names).toEqual(['AntiguoSanitas', 'BetaSanitas', 'Convenio SanitasSanitas', 'Sura tarifasSanitas']);
  });

  it('desactiva y, si falla, avisa con reintento sin cambiar la lista', async () => {
    const user = setupUser();
    mockedUpdate.mockResolvedValueOnce({ ...porcentaje, active: false });
    render(<AgreementsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Convenios' });

    await user.click(within(table).getByRole('button', { name: 'Desactivar «Convenio Sanitas»' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('tok', 'ag-1', { active: false }));
    expect(await within(table).findByRole('button', { name: 'Activar «Convenio Sanitas»' })).toBeInTheDocument();

    mockedUpdate.mockRejectedValueOnce(new ApiError(500, 'Caído'));
    await user.click(within(table).getByRole('button', { name: 'Activar «Antiguo»' }));
    await waitFor(() => expect(mockedNotify).toHaveBeenCalledTimes(1));
    expect(mockedNotify.mock.calls[0][0]).toBe('No pudimos cambiar el estado de «Antiguo».');
    expect(mockedNotify.mock.calls[0][1]).toEqual({ onRetry: expect.any(Function) });
    expect(within(table).getByRole('button', { name: 'Activar «Antiguo»' })).toBeInTheDocument();
  });

  it('retira con confirmación y el foco pasa a «Nuevo convenio»', async () => {
    const user = setupUser();
    mockedList.mockResolvedValue([inactivo]);
    mockedDelete.mockResolvedValue(undefined);
    render(<AgreementsManager token="tok" allowed />);
    const table = await screen.findByRole('table', { name: 'Convenios' });

    await user.click(within(table).getByRole('button', { name: 'Retirar «Antiguo»' }));
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

    await user.click(within(table).getByRole('button', { name: 'Retirar «Convenio Sanitas»' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Retirar convenio' }));
    expect(await within(dialog).findByText(message)).toBeInTheDocument();
    expect(within(table).getByText('Convenio Sanitas')).toBeInTheDocument();
  });
});
