import { render, screen } from '@testing-library/react';
import LocationSettingsPage from './page';
import { useAuthStore } from '@/lib/auth/auth-store';
import { getTokenRole } from '@/lib/auth/token-role';

let search = new URLSearchParams();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  useSearchParams: () => search,
}));
jest.mock('../../../../components/locations/locations-list', () => ({
  LocationsList: ({ canEdit, initialEditId }: { canEdit: boolean; initialEditId: string | null }) => (
    <section aria-label="Sedes" data-can-edit={String(canEdit)} data-edit-id={initialEditId ?? ''} />
  ),
}));
jest.mock('../../../../components/locations/regional-review-notice', () => ({
  RegionalReviewNotice: ({ showReviewLink }: { showReviewLink?: boolean }) => (
    <aside aria-label="Sedes por revisar" data-link={String(showReviewLink ?? true)} />
  ),
}));
jest.mock('../../../../lib/auth/token-role', () => ({ getTokenRole: jest.fn() }));
const mockedRole = getTokenRole as jest.MockedFunction<typeof getTokenRole>;

describe('Ajustes → Sedes (DX-279, DX-319)', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: 'tok', _hasHydrated: true });
    search = new URLSearchParams();
  });

  it('G1: la lista de sedes va arriba; solo ADMIN la edita y ?sede abre esa sede', () => {
    mockedRole.mockReturnValue('ADMIN');
    search = new URLSearchParams('sede=loc-9');
    const { unmount } = render(<LocationSettingsPage />);
    const list = screen.getByRole('region', { name: 'Sedes' });
    expect(list).toHaveAttribute('data-can-edit', 'true');
    expect(list).toHaveAttribute('data-edit-id', 'loc-9');
    // Aviso D5 encima de la lista (él mismo decide si es ADMIN), sin enlace a esta misma página.
    const notice = screen.getByRole('complementary', { name: 'Sedes por revisar' });
    expect(notice.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(notice).toHaveAttribute('data-link', 'false');
    unmount();

    mockedRole.mockReturnValue('RECEPTION');
    render(<LocationSettingsPage />);
    expect(screen.getByRole('region', { name: 'Sedes' })).toHaveAttribute('data-can-edit', 'false');
  });

  it('B6: es la lista; el registro sanitario y la política viven en la ficha de cada sede', () => {
    mockedRole.mockReturnValue('ADMIN');
    render(<LocationSettingsPage />);
    expect(screen.getByText(/Ábrela para sus datos legales y su política de cancelación\./)).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Nº de registro sanitario' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Política de cancelación' })).not.toBeInTheDocument();
    expect(screen.queryByText(/REPS|Resumen Digital/)).not.toBeInTheDocument();
  });

  it.each(['RECEPTION', 'DENTIST', 'ASSISTANT'] as const)(
    'a %s no le promete la política que no ve (QA D4)',
    (role) => {
      mockedRole.mockReturnValue(role);
      render(<LocationSettingsPage />);
      expect(screen.getByText(/Ábrela para sus datos legales\.$/)).toBeInTheDocument();
      expect(screen.queryByText(/política de cancelación/)).not.toBeInTheDocument();
    },
  );
});
