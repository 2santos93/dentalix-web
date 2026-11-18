import { apiFetch } from '../api/client';
import {
  canManageQuoteFollowUp,
  canPauseQuoteFollowUp,
  FOLLOW_UP_REASON_LABELS,
  followUpErrorField,
  followUpStatus,
  getQuoteFollowUpReport,
  listQuoteFollowUpSettings,
  offsetsLabel,
  parseFollowUpDraft,
  pauseQuoteFollowUp,
  resumeQuoteFollowUp,
  updateQuoteFollowUpSettings,
  type QuoteFollowUpReason,
  type QuoteFollowUpState,
} from './quote-follow-up-api';

jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  apiFetch: jest.fn(),
}));

const mockedFetch = jest.mocked(apiFetch);

const state = (over: Partial<QuoteFollowUpState> = {}): QuoteFollowUpState => ({
  lastStep: null,
  lastSentAt: null,
  lastStatus: null,
  lastReason: null,
  paused: false,
  ...over,
});

describe('quote-follow-up-api (DX-561)', () => {
  beforeEach(() => mockedFetch.mockReset());

  it('configura solo ADMIN; pausan ADMIN y RECEPTION', () => {
    expect(canManageQuoteFollowUp('ADMIN')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) expect(canManageQuoteFollowUp(role)).toBe(false);
    expect(canPauseQuoteFollowUp('ADMIN')).toBe(true);
    expect(canPauseQuoteFollowUp('RECEPTION')).toBe(true);
    for (const role of ['DENTIST', 'ASSISTANT', null] as const) expect(canPauseQuoteFollowUp(role)).toBe(false);
  });

  it('rutas: ajustes, pausa, reanudación e informe', async () => {
    mockedFetch.mockResolvedValue({});
    await listQuoteFollowUpSettings('tok');
    expect(mockedFetch).toHaveBeenLastCalledWith('/quote-follow-up-settings', { token: 'tok' });
    const body = { enabled: true, offsetsDays: [3, 10, 21], sendFromHour: 9, sendUntilHour: 19 };
    await updateQuoteFollowUpSettings('tok', 'loc 1', body);
    expect(mockedFetch).toHaveBeenLastCalledWith('/quote-follow-up-settings/loc%201', { method: 'PUT', body, token: 'tok' });
    await pauseQuoteFollowUp('tok', 'plan-1');
    expect(mockedFetch).toHaveBeenLastCalledWith('/treatment-plans/plan-1/follow-up/pause', { method: 'POST', token: 'tok' });
    await resumeQuoteFollowUp('tok', 'plan-1');
    expect(mockedFetch).toHaveBeenLastCalledWith('/treatment-plans/plan-1/follow-up/resume', { method: 'POST', token: 'tok' });
    await getQuoteFollowUpReport('tok', { from: '2026-11-01', to: '2026-11-30' });
    expect(mockedFetch).toHaveBeenLastCalledWith('/reports/quote-follow-up?from=2026-11-01&to=2026-11-30', { token: 'tok' });
    await getQuoteFollowUpReport('tok', { from: '2026-11-01', to: '2026-11-30', locationId: 'loc-1' });
    expect(mockedFetch).toHaveBeenLastCalledWith(
      '/reports/quote-follow-up?from=2026-11-01&to=2026-11-30&locationId=loc-1',
      { token: 'tok' },
    );
  });

  it('valida como la API: 1 a 3 avisos, de 1 a 90, crecientes y la franja con «hasta» > «de»', () => {
    expect(parseFollowUpDraft(['3', '10', '21'], 9, 19)).toEqual({ offsetsDays: [3, 10, 21] });
    expect(parseFollowUpDraft([' 5 ', ''], 0, 24)).toEqual({ offsetsDays: [5] });
    expect(parseFollowUpDraft(['', ''], 9, 19)).toEqual({ errors: { offsets: 'Elige de 1 a 3 avisos.' } });
    for (const bad of ['0', '91', '2,5', '-1', 'tres']) {
      expect(parseFollowUpDraft([bad], 9, 19)).toEqual({
        errors: { offsets: 'Cada aviso sale de 1 a 90 días después de presentar el presupuesto.' },
      });
    }
    const increasing = 'Los días de los avisos van de menor a mayor y sin repetirse (por ejemplo, 3, 10 y 21).';
    expect(parseFollowUpDraft(['10', '3'], 9, 19)).toEqual({ errors: { offsets: increasing } });
    expect(parseFollowUpDraft(['3', '3'], 9, 19)).toEqual({ errors: { offsets: increasing } });
    expect(parseFollowUpDraft(['3'], 19, 9)).toEqual({
      errors: { window: 'La franja horaria debe terminar después de empezar (por ejemplo, de 9 a 19).' },
    });
    expect(parseFollowUpDraft(['3'], 9, 9)).toHaveProperty('errors.window');
  });

  it('los 400 de la API van a su campo por su texto', () => {
    expect(followUpErrorField('Elige de 1 a 3 avisos.')).toBe('offsets');
    expect(followUpErrorField('Los días de los avisos van de menor a mayor y sin repetirse (por ejemplo, 3, 10 y 21).')).toBe('offsets');
    expect(followUpErrorField('La franja empieza a una hora entera de 0 a 23.')).toBe('window');
    expect(followUpErrorField('La franja horaria debe terminar después de empezar (por ejemplo, de 9 a 19).')).toBe('window');
    expect(followUpErrorField('Indica si el seguimiento automático está activo (sí o no).')).toBeNull();
  });

  it('«3, 10 y 21 días»', () => {
    expect(offsetsLabel([3, 10, 21])).toBe('3, 10 y 21 días');
    expect(offsetsLabel([7])).toBe('7 días');
    expect(offsetsLabel([1])).toBe('1 día');
  });

  it('estado: la pausa manda; sin pasos, «Sin avisos»; enviado, «Aviso n»; omitido, el porqué; parada, «Detenido»', () => {
    expect(followUpStatus(state({ paused: true, lastStep: 2, lastStatus: 'SENT' }))).toMatchObject({
      text: 'En pausa',
      tone: 'warning',
    });
    expect(followUpStatus(state())).toMatchObject({ text: 'Sin avisos', lastSentAt: null });
    expect(
      followUpStatus(state({ lastStep: 2, lastStatus: 'SENT', lastSentAt: '2026-11-12T14:00:00.000Z' })),
    ).toMatchObject({ text: 'Aviso 2', lastSentAt: '2026-11-12T14:00:00.000Z' });
    const skipped = followUpStatus(state({ lastStep: 2, lastStatus: 'SKIPPED', lastReason: 'NO_EMAIL', lastSentAt: 'x' }));
    expect(skipped).toMatchObject({ text: 'Aviso 2 no salió: sin email', tone: 'warning', lastSentAt: 'x' });
    expect(skipped.hint).toMatch(/no tiene email/);
    expect(followUpStatus(state({ lastStep: 3, lastStatus: 'SKIPPED', lastReason: 'EXPIRED' }))).toMatchObject({
      text: 'Detenido: presupuesto vencido',
    });
    // Un motivo que la web aún no conoce no rompe la fila.
    expect(followUpStatus(state({ lastStep: 1, lastStatus: 'SKIPPED', lastReason: 'NUEVO' })).text).toBe(
      'Aviso 1 no salió: sin motivo',
    );
  });

  it('cada motivo del contrato tiene su texto corto y su explicación', () => {
    const reasons: QuoteFollowUpReason[] = [
      'SUPERSEDED',
      'TOO_LATE',
      'STOPPED_ACCEPTED',
      'STOPPED_REJECTED',
      'STOPPED_SCHEDULED',
      'EXPIRED',
      'OPTED_OUT',
      'CHANNEL_NONE',
      'CHANNEL_WHATSAPP',
      'NO_EMAIL',
      'NO_CONSENT',
      'NO_LINK_HOST',
      'NO_PROFESSIONAL',
    ];
    expect(Object.keys(FOLLOW_UP_REASON_LABELS).sort()).toEqual([...reasons].sort());
    for (const r of reasons) {
      expect(FOLLOW_UP_REASON_LABELS[r].short.length).toBeGreaterThan(0);
      expect(FOLLOW_UP_REASON_LABELS[r].long).toMatch(/\.$/);
    }
  });
});
