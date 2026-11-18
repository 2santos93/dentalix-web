import { render, screen, within } from '@testing-library/react';
import { PublicBudgetSummary } from './public-budget';
import { regionalFormat } from '@/lib/format/regional-format';
import type { PublicBudget } from '@/lib/signature-requests/signature-requests-api';

// `Intl` separa con espacios duros; se normalizan para leer.
const text = (el: HTMLElement) => (el.textContent ?? '').replace(/\s/g, ' ');

// Sede en es-VE: «VES 80.000,00», «EUR 100,55».
const CLOCK = { timeZone: 'America/Caracas', fmt: regionalFormat({ locale: 'es-VE', hourCycle: 'h12' }) };

/** Plan en EUR a precio de convenio con el catálogo en VES (DX-502). */
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
        listPriceCurrency: 'VES',
        ...overrides,
      },
    ],
    totals: [{ currency: 'EUR', gross: 100.55, discount: 0, net: 100.55, agreementSaving: saving }],
  };
}

describe('PublicBudgetSummary: precio de lista en la moneda del catálogo (DX-502)', () => {
  it('plan en EUR con el catálogo en VES: el precio de lista lleva VES, nunca EUR, con la nota de referencia', () => {
    render(<PublicBudgetSummary budget={eurBudget()} clock={CLOCK} />);
    const item = within(screen.getByRole('list', { name: 'Procedimientos del presupuesto' })).getByRole('listitem');
    expect(text(item)).toContain('Precio de lista VES 80.000,00');
    expect(text(item)).not.toContain('EUR 80.000,00');
    // Lo cobrado sigue en la moneda del plan.
    expect(text(item)).toContain('EUR 100,55');
    expect(text(screen.getByTestId('public-budget-list-price-note'))).toBe(
      'El precio de lista es el del catálogo de la clínica, en VES: es de referencia y no se convierte a EUR.',
    );
  });

  it('no muestra «Ahorro por convenio» con las monedas distintas, aunque la foto traiga uno', () => {
    // Una foto v2 guardó el «ahorro» restando VES de EUR.
    render(<PublicBudgetSummary budget={eurBudget({}, 79899.45)} clock={CLOCK} />);
    expect(screen.queryByText('Ahorro por convenio')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/79\.899/);
  });

  it('sin moneda del catálogo conocida, oculta la cifra y lo explica con la nota de referencia, sin ahorro', () => {
    render(<PublicBudgetSummary budget={eurBudget({ listPriceCurrency: null }, 79899.45)} clock={CLOCK} />);
    expect(screen.queryByText(/Precio de lista/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/80\.000/);
    expect(text(screen.getByTestId('public-budget-list-price-hidden-note'))).toBe(
      'El precio de lista del catálogo de la clínica no se muestra: no se sabe en qué moneda está y no se convierte a EUR.',
    );
    expect(screen.queryByTestId('public-budget-list-price-note')).not.toBeInTheDocument();
    expect(screen.queryByText('Ahorro por convenio')).not.toBeInTheDocument();
  });

  it('con un ítem en VES y otro sin moneda: la nota solo habla del que se ve', () => {
    const budget = eurBudget();
    budget.items.push({ ...budget.items[0], procedure: 'Resina', listPrice: 50000, listPriceCurrency: null });
    render(<PublicBudgetSummary budget={budget} clock={CLOCK} />);
    expect(screen.getAllByText(/Precio de lista/)).toHaveLength(1);
    expect(document.body.textContent).not.toMatch(/50\.000/);
    expect(text(screen.getByTestId('public-budget-list-price-note'))).toBe(
      'El precio de lista es el del catálogo de la clínica, en VES: es de referencia y no se convierte a EUR.',
    );
    // El oculto también se explica, aparte.
    expect(screen.getByTestId('public-budget-list-price-hidden-note')).toBeInTheDocument();
  });

  it('con el catálogo en la moneda del plan: precio de lista y ahorro, sin nota', () => {
    const budget = eurBudget({ listPrice: 120, listPriceCurrency: 'EUR' }, 19.45);
    render(<PublicBudgetSummary budget={budget} clock={CLOCK} />);
    expect(screen.getByText('Precio de lista EUR 120,00', { normalizer: (s) => s.replace(/\s/g, ' ') })).toBeInTheDocument();
    expect(screen.getByText('Ahorro por convenio')).toBeInTheDocument();
    expect(screen.queryByTestId('public-budget-list-price-note')).not.toBeInTheDocument();
    expect(screen.queryByTestId('public-budget-list-price-hidden-note')).not.toBeInTheDocument();
  });

  it('sin convenio no hay precio de lista ni nota', () => {
    render(
      <PublicBudgetSummary
        budget={{ ...eurBudget({ agreementName: null, listPriceCurrency: 'VES' }), agreement: null }}
        clock={CLOCK}
      />,
    );
    expect(screen.queryByText(/Precio de lista/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('public-budget-list-price-note')).not.toBeInTheDocument();
  });
});

describe('PublicBudgetSummary · DX-560 presentación', () => {
  const budget: PublicBudget = {
    ...eurBudget(),
    currency: 'VES',
    agreement: null,
    items: [
      { ...eurBudget().items[0], toothNumber: '16', surfaces: ['OCCLUSAL'], procedure: 'Resina compuesta', unitPrice: 150000, subtotal: 150000, listPrice: null, agreementName: null, listPriceCurrency: null },
      { ...eurBudget().items[0], toothNumber: '36', surfaces: [], procedure: 'Implante', unitPrice: 3150000, subtotal: 3150000, listPrice: null, agreementName: null, listPriceCurrency: null },
    ],
    totals: [{ currency: 'VES', gross: 3300000, discount: 0, net: 3300000, agreementSaving: 0 }],
  };
  const presentation = {
    language: 'en',
    items: [
      { index: 0, visit: 1, label: 'Filling on the molar', language: 'en' },
      { index: 1, visit: 2, label: 'Implante para reponer la muela', language: 'es' },
    ],
    visitOrganization: [
      { visit: 1, label: null, minDaysAfterPrevious: 0 },
      { visit: 2, label: 'Cirugía', minDaysAfterPrevious: 15 },
    ],
    secondCurrency: { currency: 'USD', fromPerBase: 4000, toPerBase: 1, source: 'MANUAL', date: '2026-11-18' },
  };

  it('con presentación: visitas, odontograma compacto, textos con su idioma, total y segunda moneda congelada', () => {
    render(<PublicBudgetSummary budget={budget} clock={CLOCK} presentation={presentation} />);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['Visita 1', 'Visita 2 · Cirugía']);
    expect(screen.getByRole('img', { name: 'Dientes de esta visita: 16' })).toBeInTheDocument();
    expect(screen.getByText('Filling on the molar')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Implante para reponer la muela')).toHaveAttribute('lang', 'es');
    // El nombre del catálogo no sale cuando hay texto para el paciente.
    expect(screen.queryByText('Resina compuesta')).not.toBeInTheDocument();
    expect(text(screen.getByText('Total (VES)').parentElement!)).toContain('VES 3.300.000,00');
    expect(text(screen.getByTestId('public-budget-second-total'))).toContain('USD 825,00');
    expect(text(screen.getByTestId('public-budget-second-note'))).toBe(
      'Tasa del 18/11/2026: 1 USD = VES 4.000,00 (manual). El importe en USD es orientativo y se calcula con la tasa del día del pago.',
    );
    // Lo que firma sigue por línea: precio (y descuento o precio de lista si los hay).
    const items = screen.getByRole('list', { name: 'Procedimientos del presupuesto' });
    expect(text(items)).toContain('PrecioVES 150.000,00');
    expect(text(items)).toContain('PrecioVES 3.150.000,00');
  });

  it('con presentación sigue el descuento y el precio de lista en la moneda del catálogo, con su nota', () => {
    const eur = eurBudget();
    render(
      <PublicBudgetSummary
        budget={{ ...eur, items: [{ ...eur.items[0], discount: 10, subtotal: 90.55 }] }}
        clock={CLOCK}
        presentation={{
          language: 'es',
          items: [{ index: 0, visit: 1, label: 'Funda para el incisivo', language: 'es' }],
          visitOrganization: [{ visit: 1, label: null, minDaysAfterPrevious: 0 }],
        }}
      />,
    );
    const items = screen.getByRole('list', { name: 'Procedimientos del presupuesto' });
    expect(within(items).getByRole('heading', { name: 'Visita 1' })).toBeInTheDocument();
    expect(text(items)).toContain('Funda para el incisivo');
    expect(text(items)).toContain('PrecioEUR 100,55');
    expect(text(items)).toContain('Descuento−EUR 10,00');
    expect(text(items)).toContain('Precio de lista VES 80.000,00');
    expect(text(items)).not.toContain('EUR 80.000,00');
    expect(screen.getByTestId('public-budget-list-price-note')).toBeInTheDocument();
  });

  it('sin presentación (enlaces anteriores): la lista de siempre, sin segunda moneda', () => {
    render(<PublicBudgetSummary budget={budget} clock={CLOCK} presentation={null} />);
    expect(screen.getByRole('list', { name: 'Procedimientos del presupuesto' })).toBeInTheDocument();
    expect(screen.getByText('Resina compuesta')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByTestId('public-budget-second-total')).not.toBeInTheDocument();
  });

  it('sin segunda moneda en la presentación, no hay total orientativo', () => {
    const { secondCurrency: _omit, ...rest } = presentation;
    void _omit;
    render(<PublicBudgetSummary budget={budget} clock={CLOCK} presentation={rest} />);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(2);
    expect(screen.queryByTestId('public-budget-second-total')).not.toBeInTheDocument();
  });
});
