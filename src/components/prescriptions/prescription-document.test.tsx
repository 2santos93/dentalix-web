import { render, screen } from '@testing-library/react';
import { PrescriptionDocument } from './prescription-document';
import { makePrescriptionDocument } from '@/lib/test/prescriptions';

describe('PrescriptionDocument (A4)', () => {
  it('CO: clínica, paciente con nº de HC, profesional con registro, cantidad en letras y validez', () => {
    render(<PrescriptionDocument prescription={makePrescriptionDocument()} />);
    expect(screen.getByRole('heading', { name: 'Fórmula médica' })).toBeInTheDocument();
    expect(screen.getByText('Decreto 780 de 2016, art. 2.5.3.10.16')).toBeInTheDocument();
    expect(screen.getByText('Clínica Demo')).toBeInTheDocument();
    expect(screen.getByText(/Sede Principal · Cra 15 #90-20/)).toBeInTheDocument();
    expect(screen.getByText('Nº de historia clínica').nextSibling).toHaveTextContent('1020');
    expect(screen.getByText('Registro profesional').nextSibling).toHaveTextContent('RM-12345');
    expect(screen.getByText('21 (veintiuno) cápsulas')).toBeInTheDocument();
    expect(screen.getByText('1 cápsula, cada 8 horas, durante 7 días.')).toBeInTheDocument();
    expect(screen.getByText('Válida hasta').nextSibling).toHaveTextContent('14/11/2026');
    expect(screen.getByText('Firma del profesional')).toBeInTheDocument();
    expect(screen.getByText('a'.repeat(64))).toBeInTheDocument();
    expect(document.querySelector('.prescription-print-root')).toBeInTheDocument();
  });

  it('ES: DNI/NIE, año de nacimiento, envases y nº de colegiado', () => {
    const base = makePrescriptionDocument();
    render(
      <PrescriptionDocument
        prescription={makePrescriptionDocument({
          country: 'ES',
          patientDocument: '12345678Z',
          patientBirthYear: 1980,
          professionalLicense: '28/012345',
          items: [{ ...base.items[0], packages: 2 }],
        })}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Receta médica privada' })).toBeInTheDocument();
    expect(screen.getByText('DNI/NIE').nextSibling).toHaveTextContent('12345678Z');
    expect(screen.getByText('Año de nacimiento').nextSibling).toHaveTextContent('1980');
    expect(screen.getByText('Nº de colegiado').nextSibling).toHaveTextContent('28/012345');
    expect(screen.getByText('Fecha prevista de dispensación')).toBeInTheDocument();
    expect(screen.getByText('(10 días naturales)')).toBeInTheDocument();
    expect(screen.getByText('Envases:')).toBeInTheDocument();
  });

  it('anulada: aviso visible con quién, cuándo y motivo; alergia confirmada y alteración avisadas', () => {
    render(
      <PrescriptionDocument
        prescription={makePrescriptionDocument({
          status: 'VOIDED',
          voidedAt: '2026-10-16T16:00:00.000Z',
          voidedByName: 'Dra. Laura Ruiz',
          voidReason: 'Dosis equivocada',
          allergyOverride: true,
          allergyMatches: [{ activeIngredient: 'Amoxicilina', allergen: 'Penicilina' }],
          integrityOk: false,
        })}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent('RECETA ANULADA');
    expect(screen.getByRole('note')).toHaveTextContent('Motivo: Dosis equivocada');
    expect(screen.getByText(/alergia registrada a: Penicilina \(Amoxicilina\)/)).toBeInTheDocument();
    expect(screen.getByText(/pudo alterarse fuera de Dentalix/)).toBeInTheDocument();
  });
});
