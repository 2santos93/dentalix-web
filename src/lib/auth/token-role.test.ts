import { getTokenRole } from './token-role';

function tokenWith(claims: unknown): string {
  const b64url = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${b64url('{"alg":"HS256"}')}.${b64url(JSON.stringify(claims))}.firma`;
}

describe('getTokenRole', () => {
  it('lee el rol de clínica del payload', () => {
    expect(getTokenRole(tokenWith({ sub: 'u1', tenantId: 't1', role: 'RECEPTION' }))).toBe(
      'RECEPTION',
    );
  });

  it('decodifica base64url (caracteres - y _ sin relleno)', () => {
    // "Gómez ~~~?" fuerza bytes que en base64 estándar salen como + y /.
    const token = tokenWith({ role: 'ADMIN', fullName: 'Gómez ~~~?' });
    expect(token.split('.')[1]).toMatch(/[-_]/);
    expect(getTokenRole(token)).toBe('ADMIN');
  });

  it('devuelve null sin token, con un token ilegible o de plataforma', () => {
    expect(getTokenRole(null)).toBeNull();
    expect(getTokenRole('')).toBeNull();
    expect(getTokenRole('no-es-un-jwt')).toBeNull();
    expect(getTokenRole('a.%%%.c')).toBeNull();
    expect(getTokenRole(tokenWith({ sub: 'u1', platform: true }))).toBeNull();
  });

  it('no acepta un rol que no existe', () => {
    expect(getTokenRole(tokenWith({ role: 'OWNER' }))).toBeNull();
  });
});
