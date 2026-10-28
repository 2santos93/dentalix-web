import { render, screen } from '@testing-library/react';
import { PrescriptionDocument } from './prescription-document';
import { regionalFormat } from '@/lib/format/regional-format';
import type { PrescriptionFormat } from '@/lib/prescriptions/prescription-format';
import type { PrescriptionDocument as PrescriptionDoc } from '@/lib/prescriptions/prescriptions-api';
import { makeLegacyPrescription, makePrescriptionDocument } from '@/lib/test/prescriptions';

const NEW_YORK: PrescriptionFormat = {
  fmt: regionalFormat({ locale: 'en-US', hourCycle: 'h12' }),
  timeZone: 'America/New_York',
};
const BERLIN: PrescriptionFormat = {
  fmt: regionalFormat({ locale: 'de-DE', hourCycle: 'h23' }),
  timeZone: 'Europe/Berlin',
};

function renderDocument(prescription: PrescriptionDoc, format: PrescriptionFormat | null = NEW_YORK) {
  return render(<PrescriptionDocument prescription={prescription} format={format} />);
}

function item(rx: PrescriptionDoc, overrides: Partial<PrescriptionDoc['items'][number]>) {
  return [{ ...rx.items[0], ...overrides }];
}

describe('PrescriptionDocument (A4)', () => {
  it('el logo no filtra la URL de la receta al host de la imagen', () => {
    renderDocument(makePrescriptionDocument({ clinicLogoUrl: 'https://cdn.example.com/logo.png' }));
    expect(screen.getByRole('img', { name: 'Clínica Demo' })).toHaveAttribute('referrerpolicy', 'no-referrer');
  });

  it('legacy CO and ES snapshots render with their issued labels, byte for byte', () => {
    // Textos, filas y orden de antes de DX-324; solo las fechas siguen la sede (R11).
    const co = renderDocument(makePrescriptionDocument(makeLegacyPrescription('CO')));
    expect(co.container.textContent).toBe(
      'Clínica DemoSede Principal · Cra 15 #90-20Fórmula médicaDecreto 780 de 2016, art. 2.5.3.10.16' +
        'Fecha de emisión10/16/2026 11:00 a. m.Fecha de la receta10/16/2026' +
        'Válida hasta11/14/2026 (30 días naturales)' +
        'PacienteNombreAna PérezDocumentoCC 1020Nº de historia clínica1020' +
        'Medicamentos1.Amoxicilina 500 mgCápsula · Vía oral1 cápsula, cada 8 horas, durante 7 días.' +
        'Cantidad total: 21 (veintiuno) cápsulas' +
        'Profesional que prescribeDra. Laura RuizRegistro profesionalRM-12345Contactolaura@example.com' +
        'Firma del profesionalHuella SHA-256 del contenido emitido: ' +
        'a'.repeat(64),
    );
    expect(screen.getByRole('heading', { name: 'Fórmula médica' })).toBeInTheDocument();
    expect(screen.getByText('Nº de historia clínica').nextSibling).toHaveTextContent('1020');
    expect(screen.getByText('Registro profesional').nextSibling).toHaveTextContent('RM-12345');
    expect(screen.getByText('(30 días naturales)')).toBeInTheDocument();
    expect(screen.getByText('21 (veintiuno) cápsulas')).toBeInTheDocument();
    co.unmount();

    const es = renderDocument(makePrescriptionDocument(makeLegacyPrescription('ES')));
    expect(es.container.textContent).toBe(
      'Clínica DemoSede Principal · Cra 15 #90-20Receta médica privadaReal Decreto 1718/2010, art. 3' +
        'Fecha de emisión10/16/2026 11:00 a. m.Fecha prevista de dispensación10/16/2026' +
        'Válida hasta10/25/2026 (10 días naturales)' +
        'PacienteNombreAna PérezDNI/NIE12345678ZAño de nacimiento1980' +
        'Medicamentos1.Amoxicilina 500 mgCápsula · Vía oral1 cápsula, cada 8 horas, durante 7 días.' +
        'Cantidad total: 21 (veintiuno) cápsulas · Envases: 2' +
        'Profesional que prescribeDra. Laura RuizNº de colegiado28/012345Contactolaura@example.com' +
        'Firma del profesionalHuella SHA-256 del contenido emitido: ' +
        'a'.repeat(64),
    );
    expect(screen.getByText('DNI/NIE').nextSibling).toHaveTextContent('12345678Z');
    expect(screen.getByText('Año de nacimiento').nextSibling).toHaveTextContent('1980');
    expect(screen.getByText('Nº de colegiado').nextSibling).toHaveTextContent('28/012345');
    expect(screen.getByText('(10 días naturales)')).toBeInTheDocument();
  });

  it('legacy prescriptions never show age, weight or specialty, even if the snapshot had them', () => {
    renderDocument(
      makePrescriptionDocument(
        makeLegacyPrescription('CO', { patientAgeYears: 40, patientWeightKg: 70, professionalSpecialty: 'Endodoncia' }),
      ),
    );
    expect(screen.queryByText('Edad')).not.toBeInTheDocument();
    expect(screen.queryByText('Peso')).not.toBeInTheDocument();
    expect(screen.queryByText('Especialidad')).not.toBeInTheDocument();
  });

  it('legacy quantity keeps plain digits: «1500 (mil quinientos)»', () => {
    const legacy = makeLegacyPrescription('ES');
    const rx = makePrescriptionDocument({
      ...legacy,
      items: item(makePrescriptionDocument(legacy), { totalQuantity: 1500, quantityInWords: 'mil quinientos' }),
    });
    const withFormat = renderDocument(rx, BERLIN);
    expect(screen.getByText('1500 (mil quinientos) cápsulas')).toBeInTheDocument();
    withFormat.unmount();
    renderDocument(rx, null);
    expect(screen.getByText('1500 (mil quinientos) cápsulas')).toBeInTheDocument();
  });

  it('single-format prescription shows Receta, Válida desde, Nº de registro profesional and no legal reference', () => {
    const { container } = renderDocument(makePrescriptionDocument({ validUntil: '2026-10-25' }));
    expect(screen.getByRole('heading', { name: 'Receta' })).toBeInTheDocument();
    expect(screen.getByText('Válida desde').nextSibling).toHaveTextContent('10/16/2026');
    expect(screen.getByText('Válida hasta').nextSibling).toHaveTextContent('10/25/2026');
    expect(screen.getByText('(10 días)')).toBeInTheDocument();
    expect(screen.getByText('Documento').nextSibling).toHaveTextContent('CC 1020');
    expect(screen.getByText('Nº de registro profesional').nextSibling).toHaveTextContent('RM-12345');
    // Bajo el título no hay nada: ni norma ni subtítulo.
    expect(screen.getByRole('heading', { name: 'Receta' }).nextElementSibling).toBeNull();
    expect(container.textContent).not.toMatch(/Decreto|naturales|Fórmula médica|Receta médica privada/);
  });

  it('single-format validity of one day reads «(1 día)»', () => {
    renderDocument(makePrescriptionDocument({ validUntil: '2026-10-16' }));
    expect(screen.getByText('(1 día)')).toBeInTheDocument();
  });

  it('document rendering takes words, HC and specialty only from the snapshot', () => {
    const base = makePrescriptionDocument();
    const off = renderDocument(
      makePrescriptionDocument({ clinicalRecordNumber: null, items: item(base, { quantityInWords: null }) }),
    );
    expect(screen.getByText('21 cápsulas')).toBeInTheDocument();
    expect(off.container.textContent).not.toContain('veintiuno');
    expect(screen.queryByText('Nº de historia clínica')).not.toBeInTheDocument();
    expect(screen.queryByText('Especialidad')).not.toBeInTheDocument();
    off.unmount();

    renderDocument(makePrescriptionDocument({ professionalSpecialty: 'Endodoncia' }));
    expect(screen.getByText('21 (veintiuno) cápsulas')).toBeInTheDocument();
    expect(screen.getByText('Nº de historia clínica').nextSibling).toHaveTextContent('1020');
    expect(screen.getByText('Especialidad').nextSibling).toHaveTextContent('Endodoncia');
  });

  it('age and weight rows only when the snapshot has them', () => {
    const none = renderDocument(makePrescriptionDocument());
    expect(screen.queryByText('Edad')).not.toBeInTheDocument();
    expect(screen.queryByText('Peso')).not.toBeInTheDocument();
    none.unmount();

    const baby = renderDocument(makePrescriptionDocument({ patientAgeYears: 1 }));
    expect(screen.getByText('Edad').nextSibling).toHaveTextContent(/^1 año$/);
    baby.unmount();

    renderDocument(makePrescriptionDocument({ patientAgeYears: 34, patientWeightKg: 72.5 }), BERLIN);
    expect(screen.getByText('Edad').nextSibling).toHaveTextContent(/^34 años$/);
    expect(screen.getByText('Peso').nextSibling).toHaveTextContent(/^72,5 kg$/);
    // Orden de las filas del paciente: nombre, documento, edad, peso, nº de HC.
    const labels = Array.from(
      screen.getByRole('region', { name: 'Paciente' }).querySelectorAll('dt'),
      (dt) => dt.textContent,
    );
    expect(labels).toEqual(['Nombre', 'Documento', 'Edad', 'Peso', 'Nº de historia clínica']);
  });

  it('document dates follow the prescription location, not the active one', () => {
    const previousTz = process.env.TZ;
    process.env.TZ = 'America/Los_Angeles';
    try {
      const rx = makePrescriptionDocument({
        issuedAt: '2027-05-03T15:00:00.000Z',
        dispensationDate: '2027-05-03',
        validUntil: '2027-05-03',
      });
      const us = renderDocument(rx, NEW_YORK);
      expect(screen.getByText('Fecha de emisión').nextSibling).toHaveTextContent('05/03/2027 11:00 a. m.');
      expect(screen.getByText('Válida desde').nextSibling).toHaveTextContent(/^05\/03\/2027$/);
      us.unmount();

      renderDocument(rx, BERLIN);
      expect(screen.getByText('Fecha de emisión').nextSibling).toHaveTextContent('03.05.2027 17:00');
      expect(screen.getByText('Válida desde').nextSibling).toHaveTextContent(/^03\.05\.2027$/);
      expect(screen.getByText('Válida hasta').nextSibling).toHaveTextContent('03.05.2027');
    } finally {
      process.env.TZ = previousTz;
    }
  });

  it('quantity prints without the location format', () => {
    const base = makePrescriptionDocument({ patientWeightKg: 72.5 });
    renderDocument(
      makePrescriptionDocument({
        ...base,
        status: 'VOIDED',
        voidedAt: '2026-10-16T16:00:00.000Z',
        voidedByName: 'Dra. Laura Ruiz',
        voidReason: 'Dosis equivocada',
        items: [
          { ...base.items[0], quantityInWords: null },
          { ...base.items[0], id: 'i2', position: 2, totalQuantity: 1500, quantityInWords: 'mil quinientos', packages: 12 },
        ],
      }),
      null,
    );
    expect(screen.getByText('21 cápsulas')).toBeInTheDocument();
    expect(screen.getByText('1500 (mil quinientos) cápsulas')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
    // Lo que depende del formato de la sede sale «—», nunca con otro formato.
    expect(screen.getByText('Fecha de emisión').nextSibling).toHaveTextContent(/^—$/);
    expect(screen.getByText('Válida desde').nextSibling).toHaveTextContent(/^—$/);
    expect(screen.getByText('Válida hasta').nextSibling).toHaveTextContent(/^— \(30 días\)$/);
    expect(screen.getByText('Peso').nextSibling).toHaveTextContent(/^—$/);
    expect(screen.getByRole('note')).toHaveTextContent('Anulada el — por Dra. Laura Ruiz.');
  });

  it('anulada: aviso visible con quién, cuándo y motivo; alergia confirmada y alteración avisadas', () => {
    renderDocument(
      makePrescriptionDocument({
        status: 'VOIDED',
        voidedAt: '2026-10-16T16:00:00.000Z',
        voidedByName: 'Dra. Laura Ruiz',
        voidReason: 'Dosis equivocada',
        allergyOverride: true,
        allergyMatches: [{ activeIngredient: 'Amoxicilina', allergen: 'Penicilina' }],
        // Receta anterior a DX-300: sin avisos de seguridad sellados.
        safetyRulesVersion: null,
        safetyAlerts: null,
        integrityOk: false,
      }),
    );
    expect(screen.getByRole('note')).toHaveTextContent('RECETA ANULADA');
    expect(screen.getByRole('note')).toHaveTextContent('Anulada el 10/16/2026 12:00 p. m. por Dra. Laura Ruiz.');
    expect(screen.getByRole('note')).toHaveTextContent('Motivo: Dosis equivocada');
    expect(screen.getByText(/alergia registrada a: Penicilina \(Amoxicilina\)/)).toBeInTheDocument();
    expect(screen.getByText(/pudo alterarse fuera de Dentalix/)).toBeInTheDocument();
  });

  it('DX-300: los avisos bloqueantes confirmados y el motivo salen en el documento; los informativos no', () => {
    renderDocument(
      makePrescriptionDocument({
        allergyOverride: true,
        allergyMatches: [{ activeIngredient: 'Amoxicilina', allergen: 'penicilina' }],
        safetyAlerts: [
          {
            rule: 'ALLERGY',
            code: 'ALLERGY_MATCH',
            severity: 'BLOCKING',
            activeIngredient: 'Amoxicilina',
            message: 'Alergia: el paciente tiene registrada alergia a penicilina y Amoxicilina puede causarla.',
            source: 'Anamnesis: alergias registradas',
          },
          {
            rule: 'ANTIRESORPTIVE',
            code: 'ANTIRESORPTIVE_MRONJ',
            severity: 'INFO',
            activeIngredient: null,
            message: 'El paciente toma antirresortivos.',
            source: 'SDCEP',
          },
        ],
        safetyOverrideReason: 'Prueba cutánea negativa en 2025',
      }),
    );
    const block = screen.getByRole('region', { name: 'Avisos de seguridad confirmados' });
    expect(block).toHaveTextContent('Amoxicilina puede causarla');
    expect(block).toHaveTextContent('Motivo: Prueba cutánea negativa en 2025');
    expect(block).not.toHaveTextContent('antirresortivos');
    // Sin duplicar con la nota de alergia de DX-013.
    expect(screen.queryByText(/confirmó la prescripción conociendo la alergia/)).not.toBeInTheDocument();
  });

  it('DX-300: sin avisos bloqueantes no hay bloque de avisos', () => {
    renderDocument(makePrescriptionDocument());
    expect(screen.queryByRole('region', { name: 'Avisos de seguridad confirmados' })).not.toBeInTheDocument();
  });

  it('la huella sale entera en el pie', () => {
    renderDocument(makePrescriptionDocument());
    expect(screen.getByText('a'.repeat(64))).toBeInTheDocument();
    expect(screen.getByText('Firma del profesional')).toBeInTheDocument();
    expect(document.querySelector('.prescription-print-root')).toBeInTheDocument();
  });
});
