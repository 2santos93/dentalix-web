import { render, screen } from '@testing-library/react';
import { StatusBadge } from './status-badge';

describe('StatusBadge', () => {
  it('pinta la etiqueta y el tono del mapa único, con punto', () => {
    const { container } = render(<StatusBadge kind="installment" status="OVERDUE" />);
    const badge = screen.getByText('Vencida');
    expect(badge.className).toContain('bg-danger-subtle');
    expect(badge).toHaveAttribute('data-status', 'OVERDUE');
    expect(container.querySelector('[aria-hidden].rounded-full')).toBeInTheDocument();
  });

  it('acepta un texto propio sin cambiar el tono', () => {
    render(<StatusBadge kind="reminder" status="SENT">Enviado 12 oct 10:30</StatusBadge>);
    expect(screen.getByText('Enviado 12 oct 10:30').className).toContain('bg-success-subtle');
  });

  it('una categoría (método de pago) es neutra y sin punto', () => {
    const { container } = render(<StatusBadge kind="paymentMethod" status="CARD" />);
    const badge = screen.getByText('Tarjeta');
    expect(badge.className).toContain('bg-surface-active');
    expect(badge.className).not.toContain('primary');
    expect(container.querySelector('[aria-hidden]')).toBeNull();
  });

  it('reenvía data-testid y className', () => {
    render(<StatusBadge kind="appointment" status="CONFIRMED" data-testid="x" className="self-start" />);
    expect(screen.getByTestId('x')).toHaveClass('self-start', 'bg-info-subtle');
  });
});
