import { fireEvent, render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import AuthError from './error';
import AdminError from '../admin/error';
import PublicError from '../(public)/error';
import GlobalError from '../global-error';

describe.each([
  ['(auth)/error.tsx', AuthError],
  ['admin/error.tsx', AdminError],
  ['(public)/error.tsx', PublicError],
])('%s (DX-116)', (_name, Boundary) => {
  const env = process.env as Record<string, string | undefined>;
  const originalEnv = env.NODE_ENV;
  let spy: jest.SpyInstance;
  beforeEach(() => {
    spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
    env.NODE_ENV = originalEnv;
  });

  it('en español, con «Reintentar», sin enseñar el mensaje y registrando solo name y digest', () => {
    env.NODE_ENV = 'production';
    const retry = jest.fn();
    const error = Object.assign(new RangeError('HC de Juan Pérez'), { digest: 'd1' });
    render(<Boundary error={error} retry={retry} />);
    expect(screen.getByText('Algo salió mal')).toBeInTheDocument();
    expect(screen.queryByText(/Juan/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith('Error de render', { name: 'RangeError', digest: 'd1' });
    expect(JSON.stringify(spy.mock.calls)).not.toContain('Juan');
  });
});

describe('global-error.tsx (DX-116)', () => {
  it('trae su propio <html lang="es">, título y texto en español, sin el mensaje del error', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error('HC de Juan Pérez')} retry={() => {}} />,
    );
    expect(html).toContain('<html lang="es">');
    expect(html).toContain('<title>Algo salió mal</title>');
    expect(html).toContain('Reintentar');
    expect(html).not.toContain('Juan');
  });
});
