import { render, screen } from '@testing-library/react';
import { ClinicFiscalLines } from './clinic-fiscal-lines';
import { EMPTY_CLINIC_FISCAL } from '@/lib/clinic/clinic-settings-api';

describe('ClinicFiscalLines (DX-019)', () => {
  it('razón social · identificador con su nombre, dirección y contacto', () => {
    render(
      <ClinicFiscalLines
        fiscal={{ legalName: 'Sonrisas S.A.', taxIdLabel: 'ID fiscal', taxId: 'J-1', address: 'Av. 1', email: 'a@b.c', phone: '+1 555' }}
      />,
    );
    const lines = screen.getByTestId('clinic-fiscal').querySelectorAll('span');
    expect([...lines].map((l) => l.textContent)).toEqual(['Sonrisas S.A. · ID fiscal J-1', 'Av. 1', 'a@b.c · +1 555']);
  });

  it('sin nombre propio, el genérico; sin nada, no pinta nada', () => {
    const { rerender } = render(<ClinicFiscalLines fiscal={{ ...EMPTY_CLINIC_FISCAL, taxId: '123' }} />);
    expect(screen.getByTestId('clinic-fiscal')).toHaveTextContent('Id. fiscal 123');
    rerender(<ClinicFiscalLines fiscal={EMPTY_CLINIC_FISCAL} />);
    expect(screen.queryByTestId('clinic-fiscal')).not.toBeInTheDocument();
    rerender(<ClinicFiscalLines fiscal={undefined} />);
    expect(screen.queryByTestId('clinic-fiscal')).not.toBeInTheDocument();
  });
});
