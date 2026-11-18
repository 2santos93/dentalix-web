import { render, screen } from '@testing-library/react';
import { OnlineChip } from './online-chip';

describe('OnlineChip (DX-016)', () => {
  it('pinta «Online» solo en las citas reservadas por el paciente', () => {
    const { rerender } = render(<OnlineChip origin="ONLINE" />);
    expect(screen.getByTestId('online-chip')).toHaveTextContent('Online');
    rerender(<OnlineChip origin="STAFF" />);
    expect(screen.queryByTestId('online-chip')).not.toBeInTheDocument();
    rerender(<OnlineChip origin={undefined} />);
    expect(screen.queryByTestId('online-chip')).not.toBeInTheDocument();
  });
});
