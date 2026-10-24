import { render, screen } from '@testing-library/react';
import { AttendanceBadge } from './attendance-badge';

describe('AttendanceBadge (DX-279)', () => {
  it('muestra inasistencias y cancelaciones tardías de 12 meses', () => {
    render(<AttendanceBadge counts={{ noShows: 2, lateCancellations: 1 }} />);
    expect(screen.getByTestId('attendance-badge')).toHaveTextContent(
      '2 inasistencias · 1 cancelación tardía (12 meses)',
    );
  });

  it('sin incidencias no hay insignia', () => {
    const { container } = render(<AttendanceBadge counts={{ noShows: 0, lateCancellations: 0 }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('compacta: el texto completo queda en el título para la tarjeta estrecha', () => {
    render(<AttendanceBadge counts={{ noShows: 1, lateCancellations: 0 }} compact />);
    expect(screen.getByTestId('attendance-badge')).toHaveAttribute('title', '1 inasistencia (12 meses)');
  });
});
