import { render, screen } from '@testing-library/react';
import { InlineError } from './inline-error';

describe('InlineError', () => {
  it('anuncia el mensaje como alerta', () => {
    render(<InlineError>Documento ya registrado</InlineError>);

    expect(screen.getByRole('alert')).toHaveTextContent('Documento ya registrado');
  });

  it('acompaña el color con un icono, para no comunicar solo por color', () => {
    const { container } = render(<InlineError>Correo inválido</InlineError>);

    const icon = container.querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute('aria-hidden', 'true');
  });

  it('refleja el id recibido, para sostener aria-describedby desde el campo', () => {
    render(<InlineError id="login-error">Credenciales inválidas</InlineError>);

    expect(screen.getByRole('alert')).toHaveAttribute('id', 'login-error');
  });

  it('variant="summary" añade la caja de resumen; "inline" (por defecto) no', () => {
    const { rerender } = render(<InlineError>Correo inválido</InlineError>);
    expect(screen.getByRole('alert')).not.toHaveClass('rounded-lg', 'border', 'bg-danger/10');

    rerender(<InlineError variant="summary">No pudimos guardar</InlineError>);
    expect(screen.getByRole('alert')).toHaveClass('rounded-lg', 'border', 'bg-danger/10');
  });
});
