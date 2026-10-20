import { getTokenAllowedLocationIds, getTokenRole, getTokenUserId } from './token-role';

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

describe('getTokenUserId', () => {
  it('lee `sub` y devuelve null sin token legible', () => {
    expect(getTokenUserId(tokenWith({ sub: 'u1', role: 'DENTIST' }))).toBe('u1');
    expect(getTokenUserId(tokenWith({ role: 'DENTIST' }))).toBeNull();
    expect(getTokenUserId(null)).toBeNull();
  });
});

describe('getTokenAllowedLocationIds (DX-089)', () => {
  it('sin claim `loc` el miembro tiene todas las sedes (null)', () => {
    expect(getTokenAllowedLocationIds(tokenWith({ sub: 'u1', role: 'ADMIN' }))).toBeNull();
  });

  it('con `loc` devuelve la lista de sedes permitidas', () => {
    expect(
      getTokenAllowedLocationIds(tokenWith({ sub: 'u1', role: 'RECEPTION', loc: ['s1', 's2'] })),
    ).toEqual(['s1', 's2']);
  });

  it('`loc: []` significa ninguna sede, no todas', () => {
    expect(getTokenAllowedLocationIds(tokenWith({ role: 'DENTIST', loc: [] }))).toEqual([]);
  });

  it('descarta entradas que no son texto y trata un `loc` que no es lista como ausente', () => {
    expect(getTokenAllowedLocationIds(tokenWith({ loc: ['s1', 7, '', null] }))).toEqual(['s1']);
    expect(getTokenAllowedLocationIds(tokenWith({ loc: 's1' }))).toBeNull();
  });

  it('sin token legible devuelve null', () => {
    expect(getTokenAllowedLocationIds(null)).toBeNull();
    expect(getTokenAllowedLocationIds('basura')).toBeNull();
  });
});
