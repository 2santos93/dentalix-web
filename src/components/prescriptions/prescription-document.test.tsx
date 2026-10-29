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

/**
 * Marcado de las recetas emitidas antes de DX-324, capturado del componente de
 * BASE (`6ca1667`) con `makeLegacyPrescription`: un cambio en su marcado
 * (etiquetas, filas, orden, clases, «(…)») rompe este test. Las fechas se
 * enmascaran porque siguen el formato de la sede (R11).
 */
const LEGACY_CO_MARKUP = [
  '<article class="prescription-print-root relative mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:max-w-none print:p-0">',
  '<header class="flex flex-col gap-4 border-b border-[#d1d5db] pb-4 sm:flex-row sm:items-start sm:justify-between print:flex-row">',
  '<div class="flex items-center gap-3">',
  '<div>',
  '<p class="text-base font-semibold">Clínica Demo',
  '</p>',
  '<p class="text-sm text-[#4b5563]">Sede Principal · Cra 15 #90-20',
  '</p>',
  '</div>',
  '</div>',
  '<div class="sm:text-right print:text-right">',
  '<h1 class="text-xl font-semibold tracking-tight">Fórmula médica',
  '</h1>',
  '<p class="text-xs text-[#4b5563]">Decreto 780 de 2016, art. 2.5.3.10.16',
  '</p>',
  '</div>',
  '</header>',
  '<dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Fecha de emisión',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">[fecha]',
  '</span>',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Fecha de la receta',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">[fecha]',
  '</span>',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Válida hasta',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">[fecha]',
  '</span> ',
  '<span class="text-xs font-normal text-[#4b5563]">(30 días naturales)',
  '</span>',
  '</dd>',
  '</div>',
  '</dl>',
  '<section aria-label="Paciente" class="mt-5">',
  '<h2 class="text-sm font-semibold uppercase tracking-wide text-[#4b5563]">Paciente',
  '</h2>',
  '<dl class="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Nombre',
  '</dt>',
  '<dd class="font-medium">Ana Pérez',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Documento',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">Documento nacional DOC-1020',
  '</span>',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Nº de historia clínica',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">1020',
  '</span>',
  '</dd>',
  '</div>',
  '</dl>',
  '</section>',
  '<section aria-label="Medicamentos" class="mt-5">',
  '<h2 class="text-sm font-semibold uppercase tracking-wide text-[#4b5563]">Medicamentos',
  '</h2>',
  '<ol class="mt-2 flex flex-col divide-y divide-[#e5e7eb] border-y border-[#e5e7eb]">',
  '<li class="prescription-item flex gap-3 py-3 text-sm">',
  '<span class="font-semibold tabular-nums">1.',
  '</span>',
  '<div>',
  '<p class="text-base font-semibold">Amoxicilina 500 mg',
  '</p>',
  '<p class="text-[#374151]">Cápsula · Vía oral',
  '</p>',
  '<p>1 cápsula, cada 8 horas, durante 7 días.',
  '</p>',
  '<p>',
  '<span class="text-[#4b5563]">Cantidad total:',
  '</span> ',
  '<span class="font-medium tabular-nums">21 (veintiuno) cápsulas',
  '</span>',
  '</p>',
  '</div>',
  '</li>',
  '</ol>',
  '</section>',
  '<section aria-label="Profesional que prescribe" class="prescription-signature mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2">',
  '<dl class="flex flex-col gap-2 text-sm">',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Profesional que prescribe',
  '</dt>',
  '<dd class="font-medium">Dra. Laura Ruiz',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Registro profesional',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">RM-12345',
  '</span>',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Contacto',
  '</dt>',
  '<dd class="font-medium">laura@example.com',
  '</dd>',
  '</div>',
  '</dl>',
  '<div class="flex flex-col justify-end">',
  '<div class="h-16">',
  '</div>',
  '<p class="border-t border-[#111827] pt-2 text-sm">Firma del profesional',
  '</p>',
  '</div>',
  '</section>',
  '<footer class="mt-6 flex flex-col gap-1 border-t border-[#d1d5db] pt-3 text-xs text-[#4b5563]">',
  '<p>Huella SHA-256 del contenido emitido: ',
  '<span class="break-all font-mono text-[#111827]">aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '</span>',
  '</p>',
  '</footer>',
  '</article>',
];
const LEGACY_ES_MARKUP = [
  '<article class="prescription-print-root relative mx-auto w-full max-w-[210mm] bg-white px-4 py-6 text-[#111827] sm:px-10 sm:py-10 print:max-w-none print:p-0">',
  '<header class="flex flex-col gap-4 border-b border-[#d1d5db] pb-4 sm:flex-row sm:items-start sm:justify-between print:flex-row">',
  '<div class="flex items-center gap-3">',
  '<div>',
  '<p class="text-base font-semibold">Clínica Demo',
  '</p>',
  '<p class="text-sm text-[#4b5563]">Sede Principal · Cra 15 #90-20',
  '</p>',
  '</div>',
  '</div>',
  '<div class="sm:text-right print:text-right">',
  '<h1 class="text-xl font-semibold tracking-tight">Receta médica privada',
  '</h1>',
  '<p class="text-xs text-[#4b5563]">Real Decreto 1718/2010, art. 3',
  '</p>',
  '</div>',
  '</header>',
  '<dl class="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Fecha de emisión',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">[fecha]',
  '</span>',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Fecha prevista de dispensación',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">[fecha]',
  '</span>',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Válida hasta',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">[fecha]',
  '</span> ',
  '<span class="text-xs font-normal text-[#4b5563]">(10 días naturales)',
  '</span>',
  '</dd>',
  '</div>',
  '</dl>',
  '<section aria-label="Paciente" class="mt-5">',
  '<h2 class="text-sm font-semibold uppercase tracking-wide text-[#4b5563]">Paciente',
  '</h2>',
  '<dl class="mt-2 grid grid-cols-2 gap-3 text-sm sm:grid-cols-3 print:grid-cols-3">',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Nombre',
  '</dt>',
  '<dd class="font-medium">Ana Pérez',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">DNI/NIE',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">12345678Z',
  '</span>',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Año de nacimiento',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">1980',
  '</span>',
  '</dd>',
  '</div>',
  '</dl>',
  '</section>',
  '<section aria-label="Medicamentos" class="mt-5">',
  '<h2 class="text-sm font-semibold uppercase tracking-wide text-[#4b5563]">Medicamentos',
  '</h2>',
  '<ol class="mt-2 flex flex-col divide-y divide-[#e5e7eb] border-y border-[#e5e7eb]">',
  '<li class="prescription-item flex gap-3 py-3 text-sm">',
  '<span class="font-semibold tabular-nums">1.',
  '</span>',
  '<div>',
  '<p class="text-base font-semibold">Amoxicilina 500 mg',
  '</p>',
  '<p class="text-[#374151]">Cápsula · Vía oral',
  '</p>',
  '<p>1 cápsula, cada 8 horas, durante 7 días.',
  '</p>',
  '<p>',
  '<span class="text-[#4b5563]">Cantidad total:',
  '</span> ',
  '<span class="font-medium tabular-nums">21 (veintiuno) cápsulas',
  '</span> · ',
  '<span class="text-[#4b5563]">Envases:',
  '</span> ',
  '<span class="font-medium tabular-nums">2',
  '</span>',
  '</p>',
  '</div>',
  '</li>',
  '</ol>',
  '</section>',
  '<section aria-label="Profesional que prescribe" class="prescription-signature mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2">',
  '<dl class="flex flex-col gap-2 text-sm">',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Profesional que prescribe',
  '</dt>',
  '<dd class="font-medium">Dra. Laura Ruiz',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Nº de colegiado',
  '</dt>',
  '<dd class="font-medium">',
  '<span class="tabular-nums">28/012345',
  '</span>',
  '</dd>',
  '</div>',
  '<div>',
  '<dt class="text-xs font-medium text-[#6b7280]">Contacto',
  '</dt>',
  '<dd class="font-medium">laura@example.com',
  '</dd>',
  '</div>',
  '</dl>',
  '<div class="flex flex-col justify-end">',
  '<div class="h-16">',
  '</div>',
  '<p class="border-t border-[#111827] pt-2 text-sm">Firma del profesional',
  '</p>',
  '</div>',
  '</section>',
  '<footer class="mt-6 flex flex-col gap-1 border-t border-[#d1d5db] pt-3 text-xs text-[#4b5563]">',
  '<p>Huella SHA-256 del contenido emitido: ',
  '<span class="break-all font-mono text-[#111827]">aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  '</span>',
  '</p>',
  '</footer>',
  '</article>',
];

/** Enmascara las fechas y corta por etiquetas para que un fallo señale la pieza que cambió. */
function legacyMarkup(html: string): string[] {
  return html
    .replace(/\d{2}[/.]\d{2}[/.]\d{4}(?: \d{1,2}:\d{2}(?: [ap]\. m\.)?)?/g, '[fecha]')
    .split(/(?=<)/);
}

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
    const co = renderDocument(makePrescriptionDocument(makeLegacyPrescription('CO', { safetyRulesVersion: null })));
    expect(co.container.textContent).toBe(
      'Clínica DemoSede Principal · Cra 15 #90-20Fórmula médicaDecreto 780 de 2016, art. 2.5.3.10.16' +
        'Fecha de emisión10/16/2026 11:00 a. m.Fecha de la receta10/16/2026' +
        'Válida hasta11/14/2026 (30 días naturales)' +
        'PacienteNombreAna PérezDocumentoDocumento nacional DOC-1020Nº de historia clínica1020' +
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

    const es = renderDocument(makePrescriptionDocument(makeLegacyPrescription('ES', { safetyRulesVersion: null })));
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

  it('legacy CO and ES markup stays as issued (dates masked)', () => {
    const co = renderDocument(makePrescriptionDocument(makeLegacyPrescription('CO', { safetyRulesVersion: null })));
    expect(legacyMarkup(co.container.innerHTML)).toEqual(LEGACY_CO_MARKUP);
    co.unmount();
    const es = renderDocument(makePrescriptionDocument(makeLegacyPrescription('ES', { safetyRulesVersion: null })));
    expect(legacyMarkup(es.container.innerHTML)).toEqual(LEGACY_ES_MARKUP);
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
    expect(screen.getByText('Documento').nextSibling).toHaveTextContent('Documento nacional DOC-1020');
    expect(screen.getByText('Nº de registro profesional').nextSibling).toHaveTextContent('RM-12345');
    // Bajo el título no hay nada: ni norma ni subtítulo.
    expect(screen.getByRole('heading', { name: 'Receta' }).nextElementSibling).toBeNull();
    expect(container.textContent).not.toMatch(/Decreto|naturales|Fórmula médica|Receta médica privada/);
  });

  it('an unknown legacy country falls back to the neutral layout (M3)', () => {
    const rx = makePrescriptionDocument({ country: 'XX' as unknown as 'CO' });
    const { container } = renderDocument(rx);
    expect(screen.getByRole('heading', { name: 'Receta' })).toBeInTheDocument();
    expect(screen.getByText('Nº de registro profesional')).toBeInTheDocument();
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

  it('age appears when present and weight stays private', () => {
    const none = renderDocument(makePrescriptionDocument());
    expect(screen.queryByText('Edad')).not.toBeInTheDocument();
    expect(screen.queryByText('Peso')).not.toBeInTheDocument();
    none.unmount();

    const baby = renderDocument(makePrescriptionDocument({ patientAgeYears: 1 }));
    expect(screen.getByText('Edad').nextSibling).toHaveTextContent(/^1 año$/);
    baby.unmount();

    renderDocument(makePrescriptionDocument({ patientAgeYears: 34, patientWeightKg: 72.5 }), BERLIN);
    expect(screen.getByText('Edad').nextSibling).toHaveTextContent(/^34 años$/);
    expect(screen.queryByText('Peso')).not.toBeInTheDocument();
    // Orden de las filas del paciente: nombre, documento, edad, nº de HC.
    const labels = Array.from(
      screen.getByRole('region', { name: 'Paciente' }).querySelectorAll('dt'),
      (dt) => dt.textContent,
    );
    expect(labels).toEqual(['Nombre', 'Documento', 'Edad', 'Nº de historia clínica']);
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
    expect(screen.queryByText('Peso')).not.toBeInTheDocument();
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
    expect(screen.queryByText(/Penicilina/)).not.toBeInTheDocument();
    expect(screen.getByText(/Avisos de seguridad revisados por el prescriptor/)).toHaveTextContent('versión de reglas no disponible');
    expect(screen.getByText(/pudo alterarse fuera de Dentalix/)).toBeInTheDocument();
  });

  it('los avisos y el motivo permanecen privados con la versión sellada', () => {
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
            message: 'MARCADOR EMBARAZO SEMANAS MEDICACION HABITUAL',
            source: 'Anamnesis: alergias registradas',
          },
          {
            rule: 'ANTIRESORPTIVE',
            code: 'ANTIRESORPTIVE_MRONJ',
            severity: 'INFO',
            activeIngredient: null,
            message: 'MARCADOR INFORMATIVO PRIVADO',
            source: 'SDCEP',
          },
        ],
        safetyOverrideReason: 'MARCADOR MOTIVO PRIVADO',
        patientWeightKg: 73.2,
        notes: 'MARCADOR INDICACION GENERAL',
      }),
    );
    expect(screen.getByText(/Avisos de seguridad revisados por el prescriptor/)).toHaveTextContent('reglas RX_SAFETY_V1');
    expect(screen.queryByText(/MARCADOR EMBARAZO SEMANAS MEDICACION HABITUAL/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MARCADOR MOTIVO PRIVADO/)).not.toBeInTheDocument();
    expect(screen.queryByText(/MARCADOR INFORMATIVO PRIVADO/)).not.toBeInTheDocument();
    expect(screen.queryByText(/73[.,]2/)).not.toBeInTheDocument();
    expect(screen.getByText(/MARCADOR INDICACION GENERAL/)).toBeInTheDocument();
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
