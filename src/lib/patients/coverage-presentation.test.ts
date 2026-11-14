import {
  COVERAGE_EXPIRED_LABEL,
  coverageChipText,
  coverageDetailText,
  coverageStatusBadge,
  coverageValidityLabel,
} from './coverage-presentation';
import { stampPainters } from '@/lib/locations/sede-stamp';
import { testAgendaClock, utcSede } from '@/lib/test/sede-clock';
import { regionalFormat } from '@/lib/format/regional-format';

// DX-354b: el formato lo da la sede (es-VE: dd/mm/aaaa; en-US: mm/dd/aaaa; de-DE: dd.mm.aaaa).
const sede = (locale: string, hourCycle: 'h12' | 'h23' = 'h23') =>
  stampPainters(testAgendaClock([utcSede({ locale, hourCycle })]));
const VE = sede('es-VE', 'h12');

describe('coverageChipText (DX-153)', () => {
  it('solo avisa cuando la cobertura venció', () => {
    const base = { payerName: 'Sanavida', planName: null, validTo: null };
    expect(coverageChipText({ ...base, status: 'EXPIRED' })).toBe(COVERAGE_EXPIRED_LABEL);
    expect(coverageChipText({ ...base, status: 'ACTIVE' })).toBe('');
    expect(coverageChipText({ ...base, status: 'NOT_STARTED' })).toBe('');
    expect(coverageChipText({ ...base, status: 'NONE' })).toBe('');
    expect(coverageChipText(undefined)).toBe('');
    expect(coverageChipText(null)).toBe('');
  });
});

describe('coverageValidityLabel (DX-153)', () => {
  it('vigente con fecha de fin', () => {
    expect(
      coverageValidityLabel({ status: 'ACTIVE', validFrom: '2026-01-01', validTo: '2027-01-31' }, VE),
    ).toBe('Vigente hasta 31/01/2027');
  });
  it('vigente sin fecha de fin', () => {
    expect(coverageValidityLabel({ status: 'ACTIVE', validFrom: null, validTo: null }, VE)).toBe(
      'Sin fecha de fin',
    );
  });
  it('pendiente de inicio', () => {
    expect(
      coverageValidityLabel({ status: 'NOT_STARTED', validFrom: '2027-03-01', validTo: null }, VE),
    ).toBe('Desde 01/03/2027');
  });
  it('vencida', () => {
    expect(
      coverageValidityLabel({ status: 'EXPIRED', validFrom: null, validTo: '2026-01-31' }, VE),
    ).toBe('Venció el 31/01/2026');
  });
});

describe('coverage dates with the sede format (DX-354b)', () => {
  it('la vigencia y el vencimiento de la cita salen en es-VE, en-US y de-DE', () => {
    const c = { status: 'EXPIRED', validFrom: null, validTo: '2026-01-31' } as const;
    const summary = { status: 'EXPIRED', payerName: 'Surco Salud', planName: 'Plan X', validTo: '2026-01-31' } as never;
    for (const [locale, hourCycle] of [['es-VE', 'h12'], ['en-US', 'h12'], ['de-DE', 'h23']] as const) {
      const day = regionalFormat({ locale, hourCycle }).civilDate('2026-01-31');
      expect(coverageValidityLabel(c, sede(locale, hourCycle))).toBe(`Venció el ${day}`);
      expect(coverageDetailText(summary, sede(locale, hourCycle))).toBe(`Cobertura: Surco Salud · venció el ${day}`);
    }
    expect(coverageDetailText(summary, stampPainters(null))).toBe('Cobertura: Surco Salud · venció el —');
  });
});

describe('coverageStatusBadge (DX-153)', () => {
  it('marca vencida y pendiente de inicio; la vigente no lleva insignia', () => {
    expect(coverageStatusBadge({ status: 'EXPIRED' })).toEqual({
      label: 'Vencida',
      variant: 'danger',
    });
    expect(coverageStatusBadge({ status: 'NOT_STARTED' })).toEqual({
      label: 'Pendiente de inicio',
      variant: 'warning',
    });
    expect(coverageStatusBadge({ status: 'ACTIVE' })).toBeNull();
  });
});

describe('coverageDetailText (DX-153)', () => {
  const base = { payerName: 'Surco Salud', planName: 'Plan X', validTo: '2026-01-31' };
  it('vigente: pagador y plan', () => {
    expect(coverageDetailText({ ...base, status: 'ACTIVE' }, VE)).toBe('Cobertura: Surco Salud · Plan X');
  });
  it('vencida: pagador y fecha de vencimiento', () => {
    expect(coverageDetailText({ ...base, status: 'EXPIRED' }, VE)).toMatch(/^Cobertura: Surco Salud · venció el /);
  });
  it('pendiente de inicio: lo dice en vez de mostrar el plan como vigente', () => {
    expect(coverageDetailText({ ...base, status: 'NOT_STARTED' }, VE)).toBe(
      'Cobertura: Surco Salud · pendiente de inicio',
    );
  });
  it('sin cobertura o sin pagador: vacío', () => {
    expect(coverageDetailText({ ...base, status: 'NONE' }, VE)).toBe('');
    expect(coverageDetailText({ ...base, payerName: null, status: 'ACTIVE' }, VE)).toBe('');
    expect(coverageDetailText(null, VE)).toBe('');
  });
});
