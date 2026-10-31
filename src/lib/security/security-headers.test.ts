import nextConfig from '../../../next.config';
import { SECURITY_HEADERS, securityHeaderRules } from './security-headers';

function asRecord(headers: { key: string; value: string }[]) {
  return Object.fromEntries(headers.map((h) => [h.key, h.value]));
}

describe('cabeceras de seguridad de la web (DX-061)', () => {
  it('fija anti-enmarcado, nosniff, referrer y permissions restrictivas', () => {
    expect(asRecord(SECURITY_HEADERS)).toEqual({
      'X-Frame-Options': 'DENY',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
  });

  it('no fija CSP: la completa, con nonce, la pone proxy.ts en cada página (DX-062)', () => {
    expect(asRecord(SECURITY_HEADERS)).not.toHaveProperty('Content-Security-Policy');
  });

  it('se aplican a todas las rutas', () => {
    expect(securityHeaderRules()).toEqual([{ source: '/:path*', headers: SECURITY_HEADERS }]);
  });

  it('next.config las expone en headers() y desactiva x-powered-by', async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(typeof nextConfig.headers).toBe('function');
    await expect(nextConfig.headers!()).resolves.toEqual(securityHeaderRules());
  });

  it('DX-083: /api/v1/* NO se reescribe en next.config (se fijaría al compilar) sino en proxy.ts, y el build es standalone', () => {
    expect(nextConfig.rewrites).toBeUndefined();
    expect(nextConfig.output).toBe('standalone');
  });
});
