/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { config, proxy } from './proxy';

function run(url: string, headers: Record<string, string> = {}) {
  return proxy(new NextRequest(url, { headers }));
}

/** Cabeceras de PETICIÓN que el proxy reenvía al render (Next las serializa así). */
function forwarded(res: Response, name: string): string | null {
  return res.headers.get(`x-middleware-request-${name}`);
}

describe('proxy (DX-062: CSP con nonce por petición)', () => {
  it('pone una CSP con nonce en la respuesta y la misma en la petición, para que Next firme sus scripts', () => {
    const res = run('http://demo.localhost:3001/patients', { host: 'demo.localhost:3001' });

    const csp = res.headers.get('content-security-policy');
    expect(csp).toMatch(/script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/);
    const nonce = /'nonce-([^']+)'/.exec(csp as string)?.[1];
    expect(forwarded(res, 'x-nonce')).toBe(nonce);
    expect(forwarded(res, 'content-security-policy')).toBe(csp);
  });

  it('genera un nonce distinto en cada petición', () => {
    const a = run('http://demo.localhost:3001/').headers.get('content-security-policy');
    const b = run('http://demo.localhost:3001/').headers.get('content-security-policy');
    expect(a).not.toBe(b);
  });

  it('no incluye unsafe-eval fuera de desarrollo (jest corre con NODE_ENV=test)', () => {
    const csp = run('http://demo.localhost:3001/').headers.get('content-security-policy');
    expect(csp).not.toContain('unsafe-eval');
  });

  it('reenvía x-tenant derivado del host y descarta el que mande el cliente', () => {
    const res = run('http://demo.dentalix.local/agenda', {
      host: 'demo.dentalix.local',
      'x-tenant': 'otra',
    });
    expect(forwarded(res, 'x-tenant')).toBe('demo');

    const apex = run('http://dentalix.local/', { host: 'dentalix.local', 'x-tenant': 'otra' });
    expect(forwarded(apex, 'x-tenant')).toBeNull();
  });

  it('no corre sobre /api (proxy hacia la API), estáticos ni imágenes optimizadas', () => {
    const [matcher] = config.matcher;
    const source = new RegExp(`^${matcher.source}$`);
    expect(source.test('/patients')).toBe(true);
    expect(source.test('/')).toBe(true);
    expect(source.test('/print/patients/x/consents/y')).toBe(true);
    expect(source.test('/api/v1/auth/refresh')).toBe(false);
    expect(source.test('/_next/static/chunks/main.js')).toBe(false);
    expect(source.test('/_next/image')).toBe(false);
    expect(source.test('/favicon.ico')).toBe(false);
  });
});
