import { readdirSync } from 'node:fs';
import path from 'node:path';
import type { ClinicRole } from '@/lib/me/me-api';
import { SETTINGS_SECTIONS, visibleSettingsSections } from './settings-sections';

const hrefsFor = (role: ClinicRole | null) =>
  visibleSettingsSections(role).flatMap((section) => section.entries.map((entry) => entry.href));

// Las pantallas que se abren para todos los roles: las lee cualquiera y solo
// ADMIN las cambia (la pantalla y la API lo deciden, no el índice).
const FOR_EVERYONE = ['/settings/profile', '/settings/sedes', '/settings/horarios', '/settings/privacidad'];

describe('Índice de Ajustes (DX-282)', () => {
  it('agrupa por tema, en este orden', () => {
    expect(visibleSettingsSections('ADMIN').map((section) => section.title)).toEqual([
      'Tu cuenta',
      'Clínica y sedes',
      'Agenda',
      'Cobro',
      'Historia clínica',
      'Datos y seguridad',
      'Herramientas y registros',
    ]);
  });

  it('ADMIN ve las 25 pantallas de ajustes (Mi perfil incluido), cada una una sola vez', () => {
    const hrefs = hrefsFor('ADMIN');
    expect(hrefs).toHaveLength(25);
    expect(new Set(hrefs).size).toBe(25);
  });

  it('las herramientas y los registros van aparte de las políticas', () => {
    const tools = visibleSettingsSections('ADMIN').find((section) => section.id === 'herramientas');
    expect(tools?.entries.map((entry) => entry.label)).toEqual([
      'Importar pacientes',
      'Implantes',
      'Accesos de soporte',
      'Auditoría',
    ]);
  });

  it('ADMIN sees «Nombres de documentos» right after «Mayoría de edad»; other roles do not', () => {
    const clinic = visibleSettingsSections('ADMIN').find((section) => section.id === 'clinica');
    const labels = clinic?.entries.map((entry) => entry.label) ?? [];
    expect(labels.indexOf('Nombres de documentos')).toBe(labels.indexOf('Mayoría de edad') + 1);
    expect(hrefsFor('ADMIN')).toContain('/settings/tipos-de-documento');
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(hrefsFor(role)).not.toContain('/settings/tipos-de-documento');
    }
  });

  it('settings index lists Calendario de la sede only for ADMIN', () => {
    const clinic = visibleSettingsSections('ADMIN').find((section) => section.id === 'clinica');
    const labels = clinic?.entries.map((entry) => entry.label) ?? [];
    // Justo después de «Sedes» (DX-316, spec §7.1).
    expect(labels.indexOf('Calendario de la sede')).toBe(labels.indexOf('Sedes') + 1);
    expect(hrefsFor('ADMIN')).toContain('/settings/calendario');
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(hrefsFor(role)).not.toContain('/settings/calendario');
    }
  });

  it('Recetas is ADMIN only and reads «Plantillas y datos que imprime la receta.»', () => {
    const entry = SETTINGS_SECTIONS.flatMap((section) => section.entries).find(
      (e) => e.href === '/settings/recetas',
    );
    expect(entry?.label).toBe('Recetas');
    expect(entry?.description).toBe('Plantillas y datos que imprime la receta.');
    expect(hrefsFor('ADMIN')).toContain('/settings/recetas');
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(hrefsFor(role)).not.toContain('/settings/recetas');
    }
  });

  it('settings index lists Mayoría de edad only for ADMIN', () => {
    const clinic = visibleSettingsSections('ADMIN').find((section) => section.id === 'clinica');
    expect(clinic?.entries.map((entry) => entry.label)).toContain('Mayoría de edad');
    expect(hrefsFor('ADMIN')).toContain('/settings/mayoria-de-edad');
    for (const role of ['DENTIST', 'ASSISTANT', 'RECEPTION', null] as const) {
      expect(hrefsFor(role)).not.toContain('/settings/mayoria-de-edad');
    }
  });

  it('no deja ninguna pantalla de /settings sin entrada', () => {
    // El índice es el mapa completo (B6): Mi perfil en «Tu cuenta». Cualquier
    // carpeta nueva en /settings tiene que salir en el índice: si no, la
    // pantalla existe pero no se llega a ella.
    const dir = path.join(process.cwd(), 'src/app/(app)/settings');
    const pages = readdirSync(dir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `/settings/${entry.name}`)
      .sort();
    const all = SETTINGS_SECTIONS.flatMap((section) => section.entries.map((entry) => entry.href));
    expect([...all].sort()).toEqual(pages);
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'] as const)(
    '%s solo ve Mi perfil, Sedes, Horarios y Privacidad de datos',
    (role) => {
      expect(hrefsFor(role)).toEqual(FOR_EVERYONE);
      // Las secciones que se quedan vacías no se pintan.
      expect(visibleSettingsSections(role).map((section) => section.title)).toEqual([
        'Tu cuenta',
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
