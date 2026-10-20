import { render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '@/lib/test/user';
import { PatientsView } from './patients-view';
import { listPatients, type Patient } from '@/lib/patients/patients-api';
import { ApiError } from '@/lib/api/client';
import { listPayers, type Payer } from '@/lib/payers/payers-api';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC transform
// (only real `import`/`require` specifiers are) — relative path here, matching
// the convention of the other view tests.
jest.mock('../../lib/patients/patients-api', () => ({
  ...jest.requireActual('../../lib/patients/patients-api'),
  listPatients: jest.fn(),
}));
jest.mock('../../lib/payers/payers-api', () => ({
  ...jest.requireActual('../../lib/payers/payers-api'),
  listPayers: jest.fn(),
}));

const mockedList = listPatients as jest.MockedFunction<typeof listPatients>;
const mockedPayers = listPayers as jest.MockedFunction<typeof listPayers>;

const sura = { id: 'py1', name: 'Sura EPS' } as Payer;
const colsanitas = { id: 'py2', name: 'Colsanitas' } as Payer;

const maria: Patient = {
  id: 'p1',
  tenantId: 't1',
  firstName: 'María',
  lastName: 'López',
  docType: 'CC',
  docNumber: '123',
  birthDate: null,
  sex: 'F',
  phone: null,
  email: null,
  address: null,
  notes: null,
  createdById: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function page(items: Patient[], total = items.length) {
  return { items, total, page: 1, pageSize: 20 };
}

describe('PatientsView', () => {
  beforeEach(() => {
    mockedList.mockReset();
    mockedList.mockResolvedValue(page([maria]));
    mockedPayers.mockReset();
    mockedPayers.mockResolvedValue([sura, colsanitas]);
  });

  it('la accion primaria vive en la barra de filtros, no colgada del titulo', async () => {
    render(<PatientsView token="tok" />);

    const heading = await screen.findByRole('heading', {
      name: 'Pacientes',
      level: 1,
    });

    // La cabecera es identidad: titulo y linea de apoyo, nada mas.
    const header = heading.closest('div')?.parentElement as HTMLElement;
    expect(
      within(header).queryByRole('link', { name: /nuevo paciente/i }),
    ).not.toBeInTheDocument();

    // El boton esta en la misma barra que el buscador, que es con lo que se usa.
    const toolbar = screen.getByRole('searchbox').closest('div')?.parentElement
      ?.parentElement as HTMLElement;
    expect(
      within(toolbar).getByRole('link', { name: /nuevo paciente/i }),
    ).toBeInTheDocument();
  });

  it('dice cuantos pacientes hay, y concuerda el singular', async () => {
    render(<PatientsView token="tok" />);

    expect(await screen.findByText('1 paciente')).toBeInTheDocument();
  });

  it('buscar consulta al servidor y vuelve a la pagina 1', async () => {
    const user = setupUser();
    render(<PatientsView token="tok" />);
    await screen.findByText('1 paciente');

    mockedList.mockClear();
    await user.type(screen.getByLabelText(/buscar/i), 'lópez');

    // El debounce es de 300 ms; `waitFor` cubre la espera sin acoplarse al valor.
    await waitFor(() =>
      expect(mockedList).toHaveBeenCalledWith('tok', {
        page: 1,
        query: 'lópez',
      }),
    );
  });

  it('si la carga falla ofrece reintentar, y el reintento vuelve a pedir', async () => {
    const user = setupUser();
    mockedList.mockRejectedValueOnce(new Error('boom'));
    render(<PatientsView token="tok" />);

    const retry = await screen.findByRole('button', { name: /reintentar/i });
    mockedList.mockResolvedValue(page([maria]));
    await user.click(retry);

    expect(await screen.findByText('1 paciente')).toBeInTheDocument();
  });

  // DX-063: un 500 no llega a la recepción como «Internal server error».
  it('un 500 al cargar muestra texto en español con reintento', async () => {
    const user = setupUser();
    mockedList
      .mockRejectedValueOnce(new ApiError(500, 'Internal server error'))
      .mockResolvedValueOnce(page([maria]));
    render(<PatientsView token="tok" />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar los pacientes.');
    expect(alert).not.toHaveTextContent(/internal server error/i);
    await user.click(within(alert).getByRole('button', { name: /reintentar/i }));
    expect(await screen.findByText('1 paciente')).toBeInTheDocument();
  });

  it('un 403 técnico («Insufficient role») se dice en español', async () => {
    mockedList.mockRejectedValueOnce(new ApiError(403, 'Insufficient role'));
    render(<PatientsView token="tok" />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/no tienes permiso/i);
    expect(alert).not.toHaveTextContent(/insufficient role/i);
  });

  describe('filtro por pagador (DX-153)', () => {
    it('ofrece «Todos los pagadores» y los pagadores activos', async () => {
      render(<PatientsView token="tok" />);
      const select = await screen.findByRole('combobox', { name: 'Filtrar por pagador' });
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
      const options = within(select).getAllByRole('option');
      expect(options[0]).toHaveTextContent('Todos los pagadores');
      expect(options[0]).toHaveValue('');
      expect(options[1]).toHaveTextContent('Sura EPS');
      expect(mockedPayers).toHaveBeenCalledWith('tok');
    });

    it('cambiar el pagador consulta con payerId y vuelve a la página 1', async () => {
      const user = setupUser();
      render(<PatientsView token="tok" />);
      await screen.findByText('1 paciente');
      const select = screen.getByRole('combobox', { name: 'Filtrar por pagador' });
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));

      mockedList.mockClear();
      await user.selectOptions(select, 'py1');

      await waitFor(() =>
        expect(mockedList).toHaveBeenCalledWith('tok', { page: 1, payerId: 'py1' }),
      );
    });

    it('volver a «Todos» deja de mandar payerId', async () => {
      const user = setupUser();
      render(<PatientsView token="tok" />);
      await screen.findByText('1 paciente');
      const select = screen.getByRole('combobox', { name: 'Filtrar por pagador' });
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
      await user.selectOptions(select, 'py1');
      mockedList.mockClear();
      await user.selectOptions(select, '');
      await waitFor(() => expect(mockedList).toHaveBeenCalledWith('tok', { page: 1 }));
    });

    it('con un pagador elegido, el vacío habla de filtro y no de pacientes inexistentes', async () => {
      const user = setupUser();
      render(<PatientsView token="tok" />);
      await screen.findByText('1 paciente');
      const select = screen.getByRole('combobox', { name: 'Filtrar por pagador' });
      await waitFor(() => expect(within(select).getAllByRole('option')).toHaveLength(3));
      mockedList.mockResolvedValue(page([]));
      await user.selectOptions(select, 'py2');
      expect(await screen.findByText(/ningún paciente coincide/i)).toBeInTheDocument();
    });

    it('si fallan los pagadores, avisa junto al filtro con reintento y la tabla sigue', async () => {
      const user = setupUser();
      mockedPayers.mockRejectedValueOnce(new Error('boom'));
      render(<PatientsView token="tok" />);

      expect(await screen.findByText('1 paciente')).toBeInTheDocument();
      expect((await screen.findAllByText(/López/)).length).toBeGreaterThan(0);
      const status = (await screen.findByText('No cargaron los pagadores')).closest(
        '[role="status"]',
      ) as HTMLElement;
      expect(status).toBeInTheDocument();
      expect(
        screen.queryByRole('combobox', { name: 'Filtrar por pagador' }),
      ).not.toBeInTheDocument();

      await user.click(within(status).getByRole('button', { name: /reintentar/i }));
      expect(
        await screen.findByRole('combobox', { name: 'Filtrar por pagador' }),
      ).toBeInTheDocument();
    });
  });
});
