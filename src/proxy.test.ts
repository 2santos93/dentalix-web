/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { API_BODY_TOO_LARGE, HEALTH_FORM_HEADERS, config, proxy } from './proxy';

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

  it('DX-099: el cuestionario de salud sale sin Referer, sin caché y sin indexar; el resto no cambia', () => {
    const res = run('http://demo.localhost:3001/anamnesis/abc', { host: 'demo.localhost:3001' });
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(Object.keys(HEALTH_FORM_HEADERS)).toHaveLength(3);
    const other = run('http://demo.localhost:3001/anamnesis-por-revisar', { host: 'demo.localhost:3001' });
    expect(other.headers.get('cache-control')).toBeNull();
    expect(other.headers.get('referrer-policy')).toBeNull();
  });

  it('DX-243: la firma a distancia sale sin Referer, sin caché y sin indexar', () => {
    const res = run('http://demo.localhost:3001/firmar/abc', { host: 'demo.localhost:3001' });
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    const other = run('http://demo.localhost:3001/firmarx', { host: 'demo.localhost:3001' });
    expect(other.headers.get('x-robots-tag')).toBeNull();
  });

  it('DX-435: la oferta de hueco por enlace sale sin Referer, sin caché y sin indexar', () => {
    const res = run('http://demo.localhost:3001/hueco/abc', { host: 'demo.localhost:3001' });
    expect(res.headers.get('referrer-policy')).toBe('no-referrer');
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(res.headers.get('x-robots-tag')).toBe('noindex, nofollow');
    const other = run('http://demo.localhost:3001/huecos', { host: 'demo.localhost:3001' });
    expect(other.headers.get('x-robots-tag')).toBeNull();
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
    expect(frameSrc).toBe(`frame-src 'self' ${new URL(process.env.API_URL ?? 'http://localhost:3000/api/v1').origin}`);
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
    expect(small.headers.get('x-middleware-rewrite')).toBe('http://localhost:3000/api/v1/auth/login');
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

  it('DX-083: corre sobre todo /api/v1 (también los GET sin cuerpo), que reescribe hacia la API', () => {
    expect(config.matcher[1]).toEqual({ source: '/api/v1/:path*' });
    expect(unstable_doesMiddlewareMatch({ config, url: '/api/v1/auth/refresh' })).toBe(true);
  });
});

describe('proxy (DX-083: URL de la API y origen de ficheros en runtime)', () => {
  const saved = { API_URL: process.env.API_URL, FILES_ORIGIN: process.env.FILES_ORIGIN };
  afterEach(() => {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it('el mismo build reescribe /api/v1 hacia la API que diga API_URL en cada momento, con ruta y query', () => {
    process.env.API_URL = 'https://api.staging.dentalix.app/api/v1';
    const a = run('http://demo.dentalix.app/api/v1/patients?page=2', { host: 'demo.dentalix.app' });
    expect(a.headers.get('x-middleware-rewrite')).toBe('https://api.staging.dentalix.app/api/v1/patients?page=2');
    expect(a.headers.get('content-security-policy')).toBeNull();

    process.env.API_URL = 'https://api.dentalix.app/api/v1/';
    const b = run('http://demo.dentalix.app/api/v1/auth/refresh', { host: 'demo.dentalix.app' });
    expect(b.headers.get('x-middleware-rewrite')).toBe('https://api.dentalix.app/api/v1/auth/refresh');
  });

  it('OPS-041: la CSP de las páginas toma el origen de la API y de FILES_ORIGIN en runtime', () => {
    process.env.API_URL = 'https://api.staging.dentalix.app/api/v1';
    process.env.FILES_ORIGIN = 'https://bucket-staging.example.com';
    const csp = run('http://demo.dentalix.app/patients/p1').headers.get('content-security-policy') as string;
    expect(csp).toContain("frame-src 'self' https://bucket-staging.example.com");
    expect(csp).toMatch(/img-src [^;]*https:\/\/api\.staging\.dentalix\.app[^;]*https:\/\/bucket-staging\.example\.com/);

    process.env.FILES_ORIGIN = 'https://bucket.example.com';
    const other = run('http://demo.dentalix.app/patients/p1').headers.get('content-security-policy') as string;
    expect(other).toContain("frame-src 'self' https://bucket.example.com");
  });
});
