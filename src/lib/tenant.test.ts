import { parseTenantFromHost } from './tenant';

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
