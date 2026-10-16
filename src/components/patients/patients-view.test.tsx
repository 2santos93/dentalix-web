import { render, screen, waitFor, within } from '@testing-library/react';
import { setupUser } from '@/lib/test/user';
import { PatientsView } from './patients-view';
import { listPatients, type Patient } from '@/lib/patients/patients-api';
import { ApiError } from '@/lib/api/client';

// NOTE: jest.mock's string literal is not alias-rewritten by the SWC transform
// (only real `import`/`require` specifiers are) — relative path here, matching
// the convention of the other view tests.
jest.mock('../../lib/patients/patients-api', () => ({
  listPatients: jest.fn(),
}));

const mockedList = listPatients as jest.MockedFunction<typeof listPatients>;

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
});
