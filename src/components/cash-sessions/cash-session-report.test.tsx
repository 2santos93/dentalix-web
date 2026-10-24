import { render, screen, within } from '@testing-library/react';
import { CashSessionReport } from './cash-session-report';
import { cashSessionFixture, closedCashSessionFixture, outflowFixture } from '@/lib/test/cash-session';

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

  describe('DX-274: salidas de caja', () => {
    const [cash, card] = cashSessionFixture().expected!;
    const voided = {
      ...outflowFixture({ id: 'ep-2', category: 'Café', supplier: null, amount: 5_000 }),
      voidedAt: '2026-10-17T20:00:00.000Z',
      voidedBy: { id: 'u-admin', fullName: 'Admin' },
      voidReason: 'Se devolvió el dinero',
      bookedAsAdjustment: true,
    };

    it('columna «Salidas» con signo y sección con hora, categoría, proveedor, quién e importe; las anuladas tachadas con motivo', () => {
      render(
        <CashSessionReport
          session={closedCashSessionFixture({
            expected: [{ ...cash, outflows: 8_000, outflowsCount: 1, expected: 72_000 }, card],
            outflows: [outflowFixture()],
            voidedOutflows: [voided],
          })}
        />,
      );
      const arqueo = screen.getByRole('table', { name: 'Arqueo por moneda y método' });
      expect(within(arqueo).getByRole('columnheader', { name: 'Salidas' })).toBeInTheDocument();
      const [, cashRow, cardRow] = within(arqueo).getAllByRole('row');
      expect(within(cashRow).getAllByRole('cell')[4]).toHaveTextContent(/-8\.?000,00/);
      expect(within(cardRow).getAllByRole('cell')[4]).toHaveTextContent(/^\$?\s?0,00/);

      const outflows = screen.getByRole('table', { name: 'Salidas de caja' });
      const row = within(outflows).getAllByRole('row')[1];
      expect(row).toHaveTextContent('11:30');
      expect(row).toHaveTextContent('Mensajería');
      expect(row).toHaveTextContent('Mensajeros Ya');
      expect(row).toHaveTextContent('Paola Martínez');
      expect(row).toHaveTextContent(/8\.?000,00/);

      const annulled = screen.getByRole('list', { name: 'Salidas anuladas' });
      expect(annulled).toHaveTextContent('Café');
      expect(annulled).toHaveTextContent('Motivo: Se devolvió el dinero');
      expect(within(annulled).getByText(/5\.?000,00/)).toHaveClass('line-through');
      expect(annulled).toHaveTextContent(/ajuste en otra caja/);
    });

    it('la anulación de una salida de una caja cerrada es un ajuste «Anulación de salida» con su gasto', () => {
      render(
        <CashSessionReport
          session={cashSessionFixture({
            adjustments: [
              {
                id: 'adj-2',
                kind: 'OUTFLOW_VOID',
                currency: 'COP',
                method: 'CASH',
                amount: 8_000,
                reason: 'Se devolvió el dinero',
                createdAt: '2026-10-18T15:00:00.000Z',
                createdBy: { id: 'u-admin', fullName: 'Admin' },
                sessionId: 'cs-1',
                payment: null,
                expensePayment: { id: 'ep-1', expenseId: 'exp-9', category: 'Mensajería', supplier: 'Mensajeros Ya' },
                originalSession: { id: 'cs-0', openedAt: '2026-10-17T13:00:00.000Z', openedBy: { id: 'u-recep', fullName: 'Paola' } },
              },
            ],
          })}
        />,
      );
      const adjustments = screen.getByRole('list', { name: 'Ajustes en este turno' });
      expect(adjustments).toHaveTextContent('Anulación de salida');
      expect(adjustments).toHaveTextContent('Mensajería · Mensajeros Ya · Se devolvió el dinero');
    });

    it('arqueo ciego: sin esperado ni columna, pero la lista de salidas se ve', () => {
      render(
        <CashSessionReport
          session={cashSessionFixture({ blindHidden: true, expected: null, payments: null, outflows: [outflowFixture()] })}
        />,
      );
      expect(screen.queryByRole('table', { name: 'Arqueo por moneda y método' })).not.toBeInTheDocument();
      expect(screen.getByRole('table', { name: 'Salidas de caja' })).toHaveTextContent('Mensajería');
      expect(screen.queryByText('Esperado')).not.toBeInTheDocument();
    });

    it('sin salidas lo dice', () => {
      render(<CashSessionReport session={cashSessionFixture()} />);
      expect(screen.getByText('Sin salidas de caja en este turno.')).toBeInTheDocument();
    });
  });
});
