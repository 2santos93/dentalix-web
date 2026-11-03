import { render, screen } from '@testing-library/react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { SEDE_LOCALE_ERROR } from '@/lib/locations/use-sede-format';
import type { SedeStamp } from '@/lib/locations/sede-stamp';
import { tokenFor } from '@/lib/test/prescriptions';
import { setupUser } from '@/lib/test/user';
import { SedeStampNote } from './sede-stamp-note';

function stampWith(notice: SedeStamp['notice']): Pick<SedeStamp, 'notice'> {
  return { notice };
}
const failing = (retry = jest.fn()): SedeStamp['notice'] => ({
  status: 'error',
  kind: 'locale',
  message: SEDE_LOCALE_ERROR,
  locationId: 'berlin',
  retry,
  scope: 'row',
});

afterEach(() => useAuthStore.setState({ accessToken: null }));

describe('SedeStampNote', () => {
  it('the status region is mounted before the notice and its content shows up afterwards', () => {
    const { rerender } = render(<SedeStampNote stamp={stampWith(null)} />);
    const region = screen.getByRole('status');
    expect(region).toBeEmptyDOMElement();
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();

    rerender(<SedeStampNote stamp={stampWith(failing())} />);
    // La MISMA región (no una nueva): así se anuncia.
    expect(screen.getByRole('status')).toBe(region);
    expect(region).toHaveTextContent('No se pudo saber el formato regional o el reloj de la sede.');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('retry calls the notice retry', async () => {
    const retry = jest.fn();
    render(<SedeStampNote stamp={stampWith(failing(retry))} />);
    await setupUser().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('«Configurar sede» is only for ADMIN and opens the failing sede', () => {
    useAuthStore.setState({ accessToken: tokenFor('RECEPTIONIST') });
    const { unmount } = render(<SedeStampNote stamp={stampWith(failing())} />);
    expect(screen.queryByRole('link', { name: 'Configurar sede' })).not.toBeInTheDocument();
    unmount();

    useAuthStore.setState({ accessToken: tokenFor('ADMIN') });
    render(<SedeStampNote stamp={stampWith(failing())} />);
    expect(screen.getByRole('link', { name: 'Configurar sede' })).toHaveAttribute('href', '/settings/sedes?sede=berlin');
  });
});
