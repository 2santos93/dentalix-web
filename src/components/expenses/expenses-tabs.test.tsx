import { render, screen } from '@testing-library/react';
import { ExpensesTabs, resolveExpensesTab } from './expenses-tabs';
import { setupUser } from '@/lib/test/user';

describe('ExpensesTabs (DX-274)', () => {
  it('cualquier valor desconocido de ?tab= cae en «Gastos»', () => {
    expect(resolveExpensesTab('resumen')).toBe('resumen');
    expect(resolveExpensesTab('otra')).toBe('gastos');
    expect(resolveExpensesTab(null)).toBe('gastos');
  });

  it('marca la pestaña activa, elige con clic y mueve el foco con las flechas', async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<ExpensesTabs active="gastos" onChange={onChange} />);

    const gastos = screen.getByRole('tab', { name: 'Gastos' });
    const resumen = screen.getByRole('tab', { name: 'Resumen' });
    expect(gastos).toHaveAttribute('aria-selected', 'true');
    expect(resumen).toHaveAttribute('aria-selected', 'false');

    gastos.focus();
    await user.keyboard('{ArrowRight}');
    expect(resumen).toHaveFocus();
    expect(onChange).not.toHaveBeenCalled();

    await user.click(resumen);
    expect(onChange).toHaveBeenCalledWith('resumen');
  });
});
