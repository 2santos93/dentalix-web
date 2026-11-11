import { parseDate } from '@internationalized/date';
import {
  SUMMARY_PRESETS,
  activeSummaryPreset,
  defaultSummaryRange,
  summaryRangeCopy,
  summaryRangeError,
} from './receipts-summary-range';
import { receiptsSummaryPrintHref } from './receipts-summary-api';

const today = parseDate('2026-11-11');
const preset = (id: string) => SUMMARY_PRESETS.find((p) => p.id === id)!.range(today);

it('por defecto, del día 1 del mes a hoy', () => {
  expect(defaultSummaryRange(today)).toEqual({ from: '2026-11-01', to: '2026-11-11' });
});

it('atajos: este mes, el mes anterior completo y el año en curso', () => {
  expect(preset('thisMonth')).toEqual({ from: '2026-11-01', to: '2026-11-11' });
  expect(preset('previousMonth')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
  expect(preset('thisYear')).toEqual({ from: '2026-01-01', to: '2026-11-11' });
  expect(SUMMARY_PRESETS.find((p) => p.id === 'previousMonth')!.range(parseDate('2026-01-15'))).toEqual({
    from: '2025-12-01',
    to: '2025-12-31',
  });
  expect(activeSummaryPreset({ from: '2026-10-01', to: '2026-10-31' }, today)).toBe('previousMonth');
  expect(activeSummaryPreset({ from: '2026-10-02', to: '2026-10-31' }, today)).toBeNull();
});

it('valida el periodo como la API', () => {
  expect(summaryRangeError('2026-11-01', '2026-11-11')).toBeNull();
  expect(summaryRangeError('2026-11-11', '2026-11-11')).toBeNull();
  expect(summaryRangeError(null, '2026-11-11')).toEqual({ field: 'from', message: summaryRangeCopy.missing });
  expect(summaryRangeError('2026-11-01', 'mal')).toEqual({ field: 'to', message: summaryRangeCopy.missing });
  expect(summaryRangeError('2026-11-12', '2026-11-11')).toEqual({ field: 'to', message: summaryRangeCopy.fromAfterTo });
  // 366 días contando los dos extremos: vale; 367, no.
  expect(summaryRangeError('2025-11-11', '2026-11-11')).toBeNull();
  expect(summaryRangeError('2025-11-10', '2026-11-11')).toEqual({ field: 'to', message: summaryRangeCopy.tooLong });
});

it('el enlace imprimible lleva el periodo', () => {
  expect(receiptsSummaryPrintHref('pat 1', { from: '2026-11-01', to: '2026-11-11' })).toBe(
    '/print/patients/pat%201/receipts-summary?from=2026-11-01&to=2026-11-11',
  );
});
