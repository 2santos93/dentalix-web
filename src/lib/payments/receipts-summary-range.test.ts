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
  // Los casos de la API: bisiesto completo vale, 367 días no.
  expect(summaryRangeError('2028-01-01', '2028-12-31')).toBeNull();
  expect(summaryRangeError('2025-01-01', '2026-01-02')).toEqual({ field: 'to', message: summaryRangeCopy.tooLong });
  // Un día que no existe es un día que falta.
  expect(summaryRangeError('2026-02-30', '2026-03-01')).toEqual({ field: 'from', message: summaryRangeCopy.missing });
  // Fuera de 2000-01-01..2100-12-31, con el texto de la API.
  expect(summaryRangeError('1999-12-31', '2000-01-05')).toEqual({ field: 'from', message: summaryRangeCopy.outOfBounds });
  expect(summaryRangeError('2100-12-31', '2101-01-01')).toEqual({ field: 'to', message: summaryRangeCopy.outOfBounds });
  expect(summaryRangeCopy.outOfBounds).toBe('Las fechas del período tienen que estar entre el 01/01/2000 y el 31/12/2100.');
});

it('el enlace imprimible lleva el periodo', () => {
  expect(receiptsSummaryPrintHref('pat 1', { from: '2026-11-01', to: '2026-11-11' })).toBe(
    '/print/patients/pat%201/receipts-summary?from=2026-11-01&to=2026-11-11',
  );
});
