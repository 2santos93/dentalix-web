import { render, screen } from '@testing-library/react';
import GastosPage from './page';
import { setupUser } from '@/lib/test/user';

const mockReplace = jest.fn();
let mockSearch = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/caja/gastos',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('../../../../lib/auth/auth-store', () => ({
  useAuthStore: (select: (s: object) => unknown) => select({ accessToken: 'tok', _hasHydrated: true }),
}));
jest.mock('../../../../components/expenses/expenses-view', () => ({
  ExpensesView: ({ tabs }: { tabs?: { nav: React.ReactNode } }) => (
    <div>
      vista de gastos
      {tabs?.nav}
    </div>
  ),
}));
jest.mock('../../../../components/expenses/expenses-summary-view', () => ({
  ExpensesSummaryView: ({ tabs }: { tabs?: { nav: React.ReactNode } }) => (
    <div>
      vista de resumen
      {tabs?.nav}
    </div>
  ),
}));

describe('/caja/gastos (DX-274)', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSearch = '';
  });

  it('sin ?tab= enseña los gastos', () => {
    render(<GastosPage />);
    expect(screen.getByText('vista de gastos')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Gastos' })).toHaveAttribute('aria-selected', 'true');
  });

  it('?tab=resumen enseña el resumen', () => {
    mockSearch = 'tab=resumen';
    render(<GastosPage />);
    expect(screen.getByText('vista de resumen')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveAttribute('aria-selected', 'true');
  });

  it('cambiar de pestaña reescribe la URL sin navegar', async () => {
    const user = setupUser();
    render(<GastosPage />);
    await user.click(screen.getByRole('tab', { name: 'Resumen' }));
    expect(mockReplace).toHaveBeenCalledWith('/caja/gastos?tab=resumen', { scroll: false });
  });

  it('al activar con teclado y cambiar realmente searchParams conserva el foco en la pestaña elegida', async () => {
    const user = setupUser();
    const view = render(<GastosPage />);
    screen.getByRole('tab', { name: 'Gastos' }).focus();
    await user.keyboard('{ArrowRight}{Enter}');
    expect(mockReplace).toHaveBeenCalledWith('/caja/gastos?tab=resumen', { scroll: false });
    mockSearch = 'tab=resumen';
    view.rerender(<GastosPage />);
    expect(screen.getByText('vista de resumen')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Resumen' })).toHaveFocus();
    await user.keyboard('{ArrowLeft} ');
    expect(mockReplace).toHaveBeenLastCalledWith('/caja/gastos', { scroll: false });
    mockSearch = '';
    view.rerender(<GastosPage />);
    expect(screen.getByText('vista de gastos')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Gastos' })).toHaveFocus();
  });

  it('no roba el foco si la persona pasó a otro control antes de terminar la navegación', async () => {
    const user = setupUser();
    const view = render(<><GastosPage /><button>Otro control</button></>);
    await user.click(screen.getByRole('tab', { name: 'Resumen' }));
    screen.getByRole('button', { name: 'Otro control' }).focus();
    mockSearch = 'tab=resumen';
    view.rerender(<><GastosPage /><button>Otro control</button></>);
    expect(screen.getByRole('button', { name: 'Otro control' })).toHaveFocus();
  });

  it('volver a «Gastos» quita el parámetro', async () => {
    const user = setupUser();
    mockSearch = 'tab=resumen';
    render(<GastosPage />);
    await user.click(screen.getByRole('tab', { name: 'Gastos' }));
    expect(mockReplace).toHaveBeenCalledWith('/caja/gastos', { scroll: false });
  });
});
