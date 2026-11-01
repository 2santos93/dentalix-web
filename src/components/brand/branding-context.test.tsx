import { render, screen, waitFor } from '@testing-library/react';
import { act } from 'react';
import { BrandingProvider, useClinicBranding, useSetClinicBranding } from './branding-context';
import { AuthLayout } from '@/components/auth/auth-layout';
import { apiFetch } from '@/lib/api/client';

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

beforeEach(() => jest.clearAllMocks());

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
});
