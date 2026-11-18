import { render, screen, waitFor, within } from '@testing-library/react';
import {
  closeCommissionSettlement,
  getCommissionPreview,
  listCommissionRules,
  listCommissionSettlements,
} from '@/lib/commissions/commissions-api';
import { getTokenRole } from '@/lib/auth/token-role';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { CommissionsView, commissionsViewCopy as copy } from './commissions-view';
import { DRA_X, makePreview, makeRuleRow, makeSettlement, makeSettlementSummary } from './commissions-fixtures';

const push = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: jest.fn() }),
  usePathname: () => '/honorarios',
}));
jest.mock('../../lib/auth/token-role', () => ({ getTokenRole: jest.fn() }));
jest.mock('../../lib/locations/locations-api', () => {
  const { utcSede } = jest.requireActual('../../lib/test/sede-clock');
  return { listLocations: jest.fn().mockResolvedValue([utcSede({ id: 'loc1', name: 'Sede Centro' })]) };
});
jest.mock('../../lib/commissions/commissions-api', () => ({
  ...jest.requireActual('../../lib/commissions/commissions-api'),
  listCommissionRules: jest.fn(),
  getCommissionPreview: jest.fn(),
  listCommissionSettlements: jest.fn(),
  closeCommissionSettlement: jest.fn(),
}));

const DETAIL = 'Detalle devengado por paciente, procedimiento y abono';

describe('CommissionsView (DX-018)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSessionStore();
    setActiveLocationId('loc1');
    jest.mocked(listCommissionRules).mockResolvedValue({
      professionals: [makeRuleRow()],
      categories: ['Endodoncia', 'Higiene'],
      deductionsAvailable: { labCost: false, cardFee: false },
    });
    jest.mocked(listCommissionSettlements).mockResolvedValue([makeSettlementSummary()]);
  });

  it('ADMIN: vista previa con el detalle por abono, los ajustes aparte y los totales por moneda', async () => {
    jest.mocked(getTokenRole).mockReturnValue('ADMIN');
    jest.mocked(getCommissionPreview).mockResolvedValue(makePreview());
    render(<CommissionsView token="tok" />);
    const table = await screen.findByRole('table', { name: DETAIL });
    expect(getCommissionPreview).toHaveBeenCalledWith('tok', expect.objectContaining({ userId: DRA_X.userId }));
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent('Carmen Pérez');
    expect(rows[1]).toHaveTextContent('35 %');
    expect(screen.getByRole('table', { name: 'Ajustes de liquidaciones anteriores' })).toHaveTextContent('Corona');
    const totals = screen.getByRole('region', { name: 'Totales por moneda' });
    await waitFor(() => expect(totals).toHaveTextContent('USD'));
    expect(totals).toHaveTextContent('VES');
    expect(screen.getByText('A pagar en USD')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.close })).toBeEnabled();
  });

  it('ADMIN: con un bloqueo, «Cerrar» desactivado y el porqué', async () => {
    jest.mocked(getTokenRole).mockReturnValue('ADMIN');
    jest.mocked(getCommissionPreview).mockResolvedValue(
      makePreview({
        canClose: false,
        blocker: 'PERIOD_NOT_ENDED',
        blockerMessage: 'El período todavía no ha terminado.',
      }),
    );
    render(<CommissionsView token="tok" />);
    expect(await screen.findByText('El período todavía no ha terminado.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: copy.close })).toBeDisabled();
  });

  it('ADMIN cierra: confirma, avisa del cierre contable y abre la liquidación', async () => {
    const user = setupUser();
    jest.mocked(getTokenRole).mockReturnValue('ADMIN');
    jest.mocked(getCommissionPreview).mockResolvedValue(makePreview());
    jest.mocked(closeCommissionSettlement).mockResolvedValue(makeSettlement({ id: 's9' }));
    render(<CommissionsView token="tok" />);
    await user.click(await screen.findByRole('button', { name: copy.close }));
    const dialog = await screen.findByRole('dialog', { name: copy.confirmTitle });
    expect(dialog).toHaveTextContent('cierre contable');
    await user.click(within(dialog).getByRole('button', { name: copy.confirmAction }));
    await waitFor(() =>
      expect(closeCommissionSettlement).toHaveBeenCalledWith('tok', expect.objectContaining({ userId: DRA_X.userId })),
    );
    expect(push).toHaveBeenCalledWith('/honorarios/s9');
  });

  it('DENTIST: solo lo suyo, sin elegir profesional ni cerrar', async () => {
    jest.mocked(getTokenRole).mockReturnValue('DENTIST');
    jest.mocked(getCommissionPreview).mockResolvedValue(makePreview());
    render(<CommissionsView token="tok" />);
    await screen.findByRole('table', { name: DETAIL });
    expect(listCommissionRules).not.toHaveBeenCalled();
    expect(getCommissionPreview).toHaveBeenCalledWith('tok', expect.objectContaining({ userId: null }));
    expect(screen.queryByRole('combobox', { name: copy.professional })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: copy.close })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /2026/ })).toHaveAttribute('href', '/honorarios/s1');
  });

  it('DX-464: cada liquidación cerrada lleva su estado de pago', async () => {
    jest.mocked(getTokenRole).mockReturnValue('ADMIN');
    jest.mocked(getCommissionPreview).mockResolvedValue(makePreview());
    jest.mocked(listCommissionSettlements).mockResolvedValue([
      makeSettlementSummary(),
      makeSettlementSummary({ id: 's2', payment: { status: 'PAID', currencies: [] } }),
    ]);
    render(<CommissionsView token="tok" />);
    const list = await screen.findByRole('table', { name: copy.settlementsLabel });
    expect(within(list).getByText('Pendiente de pago')).toBeInTheDocument();
    expect(within(list).getByText('Pagada')).toBeInTheDocument();
  });

  it('error al calcular: sección con reintento', async () => {
    const user = setupUser();
    jest.mocked(getTokenRole).mockReturnValue('DENTIST');
    jest.mocked(getCommissionPreview).mockRejectedValueOnce(new Error('red')).mockResolvedValue(makePreview());
    render(<CommissionsView token="tok" />);
    await user.click(await screen.findByRole('button', { name: /Reintentar/ }));
    expect(await screen.findByRole('table', { name: DETAIL })).toBeInTheDocument();
  });
});
