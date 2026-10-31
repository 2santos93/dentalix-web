import nextConfig from '../../../next.config';
import { MAX_PATIENT_DOCUMENT_BYTES } from '@/lib/patient-documents/patient-documents-api';
import {
  API_PROXY_MAX_BODY_BYTES,
  API_PROXY_PATH,
  DEV_API_URL,
  apiOrigin,
  apiProxyDestination,
  apiUrl,
  assertRuntimeConfig,
  filesOrigin,
} from './api-base';

describe('api-base', () => {
  it('el navegador habla con la API por el MISMO origen (/api/v1), para que la cookie de sesión sea del host de la clínica', () => {
    expect(API_PROXY_PATH).toBe('/api/v1');
  });

  it('DX-083: la URL de la API sale de la variable de SERVIDOR API_URL al llamar (runtime), no al compilar', () => {
    expect(apiUrl({ API_URL: 'https://api.staging.dentalix.app/api/v1' })).toBe('https://api.staging.dentalix.app/api/v1');
    expect(apiUrl({ API_URL: '  https://api.dentalix.app/api/v1 ' })).toBe('https://api.dentalix.app/api/v1');
    // Sin variable (desarrollo): la API local. Una NEXT_PUBLIC_* ya no cuenta.
    expect(apiUrl({})).toBe(DEV_API_URL);
    expect(apiUrl({ NEXT_PUBLIC_API_URL: 'https://otra/api/v1' })).toBe(DEV_API_URL);
  });

  it('reescribe /api/v1/* hacia la API configurada, con su query', () => {
    const url = new URL('http://demo.localhost:3001/api/v1/patients?search=ana&page=2');
    expect(apiProxyDestination(url, 'http://localhost:3130/api/v1').href).toBe(
      'http://localhost:3130/api/v1/patients?search=ana&page=2',
    );
  });

  it('tolera una barra final en la URL de la API', () => {
    const url = new URL('http://demo.localhost:3001/api/v1/auth/refresh');
    expect(apiProxyDestination(url, 'https://api.dentalix.app/api/v1/').href).toBe(
      'https://api.dentalix.app/api/v1/auth/refresh',
    );
  });

  it('OPS-024: en producción no arranca sin API_URL http(s) válida ni con FILES_ORIGIN inválido', () => {
    expect(() => assertRuntimeConfig({ NODE_ENV: 'production' })).toThrow(/API_URL/);
    expect(() => assertRuntimeConfig({ NODE_ENV: 'production', API_URL: '  ' })).toThrow(/API_URL/);
    expect(() => assertRuntimeConfig({ NODE_ENV: 'production', API_URL: 'api.dentalix.app' })).toThrow(/API_URL/);
    expect(() => assertRuntimeConfig({ NODE_ENV: 'production', API_URL: 'ftp://api.dentalix.app' })).toThrow(/API_URL/);
    expect(() =>
      assertRuntimeConfig({ NODE_ENV: 'production', API_URL: 'https://api.dentalix.app/api/v1', FILES_ORIGIN: 'bucket' }),
    ).toThrow(/FILES_ORIGIN/);
    expect(() =>
      assertRuntimeConfig({
        NODE_ENV: 'production',
        API_URL: 'http://api.interna:3000/api/v1',
        FILES_ORIGIN: 'https://archivos.dentalix.app',
      }),
    ).not.toThrow();
    // Fuera de producción, los defaults de desarrollo.
    expect(() => assertRuntimeConfig({ NODE_ENV: 'development' })).not.toThrow();
  });

  it('apiOrigin da solo el origen (para img-src de logos y avatares)', () => {
    expect(apiOrigin('http://localhost:3130/api/v1')).toBe('http://localhost:3130');
    expect(apiOrigin('https://api.dentalix.app/api/v1')).toBe('https://api.dentalix.app');
  });

  it('DX-151: filesOrigin es el del bucket si se configura, y si no (o no es URL) el de la API', () => {
    expect(filesOrigin('https://bucket.example.com/some/path', 'http://localhost:3130/api/v1')).toBe(
      'https://bucket.example.com',
    );
    expect(filesOrigin(undefined, 'http://localhost:3130/api/v1')).toBe('http://localhost:3130');
    expect(filesOrigin('  ', 'http://localhost:3130/api/v1')).toBe('http://localhost:3130');
    expect(filesOrigin('no es una url', 'http://localhost:3130/api/v1')).toBe('http://localhost:3130');
  });

  it('DX-259: el proxy de Next copia como mucho 1 MB del cuerpo (los documentos van directos al bucket)', () => {
    expect(API_PROXY_MAX_BODY_BYTES).toBeLessThanOrEqual(1024 * 1024);
    // La firma de un consentimiento (hasta ~700 KB en JSON) sigue cabiendo.
    expect(API_PROXY_MAX_BODY_BYTES).toBeGreaterThanOrEqual(700 * 1024);
    expect(nextConfig.experimental?.proxyClientMaxBodySize).toBe(API_PROXY_MAX_BODY_BYTES);
    expect(MAX_PATIENT_DOCUMENT_BYTES).toBeGreaterThan(API_PROXY_MAX_BODY_BYTES);
  });
});
