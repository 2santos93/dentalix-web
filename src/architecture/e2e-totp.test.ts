/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import {
  TOTP_PERIOD_MS,
  totpCodeForStep,
  totpNow,
} from '../../e2e/support/totp';

/**
 * DX-552: los e2e del MFA calculan el código TOTP con `Date.now()` y la API lo
 * valida con el suyo un momento después. Con el reloj FIJO en el borde de la
 * ventana (segundo 29,9 de un paso) se comprueba que los desfases que admite
 * `totpNow` dan el mismo resultado aunque la petición cruce al paso siguiente.
 *
 * `apiAccepts` replica la regla de la API (dentalix-api,
 * src/shared/crypto/totp.ts `matchTotp`): paso actual ±1 y solo pasos
 * posteriores al último usado. No cambia nada del producto.
 */
function apiAccepts(
  secret: string,
  code: string,
  nowMs: number,
  lastUsedStep: number | null,
) {
  const current = Math.floor(nowMs / TOTP_PERIOD_MS);
  for (let step = current - 1; step <= current + 1; step++) {
    if (totpCodeForStep(secret, step) === code) {
      return lastUsedStep !== null && step <= lastUsedStep ? null : step;
    }
  }
  return null;
}

const SECRET = 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP';
const STEP_START = 1_800_000_000_000; // múltiplo de 30 s
const S = STEP_START / TOTP_PERIOD_MS;
const EDGE = STEP_START + 29_900;
const LATENCY = 200; // la API lo valida ya en el paso S + 1

describe('DX-552: códigos TOTP de los e2e en el borde de la ventana', () => {
  it('RFC 6238: vector SHA-1 de T = 59 s', () => {
    // Clave ASCII «12345678901234567890» en base32; el RFC da 94287082 (8
    // cifras): con 6, 287082.
    expect(totpNow('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ', 0, 59_000)).toBe(
      '287082',
    );
  });

  it('el fallo que evita: el paso anterior calculado a las …:29,9 ya no vale a las …:30,1', () => {
    expect(
      apiAccepts(SECRET, totpCodeForStep(SECRET, S - 1), EDGE + LATENCY, null),
    ).toBeNull();
    expect(() => totpNow(SECRET, -1, EDGE)).toThrow(/desfase -1/);
  });

  it('+2 como «código malo» pasaría a valer en el cruce: también se rechaza', () => {
    expect(
      apiAccepts(SECRET, totpCodeForStep(SECRET, S + 2), EDGE + LATENCY, null),
    ).toBe(S + 2);
    expect(() => totpNow(SECRET, 2, EDGE)).toThrow(/desfase 2/);
  });

  it('0 y +1 valen aunque la petición cruce el límite', () => {
    expect(
      apiAccepts(SECRET, totpNow(SECRET, 0, EDGE), EDGE + LATENCY, null),
    ).toBe(S);
    expect(
      apiAccepts(SECRET, totpNow(SECRET, 1, EDGE), EDGE + LATENCY, null),
    ).toBe(S + 1);
  });

  it('−4 (el código malo de los specs) no vale ni antes ni después del cruce', () => {
    const wrong = totpNow(SECRET, -4, EDGE);
    expect(apiAccepts(SECRET, wrong, EDGE, null)).toBeNull();
    expect(apiAccepts(SECRET, wrong, EDGE + LATENCY, null)).toBeNull();
  });

  it('anti-reuso: el alta gasta el paso actual y el +1 del login entra, cruce o no', () => {
    // Alta en el borde (validada ya en S + 1) y login en el mismo paso o en el siguiente.
    const enrolled = apiAccepts(
      SECRET,
      totpNow(SECRET, 0, EDGE),
      EDGE + LATENCY,
      null,
    );
    expect(enrolled).toBe(S);
    for (const loginAt of [EDGE + LATENCY + 10, EDGE + LATENCY + 29_000]) {
      expect(
        apiAccepts(
          SECRET,
          totpNow(SECRET, 1, loginAt),
          loginAt + LATENCY,
          enrolled,
        ),
      ).not.toBeNull();
    }
    // Alta a mitad de paso y login con +1 justo en el borde.
    const mid = STEP_START + 15_000;
    const used = apiAccepts(
      SECRET,
      totpNow(SECRET, 0, mid),
      mid + LATENCY,
      null,
    );
    expect(
      apiAccepts(SECRET, totpNow(SECRET, 1, EDGE), EDGE + LATENCY, used),
    ).toBe(S + 1);
  });
});

// Un solo generador: ningún spec de e2e calcula pasos o códigos por su cuenta.
const E2E = join(__dirname, '..', '..', 'e2e');
const OWN = join(E2E, 'support', 'totp.ts');

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('DX-552: un solo generador TOTP en e2e/', () => {
  it('nadie más hace HMAC-SHA1 ni cuenta pasos de 30 s', () => {
    const offenders = tsFiles(E2E)
      .filter((file) => file !== OWN)
      .filter((file) => {
        const text = readFileSync(file, 'utf8');
        return (
          /createHmac\(\s*['"]sha1/.test(text) ||
          /\/\s*30_?000\b/.test(text) ||
          /totpCodeForStep\(/.test(text)
        );
      })
      .map((file) => relative(E2E, file).split(sep).join('/'));
    expect(offenders).toEqual([]);
  });
});
