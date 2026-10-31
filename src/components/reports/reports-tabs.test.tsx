import { render, screen } from '@testing-library/react';
import { REPORT_TABS, ReportsTabs, reportTabsFor, resolveReportTab } from './reports-tabs';

describe('pestañas de Reportes por rol (DX-423)', () => {
  it('ADMIN ve las dos; DENTIST solo «Producción por procedimiento»; el resto, la primera (su 403)', () => {
    expect(reportTabsFor('ADMIN').map((t) => t.key)).toEqual(['comparar-sedes', 'produccion']);
    expect(reportTabsFor('DENTIST').map((t) => t.key)).toEqual(['produccion']);
    expect(reportTabsFor('RECEPTION').map((t) => t.key)).toEqual(['comparar-sedes']);
    expect(reportTabsFor(null).map((t) => t.key)).toEqual(['comparar-sedes']);
  });

  it('`?tab=` fuera de las del rol cae en su primera', () => {
    expect(resolveReportTab('comparar-sedes', reportTabsFor('DENTIST'))).toBe('produccion');
    expect(resolveReportTab('produccion', reportTabsFor('ADMIN'))).toBe('produccion');
    expect(resolveReportTab('otra')).toBe(REPORT_TABS[0].key);
  });

  it('pinta solo las pestañas recibidas', () => {
    render(<ReportsTabs active="produccion" onChange={() => undefined} tabs={reportTabsFor('DENTIST')} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Producción por procedimiento']);
    expect(screen.getByRole('tab')).toHaveAttribute('aria-selected', 'true');
  });
});
