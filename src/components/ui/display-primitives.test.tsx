import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Callout } from './callout';
import { DescriptionItem, DescriptionList } from './description-list';
import { Avatar } from './avatar';
import { SectionHeader } from './section-header';
import { Tooltip } from './tooltip';
import { Popover, PopoverContent, PopoverTrigger } from './popover';
import { initials } from '@/lib/format/initials';

describe('Callout', () => {
  it('tono, título, cuerpo y acción; el aviso usa role=status y nunca el acento', () => {
    render(
      <Callout tone="warning" title="Anamnesis por revisar" action={<button>Revisar</button>}>
        El paciente envió cambios.
      </Callout>,
    );
    const box = screen.getByRole('status');
    expect(box).toHaveAttribute('data-tone', 'warning');
    expect(box.className).toContain('bg-warning-subtle');
    expect(box.className).not.toMatch(/primary/);
    expect(screen.getByText('Anamnesis por revisar')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revisar' })).toBeInTheDocument();
  });

  it('info no es región viva; el rol se puede forzar; el icono se puede quitar', () => {
    const { container, rerender } = render(<Callout tone="info">Nota</Callout>);
    expect(screen.queryByRole('status')).toBeNull();
    expect(container.querySelector('svg')).toBeInTheDocument();
    rerender(<Callout tone="danger" role="alert" icon={null}>Bloqueado</Callout>);
    expect(screen.getByRole('alert')).toHaveTextContent('Bloqueado');
    expect(container.querySelector('svg')).toBeNull();
  });
});

describe('DescriptionList', () => {
  it('pares dt/dd con etiqueta t-overline y valor tabular cuando es numérico', () => {
    render(
      <DescriptionList columns={3}>
        <DescriptionItem label="Documento">V-12.345.678</DescriptionItem>
        <DescriptionItem label="Saldo" numeric>
          $ 120,00
        </DescriptionItem>
      </DescriptionList>,
    );
    const term = screen.getByText('Documento');
    expect(term.tagName).toBe('DT');
    expect(term).toHaveClass('t-overline');
    expect(screen.getByText('$ 120,00')).toHaveClass('t-data');
    expect(term.closest('dl')!.className).toContain('lg:grid-cols-3');
  });

  it('inline: rejilla de dos columnas etiqueta | valor', () => {
    const { container } = render(
      <DescriptionList layout="inline">
        <DescriptionItem label="Método">Efectivo</DescriptionItem>
      </DescriptionList>,
    );
    expect(container.querySelector('dl')).toHaveAttribute('data-layout', 'inline');
  });
});

describe('Avatar + initials', () => {
  it('iniciales neutras, nunca el acento', () => {
    const { container } = render(<Avatar initials={initials('María José', 'Pérez')} />);
    const el = container.firstChild as HTMLElement;
    expect(el).toHaveTextContent('MP');
    expect(el.className).toContain('bg-surface-active');
    expect(el.className).not.toMatch(/primary/);
    expect(el).toHaveAttribute('aria-hidden', 'true');
  });

  it('initials con nombre completo usa las dos primeras palabras', () => {
    expect(initials('ana lucía torres')).toBe('AL');
    expect(initials('  ')).toBe('');
    expect(initials('Ñ', 'Ávila')).toBe('ÑÁ');
  });

  it('con foto la muestra; si falla vuelve a las iniciales', () => {
    const { container } = render(<Avatar initials="AB" src="/x.png" alt="Ana Bello" size="xl" />);
    const img = container.querySelector('img')!;
    expect(img).toHaveAttribute('alt', 'Ana Bello');
    fireEvent.error(img);
    expect(container.querySelector('img')).toBeNull();
    expect(container.firstChild).toHaveTextContent('AB');
  });
});

describe('SectionHeader', () => {
  it('título t-title con el nivel pedido, descripción y acciones', () => {
    render(<SectionHeader as="h3" title="Coberturas" description="Seguros y planes" actions={<button>Añadir</button>} />);
    const h = screen.getByRole('heading', { level: 3, name: 'Coberturas' });
    expect(h).toHaveClass('t-title');
    expect(screen.getByText('Seguros y planes')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir' })).toBeInTheDocument();
  });
});

describe('Tooltip', () => {
  it('aparece al enfocar con teclado y el disparador conserva su nombre', async () => {
    const user = userEvent.setup();
    render(
      <Tooltip content="Lista de espera">
        <button aria-label="Lista de espera">i</button>
      </Tooltip>,
    );
    await user.tab();
    expect(screen.getByRole('button', { name: 'Lista de espera' })).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('Lista de espera');
  });
});

describe('Popover', () => {
  it('abre al pulsar, con superficie y sombra de capa, y cierra con Escape', async () => {
    const user = userEvent.setup();
    render(
      <Popover>
        <PopoverTrigger>Filtros</PopoverTrigger>
        <PopoverContent aria-label="Filtros">Contenido</PopoverContent>
      </Popover>,
    );
    await user.click(screen.getByRole('button', { name: 'Filtros' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.className).toContain('shadow-overlay');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});
