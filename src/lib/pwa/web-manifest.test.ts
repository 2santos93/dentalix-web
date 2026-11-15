import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildWebManifest, iconColors, iconMonogram, isIconSize, shortName } from './web-manifest';
import { SW_PAGES_CACHE, OFFLINE_PAGES } from '@/lib/offline/service-worker';
import { OFFLINE_CAPABLE_PATHS } from '@/lib/offline/offline-session';

describe('manifest por clínica (DX-405)', () => {
  it('nombre, color y los iconos de la clínica; arranca en la agenda', () => {
    const m = buildWebManifest({ name: 'Clínica Dental Los Palos Grandes', primaryColor: '#7C3AED' });
    expect(m.name).toBe('Clínica Dental Los Palos Grandes');
    expect(m.short_name).toBe('Clínica');
    expect(m.start_url).toBe('/agenda');
    expect(m.display).toBe('standalone');
    expect(m.theme_color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(m.icons.map((i) => i.sizes)).toEqual(['192x192', '512x512', '512x512']);
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
  });

  it('sin clínica (o sin color), Dentalix con el acento de fábrica', () => {
    const m = buildWebManifest({ name: null, primaryColor: null });
    expect(m.name).toBe('Dentalix');
    expect(m.theme_color).toBe('#0E7490');
  });

  it('el icono usa la familia del acento derivada (tinta con contraste) y las iniciales', () => {
    expect(iconColors(null)).toEqual({ fill: '#0E7490', ink: '#FFFFFF' });
    const light = iconColors('#FDE68A');
    expect(light.fill).toBeTruthy();
    expect(light.ink).toBeTruthy();
    expect(iconMonogram('Odontología Caracas')).toBe('OC');
    expect(iconMonogram(null)).toBe('D');
    expect(shortName('Sonrisa')).toBe('Sonrisa');
    expect(isIconSize(512)).toBe(true);
    expect(isIconSize(64)).toBe(false);
  });

  it('public/sw.js guarda las mismas páginas y con el mismo nombre de caché que borra la web', () => {
    const sw = readFileSync(join(process.cwd(), 'public/sw.js'), 'utf8');
    expect(sw).toContain(`const PAGES_CACHE = '${SW_PAGES_CACHE}';`);
    expect(sw).toContain(`const OFFLINE_PAGES = ${JSON.stringify([...OFFLINE_PAGES]).replace(/"/g, "'")};`);
    expect([...OFFLINE_CAPABLE_PATHS]).toEqual([...OFFLINE_PAGES]);
    // Nunca la API: sus respuestas no pasan por la caché del service worker.
    expect(sw).not.toMatch(/['"`]\/api\//);
  });
});
