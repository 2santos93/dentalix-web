/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { API_BODY_TOO_LARGE, config, proxy } from './proxy';

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

  it('DX-151: la CSP deja enmarcar e incrustar las URL firmadas de documentos (origen de la API por defecto)', () => {
    const csp = run('http://demo.localhost:3001/patients/p1').headers.get('content-security-policy') as string;
    const frameSrc = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('frame-src'));
    expect(frameSrc).toBe(`frame-src 'self' ${new URL(process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api/v1').origin}`);
  });

  it('DX-259: un POST a /api/v1 con más de 1 MB es 413 aquí, sin llegar a la API; lo demás sigue al rewrite sin tocar', async () => {
    const big = proxy(
      new NextRequest('http://demo.localhost:3001/api/v1/auth/login', {
        method: 'POST',
        headers: { host: 'demo.localhost:3001', 'content-length': String(5 * 1024 * 1024) },
      }),
    );
    expect(big.status).toBe(413);
    expect(await big.json()).toEqual(API_BODY_TOO_LARGE);
    expect(big.headers.get('content-security-policy')).toBeNull();

    const small = proxy(
      new NextRequest('http://demo.localhost:3001/api/v1/auth/login', {
        method: 'POST',
        headers: { host: 'demo.localhost:3001', 'content-length': String(700 * 1024) },
      }),
    );
    expect(small.status).toBe(200);
    expect(small.headers.get('x-middleware-next')).toBe('1');
    expect(small.headers.get('content-security-policy')).toBeNull();
    expect(forwarded(small, 'x-nonce')).toBeNull();
  });

  it('DX-107 × DX-259: la subida de la importación NO pasa por el proxy (Next no copia su cuerpo en memoria); /api/v1 sí', () => {
    const body = { 'content-length': String(4 * 1024 * 1024) };
    for (const url of ['/api/import-upload/inspect', '/api/import-upload/validate']) {
      expect(unstable_doesMiddlewareMatch({ config, url, headers: body })).toBe(false);
    }
    // La ruta de siempre de la API sigue con el tope de 1 MB…
    expect(unstable_doesMiddlewareMatch({ config, url: '/api/v1/patient-imports/inspect', headers: body })).toBe(true);
    expect(unstable_doesMiddlewareMatch({ config, url: '/api/v1/patient-imports', headers: body })).toBe(true);
    // …y las páginas, con su CSP.
    expect(unstable_doesMiddlewareMatch({ config, url: '/settings/importar-pacientes' })).toBe(true);
  });

  it('DX-107 × DX-259: un multipart de más de 1 MB a /api/v1/patient-imports sigue siendo el 413 en español', async () => {
    for (const path of ['/api/v1/patient-imports/inspect', '/api/v1/patient-imports']) {
      const res = proxy(
        new NextRequest(`http://demo.localhost:3001${path}`, {
          method: 'POST',
          headers: {
            host: 'demo.localhost:3001',
            authorization: 'Bearer T',
            'content-type': 'multipart/form-data; boundary=x',
            'content-length': String(1024 * 1024 + 1),
          },
        }),
      );
      expect(res.status).toBe(413);
      expect(await res.json()).toEqual(API_BODY_TOO_LARGE);
    }
  });

  it('DX-259: sobre /api/v1 solo corre si la petición trae cuerpo (Content-Length)', () => {
    const api = config.matcher[1];
    expect(api).toEqual({ source: '/api/v1/:path*', has: [{ type: 'header', key: 'content-length' }] });
  });
});
