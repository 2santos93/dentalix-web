import { buildCsp, generateNonce } from './csp';

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp
      .split(';')
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const [name, ...values] = d.split(/\s+/);
        return [name, values] as [string, string[]];
      }),
  );
}

describe('buildCsp', () => {
  const base = { nonce: 'abc123', apiOrigin: 'http://localhost:3130' };

  it('scripts solo con nonce + strict-dynamic, sin unsafe-eval ni unsafe-inline en producción', () => {
    const d = directives(buildCsp({ ...base, isDev: false }));
    expect(d.get('script-src')).toEqual(["'self'", "'nonce-abc123'", "'strict-dynamic'"]);
    expect(buildCsp({ ...base, isDev: false })).not.toContain('unsafe-eval');
  });

  it('en desarrollo añade unsafe-eval (React lo usa para las trazas), solo ahí', () => {
    const d = directives(buildCsp({ ...base, isDev: true }));
    expect(d.get('script-src')).toContain("'unsafe-eval'");
  });

  it('cierra lo demás: object-src, base-uri, frame-ancestors, form-action y default-src', () => {
    const d = directives(buildCsp({ ...base, isDev: false }));
    expect(d.get('default-src')).toEqual(["'self'"]);
    expect(d.get('object-src')).toEqual(["'none'"]);
    expect(d.get('base-uri')).toEqual(["'self'"]);
    expect(d.get('frame-ancestors')).toEqual(["'none'"]);
    expect(d.get('form-action')).toEqual(["'self'"]);
  });

  it('connect-src solo el propio origen: la API se alcanza por /api/v1 del mismo host', () => {
    const d = directives(buildCsp({ ...base, isDev: false }));
    expect(d.get('connect-src')).toEqual(["'self'"]);
  });

  it('img-src admite logos y avatares servidos por la API, y data:/blob: (firma, vista previa del avatar)', () => {
    const d = directives(buildCsp({ ...base, isDev: false }));
    expect(d.get('img-src')).toEqual(["'self'", 'data:', 'blob:', 'http://localhost:3130']);
  });

  it('estilos en línea permitidos (atributos style de React/Radix y el color del tenant)', () => {
    const d = directives(buildCsp({ ...base, isDev: false }));
    expect(d.get('style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });
});

describe('generateNonce', () => {
  it('es base64, de al menos 128 bits y distinto en cada petición', () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).toMatch(/^[A-Za-z0-9+/]+=*$/);
    expect(Buffer.from(a, 'base64').length).toBeGreaterThanOrEqual(16);
    expect(a).not.toBe(b);
  });
});
