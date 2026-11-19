import * as React from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { AcquisitionFields, type PatientSourcesState } from './acquisition-fields';
import {
  EMPTY_ACQUISITION,
  acquisitionPayload,
  type AcquisitionDraft,
  type PatientSource,
} from '@/lib/patients/patient-sources-api';
import { listPatients, type Patient } from '@/lib/patients/patients-api';

jest.mock('../../lib/patients/patients-api', () => ({ listPatients: jest.fn() }));
const mockedList = jest.mocked(listPatients);

async function violations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

const src = (id: string, name: string, kind: PatientSource['kind'], isActive = true): PatientSource => ({
  id,
  name,
  kind,
  isActive,
  systemKey: null,
  sortOrder: 0,
});
const SOURCES: PatientSourcesState = {
  items: [
    src('s-ref', 'Recomendación de paciente', 'PATIENT'),
    src('s-ig', 'Instagram', 'CHANNEL'),
    src('s-ext', 'Profesional externo', 'EXTERNAL_PROFESSIONAL'),
  ],
  failed: false,
  reload: jest.fn(),
};

function Harness({ initial = EMPTY_ACQUISITION, patientId }: { initial?: AcquisitionDraft; patientId?: string }) {
  const [value, setValue] = React.useState(initial);
  return (
    <form aria-label="Alta">
      <AcquisitionFields
        idPrefix="t"
        token="tok"
        sources={SOURCES}
        value={value}
        onChange={setValue}
        patientId={patientId}
      />
      <output data-testid="value">{JSON.stringify(value)}</output>
    </form>
  );
}

const PATIENT = (id: string, firstName: string, lastName: string) =>
  ({ id, firstName, lastName, docType: 'NATIONAL_ID', docNumber: 'V-1', patientCode: '1' }) as Patient;

describe('AcquisitionFields (DX-172)', () => {
  beforeEach(() => mockedList.mockReset());

  it('con un canal no pide nada más; con «Recomendación de paciente», el buscador (sin el propio paciente)', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue({
      items: [PATIENT('p-self', 'Carlos', 'Mejía'), PATIENT('p-ref', 'Luisa', 'Márquez')],
      total: 2,
      page: 1,
      pageSize: 8,
    });
    render(<Harness patientId="p-self" />);
    await user.selectOptions(screen.getByLabelText(/cómo nos conoció/i), 's-ig');
    expect(screen.queryByLabelText(/paciente que lo recomendó/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/nombre del profesional/i)).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText(/cómo nos conoció/i), 's-ref');
    await user.type(screen.getByLabelText(/^paciente que lo recomendó/i), 'ma');
    expect(await screen.findByRole('button', { name: /Luisa Márquez/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Carlos Mejía/ })).not.toBeInTheDocument();
    expect(mockedList).toHaveBeenCalledWith('tok', { query: 'ma', pageSize: 8 });
    await user.click(screen.getByRole('button', { name: /Luisa Márquez/ }));
    expect(screen.getByTestId('picked-patient')).toHaveTextContent('Luisa Márquez');

    await user.click(screen.getByRole('button', { name: /Cambiar el paciente elegido/ }));
    expect(screen.getByLabelText(/^paciente que lo recomendó/i)).toHaveValue('');
  });

  it('«Profesional externo» pide el nombre', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.selectOptions(screen.getByLabelText(/cómo nos conoció/i), 's-ext');
    await user.type(screen.getByLabelText(/nombre del profesional/i), 'Dr. José Pérez');
    expect(screen.getByTestId('value')).toHaveTextContent('"referredByName":"Dr. José Pérez"');
  });

  it('axe limpio con el buscador abierto y con el profesional', async () => {
    const user = userEvent.setup();
    mockedList.mockResolvedValue({ items: [PATIENT('p-ref', 'Luisa', 'Márquez')], total: 1, page: 1, pageSize: 8 });
    const { container } = render(<Harness />);
    await user.selectOptions(screen.getByLabelText(/cómo nos conoció/i), 's-ref');
    await user.type(screen.getByLabelText(/^paciente que lo recomendó/i), 'Luisa');
    await screen.findByRole('button', { name: /Luisa Márquez/ });
    expect(await violations(container)).toEqual([]);
    await user.click(screen.getByRole('button', { name: /Luisa Márquez/ }));
    expect(await violations(container)).toEqual([]);
    await user.selectOptions(screen.getByLabelText(/cómo nos conoció/i), 's-ext');
    expect(await violations(container)).toEqual([]);
  });
});

describe('acquisitionPayload', () => {
  const draft: AcquisitionDraft = {
    sourceId: 's',
    referredBy: { id: 'p', fullName: 'Luisa' },
    referredByName: ' Dr.  X ',
  };
  it('solo lo que encaja con el tipo', () => {
    expect(acquisitionPayload(draft, 'PATIENT')).toEqual({
      sourceId: 's',
      referredByPatientId: 'p',
      referredByName: null,
    });
    expect(acquisitionPayload(draft, 'EXTERNAL_PROFESSIONAL')).toEqual({
      sourceId: 's',
      referredByPatientId: null,
      referredByName: 'Dr. X',
    });
    expect(acquisitionPayload(draft, 'CHANNEL')).toEqual({
      sourceId: 's',
      referredByPatientId: null,
      referredByName: null,
    });
    expect(acquisitionPayload({ ...draft, sourceId: null }, null)).toEqual({
      sourceId: null,
      referredByPatientId: null,
      referredByName: null,
    });
  });
});
