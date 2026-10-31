import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { PageHeader } from './page-header';
import { SETTINGS_SECTIONS } from '@/components/settings/settings-sections';

describe('PageHeader', () => {
  it('sin `back` no pinta enlace de vuelta', () => {
    render(<PageHeader title="Pacientes" />);
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('con `back` pinta «← Ajustes» encima del título (DX-282)', () => {
    render(<PageHeader title="Horarios" back={{ href: '/settings', label: 'Ajustes' }} />);
    const link = screen.getByRole('link', { name: 'Ajustes' });
    expect(link).toHaveAttribute('href', '/settings');
    // Antes que el h1 en el orden del documento: se lee «Ajustes › Horarios».
    const heading = screen.getByRole('heading', { level: 1, name: 'Horarios' });
    expect(link.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe('Pantallas de ajustes (DX-282)', () => {
  // Cada pantalla del índice vuelve al índice desde su cabecera: con
  // `PageHeader back={SETTINGS_BACK}` o con la plantilla `SettingsPage` (B6),
  // cuya vuelta por defecto es `SETTINGS_BACK`.
  const pages = SETTINGS_SECTIONS.flatMap((section) => section.entries.map((entry) => entry.href));

  it.each(pages)('%s enlaza «← Ajustes» en el PageHeader', (href) => {
    const file = path.join(process.cwd(), 'src/app/(app)', href, 'page.tsx');
    expect(readFileSync(file, 'utf8')).toMatch(/<PageHeader[^>]*\bback=\{SETTINGS_BACK\}|<SettingsPage\b(?![^>]*\bback=)/);
  });
});
