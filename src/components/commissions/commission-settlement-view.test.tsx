import { render, screen, waitFor, within } from '@testing-library/react';
import { ApiError } from '@/lib/api/client';
import {
  fetchCommissionSettlementPdf,
  getCommissionSettlement,
  listCommissionRules,
  requestCommissionReceipt,
  voidCommissionPayment,
} from '@/lib/commissions/commissions-api';
import { getTokenRole } from '@/lib/auth/token-role';
import { saveBlob } from '@/lib/files/save-blob';
import { setActiveLocationId } from '@/lib/locations/location-store';
import { clearSessionStore } from '@/lib/session/session-store';
import { setupUser } from '@/lib/test/user';
import { CommissionSettlementView, commissionSettlementViewCopy as copy } from './commission-settlement-view';
import { CommissionSettlementDocument } from './commission-settlement-document';
import { CommissionRulesManager, commissionRulesManagerCopy as managerCopy } from './commission-rules-manager';
import { DRA_X, makePayment, makeRuleRow, makeSettlement } from './commissions-fixtures';
import { stampPainters } from '@/lib/locations/sede-stamp';

jest.mock('../../lib/locations/locations-api', () => {
  const { utcSede } = jest.requireActual('../../lib/test/sede-clock');
  return { listLocations: jest.fn().mockResolvedValue([utcSede({ id: 'loc1', name: 'Sede Centro' })]) };
});
jest.mock('../../lib/commissions/commissions-api', () => ({
  ...jest.requireActual('../../lib/commissions/commissions-api'),
  getCommissionSettlement: jest.fn(),
  listCommissionRules: jest.fn(),
  fetchCommissionSettlementPdf: jest.fn(),
  voidCommissionPayment: jest.fn(),
  requestCommissionReceipt: jest.fn(),
}));
jest.mock('../../lib/auth/token-role', () => ({ getTokenRole: jest.fn() }));
jest.mock('../../lib/files/save-blob', () => ({ saveBlob: jest.fn() }));
jest.mock('../../lib/locations/schedule-api', () => ({
  getLocationSchedule: jest.fn().mockResolvedValue({ timezone: 'UTC' }),
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

  it('DX-018-bis: el documento lleva los descuentos de la regla y el desglose de la base', () => {
    const base = makeSettlement();
    render(
      <CommissionSettlementDocument
        data={{
          ...base,
          deductLabCost: true,
          deductCardFee: true,
          lines: base.lines.map((l, i) =>
            i === 0
              ? {
                  ...l,
                  base: 66.5,
                  deductions: {
                    grossBase: 100,
                    labCost: 30,
                    cardFeePercent: 3.5,
                    cardFee: 3.5,
                    labCostSkippedCurrencies: ['VES'],
                  },
                }
              : l,
          ),
        }}
        stamp={stampPainters(null)}
        clinic={{ name: 'Clínica Ávila', logoUrl: null }}
      />,
    );
    expect(screen.getByText('Descuenta laboratorio y pasarela antes del porcentaje')).toBeInTheDocument();
    expect(screen.getByText(/Antes de descuentos .+ · Laboratorio .+ · Pasarela 3,5\s%: .+/)).toBeInTheDocument();
    expect(screen.getByText(/Laboratorio en VES sin descontar/)).toBeInTheDocument();
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

  describe('DX-464: pago de la liquidación', () => {
    const paidSettlement = () =>
      makeSettlement({
        payment: {
          status: 'PARTIALLY_PAID',
          currencies: [
            { currency: 'USD', total: 17.5, paid: 17.5, pending: 0, pendingLines: 0 },
            { currency: 'VES', total: 3650, paid: 0, pending: 3650, pendingLines: 1 },
          ],
        },
        payments: [
          makePayment({ receipt: { status: 'SIGNED', requestedAt: null, expiresAt: null, signedAt: '2026-11-06T10:00:00.000Z', signerName: 'Ximena Rivas' } }),
          makePayment({
            id: 'cp0',
            voidedAt: '2026-11-04T10:00:00.000Z',
            voidedBy: { userId: 'admin', name: 'Dr. Owner' },
            voidReason: 'Transferencia rechazada por el banco',
          }),
        ],
        lines: makeSettlement().lines.map((l) => (l.currency === 'USD' ? { ...l, paidInPaymentId: 'cp1' } : l)),
      });

    it('ADMIN: estado, resumen por moneda, acciones, pagos (anulado con motivo) y líneas pagadas', async () => {
      jest.mocked(getTokenRole).mockReturnValue('ADMIN');
      jest.mocked(getCommissionSettlement).mockResolvedValue(paidSettlement());
      render(<CommissionSettlementView token="tok" id="s1" />);
      expect(await screen.findByText('Pagada parcialmente')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: copy.pay })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: copy.pdf })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: copy.send })).toBeInTheDocument();
      const summary = screen.getByRole('region', { name: 'Pagos por moneda' });
      expect(summary).toHaveTextContent('A pagar (USD)');
      expect(summary).toHaveTextContent('A pagar (VES)');
      const payments = screen.getByRole('table', { name: 'Pagos de la liquidación, el más reciente primero' });
      expect(payments).toHaveTextContent('Firmada conforme');
      expect(payments).toHaveTextContent('Anulado: Transferencia rechazada por el banco');
      expect(payments).toHaveTextContent('Ref. TRF-8841');
      const accruals = screen.getByRole('table', { name: 'Detalle devengado por paciente, procedimiento y abono' });
      expect(within(accruals).getAllByText('Pagada')).toHaveLength(1);
    });

    it('DENTIST: ve el estado y los pagos, sin acciones', async () => {
      jest.mocked(getTokenRole).mockReturnValue('DENTIST');
      jest.mocked(getCommissionSettlement).mockResolvedValue(paidSettlement());
      render(<CommissionSettlementView token="tok" id="s1" />);
      expect(await screen.findByText('Pagada parcialmente')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: copy.pay })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: copy.pdf })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /^Acciones de/ })).not.toBeInTheDocument();
    });

    it('Descargar PDF guarda el archivo de la API', async () => {
      const user = setupUser();
      jest.mocked(getTokenRole).mockReturnValue('ADMIN');
      jest.mocked(getCommissionSettlement).mockResolvedValue(makeSettlement());
      const blob = new Blob(['%PDF'], { type: 'application/pdf' });
      jest.mocked(fetchCommissionSettlementPdf).mockResolvedValue({ blob, fileName: 'liquidacion.pdf' });
      render(<CommissionSettlementView token="tok" id="s1" />);
      await user.click(await screen.findByRole('button', { name: copy.pdf }));
      await waitFor(() => expect(saveBlob).toHaveBeenCalledWith(blob, 'liquidacion.pdf'));
    });

    it('Enviar: mailto al email del profesional con período, totales y estado', async () => {
      const user = setupUser();
      jest.mocked(getTokenRole).mockReturnValue('ADMIN');
      jest.mocked(getCommissionSettlement).mockResolvedValue(makeSettlement());
      render(<CommissionSettlementView token="tok" id="s1" />);
      await user.click(await screen.findByRole('button', { name: copy.send }));
      const dialog = await screen.findByRole('dialog', { name: 'Enviar la liquidación' });
      const mail = within(dialog).getByRole('link', { name: /Por email/ });
      const href = decodeURIComponent(mail.getAttribute('href')!);
      expect(href.startsWith('mailto:ximena.rivas@example.com?subject=')).toBe(true);
      expect(href).toContain('Estado: Pendiente de pago.');
      expect(href).toContain('VES: total');
      const wa = within(dialog).getByRole('link', { name: /Por WhatsApp/ });
      expect(wa.getAttribute('href')!.startsWith('https://wa.me/?text=')).toBe(true);
    });

    it('Anular un pago con motivo y Pedir conformidad muestran su resultado', async () => {
      const user = setupUser();
      jest.mocked(getTokenRole).mockReturnValue('ADMIN');
      jest.mocked(getCommissionSettlement).mockResolvedValue(makeSettlement({ payments: [makePayment()] }));
      jest.mocked(voidCommissionPayment).mockResolvedValue(makePayment({ voidedAt: '2026-11-07T10:00:00.000Z' }));
      jest
        .mocked(requestCommissionReceipt)
        .mockResolvedValue({ url: 'https://demo.dentalix.app/conformidad/abc', expiresAt: '2026-11-10T10:00:00.000Z' });
      render(<CommissionSettlementView token="tok" id="s1" />);

      await user.click(await screen.findByRole('button', { name: /^Acciones de/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Pedir conformidad' }));
      const receipt = await screen.findByRole('dialog', { name: 'Pedir conformidad' });
      await user.click(within(receipt).getByRole('button', { name: 'Crear enlace' }));
      expect(await within(receipt).findByDisplayValue('https://demo.dentalix.app/conformidad/abc')).toBeInTheDocument();
      expect(within(receipt).getByRole('link', { name: /Enviar por WhatsApp/ })).toBeInTheDocument();
      await user.click(within(receipt).getAllByRole('button', { name: 'Cerrar' })[0]);

      await user.click(await screen.findByRole('button', { name: /^Acciones de/ }));
      await user.click(screen.getByRole('menuitem', { name: 'Anular' }));
      const dialog = await screen.findByRole('dialog', { name: '¿Anular este pago?' });
      await user.type(within(dialog).getByRole('textbox', { name: 'Motivo de la anulación' }), 'Pagado dos veces');
      await user.click(within(dialog).getByRole('button', { name: 'Anular pago' }));
      await waitFor(() => expect(voidCommissionPayment).toHaveBeenCalledWith('tok', 'cp1', 'Pagado dos veces'));
    });
  });
});
