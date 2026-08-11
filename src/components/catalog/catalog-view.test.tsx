import { render, screen, waitFor, within } from '@testing-library/react';
import type userEvent from '@testing-library/user-event';
import { setupUser } from '@/lib/test/user';
import { CatalogView } from './catalog-view';
import {
  listCatalogDirectory,
  createCatalogItem,
  updateCatalogItem,
  type DentalCatalogItem,
} from '@/lib/odontogram/catalog-api';
import { Toaster } from '@/components/errors/toaster';
import { setActiveLocationId } from '@/lib/locations/location-store';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC transform
// (only real import/require specifiers are) — use a relative path here, same
// convention as staff-view.test.tsx / agenda-view.test.tsx.
jest.mock('../../lib/odontogram/catalog-api', () => ({
  listCatalogDirectory: jest.fn(),
  createCatalogItem: jest.fn(),
  updateCatalogItem: jest.fn(),
}));

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
        defaultPrice: 80000,
        category: 'Preventiva',
      }),
    );
    expect(await screen.findByText('Profilaxis dental')).toBeInTheDocument();
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

    expect(await screen.findByText('Error del servidor')).toBeInTheDocument();
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
});
