import { regionalFormat } from '@/lib/format/regional-format';
import {
  definitionOf,
  downloadTimingCsv,
  excludedCount,
  formatHours,
  formatMinutes,
  formatOccupancy,
  formatSignedPercent,
  getTimingReport,
  incoherentText,
  weekLabel,
  withoutTimesText,
  type TimingDefinition,
} from './timing-api';
import { apiFetch, apiFetchText } from '@/lib/api/client';

jest.mock('../api/client', () => ({
  ...jest.requireActual('../api/client'),
  apiFetch: jest.fn(async () => ({})),
  apiFetchText: jest.fn(async () => ''),
}));

const fmt = regionalFormat({ locale: 'es-VE', hourCycle: 'h12' });
const flat = (text: string) => text.replace(/\s/g, ' ');

describe('timing-api (DX-275)', () => {
  it('pide el informe y el CSV con período, sede y profesional (sin vacíos)', async () => {
    await getTimingReport('T', { from: '2026-03-02', to: '2026-03-13' });
    expect(apiFetch).toHaveBeenLastCalledWith('/reports/timing?from=2026-03-02&to=2026-03-13', { token: 'T' });
    await downloadTimingCsv('T', { from: '2026-03-02', to: '2026-03-13', locationId: 'loc', providerId: 'u-1' });
    expect(apiFetchText).toHaveBeenLastCalledWith(
      '/reports/timing.csv?from=2026-03-02&to=2026-03-13&locationId=loc&providerId=u-1',
      { token: 'T' },
    );
  });

  it('minutos con 1 decimal; null → «—»; negativos (se empezó antes) con signo', () => {
    expect(formatMinutes(9.4, fmt)).toBe('9,4 min');
    expect(formatMinutes(63, fmt)).toBe('63 min');
    expect(formatMinutes(0, fmt)).toBe('0 min');
    expect(formatMinutes(-3.5, fmt)).toMatch(/^-3,5 min$/);
    expect(formatMinutes(null, fmt)).toBe('—');
  });

  it('horas de la ocupación desde minutos enteros', () => {
    expect(formatHours(1410, fmt)).toBe('23,5 h');
    expect(formatHours(1680, fmt)).toBe('28 h');
    expect(formatHours(0, fmt)).toBe('0 h');
    expect(formatHours(50, fmt)).toBe('0,8 h');
  });

  it('real frente a programada con signo; la ocupación puede pasar de 100 % y sin horario es «—»', () => {
    expect(flat(formatSignedPercent(39.8, fmt))).toMatch(/^\+39,8 ?%$/);
    expect(flat(formatSignedPercent(-5, fmt))).toMatch(/^−5 ?%$/);
    expect(flat(formatSignedPercent(0, fmt))).toMatch(/^0 ?%$/);
    expect(formatSignedPercent(null, fmt)).toBe('—');
    expect(flat(formatOccupancy(112.5, fmt))).toMatch(/^112,5 ?%$/);
    expect(formatOccupancy(null, fmt)).toBe('—');
  });

  it('«X citas sin tiempos» y las incoherentes, contadas aparte', () => {
    expect(withoutTimesText(1, fmt)).toBe('1 cita sin tiempos');
    expect(withoutTimesText(3, fmt)).toBe('3 citas sin tiempos');
    expect(incoherentText(2, fmt)).toBe('2 con tiempos incoherentes');
    expect(excludedCount({ withoutTimes: 2, incoherent: 1 })).toBe(3);
  });

  it('la semana recortada al período y la definición por clave', () => {
    expect(weekLabel({ from: '2026-03-02', to: '2026-03-08' }, fmt)).toBe('02/03/2026 – 08/03/2026');
    expect(weekLabel({ from: '2026-03-13', to: '2026-03-13' }, fmt)).toBe('13/03/2026');
    const defs: TimingDefinition[] = [
      { key: 'wait', label: 'Espera en sala', unit: 'MINUTES', howItIsCalculated: 'x' },
    ];
    expect(definitionOf(defs, 'wait')?.label).toBe('Espera en sala');
    expect(definitionOf(defs, 'duration')).toBeUndefined();
  });
});
