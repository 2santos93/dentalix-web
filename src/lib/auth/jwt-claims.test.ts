import { isJwtExpired, readJwtClaims } from './jwt-claims';

function jwt(claims: Record<string, unknown>): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return `${b64({ alg: 'HS256' })}.${b64(claims)}.sig`;
}

describe('jwt-claims', () => {
  it('reads the claims of a base64url JWT', () => {
    expect(readJwtClaims(jwt({ sub: 'u1', role: 'ADMIN' }))).toEqual({ sub: 'u1', role: 'ADMIN' });
  });

  it('returns null for anything that is not a readable JWT', () => {
    expect(readJwtClaims(null)).toBeNull();
    expect(readJwtClaims('garbage')).toBeNull();
    expect(readJwtClaims('a.!!!.c')).toBeNull();
  });

  it('isJwtExpired compares exp (seconds) with now plus a skew', () => {
    const now = 1_800_000_000_000;
    expect(isJwtExpired(jwt({ exp: now / 1000 - 1 }), now)).toBe(true);
    expect(isJwtExpired(jwt({ exp: now / 1000 + 5 }), now)).toBe(true); // dentro del margen
    expect(isJwtExpired(jwt({ exp: now / 1000 + 600 }), now)).toBe(false);
  });

  it('treats a token without a readable exp as still valid', () => {
    expect(isJwtExpired('OPAQUE')).toBe(false);
    expect(isJwtExpired(jwt({ sub: 'u1' }))).toBe(false);
  });
});
