import {
  agreementChipText,
  agreementStatusBadge,
  agreementValidityLabel,
  effectiveValidity,
} from './agreement-presentation';
import { stampPainters } from '@/lib/locations/sede-stamp';
import { testAgendaClock, utcSede } from '@/lib/test/sede-clock';
import { regionalFormat } from '@/lib/format/regional-format';

// DX-354b: el formato lo da la sede (es-VE: dd/mm/aaaa; en-US: mm/dd/aaaa; de-DE: dd.mm.aaaa).
const sede = (locale: string, hourCycle: 'h12' | 'h23' = 'h23') =>
  stampPainters(testAgendaClock([utcSede({ locale, hourCycle })]));
const VE = sede('es-VE', 'h12');

describe('agreement-presentation (DX-105)', () => {
  it('etiqueta de vigencia por estado', () => {
    expect(
      agreementValidityLabel({ status: 'ACTIVE', validFrom: null, validTo: '2027-01-31' }, VE),
    ).toBe('Vigente hasta 31/01/2027');
    expect(agreementValidityLabel({ status: 'ACTIVE', validFrom: null, validTo: null }, VE)).toBe(
      'Sin fecha de fin',
    );
    expect(
      agreementValidityLabel({ status: 'NOT_STARTED', validFrom: '2027-03-01', validTo: null }, VE),
    ).toBe('Desde 01/03/2027');
    expect(
      agreementValidityLabel({ status: 'EXPIRED', validFrom: null, validTo: '2026-01-31' }, VE),
    ).toBe('Venció el 31/01/2026');
  });

  it('la misma vigencia con tres sedes: es-VE, en-US y de-DE (calculadas con regionalFormat)', () => {
    const a = { status: 'ACTIVE', validFrom: null, validTo: '2027-01-31' } as const;
    for (const [locale, hourCycle] of [['es-VE', 'h12'], ['en-US', 'h12'], ['de-DE', 'h23']] as const) {
      expect(agreementValidityLabel(a, sede(locale, hourCycle))).toBe(
        `Vigente hasta ${regionalFormat({ locale, hourCycle }).civilDate('2027-01-31')}`,
      );
    }
    expect(agreementValidityLabel(a, sede('en-US', 'h12'))).toBe('Vigente hasta 01/31/2027');
    // Sin formato de la sede: «—», nunca dd/mm/aaaa.
    expect(agreementValidityLabel(a, stampPainters(null))).toBe('Vigente hasta —');
  });

  it('DX-105-bis: la fecha que se explica sale de la asignación Y del convenio (la última de inicio, la primera de fin)', () => {
    // Venció el CONVENIO, no la asignación (antes: «Venció el —»).
    expect(
      agreementValidityLabel(
        { status: 'EXPIRED', validFrom: null, validTo: null, agreement: { validFrom: null, validTo: '2026-01-31' } },
        VE,
      ),
    ).toBe('Venció el 31/01/2026');
    // Las dos con fin: la primera manda.
    expect(
      agreementValidityLabel(
        { status: 'ACTIVE', validFrom: null, validTo: '2027-06-30', agreement: { validFrom: null, validTo: '2027-01-31' } },
        VE,
      ),
    ).toBe('Vigente hasta 31/01/2027');
    // Empieza cuando empiece el convenio, que es después que la asignación.
    expect(
      agreementValidityLabel(
        { status: 'NOT_STARTED', validFrom: '2027-01-01', validTo: null, agreement: { validFrom: '2027-03-01', validTo: null } },
        VE,
      ),
    ).toBe('Desde 01/03/2027');
    // Sin ninguna fecha que explicar: el estado, sin inventar un día.
    expect(
      agreementValidityLabel({ status: 'EXPIRED', validFrom: null, validTo: null, agreement: null }, VE),
    ).toBe('Vencido');
    expect(
      agreementValidityLabel({ status: 'NOT_STARTED', validFrom: null, validTo: null }, VE),
    ).toBe('Todavía no vigente');
    expect(
      effectiveValidity({ validFrom: '2026-01-01', validTo: null, agreement: { validFrom: '2025-06-01', validTo: '2026-12-31' } }),
    ).toEqual({ validFrom: '2026-01-01', validTo: '2026-12-31' });
  });

  it('insignia por estado', () => {
    expect(agreementStatusBadge({ status: 'ACTIVE' })).toEqual({
      label: 'Vigente',
      variant: 'success',
    });
    expect(agreementStatusBadge({ status: 'EXPIRED' })).toEqual({
      label: 'Vencido',
      variant: 'danger',
    });
    expect(agreementStatusBadge({ status: 'NOT_STARTED' })).toEqual({
      label: 'Pendiente de inicio',
      variant: 'warning',
    });
    expect(agreementStatusBadge({ status: 'INACTIVE' })).toEqual({
      label: 'Convenio inactivo',
      variant: 'neutral',
    });
  });

  it('el chip solo dice «Convenio: X» con ACTIVE', () => {
    const s = (status: 'NONE' | 'ACTIVE' | 'EXPIRED' | 'NOT_STARTED' | 'INACTIVE') => ({
      status,
      agreementName: 'Sanavida 2026',
      payerName: 'Sanavida',
    });
    expect(agreementChipText(s('ACTIVE'))).toBe('Convenio: Sanavida 2026');
    for (const st of ['NONE', 'EXPIRED', 'NOT_STARTED', 'INACTIVE'] as const) {
      expect(agreementChipText(s(st))).toBe('');
    }
    expect(agreementChipText(undefined)).toBe('');
  });
});
