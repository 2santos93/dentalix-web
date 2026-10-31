import { render, screen } from '@testing-library/react';
import PrescriptionSettingsPage from './page';
import { useAuthStore } from '@/lib/auth/auth-store';
import { tokenFor } from '@/lib/test/prescriptions';

const replace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));
const formRendered = jest.fn();
const templatesRendered = jest.fn();
jest.mock('../../../../components/prescriptions/prescription-settings-form', () => ({
  PrescriptionSettingsForm: ({ token }: { token: string }) => {
    formRendered(token);
    return <section aria-label="Datos de la receta (form)" data-token={token} />;
  },
}));
jest.mock('../../../../components/prescriptions/prescription-templates-manager', () => ({
  PrescriptionTemplatesManager: ({ token, allowed }: { token: string; allowed: boolean }) => {
    templatesRendered(token, allowed);
    return <section aria-label="Plantillas" data-allowed={String(allowed)} />;
  },
}));

describe('Ajustes › Recetas (DX-324)', () => {
  beforeEach(() => {
    replace.mockReset();
    formRendered.mockReset();
    templatesRendered.mockReset();
  });

  it('no country note, description «Plantillas y datos que imprime la receta.», settings before templates', () => {
    const tok = tokenFor('ADMIN', 'u-admin');
    useAuthStore.setState({ accessToken: tok, _hasHydrated: true });
    const { container } = render(<PrescriptionSettingsPage />);
    expect(screen.getByRole('heading', { level: 1, name: 'Recetas' })).toBeInTheDocument();
    expect(screen.getByText('Plantillas y datos que imprime la receta.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Datos de la receta' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Se aplican a las recetas que se emitan desde ahora. Las ya emitidas no cambian.',
      ),
    ).toBeInTheDocument();
    const form = screen.getByRole('region', { name: 'Datos de la receta (form)' });
    const templates = screen.getByRole('region', { name: 'Plantillas' });
    expect(form).toHaveAttribute('data-token', tok);
    expect(templates).toHaveAttribute('data-allowed', 'true');
    expect(form.compareDocumentPosition(templates) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(container).not.toHaveTextContent(/país|sedes →|Ajustes → Sedes/i);
    expect(screen.queryByRole('link', { name: /Sedes/ })).not.toBeInTheDocument();
    // El alcance va en la línea de la plantilla, no en las frases.
    expect(screen.getByTestId('settings-scope')).toHaveTextContent('Aplica a toda la clínica');
  });

  it.each(['DENTIST', 'ASSISTANT', 'RECEPTION'])(
    'non-admin (%s) sees exactly one lock «Solo administración cambia los datos de la receta.» and no request is made',
    (role) => {
      useAuthStore.setState({ accessToken: tokenFor(role), _hasHydrated: true });
      render(<PrescriptionSettingsPage />);
      expect(screen.getAllByText('Solo administración cambia los datos de la receta.')).toHaveLength(1);
      expect(screen.getByText('Las recetas se emiten con los ajustes que fije administración.')).toBeInTheDocument();
      expect(screen.getAllByText(/^Solo administración/)).toHaveLength(1);
      expect(formRendered).not.toHaveBeenCalled();
      expect(templatesRendered).not.toHaveBeenCalled();
    },
  );

  it('without a session goes to /login', () => {
    useAuthStore.setState({ accessToken: null, _hasHydrated: true });
    render(<PrescriptionSettingsPage />);
    expect(replace).toHaveBeenCalledWith('/login');
    expect(formRendered).not.toHaveBeenCalled();
  });
});
