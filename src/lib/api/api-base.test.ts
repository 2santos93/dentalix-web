import { API_PROXY_PATH, apiOrigin, apiRewrites, filesOrigin } from './api-base';

describe('api-base', () => {
  it('el navegador habla con la API por el MISMO origen (/api/v1), para que la cookie de sesión sea del host de la clínica', () => {
    expect(API_PROXY_PATH).toBe('/api/v1');
  });

  it('reescribe /api/v1/* hacia la API configurada', () => {
    expect(apiRewrites('http://localhost:3130/api/v1')).toEqual([
      { source: '/api/v1/:path*', destination: 'http://localhost:3130/api/v1/:path*' },
    ]);
  });

  it('tolera una barra final en la URL de la API', () => {
    expect(apiRewrites('https://api.dentalix.app/api/v1/')[0].destination).toBe(
      'https://api.dentalix.app/api/v1/:path*',
    );
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
});
