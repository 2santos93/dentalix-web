import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Disclosure } from './disclosure';

describe('Disclosure', () => {
  it('nace plegado y no monta su contenido', () => {
    render(
      <Disclosure summary="Abonos y saldo" meta="3 abonos">
        <p>detalle</p>
      </Disclosure>,
    );
    expect(screen.getByRole('button', { name: /abonos y saldo/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByText('detalle')).not.toBeInTheDocument();
  });

  it('deja legible el dato que decide si hace falta abrirlo, incluso plegado', () => {
    render(
      <Disclosure summary="Abonos y saldo" meta="3 abonos">
        <p>detalle</p>
      </Disclosure>,
    );
    expect(screen.getByText('3 abonos')).toBeInTheDocument();
  });

  it('abre y cierra al pulsar, montando y desmontando el contenido', async () => {
    const user = userEvent.setup();
    render(
      <Disclosure summary="Abonos y saldo">
        <p>detalle</p>
      </Disclosure>,
    );
    const trigger = screen.getByRole('button', { name: /abonos y saldo/i });

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('detalle')).toBeInTheDocument();

    await user.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('detalle')).not.toBeInTheDocument();
  });

  it('respeta defaultOpen', () => {
    render(
      <Disclosure summary="Abonos y saldo" defaultOpen>
        <p>detalle</p>
      </Disclosure>,
    );
    expect(screen.getByText('detalle')).toBeInTheDocument();
  });

  it('su `aria-controls` resuelve también plegado, para que la relación no cuelgue', () => {
    // Misma razón que el `TabPanel` de la ficha: la región existe siempre en el
    // DOM (`hidden` cuando está cerrada) y solo sus hijos son perezosos.
    const { container } = render(
      <Disclosure summary="Abonos y saldo">
        <p>detalle</p>
      </Disclosure>,
    );
    const controls = screen
      .getByRole('button', { name: /abonos y saldo/i })
      .getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(container.querySelector(`#${CSS.escape(controls!)}`)).toBeInTheDocument();
  });

  it('el disparador cumple el objetivo táctil mínimo', () => {
    render(
      <Disclosure summary="Abonos y saldo">
        <p>detalle</p>
      </Disclosure>,
    );
    expect(screen.getByRole('button', { name: /abonos y saldo/i }).className).toContain('min-h-11');
  });
});
