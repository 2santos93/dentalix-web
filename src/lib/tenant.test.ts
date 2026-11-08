import { isClinicHost, isPlatformHost, parseTenantFromHost } from './tenant';

describe('parseTenantFromHost', () => {
  it('extracts the subdomain as tenant slug', () => {
    expect(parseTenantFromHost('sonrisa.dentalix.local')).toBe('sonrisa');
    expect(parseTenantFromHost('sonrisa.dentalix.local:3001')).toBe('sonrisa');
  });
  it('returns null for the root domain and www', () => {
    expect(parseTenantFromHost('dentalix.local')).toBeNull();
    expect(parseTenantFromHost('www.dentalix.local')).toBeNull();
  });
  it('returns null for localhost and null host', () => {
    expect(parseTenantFromHost('localhost')).toBeNull();
    expect(parseTenantFromHost('localhost:3001')).toBeNull();
    expect(parseTenantFromHost(null)).toBeNull();
  });
});

describe('isPlatformHost', () => {
  it.each(['localhost:3001', '127.0.0.1:3001', 'dentalix.local', 'www.dentalix.local', 'LOCALHOST'])(
    '%s es de la plataforma',
    (host) => expect(isPlatformHost(host)).toBe(true),
  );

  it.each(['clinica.localhost:3001', 'clinica.dentalix.local', 'clinica-ejemplo.com'])(
    '%s puede tener clínica (subdominio o dominio propio)',
    (host) => expect(isPlatformHost(host)).toBe(false),
  );
});

describe('isClinicHost (DX-554: qué muestra «/»)', () => {
  it('sin host no hay clínica: la landing, como siempre', () => {
    expect(isClinicHost(null)).toBe(false);
    expect(isClinicHost('')).toBe(false);
  });

  it.each(['dentalix.local', 'www.dentalix.local', 'localhost', 'localhost:3001', '127.0.0.1:3001', 'LOCALHOST:3001', 'WWW.Dentalix.Local'])(
    '%s es el dominio principal: landing',
    (host) => expect(isClinicHost(host)).toBe(false),
  );

  it.each([
    'demo.localhost',
    'demo.localhost:3001',
    'clinica.dentalix.local',
    'CLINICA.Dentalix.Local:3001',
    'clinica.test',
    'clinica.test:3001',
    'app.dentalix.local',
  ])('%s es de una clínica (subdominio o dominio propio): su entrada', (host) =>
    expect(isClinicHost(host)).toBe(true),
  );
});
