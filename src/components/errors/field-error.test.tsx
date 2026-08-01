import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FieldError } from './field-error';

describe('FieldError', () => {
  it('se anuncia de forma cortés: no bloquea la pantalla', () => {
    render(<FieldError label="No se pudieron cargar" />);

    const region = screen.getByRole('status');
    expect(region).toHaveTextContent('No se pudieron cargar');
    expect(region).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('expone el reintento como botón con nombre accesible', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    render(<FieldError label="No se pudieron cargar" onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omite el botón cuando no hay reintento', () => {
    render(<FieldError label="No disponible" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('permite al llamante sobreescribir la altura con className', () => {
    render(<FieldError label="Error" className="h-9" />);

    const region = screen.getByRole('status');
    expect(region).toHaveClass('h-9');
    expect(region).not.toHaveClass('h-10');
  });
});
