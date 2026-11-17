import { render, screen, waitFor, within } from '@testing-library/react';
import { DentalLabsManager } from './dental-labs-manager';
import {
  createDentalLab,
  createDentalLabService,
  listDentalLabs,
  updateDentalLab,
} from '@/lib/lab-orders/lab-orders-api';
import { ApiError } from '@/lib/api/client';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { tokenFor } from '@/lib/test/prescriptions';
import { makeDentalLab, makeLabService } from '@/lib/test/lab-orders';

jest.mock('../../lib/locations/locations-api', () => ({
  listLocations: jest
    .fn()
    .mockResolvedValue([jest.requireActual('../../lib/test/sede-clock').utcSede({ id: 'loc1', currency: 'USD' })]),
}));
jest.mock('../../lib/reference/currencies-api', () => ({
  listCurrencies: jest.fn().mockResolvedValue([
    { code: 'USD', name: 'Dólar estadounidense', digits: 2 },
    { code: 'VES', name: 'Bolívar', digits: 2 },
  ]),
}));
jest.mock('../../lib/lab-orders/lab-orders-api', () => ({
  ...jest.requireActual('../../lib/lab-orders/lab-orders-api'),
  listDentalLabs: jest.fn(),
  createDentalLab: jest.fn(),
  updateDentalLab: jest.fn(),
  createDentalLabService: jest.fn(),
}));

const ADMIN = tokenFor('ADMIN', 'u-admin');

describe('DentalLabsManager (DX-017)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSessionStore();
  });

  it('lista cada laboratorio con sus servicios, plazo y precio de referencia (ADMIN)', async () => {
    jest.mocked(listDentalLabs).mockResolvedValue([
      makeDentalLab({
        services: [makeLabService(), makeLabService({ id: 'svc2', name: 'Férula de descarga', leadTimeBusinessDays: 3, referencePrice: null, referenceCurrency: null })],
      }),
    ]);
    render(<DentalLabsManager token={ADMIN} />);
    const table = await screen.findByRole('table', { name: 'Servicios de Laboratorio Dental Caracas' });
    expect(listDentalLabs).toHaveBeenCalledWith(ADMIN, { includeInactive: true });
    expect(screen.getByRole('heading', { name: 'Laboratorio Dental Caracas' })).toBeInTheDocument();
    expect(screen.getByText('Carmen Rojas · pedidos@lab.example')).toBeInTheDocument();
    const [, crown, splint] = within(table).getAllByRole('row');
    expect(crown).toHaveTextContent('Corona zirconio');
    expect(crown).toHaveTextContent('5 días hábiles');
    await waitFor(() => expect(crown).toHaveTextContent(/USD\s120,00/));
    expect(splint).toHaveTextContent('3 días hábiles');
    expect(splint).toHaveTextContent('Sin precio');
  });

  it('vacío: «Nuevo laboratorio» crea uno y aparece en la lista', async () => {
    const user = setupUser();
    jest.mocked(listDentalLabs).mockResolvedValue([]);
    jest.mocked(createDentalLab).mockResolvedValue(makeDentalLab({ services: [], contactName: null, email: null }));
    render(<DentalLabsManager token={ADMIN} />);
    await user.click(await screen.findByRole('button', { name: 'Nuevo laboratorio' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo laboratorio dental' });
    await user.click(within(dialog).getByRole('button', { name: 'Crear laboratorio' }));
    expect(await within(dialog).findByText('Escribe el nombre del laboratorio.')).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Laboratorio Dental Caracas');
    await user.type(within(dialog).getByLabelText('Correo (opcional)'), 'malo');
    await user.click(within(dialog).getByRole('button', { name: 'Crear laboratorio' }));
    expect(await within(dialog).findByText('Revisa el correo: falta la @ o el dominio.')).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Correo (opcional)'));
    await user.click(within(dialog).getByRole('button', { name: 'Crear laboratorio' }));
    await waitFor(() =>
      expect(createDentalLab).toHaveBeenCalledWith(ADMIN, {
        name: 'Laboratorio Dental Caracas',
        contactName: null,
        phone: null,
        email: null,
        notes: null,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Laboratorio Dental Caracas' })).toBeInTheDocument();
  });

  it('«Añadir servicio» con plazo y precio en USD (el precio se lee con el parser de importes)', async () => {
    const user = setupUser();
    jest.mocked(listDentalLabs).mockResolvedValue([makeDentalLab({ services: [] })]);
    jest.mocked(createDentalLabService).mockResolvedValue(makeLabService({ referencePrice: '150.50' }));
    render(<DentalLabsManager token={ADMIN} />);
    await user.click(await screen.findByRole('button', { name: 'Añadir servicio · Laboratorio Dental Caracas' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo servicio de Laboratorio Dental Caracas' });
    await user.type(within(dialog).getByLabelText('Servicio'), 'Corona zirconio');
    await user.type(within(dialog).getByLabelText('Plazo (días hábiles)'), '500');
    await user.click(within(dialog).getByRole('button', { name: 'Crear servicio' }));
    expect(await within(dialog).findByText(/Escribe un número entero de días hábiles/)).toBeInTheDocument();
    await user.clear(within(dialog).getByLabelText('Plazo (días hábiles)'));
    await user.type(within(dialog).getByLabelText('Plazo (días hábiles)'), '5');
    await user.type(within(dialog).getByLabelText('Precio de referencia (opcional)'), '150,50');
    await waitFor(() => expect(within(dialog).getByLabelText('Moneda del precio')).toHaveValue('USD'));
    await user.click(within(dialog).getByRole('button', { name: 'Crear servicio' }));
    await waitFor(() =>
      expect(createDentalLabService).toHaveBeenCalledWith(ADMIN, 'lab1', {
        name: 'Corona zirconio',
        leadTimeBusinessDays: 5,
        referencePrice: '150.50',
        referenceCurrency: 'USD',
      }),
    );
    expect(await screen.findByRole('table', { name: 'Servicios de Laboratorio Dental Caracas' })).toHaveTextContent('Corona zirconio');
  });

  it('desactivar un laboratorio: si falla, aviso con reintento y la lista no cambia', async () => {
    const user = setupUser();
    jest.mocked(listDentalLabs).mockResolvedValue([makeDentalLab()]);
    jest.mocked(updateDentalLab).mockResolvedValue(makeDentalLab({ active: false }));
    render(<DentalLabsManager token={ADMIN} />);
    await user.click(await screen.findByRole('button', { name: 'Acciones de Laboratorio Dental Caracas' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Desactivar' }));
    await waitFor(() => expect(updateDentalLab).toHaveBeenCalledWith(ADMIN, 'lab1', { active: false }));
    expect(await screen.findByText('Inactivo')).toBeInTheDocument();
  });

  it.each(['DENTIST', 'RECEPTION'])('%s lo ve sin botones ni precios', async (role) => {
    jest.mocked(listDentalLabs).mockResolvedValue([makeDentalLab({ services: [makeLabService({ referencePrice: null, referenceCurrency: null })] })]);
    render(<DentalLabsManager token={tokenFor(role, 'u-x')} />);
    const table = await screen.findByRole('table', { name: 'Servicios de Laboratorio Dental Caracas' });
    expect(within(table).queryByText('Precio de referencia')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Nuevo laboratorio|Añadir servicio|Acciones de/ })).not.toBeInTheDocument();
  });

  it('error de carga con «Reintentar»', async () => {
    const user = setupUser();
    jest.mocked(listDentalLabs).mockRejectedValueOnce(new ApiError(500, 'x')).mockResolvedValueOnce([makeDentalLab()]);
    render(<DentalLabsManager token={ADMIN} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar los laboratorios dentales.');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('heading', { name: 'Laboratorio Dental Caracas' })).toBeInTheDocument();
  });
});
