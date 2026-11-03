import { render, screen, within } from '@testing-library/react';
import { CashSessionReport } from './cash-session-report';
import { cashSessionFixture, closedCashSessionFixture, outflowFixture } from '@/lib/test/cash-session';
import type { CashSessionDetail } from '@/lib/cash-sessions/cash-sessions-api';
import { REGIONAL_DE, REGIONAL_US } from '@/lib/test/document-regional';

describe('CashSessionReport (DX-027)', () => {
  it('cerrada: quién abrió y cerró, fondo, arqueo con contado y diferencia, motivo y fecha de bloqueo', () => {
    render(<CashSessionReport session={closedCashSessionFixture()} />);
    const doc = screen.getByTestId('cash-session-report');
    expect(within(doc).getByRole('heading', { name: 'Informe de cierre de caja' })).toBeInTheDocument();
    expect(doc).toHaveTextContent('Paola Martínez · 17/10/2026 9:00 a. m.');
    expect(doc).toHaveTextContent('Paola Martínez · 17/10/2026 7:00 p. m.');
    const table = within(doc).getByRole('table', { name: 'Arqueo por moneda y método' });
    const cash = within(table).getAllByRole('row')[1];
    expect(cash).toHaveTextContent('Efectivo · USD');
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
              amountHidden: false,
            },
          ],
          adjustments: [
            {
              id: 'adj-1',
              kind: 'VOID',
              currency: 'USD',
              method: 'CASH',
              amount: -30_000,
              reason: null,
              createdAt: '2026-10-17T19:00:00.000Z',
              createdBy: { id: 'u-admin', fullName: 'Admin' },
              sessionId: 'cs-1',
              sessionStatus: 'OPEN',
              amountHidden: false,
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

  it('arqueo ciego abierto (SEC-043): sin anulaciones ni ajustes, que dejarían deducir lo esperado', () => {
    render(
      <CashSessionReport
        session={cashSessionFixture({
          blindHidden: true,
          expected: null,
          payments: null,
          voidedPayments: null,
          adjustments: null,
        })}
      />,
    );
    expect(screen.getByText(/las anulaciones y los ajustes del turno se ven cuando la caja está cerrada/)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Anulaciones' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ajustes en este turno' })).not.toBeInTheDocument();
    // Las salidas las hizo quien cuenta: siguen a la vista.
    expect(screen.getByRole('heading', { name: 'Salidas de caja' })).toBeInTheDocument();
  });

  it('SEC-043 (M1): lo que cuenta en otra caja abierta o pendiente sale «Oculto durante el arqueo», sin cifra', () => {
    const base = closedCashSessionFixture();
    render(
      <CashSessionReport
        session={{
          ...base,
          voidedPayments: [
            {
              ...cashSessionFixture().payments![0],
              id: 'pay-2',
              amount: null,
              collectedAmount: null,
              amountHidden: true,
              voidedAt: '2026-10-18T14:00:00.000Z',
              voidedBy: { id: 'u-admin', fullName: 'Admin' },
              voidReason: 'Duplicado',
              bookedAsAdjustment: true,
            },
          ],
          laterAdjustments: [
            {
              id: 'adj-9',
              kind: 'VOID',
              currency: 'USD',
              method: 'CASH',
              amount: null,
              amountHidden: true,
              reason: null,
              createdAt: '2026-10-18T14:00:00.000Z',
              createdBy: { id: 'u-admin', fullName: 'Admin' },
              sessionId: null,
              sessionStatus: null,
              payment: { id: 'pay-2', patient: { id: 'p', fullName: 'Beto Ruiz' }, paidOn: '2026-10-17', receiptNumber: null },
              expensePayment: null,
              originalSession: null,
            },
          ],
        }}
      />,
    );
    const voidedList = screen.getByRole('list', { name: 'Abonos anulados' });
    expect(within(voidedList).getByTestId('amount-hidden')).toHaveTextContent('Oculto durante el arqueo');
    const later = screen.getByRole('list', { name: 'Ajustes posteriores a este cierre' });
    expect(within(later).getByTestId('amount-hidden')).toHaveTextContent('Oculto durante el arqueo');
    expect(later).not.toHaveTextContent(/USD\s?-|−/);
  });

  it('SEC-043 (ronda 4): en una caja cerrada, el grupo con una anulación posterior abierta sale sin cobros, ajustes, salidas, esperado ni diferencia; el resto, con sus cifras', () => {
    const base = closedCashSessionFixture();
    const [cash, card] = base.expected!;
    const hiddenCash = {
      ...cash,
      payments: null,
      paymentsCount: null,
      paymentAdjustments: null,
      adjustments: null,
      outflows: null,
      outflowsCount: null,
      expected: null,
      amountHidden: true,
    };
    const closing = {
      ...base.closing!,
      lines: base.closing!.lines.map((l) =>
        l.method === 'CASH' ? { ...l, expected: null, difference: null, amountHidden: true } : l,
      ),
    };
    render(
      <CashSessionReport
        session={{
          ...base,
          expected: [hiddenCash, card],
          differences: [{ currency: 'USD', amount: null, amountHidden: true }],
          closing,
          closings: [closing],
        }}
      />,
    );
    const arqueo = screen.getByRole('table', { name: 'Arqueo por moneda y método' });
    const [, cashRow, cardRow] = within(arqueo).getAllByRole('row');
    // Cobros, ajustes, salidas, esperado y diferencia: ocultos; fondo y contado, no.
    expect(within(cashRow).getAllByTestId('amount-hidden')).toHaveLength(5);
    expect(cashRow).toHaveTextContent(/50\.000,00/);
    expect(cashRow).toHaveTextContent(/79\.000,00/);
    expect(within(cardRow).queryByTestId('amount-hidden')).not.toBeInTheDocument();
    expect(cardRow).toHaveTextContent(/25\.000,00/);
  });

  it('SEC-043 (B4): cuadrado a ciegas con la nota que escribió quien contó', () => {
    const base = closedCashSessionFixture();
    const closing = {
      ...base.closing!,
      blind: true,
      hasDifference: false,
      differenceReason: 'Conté dos veces el cajón',
      lines: base.closing!.lines.map((l) => ({ ...l, counted: l.expected ?? 0, difference: 0 })),
    };
    render(<CashSessionReport session={{ ...base, differences: [], closing, closings: [closing] }} />);
    expect(screen.getByText('El arqueo cuadra.')).toBeInTheDocument();
    expect(screen.getByText('Nota de quien contó: Conté dos veces el cajón')).toBeInTheDocument();
  });

  describe('recibos consultados antes de cerrar (SEC-043-bis)', () => {
    const withViews = (receiptViews: { receipts: number; views: number } | null, linkSessions = true) => {
      const base = closedCashSessionFixture();
      const closing = { ...base.closing!, blind: true, receiptViews };
      render(<CashSessionReport session={{ ...base, closing, closings: [closing] }} linkSessions={linkSessions} />);
    };

    it('lo dice con el enlace a la auditoría filtrada por quien cerró, los recibos y los días del turno', () => {
      withViews({ receipts: 3, views: 5 });
      const line = screen.getByTestId('closing-receipt-views');
      expect(line).toHaveTextContent('Consultó 3 recibos de esta caja antes de cerrar (5 consultas).');
      const link = within(line).getByRole('link', { name: 'Ver en la auditoría' });
      const href = new URL(link.getAttribute('href')!, 'http://x');
      expect(href.pathname).toBe('/settings/auditoria');
      expect(Object.fromEntries(href.searchParams)).toEqual({
        actorUserId: 'u-recep',
        resourceType: 'PAYMENT_RECEIPT',
        from: '2026-10-17',
        to: '2026-10-17',
      });
    });

    it('un recibo consultado una vez: en singular y sin el paréntesis', () => {
      withViews({ receipts: 1, views: 1 });
      expect(screen.getByTestId('closing-receipt-views')).toHaveTextContent(
        /^Consultó 1 recibo de esta caja antes de cerrar\. Ver en la auditoría$/,
      );
    });

    it('sin consultas no dice nada', () => {
      withViews({ receipts: 0, views: 0 });
      expect(screen.queryByTestId('closing-receipt-views')).not.toBeInTheDocument();
    });

    it('para recepción (null) no hay línea', () => {
      withViews(null);
      expect(screen.queryByTestId('closing-receipt-views')).not.toBeInTheDocument();
    });

    it('en la vista imprimible va sin enlace', () => {
      withViews({ receipts: 2, views: 2 }, false);
      const line = screen.getByTestId('closing-receipt-views');
      expect(within(line).queryByRole('link')).not.toBeInTheDocument();
    });
  });

  it('cierre a ciegas sin motivo que no cuadró (SEC-043): «Diferencia sin justificar» para revisar', () => {
    const base = closedCashSessionFixture();
    const closing = { ...base.closing!, blind: true, differenceReason: null, unjustifiedDifference: true };
    render(<CashSessionReport session={{ ...base, unjustifiedDifference: true, closing, closings: [closing] }} />);
    expect(screen.getByText('Diferencia sin justificar')).toBeInTheDocument();
    expect(screen.getByText(/administración la revisa con quien contó/)).toBeInTheDocument();
    expect(screen.getByText('Cerrada con arqueo ciego.')).toBeInTheDocument();
  });

  it('DX-516: los ajustes por medio de pago se ven bajo los cobros y suman al esperado; sin ellos, nada', () => {
    const [cash, card] = cashSessionFixture().expected!;
    const { unmount } = render(<CashSessionReport session={cashSessionFixture()} />);
    expect(screen.queryByText(/por ajustes del medio/)).not.toBeInTheDocument();
    unmount();
    render(
      <CashSessionReport
        session={cashSessionFixture({
          expected: [{ ...cash, paymentAdjustments: 900, expected: 80_900 }, { ...card, paymentAdjustments: -500, expected: card.expected! - 500 }],
        })}
      />,
    );
    const arqueo = screen.getByRole('table', { name: 'Arqueo por moneda y método' });
    const [, cashRow, cardRow] = within(arqueo).getAllByRole('row');
    expect(cashRow.textContent?.replace(/\s/g, ' ')).toMatch(/\+USD 900,00 por ajustes del medio/);
    expect(cashRow.textContent?.replace(/\s/g, ' ')).toMatch(/80\.900,00/);
    expect(cardRow.textContent?.replace(/\s/g, ' ')).toMatch(/−USD 500,00 por ajustes del medio/);
  });

  describe('DX-274: salidas de caja', () => {
    const [cash, card] = cashSessionFixture().expected!;
    const voided = {
      ...outflowFixture({ id: 'ep-2', category: 'Café', supplier: null, amount: 5_000 }),
      voidedAt: '2026-10-17T20:00:00.000Z',
      voidedBy: { id: 'u-admin', fullName: 'Admin' },
      voidReason: 'Se devolvió el dinero',
      bookedAsAdjustment: true,
      amountHidden: false,
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
      expect(within(cardRow).getAllByRole('cell')[4]).toHaveTextContent(/^USD\s0,00/);

      const outflows = screen.getByRole('table', { name: 'Salidas de caja' });
      const row = within(outflows).getAllByRole('row')[1];
      expect(row).toHaveTextContent('12:30');
      expect(row).toHaveTextContent('Mensajería');
      expect(row).toHaveTextContent('Mensajeros Ya');
      expect(row).toHaveTextContent('Paola Martínez');
      expect(row).toHaveTextContent(/8\.?000,00/);

      const annulled = screen.getByRole('list', { name: 'Salidas anuladas' });
      expect(annulled).toHaveTextContent('Café');
      expect(annulled).toHaveTextContent('Motivo: Se devolvió el dinero');
      expect(within(annulled).getByText(/5\.?000,00/)).toHaveClass('line-through');
      expect(within(annulled).getByText(/Café/)).not.toHaveClass('line-through');
      expect(annulled).toHaveTextContent(/ajuste en otra caja/);
      expect(screen.getByRole('heading', { name: 'Salidas anuladas' })).toBeVisible();
    });

    it('un esperado negativo (las salidas superan el efectivo) sale en rojo', () => {
      const closed = closedCashSessionFixture();
      const [cashLine, cardLine] = closed.closing!.lines;
      render(
        <CashSessionReport
          session={closedCashSessionFixture({
            expected: [{ ...cash, outflows: 100_000, outflowsCount: 1, expected: -20_000 }, card],
            closing: {
              ...closed.closing!,
              lines: [{ ...cashLine, expected: -20_000, counted: 0, difference: 20_000 }, cardLine],
            },
          })}
        />,
      );
      const arqueo = screen.getByRole('table', { name: 'Arqueo por moneda y método' });
      const [, cashRow, cardRow] = within(arqueo).getAllByRole('row');
      expect(within(cashRow).getAllByRole('cell')[5]).toHaveTextContent(/-20\.?000,00/);
      expect(within(cashRow).getAllByRole('cell')[5]).toHaveClass('text-danger-text');
      expect(within(cardRow).getAllByRole('cell')[5]).not.toHaveClass('text-danger-text');
    });

    it('la anulación de una salida de una caja cerrada es un ajuste «Anulación de salida» con su gasto', () => {
      render(
        <CashSessionReport
          session={cashSessionFixture({
            adjustments: [
              {
                id: 'adj-2',
                kind: 'OUTFLOW_VOID',
                currency: 'USD',
                method: 'CASH',
                amount: 8_000,
                reason: 'Se devolvió el dinero',
                createdAt: '2026-10-18T15:00:00.000Z',
                createdBy: { id: 'u-admin', fullName: 'Admin' },
                sessionId: 'cs-1',
                sessionStatus: 'OPEN',
                amountHidden: false,
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

describe('DX-354: el formato de la sede del turno', () => {
  const closed = (regional: CashSessionDetail['regional']) => closedCashSessionFixture({ regional });

  it('A: sede en-US h12, la hora en 12 h en la zona de la sede y los importes con código', () => {
    render(<CashSessionReport session={closed({ ...REGIONAL_US, timeZone: 'America/New_York' })} />);
    const doc = screen.getByTestId('cash-session-report');
    // 13:00 UTC es 9:00 a. m. en Nueva York (EDT).
    expect(doc).toHaveTextContent('Paola Martínez · 10/17/2026 9:00 a. m.');
    expect(doc.textContent?.replace(/\s/g, ' ')).toContain('USD 50,000.00');
  });

  it('B: sede de-DE h23, 24 h y los importes con código', () => {
    render(<CashSessionReport session={closed({ ...REGIONAL_DE, timeZone: 'America/Caracas' })} />);
    const doc = screen.getByTestId('cash-session-report');
    expect(doc).toHaveTextContent('Paola Martínez · 17.10.2026 09:00');
    expect(doc.textContent?.replace(/\s/g, ' ')).toContain('50.000,00 USD');
  });

  it('C: sin región, «—» en las fechas y los importes, sin símbolo ni dd/mm/yyyy', () => {
    render(<CashSessionReport session={closed(null)} />);
    const text = screen.getByTestId('cash-session-report').textContent ?? '';
    expect(text).toContain('Paola Martínez · —');
    expect(text).not.toMatch(/\d{2}\/\d{2}\/\d{4}/);
    expect(text).not.toMatch(/\d[.,]\d{2}/);
    expect(text).not.toContain('US$');
  });
});
