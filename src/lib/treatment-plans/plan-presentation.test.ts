import { planQuoteFixture } from '@/components/treatment-plans/plan-quote-fixture';
import type { PublicBudget } from '@/lib/signature-requests/signature-requests-api';
import {
  parsePresentationMode,
  planPresentHref,
  planTabHref,
  presentationFromPublic,
  presentationFromQuote,
} from './plan-presentation';

const UUID = '7f1d2c3e-1111-4a4a-9b9b-0123456789ab';

describe('DX-560 · modelo de la presentación', () => {
  it('agrupa por visita en orden, con el texto para el paciente, su idioma y los totales', () => {
    const quote = planQuoteFixture({
      visitOrganization: [
        { itemId: 'i1', visit: 2, label: 'Cirugía', minDaysAfterPrevious: 15 },
        { itemId: 'i2', visit: 1, label: null, minDaysAfterPrevious: 0 },
      ],
      presentation: {
        language: 'en',
        items: [
          { itemId: 'i1', visit: 2, label: 'Dental implant', language: 'en' },
          { itemId: 'i2', visit: 1, label: 'Resina en la muela', language: 'es' },
        ],
      },
    });
    const model = presentationFromQuote(quote);
    expect(model.language).toBe('en');
    expect(model.visits.map((v) => v.visit)).toEqual([1, 2]);
    expect(model.visits[0]).toMatchObject({ label: null, total: 150000, teeth: ['16'] });
    expect(model.visits[0].lines[0]).toMatchObject({ label: 'Resina en la muela', language: 'es', surfaces: ['OCCLUSAL', 'MESIAL'] });
    expect(model.visits[1]).toMatchObject({ label: 'Cirugía', minDaysAfterPrevious: 15, total: 3150000, teeth: ['36'] });
    expect(model.visits[1].lines[0]).toMatchObject({ label: 'Dental implant', language: 'en' });
    expect(model.total).toBe(3300000);
  });

  it('sin presentación ni nombre cae a «Procedimiento»: nunca un código ni un id', () => {
    const quote = planQuoteFixture({
      presentation: { language: 'es', items: [] },
      items: [{ ...planQuoteFixture().items[0], id: UUID, procedure: '  ' }],
    });
    const model = presentationFromQuote(quote);
    expect(model.visits[0].lines[0].label).toBe('Procedimiento');
    expect(JSON.stringify(model)).not.toContain('"label":"' + UUID);
  });

  it('desde el enlace público: por posición, con las visitas congeladas', () => {
    const budget = {
      currency: 'USD',
      items: [
        { toothNumber: '55', surfaces: [], procedure: 'Sellante', subtotal: 40 },
        { toothNumber: '', surfaces: [], procedure: 'Consulta', subtotal: 20.1 },
      ],
      totals: [{ currency: 'USD', gross: 60.1, discount: 0, net: 60.1, agreementSaving: 0 }],
    } as unknown as PublicBudget;
    const model = presentationFromPublic(budget, {
      language: 'es',
      items: [
        { index: 0, visit: 1, label: 'Sellado de la muela de leche', language: 'es' },
        { index: 1, visit: 2, label: 'Control', language: 'es' },
      ],
      visitOrganization: [
        { visit: 1, label: null, minDaysAfterPrevious: 0 },
        { visit: 2, label: 'Revisión', minDaysAfterPrevious: 30 },
      ],
    });
    expect(model.visits).toHaveLength(2);
    expect(model.visits[0].teeth).toEqual(['55']);
    expect(model.visits[1]).toMatchObject({ label: 'Revisión', minDaysAfterPrevious: 30, teeth: [] });
    expect(model.total).toBe(60.1);
  });

  it('las rutas y la vista de la URL', () => {
    expect(parsePresentationMode('clinica')).toBe('clinica');
    expect(parsePresentationMode('otra')).toBe('completa');
    expect(parsePresentationMode(null)).toBe('completa');
    expect(planPresentHref('p 1', 'plan-1')).toBe('/presentar/patients/p%201/treatment-plans/plan-1');
    expect(planPresentHref('p1', 'plan-1', { financing: 'M.6.2026-12-01.0', mode: 'economica' })).toBe(
      '/presentar/patients/p1/treatment-plans/plan-1?vista=economica&cuotas=M.6.2026-12-01.0',
    );
    expect(planTabHref('p1', 'plan-2', { accept: true })).toBe('/patients/p1?tab=treatment-plans&planId=plan-2&aceptar=1');
  });
});
