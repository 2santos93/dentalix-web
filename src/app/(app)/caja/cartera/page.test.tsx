import { render, screen } from '@testing-library/react';
import CarteraPage from './page';
import { setupUser } from '@/lib/test/user';

const mockReplace = jest.fn();
let mockSearch = '';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => '/caja/cartera',
  useSearchParams: () => new URLSearchParams(mockSearch),
}));
jest.mock('../../../../lib/auth/auth-store', () => ({
  useAuthStore: (select: (s: object) => unknown) => select({ accessToken: 'tok', _hasHydrated: true }),
}));
jest.mock('../../../../components/receivables/receivables-view', () => ({
  ReceivablesView: ({ tabs }: { tabs?: { nav: React.ReactNode } }) => (
    <div>
      vista por cobrar
      {tabs?.nav}
    </div>
  ),
}));
jest.mock('../../../../components/receivables/credit-balances-view', () => ({
  CreditBalancesView: ({ tabs }: { tabs?: { nav: React.ReactNode } }) => (
    <div>
      vista saldo a favor
      {tabs?.nav}
    </div>
  ),
}));

jest.mock('../../../../components/receivables/balance-reminders-view', () => ({
  BalanceRemindersView: ({ tabs }: { tabs?: { nav: React.ReactNode } }) => (
    <div>
      vista por avisar
      {tabs?.nav}
    </div>
  ),
}));

describe('/caja/cartera (DX-145, DX-430, DX-146)', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSearch = '';
  });

  it('sin ?tab= enseña lo que se debe, como siempre', () => {
    render(<CarteraPage />);
    expect(screen.getByText('vista por cobrar')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Por cobrar' })).toHaveAttribute('aria-selected', 'true');
  });

  it('?tab=saldo-a-favor enseña el saldo a favor', () => {
    mockSearch = 'tab=saldo-a-favor';
    render(<CarteraPage />);
    expect(screen.getByText('vista saldo a favor')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Saldo a favor' })).toHaveAttribute('aria-selected', 'true');
  });

  it('?tab=por-avisar enseña «Por avisar hoy» (DX-146)', async () => {
    mockSearch = 'tab=por-avisar';
    render(<CarteraPage />);
    expect(screen.getByText('vista por avisar')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Por avisar hoy' })).toHaveAttribute('aria-selected', 'true');
    await setupUser().click(screen.getByRole('tab', { name: 'Por cobrar' }));
    expect(mockReplace).toHaveBeenCalledWith('/caja/cartera', { scroll: false });
  });

  it('una pestaña desconocida cae en «Por cobrar»', () => {
    mockSearch = 'tab=otra';
    render(<CarteraPage />);
    expect(screen.getByText('vista por cobrar')).toBeInTheDocument();
  });

  it('cambiar de pestaña reescribe la URL sin navegar; volver a la primera quita el parámetro', async () => {
    const user = setupUser();
    const view = render(<CarteraPage />);
    await user.click(screen.getByRole('tab', { name: 'Saldo a favor' }));
    expect(mockReplace).toHaveBeenCalledWith('/caja/cartera?tab=saldo-a-favor', { scroll: false });
    mockSearch = 'tab=saldo-a-favor';
    view.rerender(<CarteraPage />);
    await user.click(screen.getByRole('tab', { name: 'Por cobrar' }));
    expect(mockReplace).toHaveBeenLastCalledWith('/caja/cartera', { scroll: false });
  });

  it('con teclado, el foco queda en la pestaña elegida tras cambiar de vista', async () => {
    const user = setupUser();
    const view = render(<CarteraPage />);
    screen.getByRole('tab', { name: 'Por cobrar' }).focus();
    await user.keyboard('{ArrowRight}{Enter}');
    expect(mockReplace).toHaveBeenCalledWith('/caja/cartera?tab=por-avisar', { scroll: false });
    mockSearch = 'tab=por-avisar';
    view.rerender(<CarteraPage />);
    expect(screen.getByRole('tab', { name: 'Por avisar hoy' })).toHaveFocus();
  });
});
