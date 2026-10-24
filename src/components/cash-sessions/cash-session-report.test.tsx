import { render, screen, within } from '@testing-library/react';
import { CashSessionReport } from './cash-session-report';
import { cashSessionFixture, closedCashSessionFixture } from '@/lib/test/cash-session';

describe('CashSessionReport (DX-027)', () => {
  it('cerrada: quién abrió y cerró, fondo, arqueo con contado y diferencia, motivo y fecha de bloqueo', () => {
    render(<CashSessionReport session={closedCashSessionFixture()} />);
    const doc = screen.getByTestId('cash-session-report');
    expect(within(doc).getByRole('heading', { name: 'Informe de cierre de caja' })).toBeInTheDocument();
    expect(doc).toHaveTextContent('Paola Martínez · 17/10/2026 08:00');
    expect(doc).toHaveTextContent('Paola Martínez · 17/10/2026 18:00');
    const table = within(doc).getByRole('table', { name: 'Arqueo por moneda y método' });
    const cash = within(table).getAllByRole('row')[1];
    expect(cash).toHaveTextContent('Efectivo · COP');
    expect(cash).toHaveTextContent(/79\.?000,00/);
    expect(cash).toHaveTextContent(/-1\.?000,00/);
    expect(doc).toHaveTextContent('Faltó cambio');
    expect(doc).toHaveTextContent('Fecha de bloqueo sugerida');
    expect(doc).toHaveTextContent('17/10/2026');
    expect(within(doc).getByRole('table', { name: 'Cobros del turno' })).toHaveTextContent('PRI-000012');
  });

  it('anulaciones aparte y ajustes con enlace a la caja original', () => {
    render(
      <CashSessionReport
        session={cashSessionFixture({
          voidedPayments: [
            {
              ...cashSessionFixture().payments![0],
              id: 'pay-2',
              voidedAt: '2026-10-17T18:00:00.000Z',
              voidedBy: { id: 'u-admin', fullName: 'Admin' },
              voidReason: 'Duplicado',
              bookedAsAdjustment: false,
            },
          ],
          adjustments: [
            {
              id: 'adj-1',
              kind: 'VOID',
              currency: 'COP',
              method: 'CASH',
              amount: -30_000,
              reason: null,
              createdAt: '2026-10-17T19:00:00.000Z',
              createdBy: { id: 'u-admin', fullName: 'Admin' },
              sessionId: 'cs-1',
              payment: { id: 'pay-9', patient: { id: 'p', fullName: 'Beto Ruiz' }, paidOn: '2026-10-16', receiptNumber: null },
              expensePayment: null,
              originalSession: { id: 'cs-0', openedAt: '2026-10-16T13:00:00.000Z', openedBy: { id: 'u-recep', fullName: 'Paola' } },
            },
          ],
        })}
      />,
    );
    expect(screen.getByRole('list', { name: 'Abonos anulados' })).toHaveTextContent('Duplicado');
    const adjustments = screen.getByRole('list', { name: 'Ajustes en este turno' });
    expect(adjustments).toHaveTextContent('Anulación posterior al cierre');
    expect(within(adjustments).getByRole('link')).toHaveAttribute('href', '/caja/turnos/cs-0');
  });

  it('arqueo ciego abierto: ni esperado ni cobros', () => {
    render(<CashSessionReport session={cashSessionFixture({ blindHidden: true, expected: null, payments: null })} />);
    expect(screen.getByText(/Arqueo ciego/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });
});
