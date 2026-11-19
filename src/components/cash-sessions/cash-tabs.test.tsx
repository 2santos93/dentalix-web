import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CashTabs, resolveCashTab } from './cash-tabs';

describe('CashTabs (DX-027)', () => {
  it('cualquier ?tab= desconocido cae en «Abonos»', () => {
    expect(resolveCashTab('turnos')).toBe('turnos');
    expect(resolveCashTab('por-confirmar')).toBe('por-confirmar');
    expect(resolveCashTab('conciliacion')).toBe('conciliacion');
    expect(resolveCashTab('otra')).toBe('abonos');
    expect(resolveCashTab(null)).toBe('abonos');
  });

  it('pestañas ARIA: flechas mueven el foco, Enter elige', async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<CashTabs active="abonos" onChange={onChange} />);
    const abonos = screen.getByRole('tab', { name: 'Abonos' });
    expect(abonos).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'Turnos' })).toHaveAttribute('tabindex', '-1');
    abonos.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Turnos' })).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith('turnos');
  });

  it('DX-569: «Por confirmar» solo para quien cobra, con su contador', () => {
    const { rerender } = render(<CashTabs active="abonos" onChange={jest.fn()} />);
    expect(screen.queryByRole('tab', { name: /Por confirmar/ })).not.toBeInTheDocument();
    rerender(<CashTabs active="abonos" onChange={jest.fn()} showReports pendingReports={3} />);
    const tab = screen.getByRole('tab', { name: /Por confirmar/ });
    expect(tab).toHaveTextContent('3');
    expect(within(tab).getByLabelText('3 pagos por confirmar')).toBeInTheDocument();
    rerender(<CashTabs active="abonos" onChange={jest.fn()} showReports pendingReports={0} />);
    expect(screen.getByRole('tab', { name: 'Por confirmar' })).toBeInTheDocument();
  });

  it('DX-571: «Conciliación» solo para ADMIN, la última', () => {
    const { rerender } = render(<CashTabs active="abonos" onChange={jest.fn()} showReports />);
    expect(screen.queryByRole('tab', { name: 'Conciliación' })).not.toBeInTheDocument();
    rerender(<CashTabs active="abonos" onChange={jest.fn()} showReports showReconciliation />);
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual([
      'Abonos',
      'Turnos',
      'Por confirmar',
      'Conciliación',
    ]);
  });
});
