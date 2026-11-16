import {
  downloadQuoteFunnelCsv,
  getQuoteFunnel,
  getQuoteFunnelPresentations,
  presentationAmount,
  QUOTE_FUNNEL_DETAIL_LABELS,
  QUOTE_FUNNEL_OUTCOMES,
  QUOTE_FUNNEL_STEP_LABELS,
  type QuoteFunnelPresentation,
} from './quote-funnel-api';
import { apiFetch, apiFetchText } from '@/lib/api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn(), apiFetchText: jest.fn() }));

const NOV = { from: '2026-11-01', to: '2026-11-30' };

describe('quote-funnel-api (DX-558)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('el embudo lleva el período y, si hay, la sede y quien lo elaboró', () => {
    void getQuoteFunnel('t', NOV);
    expect(apiFetch).toHaveBeenLastCalledWith('/reports/quote-funnel?from=2026-11-01&to=2026-11-30', { token: 't' });
    void getQuoteFunnel('t', { ...NOV, locationId: 'loc-1', providerId: 'u-1' });
    expect(apiFetch).toHaveBeenLastCalledWith(
      '/reports/quote-funnel?from=2026-11-01&to=2026-11-30&locationId=loc-1&providerId=u-1',
      { token: 't' },
    );
  });

  it('el detalle manda paso, página y tamaño; el motivo solo con REJECTED', () => {
    void getQuoteFunnelPresentations('t', { ...NOV, locationId: 'loc-1' }, 'ACCEPTED', null, 2, 25);
    expect(apiFetch).toHaveBeenLastCalledWith(
      '/reports/quote-funnel/presentations?from=2026-11-01&to=2026-11-30&locationId=loc-1&step=ACCEPTED&page=2&pageSize=25',
      { token: 't' },
    );
    void getQuoteFunnelPresentations('t', NOV, 'REJECTED', 'PRICE', 1, 25);
    expect(apiFetch).toHaveBeenLastCalledWith(
      '/reports/quote-funnel/presentations?from=2026-11-01&to=2026-11-30&step=REJECTED&reason=PRICE&page=1&pageSize=25',
      { token: 't' },
    );
    // Un motivo con otro paso no viaja (la API daría 400).
    void getQuoteFunnelPresentations('t', NOV, 'PENDING', 'PRICE', 1, 25);
    expect(jest.mocked(apiFetch).mock.calls.at(-1)?.[0]).not.toContain('reason=');
  });

  it('el CSV, con los mismos filtros', () => {
    void downloadQuoteFunnelCsv('t', { ...NOV, providerId: 'u-1' });
    expect(apiFetchText).toHaveBeenLastCalledWith(
      '/reports/quote-funnel.csv?from=2026-11-01&to=2026-11-30&providerId=u-1',
      { token: 't' },
    );
  });

  it('etiquetas de pasos y desenlaces', () => {
    expect(Object.values(QUOTE_FUNNEL_STEP_LABELS)).toEqual([
      'Presentados',
      'Aceptados',
      'Agendados',
      'Realizados',
      'Cobrados',
    ]);
    expect(QUOTE_FUNNEL_OUTCOMES.map((o) => [o.key, o.step, o.label])).toEqual([
      ['pending', 'PENDING', 'Pendientes'],
      ['rejected', 'REJECTED', 'Rechazados'],
      ['cancelled', 'CANCELLED', 'Cancelados'],
    ]);
    expect(QUOTE_FUNNEL_DETAIL_LABELS.COLLECTED).toBe('Cobrados');
    expect(QUOTE_FUNNEL_DETAIL_LABELS.REJECTED).toBe('Rechazados');
  });

  it('el importe de cada paso en una presentación; los desenlaces, lo presentado', () => {
    const item = {
      presentedAmount: 500,
      acceptedAmount: 300,
      scheduledAmount: 200,
      doneAmount: 100,
      collectedAmount: 50,
    } as QuoteFunnelPresentation;
    expect(presentationAmount(item, 'PRESENTED')).toBe(500);
    expect(presentationAmount(item, 'ACCEPTED')).toBe(300);
    expect(presentationAmount(item, 'SCHEDULED')).toBe(200);
    expect(presentationAmount(item, 'DONE')).toBe(100);
    expect(presentationAmount(item, 'COLLECTED')).toBe(50);
    expect(presentationAmount(item, 'REJECTED')).toBe(500);
    expect(presentationAmount(item, 'PENDING')).toBe(500);
  });
});
