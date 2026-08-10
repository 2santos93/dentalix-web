import { render, screen } from '@testing-library/react';
import { AsyncSection } from './async-section';

describe('AsyncSection', () => {
  it('en error usa la presentación de sección con reintento', () => {
    render(
      <AsyncSection loading={false} error="No pudimos cargar el personal." onRetry={() => {}}>
        <p>contenido</p>
      </AsyncSection>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('No pudimos cargar el personal.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
    expect(screen.queryByText('contenido')).not.toBeInTheDocument();
  });
});
