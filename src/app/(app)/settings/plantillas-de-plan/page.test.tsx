import { render, screen } from '@testing-library/react';
import PlanTemplatesPage from './page';
import { tokenFor } from '@/lib/test/prescriptions';
import { listPlanTemplates } from '@/lib/treatment-plans/plan-templates-api';
import { visibleSettingsSections } from '@/components/settings/settings-sections';

let mockToken: string | null = null;
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace: jest.fn() }),
  usePathname: () => '/settings/plantillas-de-plan',
}));
jest.mock('../../../../lib/auth/auth-store', () => ({
  useAuthStore: (select: (s: object) => unknown) => select({ accessToken: mockToken, _hasHydrated: true }),
}));
jest.mock('../../../../lib/treatment-plans/plan-templates-api', () => ({
  ...jest.requireActual('../../../../lib/treatment-plans/plan-templates-api'),
  listPlanTemplates: jest.fn(),
}));

describe('/settings/plantillas-de-plan (DX-559)', () => {
  beforeEach(() => jest.mocked(listPlanTemplates).mockReset().mockResolvedValue([]));

  it('se titula como su entrada del índice y ADMIN gestiona las plantillas', async () => {
    mockToken = tokenFor('ADMIN');
    render(<PlanTemplatesPage />);
    const entry = visibleSettingsSections('ADMIN')
      .find((s) => s.id === 'historia')
      ?.entries.find((e) => e.href === '/settings/plantillas-de-plan');
    expect(entry?.label).toBe('Plantillas de plan');
    expect(screen.getByRole('heading', { level: 1, name: 'Plantillas de plan' })).toBeInTheDocument();
    expect(await screen.findByText('Aún no hay plantillas de plan')).toBeInTheDocument();
    expect(listPlanTemplates).toHaveBeenCalledWith(mockToken, { includeInactive: true });
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'])('%s no la gestiona ni la ve en el índice', (role) => {
    mockToken = tokenFor(role);
    render(<PlanTemplatesPage />);
    expect(screen.getByText('Solo administración gestiona las plantillas de plan.')).toBeInTheDocument();
    expect(listPlanTemplates).not.toHaveBeenCalled();
    const hrefs = visibleSettingsSections(role as 'DENTIST').flatMap((s) => s.entries.map((e) => e.href));
    expect(hrefs).not.toContain('/settings/plantillas-de-plan');
  });
});
