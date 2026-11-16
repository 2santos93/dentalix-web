import { render, screen } from '@testing-library/react';
import ExternalOrdersSettingsPage from './page';
import { tokenFor } from '@/lib/test/prescriptions';
import { getExternalOrderSettings, listExternalOrderTemplates } from '@/lib/external-orders/external-orders-api';
import { visibleSettingsSections } from '@/components/settings/settings-sections';

let mockToken: string | null = null;
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/settings/ordenes-externas',
}));
jest.mock('../../../../lib/auth/auth-store', () => ({
  useAuthStore: (select: (s: object) => unknown) => select({ accessToken: mockToken, _hasHydrated: true }),
}));
jest.mock('../../../../lib/external-orders/external-orders-api', () => ({
  ...jest.requireActual('../../../../lib/external-orders/external-orders-api'),
  listExternalOrderTemplates: jest.fn(),
  getExternalOrderSettings: jest.fn(),
}));

describe('/settings/ordenes-externas (DX-572)', () => {
  beforeEach(() => {
    jest.mocked(listExternalOrderTemplates).mockReset().mockResolvedValue([]);
    jest.mocked(getExternalOrderSettings).mockReset().mockResolvedValue({ overdueDays: 15 });
  });

  it('se titula como su entrada del índice (Historia clínica) y ADMIN ve plantillas y plazo', async () => {
    mockToken = tokenFor('ADMIN');
    render(<ExternalOrdersSettingsPage />);
    const entry = visibleSettingsSections('ADMIN')
      .find((s) => s.id === 'historia')
      ?.entries.find((e) => e.href === '/settings/ordenes-externas');
    expect(entry?.label).toBe('Órdenes externas');
    expect(screen.getByRole('heading', { level: 1, name: 'Órdenes externas' })).toBeInTheDocument();
    expect(await screen.findByText('Aún no hay plantillas de orden')).toBeInTheDocument();
    expect(await screen.findByLabelText('Días para considerar vencida una orden sin resultado', { exact: true })).toHaveValue('15');
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'])('%s no la gestiona ni la ve en el índice', (role) => {
    mockToken = tokenFor(role);
    render(<ExternalOrdersSettingsPage />);
    expect(screen.getByText('Solo administración gestiona las órdenes externas.')).toBeInTheDocument();
    expect(listExternalOrderTemplates).not.toHaveBeenCalled();
    expect(getExternalOrderSettings).not.toHaveBeenCalled();
    const hrefs = visibleSettingsSections(role as 'DENTIST').flatMap((s) => s.entries.map((e) => e.href));
    expect(hrefs).not.toContain('/settings/ordenes-externas');
  });
});
