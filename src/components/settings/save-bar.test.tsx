import * as React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SaveBar, saveBarCopy, useSettingsDraft } from './save-bar';

jest.mock('./unsaved-changes', () => ({ useUnsavedChanges: jest.fn() }));

/**
 * Un formulario mínimo con la barra al final, como los de Ajustes: «Guardar»
 * envía el formulario; el guardado tarda (la barra pasa por «Guardando…») y,
 * al terminar, `commit` deja el borrador limpio y la barra se va.
 */
function Harness({
  save = () => Promise.resolve(),
  savedMessage,
  withReturnTarget = false,
}: {
  save?: () => Promise<void>;
  savedMessage?: string;
  withReturnTarget?: boolean;
}) {
  const { draft, setDraft, dirty, discard, commit } = useSettingsDraft('Clínica Norte');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save();
      commit();
    } catch {
      setError('No pudimos guardar.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <div>
      <h2 ref={headingRef} tabIndex={-1}>
        Datos de la clínica
      </h2>
      <form id="clinic-form" aria-label="Datos de la clínica" onSubmit={(e) => void submit(e)} noValidate>
        <label htmlFor="clinic-name">Nombre</label>
        <input id="clinic-name" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <SaveBar
          dirty={dirty}
          saving={saving}
          error={error}
          form="clinic-form"
          onDiscard={discard}
          savedMessage={savedMessage}
          returnFocusTo={withReturnTarget ? headingRef : undefined}
        />
      </form>
    </div>
  );
}

const nameField = () => screen.getByLabelText('Nombre');
const form = () => screen.getByRole('form', { name: 'Datos de la clínica' });

describe('SaveBar: a dónde va el foco cuando la barra se va (DX-546 · FE-110)', () => {
  it('tras «Guardar», el foco vuelve al formulario (no a <body>) y se anuncia el resultado', async () => {
    const user = userEvent.setup();
    render(<Harness savedMessage="Datos de la clínica guardados." />);
    await user.type(nameField(), ' Centro');
    await user.click(screen.getByRole('button', { name: saveBarCopy.save }));
    await waitFor(() => expect(screen.queryByRole('button', { name: saveBarCopy.save })).not.toBeInTheDocument());
    expect(document.body).not.toHaveFocus();
    expect(form()).toHaveFocus();
    expect(screen.getByText('Datos de la clínica guardados.')).toBeInTheDocument();
  });

  it('tras «Descartar», el foco vuelve al formulario y se anuncia que se descartaron los cambios', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(nameField(), ' Centro');
    await user.click(screen.getByRole('button', { name: saveBarCopy.discard }));
    expect(nameField()).toHaveValue('Clínica Norte');
    expect(document.body).not.toHaveFocus();
    expect(form()).toHaveFocus();
    expect(screen.getByText(saveBarCopy.discarded)).toBeInTheDocument();
  });

  it('con el teclado: Enter en «Guardar» deja el foco en el formulario', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(nameField(), ' Centro');
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: saveBarCopy.save })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(form()).toHaveFocus());
  });

  it('con `returnFocusTo`, el foco va a ese elemento', async () => {
    const user = userEvent.setup();
    render(<Harness withReturnTarget />);
    await user.type(nameField(), ' Centro');
    await user.click(screen.getByRole('button', { name: saveBarCopy.discard }));
    expect(screen.getByRole('heading', { name: 'Datos de la clínica' })).toHaveFocus();
  });

  it('sin `savedMessage` (la pantalla anuncia su guardado) la barra no repite el aviso', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.type(nameField(), ' Centro');
    await user.click(screen.getByRole('button', { name: saveBarCopy.save }));
    await waitFor(() => expect(form()).toHaveFocus());
    expect(screen.queryByText(saveBarCopy.discarded)).not.toBeInTheDocument();
  });

  it('si el guardado falla, la barra sigue y el foco no se pierde: vuelve a «Guardar» para reintentar', async () => {
    const user = userEvent.setup();
    let reject: (reason: Error) => void = () => undefined;
    render(<Harness save={() => new Promise<void>((_, r) => (reject = r))} />);
    await user.type(nameField(), ' Centro');
    await user.click(screen.getByRole('button', { name: saveBarCopy.save }));
    // Mientras guarda, el botón está deshabilitado y el navegador suelta el foco.
    act(() => (document.activeElement as HTMLElement | null)?.blur());
    await act(async () => reject(new Error('500')));
    expect(await screen.findByText('No pudimos guardar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: saveBarCopy.save })).toHaveFocus();
  });

  it('si la persona deshace a mano lo que escribió, el foco sigue en su campo y no se anuncia nada', async () => {
    const user = userEvent.setup();
    render(<Harness savedMessage="Datos de la clínica guardados." />);
    await user.type(nameField(), 'x');
    await user.keyboard('{Backspace}');
    expect(screen.queryByRole('button', { name: saveBarCopy.save })).not.toBeInTheDocument();
    expect(nameField()).toHaveFocus();
    expect(screen.queryByText('Datos de la clínica guardados.')).not.toBeInTheDocument();
    expect(screen.queryByText(saveBarCopy.discarded)).not.toBeInTheDocument();
  });
});
