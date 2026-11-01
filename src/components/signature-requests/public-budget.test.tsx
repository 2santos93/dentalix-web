import { render, screen, within } from '@testing-library/react';
import { PublicBudgetSummary } from './public-budget';
import { regionalFormat } from '@/lib/format/regional-format';
import type { PublicBudget } from '@/lib/signature-requests/signature-requests-api';

// `Intl` separa con espacios duros; se normalizan para leer.
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

// Sede en es-CO: «COP 80.000,00», «EUR 100,55».
const CLOCK = { timeZone: 'America/Bogota', fmt: regionalFormat({ locale: 'es-CO', hourCycle: 'h12' }) };

/** Plan en EUR a precio de convenio con el catálogo en COP (DX-502). */
function eurBudget(overrides: Partial<PublicBudget['items'][number]> = {}, saving = 0): PublicBudget {
  return {
    currency: 'EUR',
    clinicName: 'Clínica Sonrisas',
    location: { name: 'Sede Centro', address: null },
    patient: { name: 'Laura Castro', document: null },
    professionalName: null,
    agreement: { name: 'Lista Euro', payerName: 'Aseguradora' },
    issuedOn: '2026-11-01',
    validUntil: '2026-12-01',
    validityDays: 30,
    items: [
      {
        toothNumber: '11',
        surfaces: [],
        procedure: 'Corona cerámica',
        quantity: 1,
        unitPrice: 100.55,
        discount: 0,
        subtotal: 100.55,
        listPrice: 80000,
        agreementName: 'Lista Euro',
        listPriceCurrency: 'COP',
        ...overrides,
      },
    ],
    totals: [{ currency: 'EUR', gross: 100.55, discount: 0, net: 100.55, agreementSaving: saving }],
  };
}

describe('PublicBudgetSummary: precio de lista en la moneda del catálogo (DX-502)', () => {
  it('plan en EUR con el catálogo en COP: el precio de lista lleva COP, nunca EUR, con la nota de referencia', () => {
    render(<PublicBudgetSummary budget={eurBudget()} clock={CLOCK} />);
    const item = within(screen.getByRole('list', { name: 'Procedimientos del presupuesto' })).getByRole('listitem');
    expect(text(item)).toContain('Precio de lista COP 80.000,00');
    expect(text(item)).not.toContain('EUR 80.000,00');
    // Lo cobrado sigue en la moneda del plan.
    expect(text(item)).toContain('EUR 100,55');
    expect(text(screen.getByTestId('public-budget-list-price-note'))).toBe(
      'El precio de lista es el del catálogo de la clínica, en COP: es de referencia y no se convierte a EUR.',
    );
  });

  it('no muestra «Ahorro por convenio» con las monedas distintas, aunque la foto traiga uno', () => {
    // Una foto v2 guardó el «ahorro» restando COP de EUR.
    render(<PublicBudgetSummary budget={eurBudget({}, 79899.45)} clock={CLOCK} />);
    expect(screen.queryByText('Ahorro por convenio')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/79\.899/);
  });

  it('sin moneda del catálogo conocida, oculta la cifra y deja la nota', () => {
    render(<PublicBudgetSummary budget={eurBudget({ listPriceCurrency: null }, 79899.45)} clock={CLOCK} />);
    expect(screen.queryByText(/Precio de lista/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/80\.000/);
    expect(text(screen.getByTestId('public-budget-list-price-note'))).toBe(
      'El precio de lista es el del catálogo de la clínica, que puede estar en otra moneda: es de referencia y no se convierte a EUR.',
    );
    expect(screen.queryByText('Ahorro por convenio')).not.toBeInTheDocument();
  });

  it('con el catálogo en la moneda del plan: precio de lista y ahorro, sin nota', () => {
    const budget = eurBudget({ listPrice: 120, listPriceCurrency: 'EUR' }, 19.45);
    render(<PublicBudgetSummary budget={budget} clock={CLOCK} />);
    expect(screen.getByText('Precio de lista EUR 120,00', { normalizer: (s) => s.replace(/\s/g, ' ') })).toBeInTheDocument();
    expect(screen.getByText('Ahorro por convenio')).toBeInTheDocument();
    expect(screen.queryByTestId('public-budget-list-price-note')).not.toBeInTheDocument();
  });

  it('sin convenio no hay precio de lista ni nota', () => {
    render(
      <PublicBudgetSummary
        budget={{ ...eurBudget({ agreementName: null, listPriceCurrency: 'COP' }), agreement: null }}
        clock={CLOCK}
      />,
    );
    expect(screen.queryByText(/Precio de lista/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('public-budget-list-price-note')).not.toBeInTheDocument();
  });
});
