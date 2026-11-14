import { render, screen } from '@testing-library/react';
import { toast } from 'sonner';
import {
  ProfessionalLicenseNotice,
  announceClinicalEntryWarnings,
  professionalLicenseCopy,
} from './professional-license-notice';

jest.mock('sonner', () => ({ toast: { warning: jest.fn() } }));
const warning = toast.warning as jest.Mock;

beforeEach(() => warning.mockClear());

describe('ProfessionalLicenseNotice (DX-540)', () => {
  it('es un aviso (role=status) en español que dice qué pasará al guardar', () => {
    render(<ProfessionalLicenseNotice canEditStaff={false} userId="u1" />);
    const notice = screen.getByRole('status');
    expect(notice).toHaveAttribute('data-tone', 'warning');
    expect(notice).toHaveTextContent(professionalLicenseCopy.title);
    expect(notice).toHaveTextContent(/se guardará sin tu número de registro profesional/i);
  });

  it('ADMIN: enlaza a su ficha de Personal, en otra pestaña para no perder lo escrito', () => {
    render(<ProfessionalLicenseNotice canEditStaff userId="u-admin" />);
    const link = screen.getByRole('link', { name: /cargar mi registro en personal/i });
    expect(link).toHaveAttribute('href', '/staff/u-admin');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
    expect(link).toHaveAccessibleName(/se abre en una pestaña nueva/i);
  });

  it('sin permiso para editar Personal: sin enlace, dice a quién pedirlo', () => {
    render(<ProfessionalLicenseNotice canEditStaff={false} userId="u1" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(professionalLicenseCopy.askAdmin);
  });

  it('ADMIN sin id de sesión legible: tampoco hay enlace roto', () => {
    render(<ProfessionalLicenseNotice canEditStaff userId={null} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});

describe('announceClinicalEntryWarnings (DX-540)', () => {
  it('firmada sin registro: un aviso con título propio y el texto de la API', () => {
    announceClinicalEntryWarnings([
      { code: 'PROFESSIONAL_LICENSE_MISSING', message: 'La evolución se guardó sin tu número…' },
    ]);
    expect(warning).toHaveBeenCalledTimes(1);
    expect(warning).toHaveBeenCalledWith(professionalLicenseCopy.savedWithout, {
      description: 'La evolución se guardó sin tu número…',
      duration: 10000,
    });
  });

  it('sin avisos (o respuesta antigua sin el campo) no muestra nada', () => {
    announceClinicalEntryWarnings([]);
    announceClinicalEntryWarnings(undefined);
    expect(warning).not.toHaveBeenCalled();
  });
});
