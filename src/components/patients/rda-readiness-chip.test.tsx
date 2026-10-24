import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RdaReadinessChip, rdaMissingHref } from './rda-readiness-chip';
import type { RdaReadiness } from '@/lib/patients/clinical-api';

const pending: RdaReadiness['pending'] = [
  { code: 'CLINIC_TAX_ID', label: 'NIT de la clínica', reason: 'pendiente de DX-019' },
];

function loaded(data: Partial<RdaReadiness>) {
  return {
    status: 'loaded' as const,
    data: { notApplicable: false, ready: false, missing: [], pending, ...data },
  };
}

describe('RdaReadinessChip (DX-212)', () => {
  it('«RDA: listo» cuando no falta nada', () => {
    render(<RdaReadinessChip patientId="p1" state={loaded({ ready: true })} onRetry={jest.fn()} />);
    expect(screen.getByText('RDA: listo')).toBeInTheDocument();
  });

  it('con faltantes: «RDA: faltan N datos» abre la lista con enlaces y el NIT pendiente', async () => {
    const user = userEvent.setup();
    render(
      <RdaReadinessChip
        patientId="p1"
        onRetry={jest.fn()}
        state={loaded({
          missing: [
            { code: 'PRINCIPAL_DIAGNOSIS', label: 'Diagnóstico principal (CIE-10)', resourceId: null },
            { code: 'PROCEDURE_CUPS', label: 'Código CUPS de «Profilaxis»', resourceId: 'ci-1' },
            { code: 'AUTHOR_LICENSE', label: 'Registro profesional de Dra. Ríos', resourceId: 'u1' },
          ],
        })}
      />,
    );
    const chip = screen.getByRole('button', { name: 'RDA: faltan 3 datos' });
    expect(chip).toHaveAttribute('aria-expanded', 'false');
    await user.click(chip);
    expect(chip).toHaveAttribute('aria-expanded', 'true');
    const list = screen.getByRole('list', { name: 'Datos que faltan para el RDA' });
    expect(list).toHaveTextContent('Diagnóstico principal (CIE-10)');
    expect(
      screen.getByRole('link', { name: 'Completar: Código CUPS de «Profilaxis»' }),
    ).toHaveAttribute('href', '/catalog?item=ci-1');
    expect(
      screen.getByRole('link', { name: 'Completar: Registro profesional de Dra. Ríos' }),
    ).toHaveAttribute('href', '/staff/u1');
    expect(screen.getByText('NIT de la clínica: pendiente de DX-019.')).toBeInTheDocument();
  });

  it('un solo faltante en singular', () => {
    render(
      <RdaReadinessChip
        patientId="p1"
        onRetry={jest.fn()}
        state={loaded({
          missing: [{ code: 'PRINCIPAL_DIAGNOSIS', label: 'Diagnóstico principal (CIE-10)', resourceId: null }],
        })}
      />,
    );
    expect(screen.getByRole('button', { name: 'RDA: falta 1 dato' })).toBeInTheDocument();
  });

  it('sede ES o sin permiso: no pinta nada', () => {
    const { container, rerender } = render(
      <RdaReadinessChip patientId="p1" onRetry={jest.fn()} state={loaded({ notApplicable: true, pending: [] })} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<RdaReadinessChip patientId="p1" onRetry={jest.fn()} state={{ status: 'forbidden' }} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('cargando: estado accesible; con error, «Reintentar»', async () => {
    const onRetry = jest.fn();
    const user = userEvent.setup();
    const { rerender } = render(
      <RdaReadinessChip patientId="p1" onRetry={onRetry} state={{ status: 'loading' }} />,
    );
    expect(screen.getByRole('status', { name: 'Comprobando datos del RDA' })).toBeInTheDocument();
    rerender(<RdaReadinessChip patientId="p1" onRetry={onRetry} state={{ status: 'error' }} />);
    expect(screen.getByText('RDA no disponible')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('enlaces de cada faltante', () => {
    expect(rdaMissingHref({ code: 'PATIENT_DOCUMENT', label: '', resourceId: 'p1' }, 'p1')).toBe(
      '/patients/p1?tab=data',
    );
    expect(rdaMissingHref({ code: 'AUTHOR_LICENSE', label: '', resourceId: 'u1' }, 'p1')).toBe(
      '/staff/u1',
    );
    expect(rdaMissingHref({ code: 'AUTHOR_LICENSE', label: '', resourceId: null }, 'p1')).toBeNull();
  });
});
