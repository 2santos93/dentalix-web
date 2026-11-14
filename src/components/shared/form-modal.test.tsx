import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/lib/test/user';
import { DatePicker } from '@/components/ui/date-picker';
import { RadioGroup, RadioOption } from '@/components/ui/radio-group';
import { FormModal } from './form-modal';

describe('FormModal submitHint', () => {
  it('asocia el motivo visible a la acción deshabilitada y lo retira cuando deja de aplicar', () => {
    const props = { open: true, onOpenChange: jest.fn(), title: 'Receta', onSubmit: jest.fn() };
    const { rerender } = render(<FormModal {...props} submitDisabled submitHint="Confirma los avisos.">Campos</FormModal>);
    const submit = screen.getByRole('button', { name: 'Guardar' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAccessibleDescription('Confirma los avisos.');
    expect(screen.getByText('Confirma los avisos.')).toBeVisible();
    rerender(<FormModal {...props}>Campos</FormModal>);
    expect(submit).toBeEnabled();
    expect(submit).not.toHaveAttribute('aria-describedby');
    expect(screen.queryByText('Confirma los avisos.')).not.toBeInTheDocument();
  });
});

describe('FormModal submitHint: hueco estable', () => {
  const props = { open: true, onOpenChange: jest.fn(), title: 'Receta', onSubmit: jest.fn() };

  it('con submitHint (aunque sea null) conserva el mismo hueco reservado y solo asocia texto real', () => {
    const { rerender } = render(<FormModal {...props} submitDisabled submitHint="Espera la comprobación.">Campos</FormModal>);
    const hint = screen.getByText('Espera la comprobación.');
    // Reserva dos líneas en móvil y una desde sm: aparecer o vaciarse no mueve el pie.
    expect(hint).toHaveClass('min-h-10', 'sm:min-h-5');
    rerender(<FormModal {...props} submitHint={null}>Campos</FormModal>);
    expect(hint).toBeInTheDocument();
    expect(hint).toBeEmptyDOMElement();
    expect(hint).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByRole('button', { name: 'Guardar' })).not.toHaveAttribute('aria-describedby');
    rerender(<FormModal {...props} submitDisabled submitHint="Confirma los avisos.">Campos</FormModal>);
    expect(hint).toHaveTextContent('Confirma los avisos.');
    expect(hint).not.toHaveAttribute('aria-hidden');
    expect(screen.getByRole('button', { name: 'Guardar' })).toHaveAccessibleDescription('Confirma los avisos.');
  });

  it('sin la prop no reserva hueco: los demás formularios no cambian', () => {
    render(<FormModal {...props}>Campos</FormModal>);
    expect(screen.getByRole('dialog').querySelector('form > div:last-child > p')).toBeNull();
  });
});

describe('FormModal: validación propia antes que la del navegador', () => {
  const base = { open: true, onOpenChange: jest.fn(), title: 'Sede' };

  it('el formulario es noValidate y un radio required no bloquea el envío', async () => {
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    const user = setupUser();
    render(
      <FormModal {...base} onSubmit={onSubmit}>
        <RadioGroup id="fmt" legend="Formato" value="" onValueChange={() => {}} required>
          <RadioOption value="a" label="A" />
        </RadioGroup>
      </FormModal>,
    );
    expect(screen.getByRole('dialog').querySelector('form')).toHaveAttribute('novalidate');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('un campo de texto required sin validación propia conserva la red del navegador', async () => {
    const onSubmit = jest.fn((e: React.FormEvent) => e.preventDefault());
    const user = setupUser();
    const { rerender } = render(
      <FormModal {...base} onSubmit={onSubmit}>
        <input aria-label="Nombre" required />
      </FormModal>,
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).not.toHaveBeenCalled();
    // Con `ownValidation` el formulario decide (y pinta el error junto al campo).
    rerender(
      <FormModal {...base} onSubmit={onSubmit} ownValidation>
        <input aria-label="Nombre" required />
      </FormModal>,
    );
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('FormModal en el teléfono', () => {
  const base = { open: true, onOpenChange: jest.fn(), title: 'Cita', onSubmit: jest.fn() };

  it('por defecto es hoja a pantalla completa bajo sm, con el pie pegado abajo', () => {
    render(<FormModal {...base}>Campos</FormModal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('data-fullscreen-mobile', 'true');
    expect(dialog).toHaveClass('max-sm:h-dvh', 'max-sm:rounded-none');
    const footer = dialog.querySelector('[data-slot="form-modal-footer"]');
    expect(footer).toHaveClass('max-sm:sticky', 'max-sm:bottom-0');
  });

  it('fullScreenOnMobile={false} lo deja flotante', () => {
    render(<FormModal {...base} fullScreenOnMobile={false}>Campos</FormModal>);
    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveAttribute('data-fullscreen-mobile');
    expect(dialog).not.toHaveClass('max-sm:h-dvh');
    expect(dialog.querySelector('[data-slot="form-modal-footer"]')).not.toHaveClass('max-sm:sticky');
  });
});

describe('FormModal errorRetry (QA DX-470)', () => {
  const props = { open: true, onOpenChange: jest.fn(), title: 'Urgencia', onSubmit: jest.fn() };

  it('el banner ofrece «Reintentar» solo si se pide; deshabilitado mientras envía', () => {
    const onRetry = jest.fn();
    const { rerender } = render(<FormModal {...props} error="Sin conexión">Campos</FormModal>);
    expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeInTheDocument();
    rerender(
      <FormModal {...props} error="Sin conexión" errorRetry={{ label: 'Reintentar', onRetry }}>
        Campos
      </FormModal>,
    );
    screen.getByRole('button', { name: 'Reintentar' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(props.onSubmit).not.toHaveBeenCalled();
    rerender(
      <FormModal {...props} submitting error="Sin conexión" errorRetry={{ label: 'Reintentar', onRetry }}>
        Campos
      </FormModal>,
    );
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeDisabled();
  });
});

describe('FormModal: no se cierra mientras envía (DX-316-bis)', () => {
  it('con submitting, Escape y la X no cierran; sin él, Escape sí', async () => {
    const onOpenChange = jest.fn();
    const props = { open: true, onOpenChange, title: 'Festivo', onSubmit: jest.fn() };
    const { rerender } = render(
      <FormModal {...props} submitting>
        Campos
      </FormModal>,
    );
    const user = setupUser();
    await user.keyboard('{Escape}');
    const close = screen.getByRole('button', { name: 'Cerrar' });
    expect(close).toHaveAttribute('aria-disabled', 'true');
    await user.click(close);
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    rerender(<FormModal {...props}>Campos</FormModal>);
    await user.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('FormModal touchTargets (DX-394)', () => {
  const props = { open: true, onOpenChange: jest.fn(), title: 'Registrar abono', onSubmit: jest.fn() };

  it('en móvil, los botones del pie y «Cerrar» miden 44 px; en escritorio no cambian', () => {
    render(<FormModal {...props} touchTargets>Campos</FormModal>);
    const dialog = screen.getByRole('dialog');
    // Todo botón del modal (Cancelar, Guardar, los de dentro) con altura mínima de 44 px bajo `sm`.
    expect(dialog.className).toContain('max-sm:[&_button]:min-h-11');
    expect(screen.getByRole('button', { name: 'Cerrar' }).className).toContain('max-sm:size-11');
    // El tamaño táctil va siempre tras `max-sm:`: ninguna clase de alto/ancho de 44 px sin prefijo (escritorio intacto).
    const unprefixed = screen.getByRole('button', { name: 'Cerrar' }).className.split(/\s+/).filter((c) => /^(size|h|w|min-h)-11$/.test(c));
    expect(unprefixed).toEqual([]);
  });

  it('sin touchTargets no se fuerza la altura de los botones', () => {
    render(<FormModal {...props}>Campos</FormModal>);
    expect(screen.getByRole('dialog').className).not.toContain('min-h-11');
  });
});

describe('FormModal submitBusy', () => {
  it('la acción queda ocupada y desactivada sin bloquear Cancelar', () => {
    const props = { open: true, onOpenChange: jest.fn(), title: 'Salida', onSubmit: jest.fn() };
    render(
      <FormModal {...props} submitBusy submitLabel="Cargando…">
        Campos
      </FormModal>,
    );
    const submit = screen.getByRole('button', { name: 'Cargando…' });
    expect(submit).toBeDisabled();
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('button', { name: 'Cancelar' })).toBeEnabled();
  });
});

describe('FormModal ownValidation: foco en el primer error (DX-546 · FE-113)', () => {
  function Harness({ focusSecond = false }: { focusSecond?: boolean }) {
    const [invalid, setInvalid] = React.useState(false);
    const secondRef = React.useRef<HTMLInputElement>(null);
    return (
      <FormModal
        open
        onOpenChange={() => {}}
        title="Prueba"
        ownValidation
        onSubmit={(e) => {
          e.preventDefault();
          setInvalid(true);
          if (focusSecond) secondRef.current?.focus();
        }}
      >
        <DatePicker
          id="fm-date"
          label="Fecha"
          value={null}
          onChange={() => {}}
          aria-invalid={invalid ? true : undefined}
        />
        <label htmlFor="fm-text">Texto</label>
        <input id="fm-text" ref={secondRef} aria-invalid={invalid ? true : undefined} />
      </FormModal>
    );
  }

  it('lleva el foco a lo primero enfocable del primer campo inválido (un segmento del DatePicker)', async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    const group = screen.getByRole('group', { name: 'Fecha' });
    expect(group).toContainElement(document.activeElement as HTMLElement);
  });

  it('si la pantalla ya llevó el foco a un campo inválido, no se lo quita', async () => {
    const user = setupUser();
    render(<Harness focusSecond />);
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(screen.getByLabelText('Texto')).toHaveFocus();
  });
});
