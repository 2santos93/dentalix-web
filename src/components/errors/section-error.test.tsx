import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SectionError } from './section-error';

describe('SectionError', () => {
  it('anuncia el fallo y describe qué pasó', () => {
    render(<SectionError description="No pudimos cargar la agenda." />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar la agenda.');
  });

  it('llama a onRetry al pulsar el botón', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    render(<SectionError description="Falló." onRetry={onRetry} />);

    await user.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omite el botón cuando no hay forma de reintentar', () => {
    render(<SectionError description="Falló." />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('reserva el rojo para el icono y deja el título en tinta', () => {
    render(<SectionError title="Sin conexión" description="Falló." />);

    expect(screen.getByText('Sin conexión')).toHaveClass('text-ink');
  });
});
