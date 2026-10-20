import { render, screen, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { setupUser } from '@/lib/test/user';
import { CatalogView } from './catalog-view';
import {
  listCatalogDirectory,
  listCatalogItems,
  createCatalogItem,
  updateCatalogItem,
  type DentalCatalogItem,
} from '@/lib/odontogram/catalog-api';
import { Toaster } from '@/components/errors/toaster';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { listLocations, type ClinicLocation } from '@/lib/locations/locations-api';
import { ApiError } from '@/lib/api/client';
import { tokenFor } from '@/lib/test/prescriptions';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC transform
// (only real import/require specifiers are) — use a relative path here, same
// convention as staff-view.test.tsx / agenda-view.test.tsx.
jest.mock('../../lib/odontogram/catalog-api', () => ({
  ...jest.requireActual('../../lib/odontogram/catalog-api'),
  listCatalogDirectory: jest.fn(),
  listCatalogItems: jest.fn(),
  createCatalogItem: jest.fn(),
  updateCatalogItem: jest.fn(),
}));

// Las sedes deciden la moneda base de la clínica (DX-063): una clínica en
// Colombia por defecto.
jest.mock('../../lib/locations/locations-api', () => ({ listLocations: jest.fn() }));
const mockedLocations = listLocations as jest.MockedFunction<typeof listLocations>;

function clinicIn(country: ClinicLocation['country']): ClinicLocation[] {
  return [
    {
      id: 'l1',
      name: 'Principal',
      address: null,
      country,
      isActive: true,
      timeZone: country === 'ES' ? 'Europe/Madrid' : 'America/Bogota',
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];
}

const mockedList = listCatalogDirectory as jest.MockedFunction<
  typeof listCatalogDirectory
>;
const mockedCreate = createCatalogItem as jest.MockedFunction<
  typeof createCatalogItem
>;
const mockedUpdate = updateCatalogItem as jest.MockedFunction<
  typeof updateCatalogItem
>;

const item1: DentalCatalogItem = {
  id: 'c1',
  tenantId: 't1',
  code: 'PROF',
  category: 'Preventiva',
  kind: 'PROCEDURE',
  labelEs: 'Profilaxis',
  labelEn: null,
  labelPt: null,
  color: '#0E7490',
  defaultPrice: 80000,
  active: true,
  createdAt: '2026-07-31T10:00:00.000Z',
  updatedAt: '2026-07-31T10:00:00.000Z',
};

/** Envuelve filas en la página que devuelve el endpoint de directorio. */
function page(items: DentalCatalogItem[], total = items.length, pageNum = 1) {
  return { items, total, page: pageNum, pageSize: 20 };
}

/** Los params de la ÚLTIMA llamada al API — lo que de verdad se le pidió al servidor. */
function lastParams() {
  return mockedList.mock.calls[mockedList.mock.calls.length - 1][1];
}

/** Abre el menú ⋯ de una fila y devuelve su contenido. */
async function openRowMenu(
  user: ReturnType<typeof userEvent.setup>,
  name: RegExp,
) {
  await user.click(screen.getByRole('button', { name }));
  return screen.findByRole('menu');
}

describe('CatalogView', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedCreate.mockReset();
    mockedUpdate.mockReset();
    mockedLocations.mockReset().mockResolvedValue(clinicIn('CO'));
    // La sede activa vive en localStorage y persiste entre tests del mismo
    // fichero: sin limpiarla, el aviso de alcance se filtra a los demás casos.
    window.localStorage.clear();
  });

  it('pinta las filas de la página que devuelve el directorio', async () => {
    mockedList.mockResolvedValue(page([item1]));

    render(<CatalogView token="tok" />);

    const table = await screen.findByRole('table', { name: /catálogo/i });
    expect(within(table).getByText('Profilaxis')).toBeInTheDocument();
    expect(within(table).getByText('PROF')).toBeInTheDocument();
    // La categoría acompaña al nombre en la misma celda, como línea secundaria.
    expect(within(table).getByText('Preventiva')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(2); // cabecera + 1 ítem
  });

  it('pide la primera página al montar, sin filtros', async () => {
    mockedList.mockResolvedValue(page([item1]));

    render(<CatalogView token="tok" />);
    await screen.findByRole('table', { name: /catálogo/i });

    expect(lastParams()).toEqual({ page: 1, pageSize: 20 });
  });

  it('crear un ítem manda el payload correcto y recarga', async () => {
    mockedList.mockResolvedValueOnce(page([], 0));
    mockedCreate.mockResolvedValue(item1);
    mockedList.mockResolvedValueOnce(page([item1]));

    const user = setupUser();
    render(<CatalogView token="tok" />);

    await screen.findByText(/el catálogo todavía está vacío/i);

    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));
    await user.type(screen.getByLabelText(/^nombre$/i), 'Profilaxis');
    await user.type(screen.getByLabelText(/^código$/i), 'PROF');
    await user.type(screen.getByLabelText(/precio por defecto/i), '80000');

    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        code: 'PROF',
        kind: 'PROCEDURE',
        labelEs: 'Profilaxis',
        color: '#0E7490',
        allowDiscount: true,
        defaultPrice: 80000,
      }),
    );
    await waitFor(() => expect(mockedList).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Profilaxis')).toBeInTheDocument();
  });

  // «Tipo» era el único campo del formulario sin texto de ayuda, y es el que
  // decide dónde acaba el ítem: elegir mal no da error, simplemente el ítem no
  // aparece nunca donde se le espera. La ayuda no es adorno, es la única señal.
  it('el campo Tipo explica cuál elegir, y el desplegable da ejemplos', async () => {
    mockedList.mockResolvedValue(page([], 0));
    const user = setupUser();
    render(<CatalogView token="tok" />);
    await screen.findByText(/el catálogo todavía está vacío/i);

    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));

    expect(
      screen.getByText(/solo los procedimientos entran en un plan/i),
    ).toBeInTheDocument();
    // Los ejemplos van en las opciones del formulario, no en el filtro de la
    // barra: es aquí donde hay que elegir sin conocer la distinción.
    expect(
      within(screen.getByLabelText(/^tipo$/i)).getByRole('option', {
        name: /procedimiento \(resina/i,
      }),
    ).toBeInTheDocument();
  });

  it('elegir «Diagnóstico» manda kind DIAGNOSIS, no el PROCEDURE por defecto', async () => {
    mockedList.mockResolvedValueOnce(page([], 0));
    mockedCreate.mockResolvedValue({ ...item1, kind: 'DIAGNOSIS' });
    mockedList.mockResolvedValueOnce(page([{ ...item1, kind: 'DIAGNOSIS' }]));

    const user = setupUser();
    render(<CatalogView token="tok" />);
    await screen.findByText(/el catálogo todavía está vacío/i);

    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));
    await user.type(screen.getByLabelText(/^nombre$/i), 'Caries dental');
    await user.selectOptions(screen.getByLabelText(/^tipo$/i), 'DIAGNOSIS');
    await user.type(screen.getByLabelText(/^código$/i), 'DX-CARIES');

    await user.click(screen.getByRole('button', { name: /^crear$/i }));

    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        code: 'DX-CARIES',
        kind: 'DIAGNOSIS',
        labelEs: 'Caries dental',
        color: '#0E7490',
        allowDiscount: true,
      }),
    );
  });

  it('«Editar» vive en el menú ⋯, abre el modal relleno y hace PATCH', async () => {
    mockedList.mockResolvedValueOnce(page([item1]));
    mockedUpdate.mockResolvedValue({ ...item1, labelEs: 'Profilaxis dental' });
    mockedList.mockResolvedValueOnce(
      page([{ ...item1, labelEs: 'Profilaxis dental' }]),
    );

    const user = setupUser();
    render(<CatalogView token="tok" />);
    await screen.findByRole('table', { name: /catálogo/i });

    const menu = await openRowMenu(user, /acciones de profilaxis/i);
    await user.click(within(menu).getByRole('menuitem', { name: /editar/i }));

    const nameInput = screen.getByLabelText(/^nombre$/i);
    expect(nameInput).toHaveValue('Profilaxis');
    await user.clear(nameInput);
    await user.type(nameInput, 'Profilaxis dental');
    await user.click(screen.getByRole('button', { name: /^guardar$/i }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'c1', {
        code: 'PROF',
        kind: 'PROCEDURE',
        labelEs: 'Profilaxis dental',
        color: '#0E7490',
        allowDiscount: true,
        defaultPrice: 80000,
        category: 'Preventiva',
      }),
    );
    expect(await screen.findByText('Profilaxis dental')).toBeInTheDocument();
  });

  // Revisión DX-241: un precio de catálogo en COP con céntimos (la API lo
  // guarda en Decimal(12,2)) se edita sin tocar el precio y se guarda tal cual.
  it('DX-241: editar un ítem con precio en COP con céntimos guarda sin tocar el precio', async () => {
    const withCents = { ...item1, defaultPrice: 150000.5 };
    mockedList.mockResolvedValueOnce(page([withCents]));
    mockedUpdate.mockResolvedValue({ ...withCents, labelEs: 'Profilaxis dental' });
    mockedList.mockResolvedValueOnce(page([{ ...withCents, labelEs: 'Profilaxis dental' }]));

    const user = setupUser();
    render(<CatalogView token="tok" />);
    await screen.findByRole('table', { name: /catálogo/i });
    await waitFor(() => expect(screen.getByText('150.000,50 COP')).toBeInTheDocument());

    const menu = await openRowMenu(user, /acciones de profilaxis/i);
    await user.click(within(menu).getByRole('menuitem', { name: /editar/i }));
    const nameInput = screen.getByLabelText(/^nombre$/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Profilaxis dental');
    await user.click(screen.getByRole('button', { name: /^guardar$/i }));

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'c1', expect.objectContaining({ defaultPrice: 150000.5 })),
    );
  });

  it('«Desactivar» hace PATCH { active: false } y la fila pasa a ofrecer «Activar»', async () => {
    mockedList.mockResolvedValueOnce(page([item1]));
    mockedUpdate.mockResolvedValue({ ...item1, active: false });
    mockedList.mockResolvedValueOnce(page([{ ...item1, active: false }]));

    const user = setupUser();
    render(<CatalogView token="tok" />);
    await screen.findByRole('table', { name: /catálogo/i });

    const menu = await openRowMenu(user, /acciones de profilaxis/i);
    await user.click(
      within(menu).getByRole('menuitem', { name: /desactivar/i }),
    );

    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'c1', { active: false }),
    );
    expect(await screen.findByText('Inactivo')).toBeInTheDocument();

    const reopened = await openRowMenu(user, /acciones de profilaxis/i);
    expect(
      within(reopened).getByRole('menuitem', { name: /activar/i }),
    ).toBeInTheDocument();
  });

  it('un fallo al desactivar sale como toast con reintento, no como banner (escalón 3)', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedList.mockResolvedValue(page([item1]));
    mockedUpdate.mockRejectedValueOnce(new ApiError(500, 'Error del servidor'));
    mockedUpdate.mockResolvedValueOnce({ ...item1, active: false });

    const user = setupUser();
    render(
      <>
        <Toaster />
        <CatalogView token="tok" />
      </>,
    );
    await screen.findByRole('table', { name: /catálogo/i });

    const menu = await openRowMenu(user, /acciones de profilaxis/i);
    await user.click(
      within(menu).getByRole('menuitem', { name: /desactivar/i }),
    );

    expect(await screen.findByText('No pudimos cambiar el estado del ítem.')).toBeInTheDocument();
    // Ningún banner compite con el toast por el mismo fallo: la tabla sigue
    // siendo correcta y no se toca.
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /reintentar/i }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2));
  });

  it('muestra el error del backend tal cual cuando falla la edición', async () => {
    const { ApiError } = jest.requireActual('../../lib/api/client');
    mockedList.mockResolvedValueOnce(page([item1]));
    mockedUpdate.mockRejectedValue(new ApiError(409, 'El código ya existe'));

    const user = setupUser();
    render(<CatalogView token="tok" />);
    await screen.findByRole('table', { name: /catálogo/i });

    const menu = await openRowMenu(user, /acciones de profilaxis/i);
    await user.click(within(menu).getByRole('menuitem', { name: /editar/i }));
    await user.click(screen.getByRole('button', { name: /^guardar$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'El código ya existe',
    );
  });

  describe('búsqueda y filtros (en servidor)', () => {
    it('teclear manda la búsqueda al servidor, recortada y una sola vez', async () => {
      mockedList.mockResolvedValue(page([item1]));
      const user = setupUser();
      render(<CatalogView token="tok" />);
      await screen.findByRole('table', { name: /catálogo/i });

      const callsBefore = mockedList.mock.calls.length;
      await user.type(
        screen.getByLabelText(/buscar por nombre/i),
        '  resina  ',
      );

      await waitFor(() =>
        expect(lastParams()).toMatchObject({ query: 'resina' }),
      );
      // Un debounce, no una petición por tecla: 10 caracteres, 1 llamada más.
      expect(mockedList.mock.calls.length).toBe(callsBefore + 1);
    });

    it('el filtro de tipo viaja como `kind`', async () => {
      mockedList.mockResolvedValue(page([item1]));
      const user = setupUser();
      render(<CatalogView token="tok" />);
      await screen.findByRole('table', { name: /catálogo/i });

      await user.selectOptions(
        screen.getByLabelText(/filtrar por tipo/i),
        'DIAGNOSIS',
      );

      await waitFor(() =>
        expect(lastParams()).toMatchObject({ kind: 'DIAGNOSIS' }),
      );
    });

    it('«Solo activos» viaja como activeOnly=true y «Solo inactivos» como false', async () => {
      mockedList.mockResolvedValue(page([item1]));
      const user = setupUser();
      render(<CatalogView token="tok" />);
      await screen.findByRole('table', { name: /catálogo/i });

      const select = screen.getByLabelText(/filtrar por estado/i);
      await user.selectOptions(select, 'ACTIVE');
      await waitFor(() =>
        expect(lastParams()).toMatchObject({ activeOnly: true }),
      );

      await user.selectOptions(select, 'INACTIVE');
      await waitFor(() =>
        expect(lastParams()).toMatchObject({ activeOnly: false }),
      );
    });

    it('cambiar de filtro devuelve a la página 1', async () => {
      mockedList.mockResolvedValue(page([item1], 60, 1));
      const user = setupUser();
      render(<CatalogView token="tok" />);
      await screen.findByRole('table', { name: /catálogo/i });

      await user.click(screen.getByRole('button', { name: /siguiente/i }));
      await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));

      await user.selectOptions(
        screen.getByLabelText(/filtrar por tipo/i),
        'DIAGNOSIS',
      );

      // Sin esto la tabla se quedaría en la página 3 de un resultado que ahora
      // tiene una sola, y aparecería vacía sin motivo aparente.
      await waitFor(() => expect(lastParams()).toMatchObject({ page: 1 }));
    });

    it('sin resultados ofrece limpiar los filtros; el catálogo vacío no', async () => {
      mockedList.mockResolvedValueOnce(page([item1]));
      const user = setupUser();
      render(<CatalogView token="tok" />);
      await screen.findByRole('table', { name: /catálogo/i });

      mockedList.mockResolvedValue(page([], 0));
      await user.type(screen.getByLabelText(/buscar por nombre/i), 'zzz');

      expect(
        await screen.findByText(/ningún ítem coincide/i),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: /limpiar filtros/i }),
      ).toBeInTheDocument();
    });

    it('el catálogo vacío de verdad enseña el mensaje de bienvenida, no el de "sin coincidencias"', async () => {
      mockedList.mockResolvedValue(page([], 0));
      render(<CatalogView token="tok" />);

      expect(
        await screen.findByText(/el catálogo todavía está vacío/i),
      ).toBeInTheDocument();
      expect(
        screen.queryByText(/ningún ítem coincide/i),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: /limpiar filtros/i }),
      ).not.toBeInTheDocument();
    });

    it('el conteo dice cuántos hay, y se anuncia', async () => {
      mockedList.mockResolvedValue(page([item1], 137));
      render(<CatalogView token="tok" />);

      // Por texto y no por `role="status"`: el esqueleto de carga también lo
      // lleva, así que buscar por rol encontraría ese primero.
      const count = await screen.findByText('137 ítems');
      expect(count).toHaveAttribute('aria-live', 'polite');
    });
  });

  describe('paginación', () => {
    it('no pinta controles cuando todo cabe en una página', async () => {
      mockedList.mockResolvedValue(page([item1], 1));
      render(<CatalogView token="tok" />);
      await screen.findByRole('table', { name: /catálogo/i });

      expect(
        screen.queryByRole('navigation', { name: /paginación/i }),
      ).not.toBeInTheDocument();
    });

    it('«Siguiente» pide la página 2 al servidor', async () => {
      mockedList.mockResolvedValue(page([item1], 45, 1));
      const user = setupUser();
      render(<CatalogView token="tok" />);
      await screen.findByRole('table', { name: /catálogo/i });

      expect(screen.getByText('1–20 de 45')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: /siguiente/i }));

      await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));
    });

    it('el debounce del buscador no devuelve a la página 1 si no se tecleó nada', async () => {
      mockedList.mockResolvedValue(page([item1], 45, 1));
      const user = setupUser();
      render(<CatalogView token="tok" />);
      await screen.findByRole('table', { name: /catálogo/i });

      await user.click(screen.getByRole('button', { name: /siguiente/i }));
      await waitFor(() => expect(lastParams()).toMatchObject({ page: 2 }));

      // Se deja vencer el debounce del montaje (300 ms): con el buscador sin
      // tocar no hay búsqueda nueva, así que la página debe seguir en la 2.
      await new Promise((resolve) => setTimeout(resolve, 400));
      expect(lastParams()).toMatchObject({ page: 2 });
    });
  });

  describe('alcance del selector de sede', () => {
    it('con una sede activa avisa de que el catálogo es de toda la clínica', async () => {
      setActiveLocationId('sede-norte');
      mockedList.mockResolvedValue(page([item1]));

      render(<CatalogView token="tok" />);
      await screen.findByRole('table', { name: /catálogo/i });

      expect(await screen.findByText(/de toda la clínica/i)).toBeInTheDocument();
    });

    it('en «Todas las sedes» no aparece el aviso', async () => {
      setActiveLocationId(null);
      mockedList.mockResolvedValue(page([item1]));

      render(<CatalogView token="tok" />);
      await screen.findByRole('table', { name: /catálogo/i });

      expect(screen.queryByText(/de toda la clínica/i)).not.toBeInTheDocument();
    });
  });

  // DX-063 / FE-014: los precios iban siempre en USD («US$») aunque la clínica
  // cobre en pesos.
  it('formatea los precios en la moneda base de la clínica (COP en Colombia), no en USD', async () => {
    mockedList.mockResolvedValue(page([item1]));
    render(<CatalogView token="tok" />);
    const table = await screen.findByRole('table', { name: /catálogo/i });
    await waitFor(() => expect(within(table).getByText('80.000,00 COP')).toBeInTheDocument());
    expect(within(table).queryByText(/US\$/)).not.toBeInTheDocument();
  });

  it('una clínica en España ve los precios en euros', async () => {
    mockedLocations.mockResolvedValue(clinicIn('ES'));
    mockedList.mockResolvedValue(page([item1]));
    render(<CatalogView token="tok" />);
    const table = await screen.findByRole('table', { name: /catálogo/i });
    await waitFor(() => expect(within(table).getByText('80.000,00 €')).toBeInTheDocument());
  });

  it('una clínica con sedes en Colombia y España pinta el importe sin moneda, elija la sede que elija', async () => {
    mockedLocations.mockResolvedValue([
      ...clinicIn('CO'),
      {
        id: 'l2',
        name: 'Madrid',
        address: null,
        country: 'ES',
        isActive: true,
        timeZone: 'Europe/Madrid',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ]);
    setActiveLocationId('l2');
    mockedList.mockResolvedValue(page([item1]));
    render(<CatalogView token="tok" />);
    const table = await screen.findByRole('table', { name: /catálogo/i });
    await waitFor(() => expect(mockedLocations).toHaveBeenCalled());
    await waitFor(() => expect(within(table).getByText('80.000,00')).toBeInTheDocument());
    expect(within(table).queryByText(/€|COP|US\$/)).not.toBeInTheDocument();
  });

  it('sin sedes cargadas pinta el importe sin moneda, nunca en USD', async () => {
    mockedLocations.mockRejectedValue(new TypeError('Failed to fetch'));
    mockedList.mockResolvedValue(page([item1]));
    render(<CatalogView token="tok" />);
    const table = await screen.findByRole('table', { name: /catálogo/i });
    await waitFor(() => expect(within(table).getByText('80.000,00')).toBeInTheDocument());
    expect(within(table).queryByText(/US\$/)).not.toBeInTheDocument();
  });

  // DX-063: un 500 de la API no llega a la pantalla como «Internal server error».
  it('un 500 al cargar muestra texto en español con reintento', async () => {
    const user = setupUser();
    mockedList
      .mockRejectedValueOnce(new ApiError(500, 'Internal server error'))
      .mockResolvedValueOnce(page([item1]));
    render(<CatalogView token="tok" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar el catálogo.');
    expect(alert).not.toHaveTextContent(/internal server error/i);
    await user.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table', { name: /catálogo/i })).toBeInTheDocument();
  });
});

describe('CatalogView · código CUPS (DX-212)', () => {
  const admin = tokenFor('ADMIN', 'u-admin');
  const dentist = tokenFor('DENTIST');
  const withCups: DentalCatalogItem = { ...item1, cupsCode: '997002' };

  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue(page([withCups, { ...item1, id: 'c2', code: 'RES', labelEs: 'Resina', cupsCode: null }]));
    mockedUpdate.mockReset().mockResolvedValue(withCups);
    mockedLocations.mockReset().mockResolvedValue(clinicIn('CO'));
    (listCatalogItems as jest.Mock).mockReset().mockResolvedValue([withCups]);
    window.localStorage.clear();
  });

  it('muestra la columna CUPS («—» si no tiene)', async () => {
    render(<CatalogView token={admin} />);
    const table = await screen.findByRole('table', { name: /catálogo/i });
    expect(within(table).getByRole('columnheader', { name: 'CUPS' })).toBeInTheDocument();
    expect(within(table).getByText('997002')).toBeInTheDocument();
    expect(within(table).getByText('—')).toBeInTheDocument();
  });

  it('ADMIN cambia el CUPS (en mayúsculas) y vacío lo quita', async () => {
    const user = setupUser();
    render(<CatalogView token={admin} initialItemId="c1" />);
    const field = await screen.findByLabelText('Código CUPS');
    expect(field).toHaveValue('997002');
    await user.clear(field);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(admin, 'c1', expect.objectContaining({ cupsCode: null })),
    );
  });

  it('formato inválido: error en el campo y no se envía', async () => {
    const user = setupUser();
    render(<CatalogView token={admin} initialItemId="c1" />);
    const field = await screen.findByLabelText('Código CUPS');
    await user.clear(field);
    await user.type(field, '89-20');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(
      await screen.findByText('El código CUPS debe tener 6 caracteres alfanuméricos (ej. 890203).'),
    ).toBeInTheDocument();
    expect(mockedUpdate).not.toHaveBeenCalled();
  });

  it('DENTIST lo ve de solo lectura', async () => {
    render(<CatalogView token={dentist} initialItemId="c1" />);
    const field = await screen.findByLabelText('Código CUPS');
    expect(field).toHaveAttribute('readonly');
    expect(screen.getByText('Solo un administrador puede cambiarlo.')).toBeInTheDocument();
  });
});


describe('CatalogView · admite descuentos (DX-105)', () => {
  const admin = tokenFor('ADMIN', 'u-admin');

  beforeEach(() => {
    mockedList.mockReset().mockResolvedValue(page([item1]));
    mockedUpdate.mockReset().mockResolvedValue(item1);
    mockedCreate.mockReset().mockResolvedValue(item1);
    mockedLocations.mockReset().mockResolvedValue(clinicIn('CO'));
    (listCatalogItems as jest.Mock).mockReset().mockResolvedValue([item1]);
    window.localStorage.clear();
  });

  it('un ítem nuevo nace con «Admite descuentos» marcada y lo envía', async () => {
    const user = setupUser();
    render(<CatalogView token={admin} />);
    await screen.findByRole('table', { name: /catálogo/i });
    await user.click(screen.getByRole('button', { name: /agregar ítem/i }));
    const box = await screen.findByRole('checkbox', { name: 'Admite descuentos' });
    expect(box).toBeChecked();
    await user.type(screen.getByLabelText('Nombre'), 'Resina');
    await user.type(screen.getByLabelText('Código'), 'RES');
    await user.click(screen.getByRole('button', { name: 'Crear' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith(admin, expect.objectContaining({ allowDiscount: true })),
    );
  });

  it('al editar muestra el valor del ítem y guarda el cambio', async () => {
    const user = setupUser();
    (listCatalogItems as jest.Mock).mockResolvedValue([{ ...item1, allowDiscount: false }]);
    render(<CatalogView token={admin} initialItemId="c1" />);
    const box = await screen.findByRole('checkbox', { name: 'Admite descuentos' });
    expect(box).not.toBeChecked();
    await user.click(box);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith(admin, 'c1', expect.objectContaining({ allowDiscount: true })),
    );
  });

  it('un ítem sin el campo (respuesta antigua) se trata como que admite descuentos', async () => {
    render(<CatalogView token={admin} initialItemId="c1" />);
    expect(await screen.findByRole('checkbox', { name: 'Admite descuentos' })).toBeChecked();
  });
});
