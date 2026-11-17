import { render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@/lib/api/client';
import { getCommissionSettlement, listCommissionRules } from '@/lib/commissions/commissions-api';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { CommissionSettlementView, commissionSettlementViewCopy as copy } from './commission-settlement-view';
import { CommissionSettlementDocument } from './commission-settlement-document';
import { CommissionRulesManager, commissionRulesManagerCopy as managerCopy } from './commission-rules-manager';
import { DRA_X, makeRuleRow, makeSettlement } from './commissions-fixtures';
import { stampPainters } from '@/lib/locations/sede-stamp';

jest.mock('../../lib/locations/locations-api', () => {
  const { utcSede } = jest.requireActual('../../lib/test/sede-clock');
  return { listLocations: jest.fn().mockResolvedValue([utcSede({ id: 'loc1', name: 'Sede Centro' })]) };
});
jest.mock('../../lib/commissions/commissions-api', () => ({
  ...jest.requireActual('../../lib/commissions/commissions-api'),
  getCommissionSettlement: jest.fn(),
  listCommissionRules: jest.fn(),
}));

describe('Liquidación cerrada (DX-018)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    clearSessionStore();
    setActiveLocationId('loc1');
  });

  it('cabecera congelada, totales por moneda, detalle e «Imprimir» en pestaña nueva', async () => {
    const user = setupUser();
    const open = jest.spyOn(window, 'open').mockReturnValue(null);
    jest.mocked(getCommissionSettlement).mockResolvedValue(makeSettlement());
    render(<CommissionSettlementView token="tok" id="s1" />);
    expect(await screen.findByRole('heading', { level: 1, name: copy.title(DRA_X.name) })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(copy.lockValue('31/10/2026'))).toBeInTheDocument());
    expect(screen.getByRole('region', { name: 'Totales por moneda' })).toHaveTextContent('VES');
    await user.click(screen.getByRole('button', { name: copy.print }));
    expect(open).toHaveBeenCalledWith('/print/commission-settlements/s1', '_blank', 'noopener');
  });

  it('de otro profesional o de otra clínica: aviso, sin reintento', async () => {
    jest.mocked(getCommissionSettlement).mockRejectedValue(new ApiError(404, 'No encontrada'));
    render(<CommissionSettlementView token="tok" id="s2" />);
    expect(await screen.findByText(copy.notFound)).toBeInTheDocument();
  });

  it('el documento imprimible lleva devengos, ajustes y totales sin sumar monedas', () => {
    render(
      <CommissionSettlementDocument
        data={makeSettlement()}
        stamp={stampPainters(null)}
        clinic={{ name: 'Clínica Ávila', logoUrl: null }}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Liquidación de honorarios' })).toBeInTheDocument();
    expect(screen.getByText('Clínica Ávila')).toBeInTheDocument();
    expect(screen.getByText('Devengado en el período')).toBeInTheDocument();
    expect(screen.getByText('Ajustes de liquidaciones anteriores')).toBeInTheDocument();
    const totals = screen.getByText('Totales por moneda').parentElement!;
    expect(within(totals).getByRole('rowheader', { name: 'USD' })).toBeInTheDocument();
    expect(within(totals).getByRole('rowheader', { name: 'VES' })).toBeInTheDocument();
  });

  it('Ajustes › Honorarios: profesionales con su regla o «Sin regla»', async () => {
    jest.mocked(listCommissionRules).mockResolvedValue({
      professionals: [
        makeRuleRow(),
        makeRuleRow({ professional: { ...DRA_X, userId: 'u-y', membershipId: 'm-y', name: 'Dr. Yánez' }, rule: null }),
      ],
      categories: ['Higiene'],
      deductionsAvailable: { labCost: false, cardFee: false },
    });
    render(<CommissionRulesManager token="tok" />);
    const table = await screen.findByRole('table', { name: managerCopy.tableLabel });
    expect(table).toHaveTextContent('35 % de lo cobrado, por prestación · 1 categoría con % propio');
    expect(table).toHaveTextContent(managerCopy.noRule);
  });
});
