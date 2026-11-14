import { act, render, screen } from '@testing-library/react';
import { ClinicEntry } from './clinic-entry';
import { useAuthStore } from '@/lib/auth/auth-store';

const replace = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace }) }));
// NOTE: jest.mock's string literal is not alias-rewritten by the SWC
// transform, so this must use a relative path (see sibling *.test.tsx files).
jest.mock('../../lib/api/client', () => ({ bootstrapSession: jest.fn().mockResolvedValue(undefined) }));
const branding = { name: 'Clínica Ávila' as string | null, logoUrl: null as string | null };
jest.mock('../brand/branding-context', () => ({ useClinicBranding: () => branding }));
import { bootstrapSession } from '../../lib/api/client';

describe('ClinicEntry (DX-554: «/» en el host de una clínica)', () => {
  beforeEach(() => {
    replace.mockClear();
    (bootstrapSession as jest.Mock).mockClear();
    branding.name = 'Clínica Ávila';
    useAuthStore.setState({ accessToken: null, _hasHydrated: false });
  });

  it('antes de resolver la sesión solo dice que la verifica, con la marca de la clínica, y no navega', () => {
    const { container } = render(<ClinicEntry />);
    expect(bootstrapSession).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('status')).toHaveTextContent('Verificando sesión…');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Clínica Ávila');
    expect(container.textContent).not.toMatch(/Dentalix/);
    // Ni menú ni datos: solo la marca y el estado.
    expect(container.querySelector('nav')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('sin sesión va al login de la clínica', () => {
    render(<ClinicEntry />);
    act(() => useAuthStore.setState({ accessToken: null, _hasHydrated: true }));
    expect(replace).toHaveBeenCalledWith('/login');
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('con sesión va al inicio', () => {
    render(<ClinicEntry />);
    act(() => useAuthStore.setState({ accessToken: 'token', _hasHydrated: true }));
    expect(replace).toHaveBeenCalledWith('/dashboard');
    expect(replace).toHaveBeenCalledTimes(1);
  });

  it('sin nombre de clínica (el servidor no la supo) muestra solo el estado, sin la marca de Dentalix', () => {
    branding.name = null;
    const { container } = render(<ClinicEntry />);
    expect(screen.queryByRole('heading')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Verificando sesión…');
    expect(container.textContent).not.toMatch(/Dentalix/);
  });
});
