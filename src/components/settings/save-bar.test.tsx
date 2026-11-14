import * as React from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SaveBar, saveBarCopy, useSettingsDraft } from './save-bar';
import { SettingsPage, SettingsSection } from './settings-page';

jest.mock('./unsaved-changes', () => ({ useUnsavedChanges: jest.fn() }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

/**
 * Un formulario mínimo con la barra al final, como los de Ajustes: «Guardar»
 * envía el formulario; el guardado tarda (la barra pasa por «Guardando…») y,
 * al terminar, `commit` deja el borrador limpio y la barra se va.
 */
function ClinicForm({
  save = () => Promise.resolve(),
  savedMessage,
  noticeOnSave = false,
}: {
  save?: () => Promise<void>;
  savedMessage?: string;
  noticeOnSave?: boolean;
}) {
  const { draft, setDraft, dirty, discard, commit } = useSettingsDraft('Clínica Norte');
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState('');
  const noticeRef = React.useRef<HTMLParagraphElement>(null);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await save();
      commit();
      setNotice('Datos guardados.');
    } catch {
      setError('No pudimos guardar.');
    } finally {
      setSaving(false);
    }
  }
  return (
    <form id="clinic-form" onSubmit={(e) => void submit(e)} noValidate>
      <label htmlFor="clinic-name">Nombre</label>
      <input id="clinic-name" value={draft} onChange={(e) => setDraft(e.target.value)} />
      <p ref={noticeRef} role="status" tabIndex={-1}>
        {notice}
      </p>
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        form="clinic-form"
        onDiscard={() => {
          discard();
          setNotice('');
        }}
        savedMessage={savedMessage}
        savedFocusTo={noticeOnSave ? noticeRef : undefined}
      />
    </form>
  );
}

function renderInSection(props: React.ComponentProps<typeof ClinicForm> = {}) {
  return render(
    <SettingsPage title="Datos de la clínica">
      <SettingsSection title="Identidad">
        <ClinicForm {...props} />
      </SettingsSection>
    </SettingsPage>,
  );
}

const nameField = () => screen.getByLabelText('Nombre');
const sectionTitle = () => screen.getByRole('heading', { level: 2, name: 'Identidad' });
const liveRegion = (container: HTMLElement) => container.querySelector<HTMLElement>('[aria-live="polite"]')!;

describe('SaveBar: a dónde va el foco cuando la barra se va (DX-546 · FE-110)', () => {
  it('tras «Guardar», el foco va al título de su sección (con nombre, no a <body> ni a un contenedor) y se anuncia', async () => {
    const user = userEvent.setup();
    renderInSection({ savedMessage: 'Datos de la clínica guardados.' });
    await user.type(nameField(), ' Centro');
    await user.click(screen.getByRole('button', { name: saveBarCopy.save }));
    await waitFor(() => expect(screen.queryByRole('button', { name: saveBarCopy.save })).not.toBeInTheDocument());
    expect(document.body).not.toHaveFocus();
    expect(sectionTitle()).toHaveFocus();
    expect(screen.getByText('Datos de la clínica guardados.')).toBeInTheDocument();
  });

  it('tras «Descartar», el foco va al título de la sección y se anuncia que se descartaron los cambios', async () => {
    const user = userEvent.setup();
    renderInSection();
    await user.type(nameField(), ' Centro');
    await user.click(screen.getByRole('button', { name: saveBarCopy.discard }));
    expect(nameField()).toHaveValue('Clínica Norte');
    expect(sectionTitle()).toHaveFocus();
    expect(screen.getByText(saveBarCopy.discarded)).toBeInTheDocument();
  });

  it('el destino se declara en JSX (tabIndex=-1) y conserva el anillo de foco del producto', () => {
    renderInSection();
    const title = sectionTitle();
    expect(title).toHaveAttribute('tabindex', '-1');
    expect(title).not.toHaveClass('outline-none');
    expect(title).toHaveClass('focus-visible:outline-2', 'focus-visible:outline-primary-text');
  });

  it('el formulario no se toca: ni tabindex ni clases añadidas por la barra', async () => {
    const user = userEvent.setup();
    const { container } = renderInSection();
    await user.type(nameField(), ' Centro');
    await user.click(screen.getByRole('button', { name: saveBarCopy.discard }));
    const form = container.querySelector('form')!;
    expect(form).not.toHaveAttribute('tabindex');
    expect(form).not.toHaveClass('outline-none');
  });

  it('fuera de una sección, el foco va al título de la página (h1)', async () => {
    const user = userEvent.setup();
    render(
      <SettingsPage title="Datos de la clínica">
        <ClinicForm />
      </SettingsPage>,
    );
    await user.type(nameField(), ' Centro');
    await user.click(screen.getByRole('button', { name: saveBarCopy.discard }));
    expect(screen.getByRole('heading', { level: 1, name: 'Datos de la clínica' })).toHaveFocus();
  });

  it('con `savedFocusTo`, tras guardar el foco va a ese aviso; tras descartar, al título', async () => {
    const user = userEvent.setup();
    renderInSection({ noticeOnSave: true });
    await user.type(nameField(), ' Centro');
    await user.click(screen.getByRole('button', { name: saveBarCopy.save }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent('Datos guardados.');
    await user.type(nameField(), ' Sur');
    await user.click(screen.getByRole('button', { name: saveBarCopy.discard }));
    expect(sectionTitle()).toHaveFocus();
  });

  it('con el teclado: Enter en «Guardar» deja el foco en el título de la sección', async () => {
    const user = userEvent.setup();
    renderInSection();
    await user.type(nameField(), ' Centro');
    await user.tab();
    await user.tab();
    expect(screen.getByRole('button', { name: saveBarCopy.save })).toHaveFocus();
    await user.keyboard('{Enter}');
    await waitFor(() => expect(sectionTitle()).toHaveFocus());
  });

  it('sin `savedMessage` (la pantalla anuncia su guardado) la región viva de la barra queda vacía', async () => {
    const user = userEvent.setup();
    const { container } = renderInSection();
    await user.type(nameField(), ' Centro');
    await user.click(screen.getByRole('button', { name: saveBarCopy.save }));
    await waitFor(() => expect(sectionTitle()).toHaveFocus());
    expect(liveRegion(container)).toBeEmptyDOMElement();
  });

  it('si el guardado falla, la barra sigue y el foco no se pierde: vuelve a «Guardar» para reintentar', async () => {
    const user = userEvent.setup();
    let reject: (reason: Error) => void = () => undefined;
    renderInSection({ save: () => new Promise<void>((_, r) => (reject = r)) });
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
    const { container } = renderInSection({ savedMessage: 'Datos de la clínica guardados.' });
    await user.type(nameField(), 'x');
    await user.keyboard('{Backspace}');
    expect(screen.queryByRole('button', { name: saveBarCopy.save })).not.toBeInTheDocument();
    expect(nameField()).toHaveFocus();
    expect(liveRegion(container)).toBeEmptyDOMElement();
  });
});
