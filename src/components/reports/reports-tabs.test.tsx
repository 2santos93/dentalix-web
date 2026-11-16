import { render, screen } from '@testing-library/react';
import { REPORT_TABS, ReportsTabs, reportTabsFor, resolveReportTab } from './reports-tabs';

describe('pestañas de Reportes por rol (DX-423, DX-399, DX-558)', () => {
  it('ADMIN ve las ocho; DENTIST «Producción por procedimiento» y «Presupuestos»; RECEPTION solo «Cobrado sin imputar»; el resto, la primera (su 403)', () => {
    expect(reportTabsFor('ADMIN').map((t) => t.key)).toEqual(['comparar-sedes', 'rentabilidad', 'produccion', 'presupuestos', 'sin-imputar', 'huecos-recuperados', 'ocupacion-sillones', 'enlaces-paciente']);
    expect(reportTabsFor('DENTIST').map((t) => t.key)).toEqual(['produccion', 'presupuestos']);
    expect(reportTabsFor('RECEPTION').map((t) => t.key)).toEqual(['sin-imputar']);
    expect(reportTabsFor('ASSISTANT').map((t) => t.key)).toEqual(['comparar-sedes']);
    expect(reportTabsFor(null).map((t) => t.key)).toEqual(['comparar-sedes']);
  });

  it('DX-090: FINANCIAL_REPORTS_VIEW suma las financieras (comparar, rentabilidad, presupuestos, sin imputar); PAYMENT_REGISTER no', () => {
    expect(reportTabsFor('ASSISTANT', ['FINANCIAL_REPORTS_VIEW']).map((t) => t.key)).toEqual([
      'comparar-sedes',
      'rentabilidad',
      'presupuestos',
      'sin-imputar',
    ]);
    expect(reportTabsFor('DENTIST', ['FINANCIAL_REPORTS_VIEW']).map((t) => t.key)).toEqual([
      'comparar-sedes',
      'rentabilidad',
      'produccion',
      'presupuestos',
      'sin-imputar',
    ]);
    expect(reportTabsFor('ASSISTANT', ['PAYMENT_REGISTER']).map((t) => t.key)).toEqual(['comparar-sedes']);
    expect(reportTabsFor(null, ['FINANCIAL_REPORTS_VIEW']).map((t) => t.key)).toEqual(['comparar-sedes']);
  });

  it('`?tab=` fuera de las del rol cae en su primera', () => {
    expect(resolveReportTab('comparar-sedes', reportTabsFor('DENTIST'))).toBe('produccion');
    expect(resolveReportTab('produccion', reportTabsFor('ADMIN'))).toBe('produccion');
    expect(resolveReportTab('sin-imputar', reportTabsFor('ADMIN'))).toBe('sin-imputar');
    expect(resolveReportTab('huecos-recuperados', reportTabsFor('ADMIN'))).toBe('huecos-recuperados');
    expect(resolveReportTab('huecos-recuperados', reportTabsFor('RECEPTION'))).toBe('sin-imputar');
    expect(resolveReportTab('ocupacion-sillones', reportTabsFor('ADMIN'))).toBe('ocupacion-sillones');
    expect(resolveReportTab('ocupacion-sillones', reportTabsFor('DENTIST'))).toBe('produccion');
    expect(resolveReportTab('enlaces-paciente', reportTabsFor('ADMIN'))).toBe('enlaces-paciente');
    expect(resolveReportTab('enlaces-paciente', reportTabsFor('RECEPTION'))).toBe('sin-imputar');
    expect(resolveReportTab('produccion', reportTabsFor('RECEPTION'))).toBe('sin-imputar');
    expect(resolveReportTab('rentabilidad', reportTabsFor('ADMIN'))).toBe('rentabilidad');
    expect(resolveReportTab('rentabilidad', reportTabsFor('DENTIST'))).toBe('produccion');
    expect(resolveReportTab('presupuestos', reportTabsFor('DENTIST'))).toBe('presupuestos');
    expect(resolveReportTab('presupuestos', reportTabsFor('RECEPTION'))).toBe('sin-imputar');
    expect(resolveReportTab('presupuestos', reportTabsFor('RECEPTION', ['FINANCIAL_REPORTS_VIEW']))).toBe('presupuestos');
    expect(resolveReportTab('otra')).toBe(REPORT_TABS[0].key);
  });

  it('pinta solo las pestañas recibidas', () => {
    render(<ReportsTabs active="produccion" onChange={() => undefined} tabs={reportTabsFor('DENTIST')} />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Producción por procedimiento', 'Presupuestos']);
    expect(screen.getByRole('tab', { name: 'Producción por procedimiento' })).toHaveAttribute('aria-selected', 'true');
  });
});
