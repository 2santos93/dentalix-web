import nextConfig from '../../../next.config';
import { SECURITY_HEADERS, securityHeaderRules } from './security-headers';

function asRecord(headers: { key: string; value: string }[]) {
  return Object.fromEntries(headers.map((h) => [h.key, h.value]));
}

describe('cabeceras de seguridad de la web (DX-061)', () => {
  it('fija anti-enmarcado, nosniff, referrer y permissions restrictivas', () => {
    expect(asRecord(SECURITY_HEADERS)).toEqual({
      'X-Frame-Options': 'DENY',
      'Content-Security-Policy': "frame-ancestors 'none'",
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    });
  });

  it('la CSP es SOLO frame-ancestors (la CSP completa con nonce queda fuera)', () => {
    const csp = asRecord(SECURITY_HEADERS)['Content-Security-Policy'];
    expect(csp.split(';').map((d) => d.trim()).filter(Boolean)).toEqual(["frame-ancestors 'none'"]);
  });

  it('se aplican a todas las rutas', () => {
    expect(securityHeaderRules()).toEqual([{ source: '/:path*', headers: SECURITY_HEADERS }]);
  });

  it('next.config las expone en headers() y desactiva x-powered-by', async () => {
    expect(nextConfig.poweredByHeader).toBe(false);
    expect(typeof nextConfig.headers).toBe('function');
    await expect(nextConfig.headers!()).resolves.toEqual(securityHeaderRules());
  });
});
