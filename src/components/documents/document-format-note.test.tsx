import { render, screen } from '@testing-library/react';
import { DocumentFormatNote } from './document-format-note';

describe('DocumentFormatNote', () => {
  it('keeps one persistent status region: empty while inactive, filled when it activates', () => {
    const { rerender } = render(<DocumentFormatNote active={false} locationId="loc-1" onRetry={jest.fn()} />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();

    rerender(<DocumentFormatNote locationId="loc-1" onRetry={jest.fn()} />);
    expect(screen.getByRole('status')).toBe(region);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(region).toHaveTextContent('No se pudo saber el formato regional o el reloj de la sede.');
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});
