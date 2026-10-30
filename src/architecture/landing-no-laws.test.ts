import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

/**
 * DX-369: la landing pública describe sus garantías (auditoría, historia
 * clínica inmutable, cifrado y consentimientos versionados) sin nombrar leyes
 * ni regímenes de ningún país ni prometer que los cumple. Citar uno lo decide
 * el dueño con evidencia. Recorre todo el código de la landing, comentarios
 * incluidos: los componentes de `components/marketing/`, la raíz que la pinta
 * y el layout raíz, que lleva el título y la descripción públicos.
 */
const SRC = join(__dirname, '..');
const MARKETING = join(SRC, 'components', 'marketing');
const LANDING_ROUTE_FILES = ['app/page.tsx', 'app/layout.tsx'];

/** Nombres de regímenes de protección de datos y salud, y leyes o decretos con número. */
export const LAW_NAME =
  /\b(?:h[aá]beas\s+data|lgpd|gdpr|rgpd|hipaa|ccpa|lopdgdd|lopd|lfpdppp|pipeda)\b|\b(?:ley|decreto|reglamento)\s+(?:org[aá]nica\s+|estatutaria\s+|\(ue\)\s+)?(?:n\.?[º°o]\s*)?\d/i;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\./.test(entry.name) ? [path] : [];
  });
}

const landingFiles = (): string[] => [
  ...sourceFiles(MARKETING),
  ...LANDING_ROUTE_FILES.map((path) => join(SRC, ...path.split('/'))),
];

describe('arquitectura: landing sin leyes ni regímenes (DX-369)', () => {
  it('the landing, its route and the root metadata name no law', () => {
    const files = landingFiles();
    const rels = files.map((file) => relative(SRC, file).split(sep).join('/'));
    expect(rels).toEqual(expect.arrayContaining(['components/marketing/landing-page.tsx', ...LANDING_ROUTE_FILES]));
    const found = files.flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, i) => (LAW_NAME.test(line) ? [`${relative(SRC, file)}:${i + 1}: ${line.trim()}`] : [])),
    );
    expect(found).toEqual([]);
  });

  it('the pattern catches each regime and numbered law and skips the guarantees', () => {
    for (const text of [
      'Pensado para Habeas Data, LGPD, GDPR e HIPAA.',
      'Cumple el RGPD',
      'conforme a la Ley 1581 de 2012',
      'Ley Orgánica 3/2018',
      'Reglamento (UE) 2016/679',
      'Decreto 1377 de 2013',
      'hipaa-ready',
      'Cumple la LOPDGDD',
      'Hábeas Data',
      'Ley Estatutaria 1581 de 2012',
    ]) {
      expect({ text, caught: LAW_NAME.test(text) }).toEqual({ text, caught: true });
    }
    for (const text of [
      'Registro de auditoría de accesos y cambios, historia clínica inmutable, consentimientos versionados y conexión cifrada.',
      'Protección de datos',
      'Leyenda del odontograma',
      'ley de oferta y demanda',
    ]) {
      expect({ text, caught: LAW_NAME.test(text) }).toEqual({ text, caught: false });
    }
  });
});
