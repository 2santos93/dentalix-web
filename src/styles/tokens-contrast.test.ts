import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { contrastRatio } from '@/lib/color/contrast';

/**
 * DX-115: cada variante de `Badge` da ≥4,5:1 en claro y en oscuro. Lee los
 * tokens de `tokens.css` y las clases de `badge.tsx` tal cual, así que un
 * token o una variante nuevos entran solos en la comprobación.
 */
const TOKENS = readFileSync(join(__dirname, 'tokens.css'), 'utf8');
const BADGE = readFileSync(join(__dirname, '../components/ui/badge.tsx'), 'utf8');

function block(selector: string): Record<string, string> {
  const match = new RegExp(`^${selector.replace('.', '\\.')}\\s*\\{([\\s\\S]*?)^\\}`, 'm').exec(TOKENS);
  if (!match) throw new Error(`tokens.css sin el bloque ${selector}`);
  const vars: Record<string, string> = {};
  for (const line of match[1].replace(/\/\*[\s\S]*?\*\//g, '').split(';')) {
    const decl = /^\s*(--[\w-]+)\s*:\s*(.+?)\s*$/.exec(line);
    if (decl) vars[decl[1]] = decl[2];
  }
  return vars;
}

/** El valor final de un token, siguiendo `var(--x)`. El oscuro hereda de `:root`. */
function resolver(vars: Record<string, string>) {
  return function resolve(name: string, depth = 0): string {
    const value = vars[name];
    if (value === undefined) throw new Error(`token ${name} sin definir`);
    const ref = /^var\((--[\w-]+)\)$/.exec(value);
    if (ref && depth < 10) return resolve(ref[1], depth + 1);
    return value;
  };
}

const light = block(':root');
const THEMES = {
  claro: resolver(light),
  oscuro: resolver({ ...light, ...block('.dark') }),
};

/** `bg-x` / `text-y` de cada variante del `cva` de `Badge`. */
function badgeVariants(): { name: string; bg: string; text: string }[] {
  const variants = /variant:\s*\{([\s\S]*?)\n\s*\},\n/.exec(BADGE);
  if (!variants) throw new Error('badge.tsx sin el bloque de variantes');
  return [...variants[1].matchAll(/^\s*(\w+):\s*'([^']+)'/gm)].map(([, name, classes]) => {
    const bg = /(?:^|\s)bg-([\w-]+)/.exec(classes)?.[1];
    const text = /(?:^|\s)text-((?!xs\b|sm\b)[\w-]+)/.exec(classes)?.[1];
    if (!bg || !text) throw new Error(`la variante ${name} no tiene bg- y text-`);
    return { name, bg, text };
  });
}

const VARIANTS = badgeVariants();

describe('Badge: contraste AA de cada variante (DX-115)', () => {
  it('lee las variantes de badge.tsx', () => {
    expect(VARIANTS.map((v) => v.name)).toEqual(
      expect.arrayContaining(['neutral', 'info', 'success', 'warning', 'danger', 'primary', 'outline']),
    );
  });

  for (const [theme, resolve] of Object.entries(THEMES)) {
    it.each(VARIANTS)(`${theme}: $name da ≥4,5:1 sobre su fondo, y sobre surface y bg si es transparente`, ({ bg, text }) => {
      const ink = resolve(`--color-${text}`);
      // Un fondo transparente deja ver la superficie o el lienzo de debajo.
      const grounds =
        bg === 'transparent'
          ? [resolve('--color-surface'), resolve('--color-bg')]
          : [resolve(`--color-${bg}`)];
      for (const ground of grounds) {
        expect(contrastRatio(ink, ground)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }
});
