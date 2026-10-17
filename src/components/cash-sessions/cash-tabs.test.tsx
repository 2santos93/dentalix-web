import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CashTabs, resolveCashTab } from './cash-tabs';

describe('CashTabs (DX-027)', () => {
  it('cualquier ?tab= desconocido cae en «Abonos»', () => {
    expect(resolveCashTab('turnos')).toBe('turnos');
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
});
