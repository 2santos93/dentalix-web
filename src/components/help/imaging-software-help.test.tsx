import { render, screen, within } from '@testing-library/react';
import { ImagingSoftwareHelp } from './imaging-software-help';
import ImagingSoftwareHelpPage from '@/app/(app)/ayuda/software-de-imagen/page';

describe('ImagingSoftwareHelp (DX-484)', () => {
  it('tiene el título como h1 y una sección con encabezado por programa', () => {
    render(<ImagingSoftwareHelp />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Dar de alta al paciente en el software de imagen',
    );
    for (const name of ['Sidexis', 'Romexis', 'Dexis', 'CS Imaging']) {
      const region = screen.getByRole('region', { name });
      expect(within(region).getByRole('heading', { level: 2, name })).toBeInTheDocument();
      expect(within(region).getByText(/pega el código de Dentalix/)).toBeInTheDocument();
    }
  });

  it('explica el código, los mismos datos, las líneas sin tildes y que los menús cambian por versión', () => {
    render(<ImagingSoftwareHelp />);
    const how = screen.getByRole('region', { name: 'Cómo funciona' });
    expect(how).toHaveTextContent(/código estable/);
    expect(how).toHaveTextContent(/ID del paciente \(o número de ficha\)/);
    expect(how).toHaveTextContent(/mismos apellidos, nombre, fecha de nacimiento y sexo/);
    expect(how).toHaveTextContent(/«sin tildes»/);
    expect(how).toHaveTextContent(/cambian según la versión/);
  });

  it('no promete integración automática, captura TWAIN ni puentes', () => {
    const { container } = render(<ImagingSoftwareHelp />);
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/integración automática/i);
    expect(text).not.toMatch(/twain/i);
    expect(text).not.toMatch(/\bpuente\b|\bbridge\b/i);
    expect(text).toMatch(/Dentalix no se conecta con el software de imagen/);
  });

  it('la página de la ruta pinta la ayuda', () => {
    render(<ImagingSoftwareHelpPage />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/software de imagen/);
  });
});
