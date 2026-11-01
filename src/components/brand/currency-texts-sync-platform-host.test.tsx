import { render, screen } from '@testing-library/react';
import { CurrencyTextsSync } from './currency-texts-sync';
import { apiFetch } from '@/lib/api/client';

jest.mock('next/navigation', () => ({ usePathname: jest.fn(() => '/') }));
jest.mock('../../lib/api/client', () => ({
  ...jest.requireActual('../../lib/api/client'),
  apiFetch: jest.fn(),
}));

describe('CurrencyTextsSync en el host de la plataforma (DX-517)', () => {
  it('sin clínica en el host no pide la marca: sería un 404 en la consola del registro', () => {
    expect(window.location.hostname).toBe('localhost');
    render(
      <CurrencyTextsSync value={null}>
        <p>Registro</p>
      </CurrencyTextsSync>,
    );
    expect(screen.getByText('Registro')).toBeInTheDocument();
    expect(jest.mocked(apiFetch)).not.toHaveBeenCalled();
  });
});
