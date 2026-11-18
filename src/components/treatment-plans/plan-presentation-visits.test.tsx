import { render, screen, within } from '@testing-library/react';
import { PlanPresentationVisits } from './plan-presentation-visits';
import { presentationFromQuote } from '@/lib/treatment-plans/plan-presentation';
import { planQuoteFixture } from './plan-quote-fixture';

const QUOTE = planQuoteFixture({
  visitOrganization: [
    { itemId: 'i1', visit: 2, label: 'Cirugía', minDaysAfterPrevious: 15 },
    { itemId: 'i2', visit: 1, label: null, minDaysAfterPrevious: 0 },
  ],
  presentation: {
    language: 'en',
    items: [
      { itemId: 'i1', visit: 2, label: 'Dental implant to replace the missing tooth', language: 'en' },
      { itemId: 'i2', visit: 1, label: 'Resina <b>en</b> la muela', language: 'es' },
    ],
  },
});
const MODEL = presentationFromQuote(QUOTE);
const money = (n: number) => `VES ${n}`;

describe('DX-560 · PlanPresentationVisits', () => {
  it('Completa: visitas en orden con odontograma, textos con su idioma (como texto), importes y totales', () => {
    const { container } = render(<PlanPresentationVisits model={MODEL} mode="completa" money={money} />);
    const headings = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(headings).toEqual(['Visita 1', 'Visita 2 · Cirugía']);
    expect(screen.getByText('Al menos 15 días después de la anterior')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Dientes de esta visita: 16' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Dientes de esta visita: 36' })).toBeInTheDocument();
    // Texto plano, nunca HTML.
    expect(screen.getByText('Resina <b>en</b> la muela')).toHaveAttribute('lang', 'es');
    expect(container.querySelector('b')).toBeNull();
    expect(screen.getByText('Dental implant to replace the missing tooth')).toHaveAttribute('lang', 'en');
    expect(screen.getByText('Diente 16 · Oclusal, Mesial')).toBeInTheDocument();
    expect(screen.getByTestId('presentation-visit-total-2')).toHaveTextContent('VES 3150000');
    expect(screen.getByTestId('presentation-plan-total')).toHaveTextContent('Total del plan (VES)VES 3300000');
  });

  it('Clínica: sin ningún importe ni total, con los dientes', () => {
    render(
      <PlanPresentationVisits
        model={MODEL}
        mode="clinica"
        money={money}
        secondTotal={{ label: 'Total orientativo (USD)', amount: 'USD 825', note: 'nota' }}
      />,
    );
    expect(document.body.textContent).not.toMatch(/VES|USD|\d{4,}|Total/);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    expect(screen.getByText('Diente 36')).toBeInTheDocument();
  });

  it('Económica: importes y totales sin dientes, caras ni odontograma', () => {
    render(<PlanPresentationVisits model={MODEL} mode="economica" money={money} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByText(/Diente/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Oclusal|Mesial/)).not.toBeInTheDocument();
    const visit1 = screen.getByTestId('presentation-visit-1');
    expect(within(visit1).getByText('VES 150000', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByTestId('presentation-plan-total')).toHaveTextContent('VES 3300000');
  });

  it('nunca pinta un código ni un id', () => {
    render(<PlanPresentationVisits model={MODEL} mode="completa" money={money} />);
    expect(document.body.textContent).not.toMatch(/\bi1\b|\bi2\b|plan-1/);
  });
});
