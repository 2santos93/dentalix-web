import * as React from 'react';
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  GUARD_STATE_KEY,
  UnsavedChangesGuard,
  hasUnsavedChanges,
  requestNavigation,
  resetUnsavedChangesForTests,
  unsavedChangesCopy,
  useUnsavedChanges,
} from './unsaved-changes';
import { useSettingsDraft } from './save-bar';

const push = jest.fn();
const replace = jest.fn();
let pathname = '/settings/recetas';
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace }),
  usePathname: () => pathname,
}));

/** Una pantalla de ajustes con un borrador y enlaces de la app. */
function Screen({ initialDirty = false }: { initialDirty?: boolean }) {
  const { draft, update, dirty, discard } = useSettingsDraft({ name: 'A' });
  React.useEffect(() => {
    if (initialDirty) update({ name: 'B' });
  }, [initialDirty, update]);
  return (
    <div>
      <input aria-label="Nombre" value={draft.name} onChange={(e) => update({ name: e.target.value })} />
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- hace de <Link> sin el router real */}
      <a
        href="/patients"
        onClick={(e) => {
          // Lo que hace <Link>: navegación del router.
          e.preventDefault();
          push('/patients');
        }}
      >
        Pacientes
      </a>
      <a href="/settings/recetas#plantillas">Ancla</a>
      <a href="/patients" target="_blank">
        Otra pestaña
      </a>
      <a href="https://example.org/ayuda">Fuera</a>
      {dirty ? (
        <button type="button" onClick={discard}>
          Descartar
        </button>
      ) : null}
      <UnsavedChangesGuard />
    </div>
  );
}

function popTo(state: unknown) {
  act(() => {
    window.dispatchEvent(new PopStateEvent('popstate', { state }));
  });
}

beforeEach(() => {
  push.mockReset();
  replace.mockReset();
  pathname = '/settings/recetas';
  resetUnsavedChangesForTests();
  window.history.replaceState({ __NA: true }, '', '/settings/recetas');
});

describe('useUnsavedChanges', () => {
  it('registra la fuente solo mientras hay cambios y avisa al cerrar la pestaña', () => {
    const add = jest.spyOn(window, 'addEventListener');
    const { rerender, unmount } = renderHook(({ dirty }) => useUnsavedChanges(dirty), {
      initialProps: { dirty: false },
    });
    expect(hasUnsavedChanges()).toBe(false);
    rerender({ dirty: true });
    expect(hasUnsavedChanges()).toBe(true);
    expect(add).toHaveBeenCalledWith('beforeunload', expect.any(Function));
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    unmount();
    expect(hasUnsavedChanges()).toBe(false);
    add.mockRestore();
  });

  it('varias fuentes se suman: basta una con cambios', () => {
    const a = renderHook(() => useUnsavedChanges(true));
    const b = renderHook(() => useUnsavedChanges(true));
    a.unmount();
    expect(hasUnsavedChanges()).toBe(true);
    b.unmount();
    expect(hasUnsavedChanges()).toBe(false);
  });
});

describe('UnsavedChangesGuard', () => {
  it('sin cambios no se mete en nada: el enlace navega y no hay centinela', async () => {
    const user = userEvent.setup();
    render(<Screen />);
    await user.click(screen.getByRole('link', { name: 'Pacientes' }));
    expect(push).toHaveBeenCalledWith('/patients');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(window.history.state?.[GUARD_STATE_KEY]).toBeUndefined();
  });

  it('con cambios, un enlace de la app pregunta; «Seguir editando» no navega y conserva lo escrito', async () => {
    const user = userEvent.setup();
    render(<Screen />);
    await user.type(screen.getByLabelText('Nombre'), 'x');
    await user.click(screen.getByRole('link', { name: 'Pacientes' }));
    expect(push).not.toHaveBeenCalled();
    const dialog = screen.getByRole('dialog', { name: unsavedChangesCopy.title });
    expect(dialog).toHaveTextContent(unsavedChangesCopy.description);
    await user.click(screen.getByRole('button', { name: unsavedChangesCopy.stay }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nombre')).toHaveValue('Ax');
  });

  it('«Salir sin guardar» baja en silencio por debajo del centinela y repite el clic', async () => {
    const user = userEvent.setup();
    const routerPop = jest.fn();
    window.addEventListener('popstate', routerPop);
    render(<Screen />);
    await user.type(screen.getByLabelText('Nombre'), 'x');
    // Al haber cambios se apila el centinela con la misma URL.
    expect(window.history.state?.[GUARD_STATE_KEY]).toBe(true);
    expect(window.history.state?.__NA).toBe(true);
    expect(window.location.pathname).toBe('/settings/recetas');
    await user.click(screen.getByRole('link', { name: 'Pacientes' }));
    expect(push).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: unsavedChangesCopy.leave }));
    // El enlace navega (su propio onClick, como <Link>) desde la entrada de
    // debajo: sin entrada duplicada y sin que el router vea la vuelta.
    await waitFor(() => expect(push).toHaveBeenCalledWith('/patients'));
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.history.state?.[GUARD_STATE_KEY]).toBeUndefined();
    expect(routerPop).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    window.removeEventListener('popstate', routerPop);
  });

  it('no para lo que no sale de la pantalla ni lo que abre otra pestaña u otro sitio', async () => {
    render(<Screen initialDirty />);
    expect(hasUnsavedChanges()).toBe(true);
    const click = (name: string, init: MouseEventInit = {}) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
      // jsdom navegaría de verdad: se corta en la burbuja, tras la guarda.
      const stop = (e: Event) => e.preventDefault();
      document.addEventListener('click', stop);
      screen.getByRole('link', { name }).dispatchEvent(event);
      document.removeEventListener('click', stop);
    };
    act(() => click('Ancla'));
    act(() => click('Otra pestaña'));
    act(() => click('Fuera'));
    act(() => click('Pacientes', { metaKey: true }));
    act(() => click('Pacientes', { ctrlKey: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('tras «Descartar» el enlace vuelve a navegar sin preguntar', async () => {
    const user = userEvent.setup();
    render(<Screen />);
    await user.type(screen.getByLabelText('Nombre'), 'x');
    await user.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(hasUnsavedChanges()).toBe(false);
    await user.click(screen.getByRole('link', { name: 'Pacientes' }));
    expect(push).toHaveBeenCalledWith('/patients');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('«Atrás» del navegador pregunta sin que el router se entere; «Seguir editando» vuelve a armar', async () => {
    const user = userEvent.setup();
    const routerPop = jest.fn();
    window.addEventListener('popstate', routerPop);
    render(<Screen />);
    await user.type(screen.getByLabelText('Nombre'), 'x');
    // Bajar del centinela a la entrada de debajo (misma URL, sin la marca):
    // el «Atrás» real de jsdom.
    act(() => window.history.back());
    expect(await screen.findByRole('dialog', { name: unsavedChangesCopy.title })).toBeInTheDocument();
    expect(window.history.state?.[GUARD_STATE_KEY]).toBeUndefined();
    expect(routerPop).not.toHaveBeenCalled();
    const pushState = jest.spyOn(window.history, 'pushState');
    await user.click(screen.getByRole('button', { name: unsavedChangesCopy.stay }));
    expect(pushState).toHaveBeenCalledWith(expect.objectContaining({ [GUARD_STATE_KEY]: true }), '');
    pushState.mockRestore();
    window.removeEventListener('popstate', routerPop);
  });

  it('«Atrás» y «Salir sin guardar» hacen el history.back() de verdad, que ya no se para', async () => {
    const user = userEvent.setup();
    const routerPop = jest.fn();
    window.addEventListener('popstate', routerPop);
    const back = jest.spyOn(window.history, 'back').mockImplementation(() => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { __NA: true } }));
    });
    render(<Screen />);
    await user.type(screen.getByLabelText('Nombre'), 'x');
    popTo({ __NA: true });
    await user.click(screen.getByRole('button', { name: unsavedChangesCopy.leave }));
    expect(back).toHaveBeenCalledTimes(1);
    expect(routerPop).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    back.mockRestore();
    window.removeEventListener('popstate', routerPop);
  });

  it('volver al centinela desde una capa (⌘K, «Más») no pregunta', async () => {
    const user = userEvent.setup();
    render(<Screen />);
    await user.type(screen.getByLabelText('Nombre'), 'x');
    popTo({ __NA: true, [GUARD_STATE_KEY]: true });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('requestNavigation (⌘K): con cambios pregunta y navega al confirmar; sin cambios, no', async () => {
    const user = userEvent.setup();
    render(<Screen />);
    expect(requestNavigation('/agenda')).toBe(false);
    await user.type(screen.getByLabelText('Nombre'), 'x');
    let taken = false;
    act(() => {
      taken = requestNavigation('/agenda');
    });
    expect(taken).toBe(true);
    await user.click(screen.getByRole('button', { name: unsavedChangesCopy.leave }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/agenda'));
    expect(window.history.state?.[GUARD_STATE_KEY]).toBeUndefined();
  });
});
