import { render, screen, waitFor, within } from '@testing-library/react';
import { PatientResponsiblePartiesSection } from './patient-responsible-parties-section';
import {
  createResponsibleParty,
  getPatientResponsibles,
  removeResponsibleParty,
  updateResponsibleParty,
  type PatientResponsibles,
  type ResponsibleParty,
} from '@/lib/patients/responsible-parties-api';
import { listPatients } from '@/lib/patients/patients-api';
import { ApiError } from '@/lib/api/client';
import { setupUser } from '@/lib/test/user';

jest.mock('../../lib/patients/responsible-parties-api', () => ({
  ...jest.requireActual('../../lib/patients/responsible-parties-api'),
  getPatientResponsibles: jest.fn(),
  createResponsibleParty: jest.fn(),
  updateResponsibleParty: jest.fn(),
  removeResponsibleParty: jest.fn(),
}));
jest.mock('../../lib/patients/patients-api', () => ({
  ...jest.requireActual('../../lib/patients/patients-api'),
  listPatients: jest.fn(),
}));

const mockedGet = getPatientResponsibles as jest.MockedFunction<typeof getPatientResponsibles>;
const mockedCreate = createResponsibleParty as jest.MockedFunction<typeof createResponsibleParty>;
const mockedUpdate = updateResponsibleParty as jest.MockedFunction<typeof updateResponsibleParty>;
const mockedRemove = removeResponsibleParty as jest.MockedFunction<typeof removeResponsibleParty>;
const mockedList = listPatients as jest.MockedFunction<typeof listPatients>;

function data(over: Partial<PatientResponsibles> = {}): PatientResponsibles {
  return {
    patientId: 'son',
    minor: true,
    majorityAge: 18,
    country: 'CO',
    parties: [],
    responsibleFor: [],
    noticeRecipient: {
      kind: 'PATIENT',
      name: 'Tomás',
      email: null,
      minor: true,
      responsiblePartyId: null,
    },
    ...over,
  };
}

const motherParty: ResponsibleParty = {
  id: 'r1',
  patientId: 'son',
  kind: 'PATIENT',
  responsiblePatient: {
    id: 'mother',
    firstName: 'Claudia',
    lastName: 'Navarro',
    docType: 'CC',
    docNumber: '52987654',
    email: 'claudia@example.com',
    phone: null,
  },
  fullName: 'Claudia Navarro',
  docType: 'CC',
  docNumber: '52987654',
  email: 'claudia@example.com',
  phone: null,
  relationship: 'MOTHER',
  isPayer: true,
  receivesNotices: true,
  migratedFromGuardian: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const renderSection = () =>
  render(<PatientResponsiblePartiesSection token="tok" patientId="son" />);

describe('PatientResponsiblePartiesSection (DX-203)', () => {
  beforeEach(() => jest.resetAllMocks());

  it('carga: esqueleto con estado accesible', () => {
    mockedGet.mockReturnValue(new Promise(() => undefined));
    renderSection();
    expect(screen.getByRole('status', { name: 'Cargando responsables' })).toBeInTheDocument();
  });

  it('vacío: «Sin responsable registrado» y avisa si es menor', async () => {
    mockedGet.mockResolvedValue(data());
    renderSection();
    expect(await screen.findByText('Sin responsable registrado')).toBeInTheDocument();
    expect(screen.getByText(/Es menor de 18 años: añade un responsable/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Añadir responsable' })).toBeInTheDocument();
  });

  it('error con «Reintentar» que vuelve a cargar', async () => {
    mockedGet.mockRejectedValueOnce(new ApiError(500, 'boom'));
    mockedGet.mockResolvedValueOnce(data());
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText('Sin responsable registrado')).toBeInTheDocument();
    expect(mockedGet).toHaveBeenCalledTimes(2);
  });

  it('lista al responsable con enlace a su ficha, sus marcas y a quién van los avisos', async () => {
    mockedGet.mockResolvedValue(
      data({
        parties: [motherParty],
        noticeRecipient: {
          kind: 'RESPONSIBLE',
          name: 'Claudia',
          email: 'claudia@example.com',
          minor: true,
          responsiblePartyId: 'r1',
        },
      }),
    );
    renderSection();
    const row = await screen.findByTestId('responsible-row');
    expect(within(row).getByRole('link', { name: 'Claudia Navarro' })).toHaveAttribute(
      'href',
      '/patients/mother',
    );
    expect(within(row).getByText('Pagador principal')).toBeInTheDocument();
    expect(within(row).getByText('Recibe avisos')).toBeInTheDocument();
    expect(
      screen.getByText('Los avisos de este paciente van a Claudia (claudia@example.com).'),
    ).toBeInTheDocument();
    // Chip del familiar que es paciente.
    expect(screen.getByRole('link', { name: /Claudia Navarro · Madre/ })).toHaveAttribute(
      'href',
      '/patients/mother',
    );
  });

  it('en la ficha del responsable: «Responsable de» con chips a los familiares', async () => {
    mockedGet.mockResolvedValue(
      data({
        patientId: 'mother',
        minor: false,
        responsibleFor: [
          {
            id: 'r1',
            patient: { id: 'son', firstName: 'Tomás', lastName: 'Ortiz' },
            relationship: 'MOTHER',
            isPayer: true,
            receivesNotices: true,
          },
        ],
      }),
    );
    render(<PatientResponsiblePartiesSection token="tok" patientId="mother" />);
    const block = await screen.findByTestId('responsible-for');
    expect(within(block).getByText('Responsable de')).toBeInTheDocument();
    expect(within(block).getByRole('link', { name: /Tomás Ortiz · Pagador principal/ })).toHaveAttribute(
      'href',
      '/patients/son',
    );
  });

  it('alta de un contacto nuevo desde el modal', async () => {
    mockedGet.mockResolvedValueOnce(data());
    mockedGet.mockResolvedValueOnce(data({ parties: [{ ...motherParty, kind: 'CONTACT', responsiblePatient: null }] }));
    mockedCreate.mockResolvedValue(motherParty);
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Añadir responsable' }));
    await user.click(screen.getByRole('radio', { name: 'Un contacto nuevo (sin ficha)' }));
    // Sin nombre no se envía.
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(await screen.findByText('Escribe el nombre del responsable.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('Nombre completo'), 'Claudia Navarro');
    await user.type(screen.getByLabelText('Email'), 'claudia@example.com');
    await user.click(screen.getByLabelText('Pagador principal'));
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', 'son', {
        relationship: 'MOTHER',
        isPayer: true,
        receivesNotices: true,
        fullName: 'Claudia Navarro',
        docType: null,
        docNumber: null,
        email: 'claudia@example.com',
        phone: null,
      }),
    );
    expect(await screen.findByText('Responsable guardado.')).toBeInTheDocument();
    expect(await screen.findByTestId('responsible-row')).toBeInTheDocument();
  });

  it('alta buscando a un paciente de la clínica; el 422 del segundo pagador sale en el modal', async () => {
    mockedGet.mockResolvedValue(data());
    mockedList.mockResolvedValue({
      items: [
        { id: 'mother', firstName: 'Claudia', lastName: 'Navarro', docType: 'CC', docNumber: '52987654' },
        { id: 'son', firstName: 'Tomás', lastName: 'Ortiz', docType: 'TI', docNumber: '1' },
      ],
      total: 2,
      page: 1,
      pageSize: 8,
    } as never);
    mockedCreate.mockRejectedValue(
      new ApiError(422, 'Luis Ortiz ya es el pagador principal de este paciente. Quítale esa marca antes de elegir a otro.'),
    );
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Añadir responsable' }));
    await user.type(screen.getByLabelText('Buscar paciente'), 'Clau');
    // El propio paciente no se ofrece.
    const option = await screen.findByRole('button', { name: /Claudia Navarro/ });
    expect(screen.queryByRole('button', { name: /Tomás Ortiz/ })).not.toBeInTheDocument();
    await user.click(option);
    await user.click(screen.getByLabelText('Pagador principal'));
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    expect(
      await screen.findByText(/Luis Ortiz ya es el pagador principal/),
    ).toBeInTheDocument();
    expect(mockedCreate).toHaveBeenCalledWith(
      'tok',
      'son',
      expect.objectContaining({ responsiblePatientId: 'mother', isPayer: true }),
    );
  });

  it('editar quita la marca de avisos', async () => {
    mockedGet.mockResolvedValue(data({ parties: [motherParty] }));
    mockedUpdate.mockResolvedValue({ ...motherParty, receivesNotices: false });
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Editar a Claudia Navarro' }));
    expect(screen.getByText(/se cambian en su propia ficha/)).toBeInTheDocument();
    await user.click(screen.getByLabelText('Recibe los avisos'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() =>
      expect(mockedUpdate).toHaveBeenCalledWith('tok', 'son', 'r1', {
        relationship: 'MOTHER',
        isPayer: true,
        receivesNotices: false,
      }),
    );
  });

  it('quitar pide confirmación y vuelve a cargar', async () => {
    mockedGet.mockResolvedValueOnce(data({ parties: [motherParty] }));
    mockedGet.mockResolvedValueOnce(data());
    mockedRemove.mockResolvedValue(undefined);
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Quitar a Claudia Navarro' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/deja de ser responsable/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Quitar' }));
    await waitFor(() => expect(mockedRemove).toHaveBeenCalledWith('tok', 'son', 'r1'));
    expect(await screen.findByText('Sin responsable registrado')).toBeInTheDocument();
  });

  it('al quitar, el foco no se pierde en <body>: pasa a «Añadir responsable» (WCAG 2.4.3)', async () => {
    mockedGet.mockResolvedValueOnce(data({ parties: [motherParty] }));
    mockedGet.mockResolvedValueOnce(data());
    mockedRemove.mockResolvedValue(undefined);
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Quitar a Claudia Navarro' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Quitar' }));
    await screen.findByText('Sin responsable registrado');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Añadir responsable' })).toHaveFocus(),
    );
  });

  it('al cancelar el quitar, el foco vuelve a su botón «Quitar»', async () => {
    mockedGet.mockResolvedValueOnce(data({ parties: [motherParty] }));
    renderSection();
    const user = setupUser();
    const remove = await screen.findByRole('button', { name: 'Quitar a Claudia Navarro' });
    await user.click(remove);
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(remove).toHaveFocus());
  });
});
