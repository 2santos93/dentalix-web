import {
  agreementChipText,
  agreementStatusBadge,
  agreementValidityLabel,
} from './agreement-presentation';

describe('agreement-presentation (DX-105)', () => {
  it('etiqueta de vigencia por estado', () => {
    expect(
      agreementValidityLabel({ status: 'ACTIVE', validFrom: null, validTo: '2027-01-31' }),
    ).toBe('Vigente hasta 31/01/2027');
    expect(agreementValidityLabel({ status: 'ACTIVE', validFrom: null, validTo: null })).toBe(
      'Sin fecha de fin',
    );
    expect(
      agreementValidityLabel({ status: 'NOT_STARTED', validFrom: '2027-03-01', validTo: null }),
    ).toBe('Desde 01/03/2027');
    expect(
      agreementValidityLabel({ status: 'EXPIRED', validFrom: null, validTo: '2026-01-31' }),
    ).toBe('Venció el 31/01/2026');
  });

  it('insignia por estado', () => {
    expect(agreementStatusBadge({ status: 'ACTIVE' })).toEqual({
      label: 'Vigente',
      variant: 'success',
    });
    expect(agreementStatusBadge({ status: 'EXPIRED' })).toEqual({
      label: 'Vencido',
      variant: 'warning',
    });
    expect(agreementStatusBadge({ status: 'NOT_STARTED' })).toEqual({
      label: 'Pendiente de inicio',
      variant: 'secondary',
    });
    expect(agreementStatusBadge({ status: 'INACTIVE' })).toEqual({
      label: 'Convenio inactivo',
      variant: 'muted',
    });
  });

  it('el chip solo dice «Convenio: X» con ACTIVE', () => {
    const s = (status: 'NONE' | 'ACTIVE' | 'EXPIRED' | 'NOT_STARTED' | 'INACTIVE') => ({
      status,
      agreementName: 'Sanitas 2026',
      payerName: 'Sanitas',
    });
    expect(agreementChipText(s('ACTIVE'))).toBe('Convenio: Sanitas 2026');
    for (const st of ['NONE', 'EXPIRED', 'NOT_STARTED', 'INACTIVE'] as const) {
      expect(agreementChipText(s(st))).toBe('');
    }
    expect(agreementChipText(undefined)).toBe('');
  });
});
