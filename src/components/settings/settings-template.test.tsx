import { act, fireEvent, render, renderHook, screen, within } from '@testing-library/react';
import { useAuthStore } from '@/lib/auth/auth-store';
import { SettingRow, SettingRows, SettingsPage, SettingsSection } from './settings-page';
import { SaveBar, useSettingsDraft } from './save-bar';
import { SettingsNav, SettingsShell, isActiveSettingsHref } from './settings-nav';

let mockPathname = '/settings/horarios';
jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

function tokenForRole(role: string): string {
  const part = (value: string) =>
    btoa(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${part('{"alg":"HS256"}')}.${part(JSON.stringify({ sub: 'u1', tenantId: 't1', role }))}.sig`;
}

describe('SettingsPage', () => {
  it('pinta «← Ajustes», el título, la línea de apoyo y el alcance', () => {
    render(
      <SettingsPage title="Horarios" description="Cuándo atiende la sede." scope="sede">
        <p>contenido</p>
      </SettingsPage>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Horarios' })).toBeInTheDocument();
    const back = screen.getByRole('link', { name: 'Ajustes' });
    expect(back).toHaveAttribute('href', '/settings');
    // En `xl` la sub-navegación sustituye a la vuelta.
    expect(back.className).toMatch(/xl:hidden/);
    expect(screen.getByText('Por sede')).toBeInTheDocument();
    expect(screen.getByText('Cuándo atiende la sede.')).toBeInTheDocument();
  });

  it('una vuelta a otra pantalla se ve siempre', () => {
    render(
      <SettingsPage title="Sede Norte" back={{ href: '/settings/sedes', label: 'Sedes' }}>
        <p>contenido</p>
      </SettingsPage>,
    );
    expect(screen.getByRole('link', { name: 'Sedes' }).className).not.toMatch(/xl:hidden/);
  });

  it('SettingsSection y SettingRow: sección con nombre, valor y «Por defecto»', () => {
    render(
      <SettingsSection title="Vigencia">
        <SettingRows>
          <SettingRow label="Meses" value="12 meses" isDefault action={<button type="button">Cambiar</button>} />
        </SettingRows>
      </SettingsSection>,
    );
    const region = screen.getByRole('region', { name: 'Vigencia' });
    expect(within(region).getByText('12 meses')).toBeInTheDocument();
    expect(within(region).getByText('Por defecto')).toBeInTheDocument();
    expect(within(region).getByRole('button', { name: 'Cambiar' })).toBeInTheDocument();
  });
});

describe('useSettingsDraft + SaveBar', () => {
  it('sin cambios no hay barra; con cambios, «Descartar» vuelve a lo guardado', () => {
    function Form() {
      const { draft, update, dirty, discard } = useSettingsDraft({ name: 'Ana' });
      return (
        <>
          <input aria-label="Nombre" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
          <SaveBar dirty={dirty} onDiscard={discard} onSave={() => undefined} />
        </>
      );
    }
    render(<Form />);
    expect(screen.queryByRole('region', { name: 'Cambios sin guardar' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Ana María' } });
    const bar = screen.getByRole('region', { name: 'Cambios sin guardar' });
    expect(within(bar).getByRole('button', { name: 'Guardar' })).toBeEnabled();
    fireEvent.click(within(bar).getByRole('button', { name: 'Descartar' }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ana');
    expect(screen.queryByRole('region', { name: 'Cambios sin guardar' })).not.toBeInTheDocument();
  });

  it('lo guardado que cambia por fuera solo pisa el borrador si no hay cambios', () => {
    const { result, rerender } = renderHook(({ saved }) => useSettingsDraft(saved), {
      initialProps: { saved: { n: 1 } },
    });
    rerender({ saved: { n: 2 } });
    expect(result.current.draft).toEqual({ n: 2 });
    act(() => result.current.update({ n: 5 }));
    rerender({ saved: { n: 3 } });
    expect(result.current.draft).toEqual({ n: 5 });
    expect(result.current.dirty).toBe(true);
    act(() => result.current.commit());
    expect(result.current.dirty).toBe(false);
  });

  it('con `form`, «Guardar» envía ese formulario', () => {
    render(<SaveBar dirty form="f1" onDiscard={() => undefined} />);
    const save = screen.getByRole('button', { name: 'Guardar' });
    expect(save).toHaveAttribute('type', 'submit');
    expect(save).toHaveAttribute('form', 'f1');
  });
});

describe('SettingsNav', () => {
  beforeEach(() => {
    act(() => useAuthStore.setState({ accessToken: tokenForRole('ADMIN') }));
  });

  it('marca la pantalla activa y agrupa como el índice', () => {
    mockPathname = '/settings/listas-de-precios/abc';
    render(<SettingsNav />);
    const nav = screen.getByRole('navigation', { name: 'Ajustes' });
    expect(within(nav).getByRole('link', { name: 'Listas de precios' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Ajustes' })).toHaveAttribute('href', '/settings');
    expect(within(nav).getByRole('list', { name: 'Herramientas y registros' })).toBeInTheDocument();
  });

  it('en el índice no hay sub-navegación', () => {
    mockPathname = '/settings';
    render(
      <SettingsShell>
        <p>índice</p>
      </SettingsShell>,
    );
    expect(screen.queryByRole('navigation', { name: 'Ajustes' })).not.toBeInTheDocument();
  });

  it('isActiveSettingsHref no confunde prefijos', () => {
    expect(isActiveSettingsHref('/settings/sedes/1', '/settings/sedes')).toBe(true);
    expect(isActiveSettingsHref('/settings/sedesx', '/settings/sedes')).toBe(false);
  });
});
