import { render, screen, within } from '@testing-library/react';
import { DebtorCard } from './debtor-card';
import type { AgingRow } from '@/lib/receivables/receivables-api';

const BUCKETS = { current: 0, days0to30: 0, days31to60: 0, days61to90: 0, over90: 0 };
const money = (text: string | null | undefined) => (text ?? '').replace(/\s/g, ' ');

function row(overrides: Partial<AgingRow> = {}): AgingRow {
  return {
    patient: { id: 'pat-9', fullName: 'Jorge Ramírez', phone: '300 555 0101', whatsApp: '573005550101' },
    locationId: 'loc-1',
    oldestAgeDays: 75,
    ageApproximate: false,
    currencies: [
      {
        currency: 'COP',
        balance: 300000,
        debt: 300000,
        credit: 0,
        buckets: { ...BUCKETS, current: 100000, days0to30: 100000, days61to90: 100000 },
        oldestAgeDays: 75,
        ageApproximate: false,
        nextInstallment: { dueDate: '2026-11-07T00:00:00.000Z', amount: 100000 },
      },
    ],
    lastPayment: null,
    nextInstallment: { dueDate: '2026-11-07T00:00:00.000Z', amount: 100000, currency: 'COP' },
    lastNote: null,
    promise: null,
    ...overrides,
  };
}

describe('DebtorCard (tarjeta móvil, DX-145)', () => {
  it('muestra nombre, antigüedad, tramos con importe de más antiguo a más nuevo y la próxima cuota', () => {
    render(<DebtorCard row={row()} clinicName="Clínica Demo" />);
    const card = screen.getByRole('article', { name: 'Jorge Ramírez' });
    expect(within(card).getByText('75 días')).toBeInTheDocument();
    expect(within(card).queryByText('Fecha aproximada')).not.toBeInTheDocument();
    const terms = within(card)
      .getAllByRole('term')
      .map((t) => t.textContent);
    expect(terms).toEqual(['61–90 días', '0–30 días', 'Por vencer', 'Último abono', 'Próxima cuota']);
    expect(money(card.textContent)).toContain('300.000,00');
    expect(within(card).getByText('Sin abonos')).toBeInTheDocument();
    expect(within(card).getByText('07/11/2026')).toBeInTheDocument();
  });

  it('lleva «Llamar», «WhatsApp» y el estado de cuenta como botones de 44px a lo ancho', () => {
    render(<DebtorCard row={row()} clinicName="Clínica Demo" />);
    const card = screen.getByRole('article', { name: 'Jorge Ramírez' });
    const call = within(card).getByRole('link', { name: 'Llamar a Jorge Ramírez: 300 555 0101' });
    const whatsapp = within(card).getByRole('link', { name: 'WhatsApp a Jorge Ramírez' });
    const statement = within(card).getByRole('link', { name: 'Estado de cuenta de Jorge Ramírez' });
    for (const action of [call, whatsapp, statement]) {
      expect(action.className).toContain('h-11');
      expect(action.className).toContain('flex-1');
    }
    expect(call).toHaveAttribute('href', 'tel:3005550101');
    expect(statement).toHaveAttribute('href', '/patients/pat-9?tab=account-statement');
  });

  it('sin teléfono no ofrece llamar ni WhatsApp y lo dice', () => {
    render(
      <DebtorCard
        row={row({ patient: { id: 'p', fullName: 'Luis Gómez', phone: null, whatsApp: null }, ageApproximate: true })}
        clinicName={null}
      />,
    );
    const card = screen.getByRole('article', { name: 'Luis Gómez' });
    expect(within(card).queryByRole('link', { name: /Llamar/ })).not.toBeInTheDocument();
    expect(within(card).queryByRole('link', { name: /WhatsApp/ })).not.toBeInTheDocument();
    expect(within(card).getByText('Sin teléfono')).toBeInTheDocument();
    expect(within(card).getByText('Fecha aproximada')).toBeInTheDocument();
  });
});
