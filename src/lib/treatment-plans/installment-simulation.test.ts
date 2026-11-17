import {
  acceptInstallmentPlan,
  decodeFinancing,
  encodeFinancing,
  financingMessage,
  financingWhatsAppHref,
  scenarioLine,
  type FinancingPainters,
  type InstallmentScenario,
  type InstallmentSimulation,
} from './installment-simulation';

const paint: FinancingPainters = {
  amount: (amount, currency) => `${currency} ${amount.toFixed(2)}`,
  civilDate: (day) => day.split('-').reverse().join('/'),
};
const noFormat: FinancingPainters = { amount: () => null, civilDate: () => null };

function scenario(overrides: Partial<InstallmentScenario> = {}): InstallmentScenario {
  return {
    totalToFinance: 1000,
    downPayment: 100,
    installmentsCount: 7,
    periodicity: 'MONTHLY',
    startDate: '2026-12-01T00:00:00.000Z',
    installments: [
      ...Array.from({ length: 6 }, (_, i) => ({
        sequence: i + 1,
        dueDate: `2027-0${i + 1}-01T00:00:00.000Z`,
        amount: 128.57,
      })),
      { sequence: 7, dueDate: '2027-07-01T00:00:00.000Z', amount: 128.58 },
    ],
    ...overrides,
  };
}

const simulation = (scenarios: InstallmentScenario[]): InstallmentSimulation => ({
  treatmentPlanId: 'plan-1',
  currency: 'USD',
  totalToFinance: 1000,
  scenarios,
});

describe('DX-041 · opciones de pago en cuotas', () => {
  it('la URL de la vista A4 lleva las condiciones (no importes) y vuelve igual', () => {
    const terms = [
      { periodicity: 'MONTHLY' as const, installmentsCount: 6, startDate: '2026-12-01T00:00:00.000Z', downPayment: 300 },
      { periodicity: 'BIWEEKLY' as const, installmentsCount: 12, startDate: '2026-12-15T00:00:00.000Z', downPayment: 0 },
      { periodicity: 'WEEKLY' as const, installmentsCount: 24, startDate: '2027-01-04T00:00:00.000Z', downPayment: 150.5 },
    ];
    const encoded = encodeFinancing(terms);
    expect(encoded).toBe('M.6.2026-12-01.300_Q.12.2026-12-15.0_S.24.2027-01-04.150.5');
    expect(decodeFinancing(encoded)).toEqual(terms);
  });

  it('una URL que no es válida o con más de 3 opciones no imprime opciones', () => {
    expect(decodeFinancing(null)).toBeNull();
    expect(decodeFinancing('X.6.2026-12-01.0')).toBeNull();
    expect(decodeFinancing('M.0.2026-12-01.0')).toBeNull();
    expect(decodeFinancing('M.601.2026-12-01.0')).toBeNull();
    expect(decodeFinancing('M.6.2026-12-01.-5')).toBeNull();
    expect(decodeFinancing(Array(4).fill('M.6.2026-12-01.0').join('_'))).toBeNull();
  });

  it('la línea de una opción dice la inicial, las cuotas, la última si cambia y desde cuándo', () => {
    expect(scenarioLine(scenario(), 'USD', paint)).toBe(
      'Inicial de USD 100.00 y 7 cuotas mensuales de USD 128.57 (la última de USD 128.58), desde el 01/12/2026',
    );
    const even = scenario({
      downPayment: 0,
      installmentsCount: 2,
      periodicity: 'BIWEEKLY',
      installments: [
        { sequence: 1, dueDate: '2026-12-01T00:00:00.000Z', amount: 500 },
        { sequence: 2, dueDate: '2026-12-15T00:00:00.000Z', amount: 500 },
      ],
    });
    expect(scenarioLine(even, 'VES', paint)).toBe(
      'Sin inicial: 2 cuotas quincenales de VES 500.00, desde el 01/12/2026',
    );
    expect(scenarioLine(scenario(), 'USD', noFormat)).toBeNull();
  });

  it('el mensaje al paciente: saludo, total y una línea por opción; sin formato de la sede, ninguno', () => {
    const text = financingMessage(
      { patientName: 'Ana María Pérez', clinicName: 'Clínica Sonrisa', simulation: simulation([scenario(), scenario()]) },
      paint,
    );
    expect(text).toContain('Hola Ana, te escribimos de Clínica Sonrisa');
    expect(text).toContain('tu presupuesto de USD 1000.00');
    expect(text).toContain('Opción 1: Inicial de USD 100.00');
    expect(text).toContain('Opción 2: Inicial de USD 100.00');
    expect(text).not.toContain('—');
    expect(financingMessage({ patientName: 'Ana', clinicName: null, simulation: simulation([scenario()]) }, noFormat)).toBeNull();
  });

  it('WhatsApp: al teléfono del paciente (solo dígitos) o, sin él, el selector de chats', () => {
    expect(financingWhatsAppHref('+58 412-1234567', 'Hola')).toBe('https://wa.me/584121234567?text=Hola');
    expect(financingWhatsAppHref(null, 'Hola Ana')).toBe('https://wa.me/?text=Hola%20Ana');
  });

  it('aceptar con una opción envía sus condiciones y el saldo que mostró', () => {
    expect(acceptInstallmentPlan(scenario())).toEqual({
      downPayment: 100,
      installmentsCount: 7,
      periodicity: 'MONTHLY',
      startDate: '2026-12-01T00:00:00.000Z',
      totalToFinance: 1000,
    });
  });
});
