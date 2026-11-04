import { render } from '@testing-library/react';
import AuditPage from './page';
import { useAuthStore } from '@/lib/auth/auth-store';

let search = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/settings/auditoria',
  useSearchParams: () => search,
}));
const mockView = jest.fn<null, [unknown]>(() => null);
jest.mock('../../../../components/audit/audit-log-view', () => ({
  ...jest.requireActual('../../../../components/audit/audit-log-view'),
  AuditLogView: (props: unknown) => mockView(props),
}));

describe('Ajustes → Auditoría (SEC-043-bis)', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'tok', _hasHydrated: true });
    mockView.mockClear();
  });

  it('pasa a la lista los filtros de la URL (el enlace del cierre de caja)', () => {
    search = new URLSearchParams({
      actorUserId: '0193f2a0-1b2c-7d3e-8f40-5a6b7c8d9e0f',
      resourceType: 'PAYMENT_RECEIPT',
      from: '2026-11-02',
      to: '2026-11-04',
    });
    render(<AuditPage />);
    expect(mockView).toHaveBeenLastCalledWith(
      expect.objectContaining({
        token: 'tok',
        initialFilters: {
          actorUserId: '0193f2a0-1b2c-7d3e-8f40-5a6b7c8d9e0f',
          resourceType: 'PAYMENT_RECEIPT',
          from: '2026-11-02',
          to: '2026-11-04',
        },
      }),
    );
  });

  it('sin filtros en la URL, la lista abre sin filtros', () => {
    search = new URLSearchParams();
    render(<AuditPage />);
    expect(mockView).toHaveBeenLastCalledWith(expect.objectContaining({ initialFilters: {} }));
  });
});
