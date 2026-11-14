import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * DX-118 (FE-034): toda página cuya URL lleva un token (`[token]`) declara
 * `robots: { index: false, follow: false }` y `referrer: 'no-referrer'` en su
 * `metadata`. El token no debe indexarse ni salir en el Referer hacia terceros
 * (el logo de la clínica en otro dominio, una fuente). `proxy.ts` añade además
 * la cabecera, pero la página lo dice por sí misma: un `<meta>` sobrevive a un
 * proxy mal configurado y una captura de la página lo muestra.
 */
const APP = join(__dirname, '..', 'app');

function tokenPages(dir: string = APP): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tokenPages(path);
    return entry.name === 'page.tsx' && dir.split(sep).includes('[token]') ? [path] : [];
  });
}

export function missingTokenMetadata(source: string): string[] {
  const missing: string[] = [];
  if (!/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/.test(source)) missing.push('robots noindex');
  if (!/referrer:\s*'no-referrer'/.test(source)) missing.push("referrer 'no-referrer'");
  return missing;
}

describe('rutas con [token] (DX-118)', () => {
  it('detecta lo que falta en una página', () => {
    expect(missingTokenMetadata("export const metadata = { referrer: 'no-referrer' };")).toEqual(['robots noindex']);
    expect(
      missingTokenMetadata(
        "export const metadata = { robots: { index: false, follow: false }, referrer: 'no-referrer' };",
      ),
    ).toEqual([]);
  });

  it('hay páginas con token y todas declaran noindex y no-referrer', () => {
    const pages = tokenPages();
    expect(pages.length).toBeGreaterThanOrEqual(10);
    const problems = pages.flatMap((page) => {
      const missing = missingTokenMetadata(readFileSync(page, 'utf8'));
      return missing.length ? [`${relative(APP, page).split(sep).join('/')}: ${missing.join(', ')}`] : [];
    });
    expect(problems).toEqual([]);
  });
});
