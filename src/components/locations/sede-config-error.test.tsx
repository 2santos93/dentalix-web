import { render, screen } from '@testing-library/react';
import { SedeConfigError } from './sede-config-error';
import { locationCurrency } from '@/lib/locations/location-settings';
import type { ClinicLocation } from '@/lib/locations/locations-api';
import { clinicLocation } from '@/lib/test/locations';
import { formatCurrency } from '@/lib/format/currency';
import { setupUser } from '@/lib/test/user';

/** Una pieza mínima que pinta un importe en la moneda de su sede. */
function Amount({ location, onRetry }: { location: ClinicLocation; onRetry: () => void }) {
  const currency = locationCurrency(location);
  return currency ? <p>{formatCurrency(1500, currency)}</p> : <SedeConfigError kind="currency" onRetry={onRetry} />;
}

describe('SedeConfigError', () => {
  it('location with null currency shows SedeConfigError, never COP', async () => {
    const onRetry = jest.fn();
    render(<Amount location={clinicLocation({ country: 'CO', currency: null })} onRetry={onRetry} />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo saber la moneda de la sede. Vuelve a intentarlo o revisa la sede en Ajustes → Sedes.',
    );
    expect(document.body).not.toHaveTextContent(/COP|\$/);
    await setupUser().click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('sede en JPY: el importe sale en JPY', () => {
    render(<Amount location={clinicLocation({ currency: 'JPY' })} onRetry={jest.fn()} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(document.body).toHaveTextContent('1500');
  });

  it('zona: mensaje de sección con Reintentar', () => {
    render(<SedeConfigError kind="timeZone" onRetry={jest.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent(
      'No se pudo saber la zona horaria de la sede. Vuelve a intentarlo.',
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });

  it('variante de campo: sustituye al control y conserva el destino de su label', () => {
    render(
      <>
        <label htmlFor="fecha">Fecha</label>
        <SedeConfigError kind="timeZone" variant="field" retryId="fecha" onRetry={jest.fn()} />
      </>,
    );
    expect(screen.getByRole('status')).toHaveTextContent('Sin zona de sede');
    expect(screen.getByLabelText('Fecha')).toBe(screen.getByRole('button', { name: 'Reintentar' }));
  });
});
