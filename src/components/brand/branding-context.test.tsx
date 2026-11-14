/** @jest-environment-options {"url": "http://clinica.localhost/"} */
import { render, screen, waitFor } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { act } from 'react';
import { BrandingProvider, useClinicBranding, useSetClinicBranding } from './branding-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { apiFetch } from '@/lib/api/client';

jest.mock('next/navigation', () => ({ usePathname: jest.fn(() => '/login') }));
jest.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', setTheme: jest.fn() }) }));
jest.mock('../../lib/api/client', () => ({ apiFetch: jest.fn() }));
const mockedFetch = jest.mocked(apiFetch);

function Probe() {
  const b = useClinicBranding();
  return <p data-testid="probe">{`${b.name}|${b.primaryColor}|${b.logoUrl}`}</p>;
}

function Setter() {
  const setBranding = useSetClinicBranding();
  return (
    <button type="button" onClick={() => setBranding({ name: 'B', logoUrl: 'https://x.example/l.png', primaryColor: '#15803D' })}>
      guardar
    </button>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.mocked(usePathname).mockReturnValue('/login');
});

describe('BrandingProvider (DX-019)', () => {
  it('con la marca del servidor: no pide nada ni pinta otro acento', () => {
    render(
      <BrandingProvider value={{ name: 'Clínica Sonrisas', logoUrl: null, primaryColor: '#0E7490' }}>
        <Probe />
      </BrandingProvider>,
    );
    expect(screen.getByTestId('probe')).toHaveTextContent('Clínica Sonrisas|#0E7490|null');
    expect(mockedFetch).not.toHaveBeenCalled();
    expect(screen.queryByTestId('client-accent')).not.toBeInTheDocument();
  });

  it('si el servidor no supo la clínica, la pide el navegador: login con su nombre, logo y color', async () => {
    mockedFetch.mockResolvedValue({
      name: 'Clínica Norte',
      primaryColor: '#6D28D9',
      logoUrl: 'https://api.example/files/logos/x.png',
    });
    const { container } = render(
      <BrandingProvider value={{ name: null, logoUrl: null, primaryColor: null }}>
        <AuthLayout clinic={null} fromHost task="Inicia sesión en tu cuenta">
          <form />
        </AuthLayout>
      </BrandingProvider>,
    );
    expect(mockedFetch).toHaveBeenCalledWith('/public/tenant/branding');
    expect(await screen.findByRole('heading', { level: 1, name: 'Clínica Norte' })).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', 'https://api.example/files/logos/x.png');
    expect(screen.getByTestId('client-accent').textContent).toContain('--color-primary:#6D28D9');
  });

  it('en el registro la clínica aún no existe: no la pide (sería un 404 en la consola)', () => {
    jest.mocked(usePathname).mockReturnValue('/register');
    render(
      <BrandingProvider value={{ name: null, logoUrl: null, primaryColor: null }}>
        <Probe />
      </BrandingProvider>,
    );
    expect(mockedFetch).not.toHaveBeenCalled();
  });

  it('sin fromHost (registro de una clínica nueva) no usa la marca del host', async () => {
    mockedFetch.mockResolvedValue({ name: 'Clínica Norte', primaryColor: '#6D28D9', logoUrl: null });
    render(
      <BrandingProvider value={{ name: null, logoUrl: null, primaryColor: null }}>
        <AuthLayout clinic={null} task="Crea tu clínica">
          <form />
        </AuthLayout>
      </BrandingProvider>,
    );
    await waitFor(() => expect(mockedFetch).toHaveBeenCalled());
    expect(screen.getByRole('heading', { level: 1, name: 'Crea tu clínica' })).toBeInTheDocument();
  });

  it('un logo que no es http(s) o un color que no es hexadecimal no pasan', async () => {
    mockedFetch.mockResolvedValue({ name: 'X', primaryColor: 'red;}body{', logoUrl: 'javascript:alert(1)' });
    render(
      <BrandingProvider value={{ name: null, logoUrl: null }}>
        <Probe />
      </BrandingProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('X|null|null'));
    expect(screen.queryByTestId('client-accent')).not.toBeInTheDocument();
  });

  it('al guardar en Ajustes la marca cambia al instante', () => {
    render(
      <BrandingProvider value={{ name: 'A', logoUrl: null, primaryColor: '#0E7490' }}>
        <Setter />
        <Probe />
      </BrandingProvider>,
    );
    act(() => screen.getByRole('button', { name: 'guardar' }).click());
    expect(screen.getByTestId('probe')).toHaveTextContent('B|#15803D|https://x.example/l.png');
    expect(screen.getByTestId('client-accent').textContent).toContain('--color-primary:#15803D');
  });

  describe('DX-517-ter: el servidor dice clínica, ninguna o desconocida', () => {
    it('status clinic: pinta la del servidor y no pide nada', () => {
      render(
        <BrandingProvider status="clinic" value={{ name: 'Clínica Ávila', logoUrl: null, primaryColor: '#0E7490' }}>
          <Probe />
        </BrandingProvider>,
      );
      expect(screen.getByTestId('probe')).toHaveTextContent('Clínica Ávila|#0E7490|null');
      expect(mockedFetch).not.toHaveBeenCalled();
      expect(screen.queryByTestId('client-accent')).not.toBeInTheDocument();
    });

    it('status none: el host no tiene clínica, el navegador no la pide', () => {
      render(
        <BrandingProvider status="none" value={{ name: null, logoUrl: null, primaryColor: null }}>
          <Probe />
        </BrandingProvider>,
      );
      expect(screen.getByTestId('probe')).toHaveTextContent('null|null|null');
      expect(mockedFetch).not.toHaveBeenCalled();
    });

    it('status unknown: la pide el navegador (la API no contestó a tiempo)', async () => {
      mockedFetch.mockResolvedValue({ name: 'Clínica Norte', primaryColor: '#6D28D9', logoUrl: null });
      render(
        <BrandingProvider status="unknown" value={{ name: null, logoUrl: null, primaryColor: null }}>
          <Probe />
        </BrandingProvider>,
      );
      expect(mockedFetch).toHaveBeenCalledWith('/public/tenant/branding');
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('Clínica Norte|#6D28D9|null'));
    });

    it('status none en el registro: al salir sin recargar la pide UNA vez (la clínica ya existe)', async () => {
      jest.mocked(usePathname).mockReturnValue('/register');
      mockedFetch.mockResolvedValue({ name: 'Clínica Nueva', primaryColor: '#15803D', logoUrl: null });
      const { rerender } = render(
        <BrandingProvider status="none" value={{ name: null, logoUrl: null, primaryColor: null }}>
          <Probe />
        </BrandingProvider>,
      );
      expect(mockedFetch).not.toHaveBeenCalled();
      jest.mocked(usePathname).mockReturnValue('/login');
      rerender(
        <BrandingProvider status="none" value={{ name: null, logoUrl: null, primaryColor: null }}>
          <Probe />
        </BrandingProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('probe')).toHaveTextContent('Clínica Nueva|#15803D|null'));
      jest.mocked(usePathname).mockReturnValue('/dashboard');
      rerender(
        <BrandingProvider status="none" value={{ name: null, logoUrl: null, primaryColor: null }}>
          <Probe />
        </BrandingProvider>,
      );
      expect(mockedFetch).toHaveBeenCalledTimes(1);
    });
  });
});

