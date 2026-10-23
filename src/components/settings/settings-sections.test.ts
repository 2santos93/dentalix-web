import { readdirSync } from 'node:fs';
import path from 'node:path';
import type { ClinicRole } from '@/lib/me/me-api';
import { SETTINGS_SECTIONS, visibleSettingsSections } from './settings-sections';

const hrefsFor = (role: ClinicRole | null) =>
  visibleSettingsSections(role).flatMap((section) => section.entries.map((entry) => entry.href));

// Las pantallas que se abren para todos los roles: las lee cualquiera y solo
// ADMIN las cambia (la pantalla y la API lo deciden, no el índice).
const FOR_EVERYONE = ['/settings/sedes', '/settings/horarios', '/settings/privacidad'];

describe('Índice de Ajustes (DX-282)', () => {
  it('agrupa por tema, en este orden', () => {
    expect(visibleSettingsSections('ADMIN').map((section) => section.title)).toEqual([
      'Clínica y sedes',
      'Agenda',
      'Cobro',
      'Historia clínica',
      'Datos y seguridad',
    ]);
  });

  it('ADMIN ve las 19 pantallas de ajustes, cada una una sola vez', () => {
    const hrefs = hrefsFor('ADMIN');
    expect(hrefs).toHaveLength(19);
    expect(new Set(hrefs).size).toBe(19);
  });

  it('no deja ninguna pantalla de /settings sin entrada (salvo el perfil y la auditoría)', () => {
    // Mi perfil vive en el menú de cuenta y Auditoría en la navegación lateral.
    // Cualquier otra carpeta nueva en /settings tiene que salir en el índice:
    // si no, la pantalla existe pero no se llega a ella.
    const dir = path.join(process.cwd(), 'src/app/(app)/settings');
    const pages = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !['profile', 'auditoria'].includes(entry.name))
      .map((entry) => `/settings/${entry.name}`)
      .sort();
    const all = SETTINGS_SECTIONS.flatMap((section) => section.entries.map((entry) => entry.href));
    expect([...all].sort()).toEqual(pages);
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'] as const)(
    '%s solo ve Sedes, Horarios y Privacidad de datos',
    (role) => {
      expect(hrefsFor(role)).toEqual(FOR_EVERYONE);
      // Las secciones que se quedan vacías no se pintan.
      expect(visibleSettingsSections(role).map((section) => section.title)).toEqual([
        'Clínica y sedes',
        'Agenda',
        'Datos y seguridad',
      ]);
    },
  );

  it('sin rol legible (token de plataforma o basura) no enseña nada de administración', () => {
    expect(hrefsFor(null)).toEqual(FOR_EVERYONE);
  });
});
