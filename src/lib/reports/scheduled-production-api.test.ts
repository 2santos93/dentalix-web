import {
  appointmentHref,
  appointmentIdFromParam,
  canSeeScheduledProduction,
  forecastReportHref,
  getScheduledProduction,
  getScheduledProductionUnlinked,
  isScheduledPreset,
  isValidScheduledPeriod,
  scheduledPeriodFor,
  scheduledProductionOwnByRole,
  SCHEDULED_PRESETS,
} from './scheduled-production-api';
import { apiFetch } from '@/lib/api/client';

jest.mock('../api/client', () => ({ apiFetch: jest.fn() }));
jest.mock('../session/session-store', () => ({ useMe: jest.fn() }));

const NOV = { from: '2026-11-01', to: '2026-11-30' };

describe('scheduled-production-api (DX-567)', () => {
  beforeEach(() => jest.clearAllMocks());

  it('el agregado lleva el período y, si hay, la sede y el profesional', () => {
    void getScheduledProduction('t', NOV);
    expect(apiFetch).toHaveBeenLastCalledWith('/reports/scheduled-production?from=2026-11-01&to=2026-11-30', {
      token: 't',
    });
    void getScheduledProduction('t', { ...NOV, locationId: 'loc-1', providerId: 'u-1' });
    expect(apiFetch).toHaveBeenLastCalledWith(
      '/reports/scheduled-production?from=2026-11-01&to=2026-11-30&locationId=loc-1&providerId=u-1',
      { token: 't' },
    );
  });

  it('la lista sin tratamiento manda los mismos filtros, página y tamaño', () => {
    void getScheduledProductionUnlinked('t', { ...NOV, locationId: 'loc-1' }, 2, 25);
    expect(apiFetch).toHaveBeenLastCalledWith(
      '/reports/scheduled-production/unlinked?from=2026-11-01&to=2026-11-30&locationId=loc-1&page=2&pageSize=25',
      { token: 't' },
    );
  });

  it('roles: ADMIN, DENTIST o FINANCIAL_REPORTS_VIEW; RECEPTION y ASSISTANT sin el permiso, no', () => {
    expect(canSeeScheduledProduction('ADMIN', [])).toBe(true);
    expect(canSeeScheduledProduction('DENTIST', [])).toBe(true);
    expect(canSeeScheduledProduction('RECEPTION', [])).toBe(false);
    expect(canSeeScheduledProduction('ASSISTANT', undefined)).toBe(false);
    expect(canSeeScheduledProduction('RECEPTION', ['FINANCIAL_REPORTS_VIEW'])).toBe(true);
    expect(canSeeScheduledProduction('ASSISTANT', ['PAYMENT_REGISTER'])).toBe(false);
    expect(canSeeScheduledProduction(null, [])).toBe(false);
  });

  it('solo el DENTIST sin el permiso queda en «lo suyo»', () => {
    expect(scheduledProductionOwnByRole('DENTIST', [])).toBe(true);
    expect(scheduledProductionOwnByRole('DENTIST', ['FINANCIAL_REPORTS_VIEW'])).toBe(false);
    expect(scheduledProductionOwnByRole('ADMIN', [])).toBe(false);
  });

  it('atajos de período: este mes entero, próximos días desde hoy, mes siguiente', () => {
    expect(SCHEDULED_PRESETS.map((p) => p.label)).toEqual([
      'Este mes',
      'Próximos 7 días',
      'Próximos 30 días',
      'Mes siguiente',
      'Personalizado',
    ]);
    expect(scheduledPeriodFor('this_month', '2026-11-17')).toEqual(NOV);
    expect(scheduledPeriodFor('next_7_days', '2026-11-28')).toEqual({ from: '2026-11-28', to: '2026-12-04' });
    expect(scheduledPeriodFor('next_30_days', '2026-11-17')).toEqual({ from: '2026-11-17', to: '2026-12-16' });
    expect(scheduledPeriodFor('next_month', '2026-12-31')).toEqual({ from: '2027-01-01', to: '2027-01-31' });
    expect(scheduledPeriodFor('this_month', '2028-02-10')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    expect(scheduledPeriodFor('custom', '2026-11-17')).toBeNull();
    expect(isScheduledPreset('next_month')).toBe(true);
    expect(isScheduledPreset('this_year')).toBe(false);
    expect(isScheduledPreset(null)).toBe(false);
  });

  it('período válido: desde ≤ hasta y como mucho 62 días', () => {
    expect(isValidScheduledPeriod({ from: '2026-11-01', to: '2027-01-01' })).toBe(true); // 62
    expect(isValidScheduledPeriod({ from: '2026-11-01', to: '2027-01-02' })).toBe(false); // 63
    expect(isValidScheduledPeriod({ from: '2026-11-02', to: '2026-11-01' })).toBe(false);
    expect(isValidScheduledPeriod({ from: '2026-11-01', to: '2026-11-01' })).toBe(true);
  });

  it('enlaces: la cita en la agenda y la pestaña con el rango', () => {
    expect(appointmentHref('a-1')).toBe('/agenda?cita=a-1');
    expect(forecastReportHref({ from: '2026-11-16', to: '2026-11-22' })).toBe(
      '/reportes?tab=prevision&periodo=custom&desde=2026-11-16&hasta=2026-11-22',
    );
    expect(forecastReportHref({ from: '2026-11-17', to: '2026-11-17' }, { locationId: 'loc-1', providerId: 'u-1' })).toBe(
      '/reportes?tab=prevision&periodo=custom&desde=2026-11-17&hasta=2026-11-17&sede=loc-1&profesional=u-1',
    );
  });

  it('?cita= solo acepta un UUID', () => {
    expect(appointmentIdFromParam('9B2F4C1E-3A5D-4E6F-8A7B-1C2D3E4F5A6B')).toBe('9B2F4C1E-3A5D-4E6F-8A7B-1C2D3E4F5A6B');
    expect(appointmentIdFromParam('../payments/x')).toBeNull();
    expect(appointmentIdFromParam('9b2f4c1e-3a5d-4e6f-8a7b-1c2d3e4f5a6b/../x')).toBeNull();
    expect(appointmentIdFromParam('')).toBeNull();
    expect(appointmentIdFromParam(null)).toBeNull();
  });
});
