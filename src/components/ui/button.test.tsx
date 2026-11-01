import { render, screen } from '@testing-library/react';
import { Button, buttonVariants } from './button';

/**
 * DX-485 (FE-098): DESIGN.md → Buttons pide 44 px con `pointer: coarse` en
 * TODOS los tamaños; con puntero fino `sm` sigue en 32 px. jsdom no evalúa la
 * media query: se fija la receta; la medida real la hace
 * `e2e/touch-targets.spec.ts` (proyecto `touch`).
 */
const classes = (size: 'default' | 'sm' | 'lg' | 'icon' | 'icon-sm') =>
  buttonVariants({ size }).split(/\s+/);

describe('Button: objetivos táctiles', () => {
  it.each([
    ['default', 'pointer-coarse:h-11'],
    ['sm', 'pointer-coarse:h-11'],
    ['icon', 'pointer-coarse:size-11'],
    ['icon-sm', 'pointer-coarse:size-11'],
  ] as const)('%s mide 44 px en táctil (%s)', (size, coarse) => {
    expect(classes(size)).toContain(coarse);
    expect(classes(size).filter((c) => c.startsWith('pointer-coarse:'))).toEqual([coarse]);
  });

  it('lg ya mide 44 px con cualquier puntero', () => {
    expect(classes('lg')).toContain('h-11');
  });

  it('con puntero fino sm e icon-sm siguen en 32 px', () => {
    expect(classes('sm')).toContain('h-8');
    expect(classes('icon-sm')).toContain('size-8');
  });

  it('el tamaño llega también al enlace con buttonVariants', () => {
    render(
      <Button asChild size="sm">
        <a href="https://example.com">Abrir WhatsApp</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'Abrir WhatsApp' })).toHaveClass('h-8', 'pointer-coarse:h-11');
  });
});
