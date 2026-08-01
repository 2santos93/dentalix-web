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
});
