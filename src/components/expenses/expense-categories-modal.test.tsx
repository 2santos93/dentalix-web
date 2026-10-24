import { render, screen, waitFor, within } from '@testing-library/react';
import { ExpenseCategoriesModal } from './expense-categories-modal';
import { ApiError } from '@/lib/api/client';
import { createExpenseCategory, retireExpenseCategory } from '@/lib/expenses/expense-categories-api';
import { setupUser } from '@/lib/test/user';
import type { ExpenseCategoriesState } from './use-expense-categories';

jest.mock('../../lib/expenses/expense-categories-api', () => ({
  createExpenseCategory: jest.fn(),
  retireExpenseCategory: jest.fn(),
}));

const mockedCreate = createExpenseCategory as jest.MockedFunction<typeof createExpenseCategory>;
const mockedRetire = retireExpenseCategory as jest.MockedFunction<typeof retireExpenseCategory>;

function state(overrides: Partial<ExpenseCategoriesState> = {}): ExpenseCategoriesState {
  return {
    categories: [
      { id: null, name: 'Laboratorio', predefined: true },
      { id: 'cat-1', name: 'Seguros', predefined: false },
    ],
    failed: false,
    reload: jest.fn(),
    ...overrides,
  };
}

function renderModal(categories = state()) {
  render(<ExpenseCategoriesModal open onOpenChange={jest.fn()} token="tok" categories={categories} />);
  return categories;
}

describe('ExpenseCategoriesModal (DX-274)', () => {
  beforeEach(() => {
    mockedCreate.mockReset().mockResolvedValue({ id: 'cat-2', name: 'Publicidad', predefined: false });
    mockedRetire.mockReset().mockResolvedValue(undefined);
  });

  it('lista solo las propias', () => {
    renderModal();
    const list = screen.getByRole('list', { name: 'Categorías propias' });
    expect(within(list).getByText('Seguros')).toBeInTheDocument();
    expect(within(list).queryByText('Laboratorio')).not.toBeInTheDocument();
  });

  it('añade una con el nombre limpio y recarga la lista', async () => {
    const user = setupUser();
    const categories = renderModal();
    await user.type(screen.getByLabelText('Nueva categoría'), '  Publicidad   web ');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledWith('tok', 'Publicidad web'));
    expect(categories.reload).toHaveBeenCalled();
    expect(await screen.findByText('Categoría «Publicidad» añadida.')).toBeInTheDocument();
  });

  it('valida la longitud y dice el rechazo de la API dentro del modal', async () => {
    const user = setupUser();
    renderModal();
    await user.type(screen.getByLabelText('Nueva categoría'), 'x');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(await screen.findByText('Escribe entre 2 y 60 caracteres.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();

    mockedCreate.mockRejectedValueOnce(new ApiError(409, 'Ya existe una categoría con ese nombre.'));
    await user.type(screen.getByLabelText('Nueva categoría'), 'Seguros');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(await screen.findByText('Ya existe una categoría con ese nombre.')).toBeInTheDocument();
  });

  it('retira una propia', async () => {
    const user = setupUser();
    const categories = renderModal();
    await user.click(screen.getByRole('button', { name: 'Retirar la categoría Seguros' }));
    await waitFor(() => expect(mockedRetire).toHaveBeenCalledWith('tok', 'cat-1'));
    expect(categories.reload).toHaveBeenCalled();
    expect(await screen.findByText('Categoría «Seguros» retirada.')).toBeInTheDocument();
  });

  it('si la lista no carga: escalón 1 con Reintentar; el alta sigue disponible', async () => {
    const user = setupUser();
    const categories = renderModal(state({ categories: null, failed: true }));
    expect(screen.getByText('No pudimos cargar las categorías.')).toBeInTheDocument();
    expect(screen.getByLabelText('Nueva categoría')).toBeEnabled();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(categories.reload).toHaveBeenCalled();
  });
});
