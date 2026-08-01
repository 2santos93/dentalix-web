import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Toaster } from './toaster';
import { notifyError } from './notify';

// Revisión final #2: sonner inyecta su hoja de estilos en `<head>` sin
// `@layer`, así que gana en la cascada a cualquier utilidad de Tailwind v4
// (todas viven en `@layer utilities`), sin importar especificidad. El
// arreglo usa el modificador `!` de Tailwind (`!bg-surface`, etc.), que es
// correcto por semántica de CSS — `!important` gana sea cual sea la capa —
// y por tanto NO depende de una comprobación visual.
//
// Lo que este test puede probar en jsdom: que esas clases `!`-prefijadas
// realmente llegan al DOM del toast (regresión si alguien las quita o las
// vuelve a dejar sin el prefijo). Lo que NO puede probar: que ganan la
// cascada real — jsdom no aplica la hoja de estilos runtime de sonner ni la
// de Tailwind, así que `getComputedStyle` aquí no reflejaría ese pulso en
// absoluto. Esa parte de la garantía viene de la semántica de `!important`
// del CSS, no de este test; verificarla visualmente requeriría un navegador.
describe('Toaster', () => {
  it('aplica los tokens de la app con el modificador `!` para ganarle a la hoja sin capa de sonner', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button onClick={() => notifyError('No se pudo cargar', { onRetry: () => {} })}>
          disparar
        </button>
        <Toaster />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'disparar' }));

    const toastText = await screen.findByText('No se pudo cargar');
    const toastEl = toastText.closest('[data-sonner-toast]');
    expect(toastEl).not.toBeNull();
    expect(toastEl).toHaveClass(
      '!rounded-xl',
      '!border',
      '!border-border',
      '!bg-surface',
      '!text-ink',
      '!border-danger/30',
    );

    const retryButton = screen.getByRole('button', { name: 'Reintentar' });
    expect(retryButton).toHaveClass(
      '!rounded-md',
      '!bg-primary',
      '!text-primary-foreground',
    );
  });

  // Fix round 2: `!shadow-lg` tapaba el `box-shadow` de `:focus-visible` de
  // sonner en TODOS los estados — el `<li>` del toast es focusable
  // (`tabIndex: 0`) y ese `box-shadow` era su único indicador de foco
  // (WCAG 2.4.7). `shadow-lg` va ahora SIN `!` — regresión: que no vuelva.
  it('no lleva `!shadow-lg` (taparía el único indicador de foco del toast)', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button onClick={() => notifyError('No se pudo cargar', { onRetry: () => {} })}>
          disparar
        </button>
        <Toaster />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'disparar' }));

    const toastText = await screen.findByText('No se pudo cargar');
    const toastEl = toastText.closest('[data-sonner-toast]');
    expect(toastEl).not.toHaveClass('!shadow-lg');
  });

  // Fix round 2: `!bg-surface` sin más gana en TODOS los estados, incluido
  // el `:hover` normal de sonner sobre `[data-close-button]` — el botón de
  // cerrar no daba realimentación al pasar el cursor. Regresión: que
  // `hover:!bg-surface-2` no desaparezca.
  it('el botón de cerrar lleva un fondo de hover propio', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button onClick={() => notifyError('No se pudo cargar', { onRetry: () => {} })}>
          disparar
        </button>
        <Toaster />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'disparar' }));
    await screen.findByText('No se pudo cargar');

    const closeButton = screen.getByRole('button', { name: 'Close toast' });
    expect(closeButton).toHaveClass('!border-border', '!bg-surface', '!text-muted', 'hover:!bg-surface-2');
  });
});
