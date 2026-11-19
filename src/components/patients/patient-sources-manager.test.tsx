import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { PatientSourcesManager } from './patient-sources-manager';
import {
  createPatientSource,
  listPatientSources,
  updatePatientSource,
  type PatientSource,
} from '@/lib/patients/patient-sources-api';
import { ApiError } from '@/lib/api/client';

jest.mock('../../lib/patients/patient-sources-api', () => ({
  ...jest.requireActual('../../lib/patients/patient-sources-api'),
  listPatientSources: jest.fn(),
  createPatientSource: jest.fn(),
  updatePatientSource: jest.fn(),
}));
jest.mock('../errors/notify', () => ({ notifyError: jest.fn() }));

const mockedList = jest.mocked(listPatientSources);
const mockedCreate = jest.mocked(createPatientSource);
const mockedUpdate = jest.mocked(updatePatientSource);

async function violations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  });
  return results.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.html) }));
}

const src = (overrides: Partial<PatientSource>): PatientSource => ({
  id: 's-ig',
  name: 'Instagram',
  kind: 'CHANNEL',
  isActive: true,
  systemKey: 'INSTAGRAM',
  sortOrder: 20,
  ...overrides,
});
const SOURCES = [
  src({
    id: 's-ref',
    name: 'Recomendación de paciente',
    kind: 'PATIENT',
    systemKey: 'PATIENT_REFERRAL',
    sortOrder: 10,
  }),
  src({}),
  src({ id: 's-radio', name: 'Radio', isActive: false, systemKey: null, sortOrder: 1000 }),
];

async function openRowMenu(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(await screen.findByRole('button', { name: `Acciones de ${name}` }));
}

describe('PatientSourcesManager (DX-172)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedList.mockResolvedValue(SOURCES);
  });

  it('sin ADMIN: aviso y ninguna petición', () => {
    render(<PatientSourcesManager token="t" allowed={false} />);
    expect(screen.getByText('Solo administración cambia el origen de pacientes.')).toBeInTheDocument();
    expect(mockedList).not.toHaveBeenCalled();
  });

  it('lista activas y desactivadas en el orden de la API, con su tipo y estado; axe limpio', async () => {
    const { container } = render(<PatientSourcesManager token="t" allowed />);
    const table = await screen.findByRole('table', { name: 'Fuentes de «¿Cómo nos conoció?»' });
    expect(mockedList).toHaveBeenCalledWith('t', true);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows.map((r) => within(r).getAllByRole('cell')[0].textContent)).toEqual([
      'Recomendación de paciente' + 'Predefinida',
      'Instagram' + 'Predefinida',
      'Radio',
    ]);
    expect(within(rows[0]).getByText('Recomendación de un paciente')).toBeInTheDocument();
    expect(within(rows[2]).getByText('Desactivada')).toBeInTheDocument();
    expect(screen.getByText('3 fuentes')).toBeInTheDocument();
    expect(await violations(container)).toEqual([]);
  });

  it('alta con nombre y tipo; un nombre repetido (409) se dice junto al campo', async () => {
    const user = userEvent.setup();
    mockedCreate
      .mockRejectedValueOnce(new ApiError(409, 'Ya existe una fuente con ese nombre.'))
      .mockResolvedValueOnce(
        src({
          id: 's-new',
          name: 'Dr. Pérez y asociados',
          kind: 'EXTERNAL_PROFESSIONAL',
          systemKey: null,
          sortOrder: 1000,
        }),
      );
    render(<PatientSourcesManager token="t" allowed />);
    await user.click(await screen.findByRole('button', { name: 'Nueva fuente' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nueva fuente' });
    await user.click(within(dialog).getByRole('button', { name: 'Añadir fuente' }));
    expect(within(dialog).getByText('Escribe entre 2 y 60 caracteres.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
    await user.type(within(dialog).getByLabelText('Nombre'), 'Instagram');
    await user.click(within(dialog).getByRole('button', { name: 'Añadir fuente' }));
    expect(await within(dialog).findByText('Ya existe una fuente con ese nombre.')).toBeInTheDocument();
    expect(await violations(dialog)).toEqual([]);
    await user.clear(within(dialog).getByLabelText('Nombre'));
    await user.type(within(dialog).getByLabelText('Nombre'), '  Dr. Pérez   y asociados ');
    await user.click(within(dialog).getByRole('radio', { name: /Profesional externo/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Añadir fuente' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(mockedCreate).toHaveBeenLastCalledWith('t', {
      name: 'Dr. Pérez y asociados',
      kind: 'EXTERNAL_PROFESSIONAL',
    });
    expect(screen.getByText('Fuente «Dr. Pérez y asociados» añadida.')).toBeInTheDocument();
  });

  it('renombrar no deja cambiar el tipo', async () => {
    const user = userEvent.setup();
    mockedUpdate.mockResolvedValue(src({ name: 'Instagram y TikTok' }));
    render(<PatientSourcesManager token="t" allowed />);
    await openRowMenu(user, 'Instagram');
    await user.click(await screen.findByRole('menuitem', { name: /Renombrar/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Renombrar la fuente' });
    expect(within(dialog).queryByRole('radio')).not.toBeInTheDocument();
    expect(within(dialog).getByTestId('patient-source-kind-fixed')).toHaveTextContent(
      'Tipo: Canal. El tipo no se cambia',
    );
    await user.clear(within(dialog).getByLabelText('Nombre'));
    await user.type(within(dialog).getByLabelText('Nombre'), 'Instagram y TikTok');
    await user.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('t', 's-ig', { name: 'Instagram y TikTok' }));
  });

  it('desactivar pide confirmación y explica que los pacientes y el informe la conservan; activar es directo', async () => {
    const user = userEvent.setup();
    mockedUpdate
      .mockResolvedValueOnce(src({ isActive: false }))
      .mockResolvedValueOnce(src({ id: 's-radio', name: 'Radio', isActive: true, systemKey: null, sortOrder: 1000 }));
    render(<PatientSourcesManager token="t" allowed />);
    await openRowMenu(user, 'Instagram');
    await user.click(await screen.findByRole('menuitem', { name: /Desactivar/ }));
    const dialog = await screen.findByRole('dialog', { name: '¿Desactivar «Instagram»?' });
    expect(dialog).toHaveTextContent(
      'Los pacientes que ya la tienen la conservan, y el informe de captación la sigue contando.',
    );
    expect(mockedUpdate).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Desactivar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledWith('t', 's-ig', { isActive: false }));
    expect(await screen.findByText('Fuente «Instagram» desactivada.')).toBeInTheDocument();

    await openRowMenu(user, 'Radio');
    await user.click(await screen.findByRole('menuitem', { name: /Activar/ }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenLastCalledWith('t', 's-radio', { isActive: true }));
  });

  it('si la lista no carga, error de sección con «Reintentar»', async () => {
    const user = userEvent.setup();
    mockedList.mockRejectedValueOnce(new Error('caída'));
    render(<PatientSourcesManager token="t" allowed />);
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByRole('table')).toBeInTheDocument();
  });
});
