import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
import { getDocumentTypeNames } from '@/lib/patients/document-type-names-api';
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

jest.mock('../../lib/patients/document-type-names-api', () => ({
  getDocumentTypeNames: jest.fn(),
}));
const mockedGetNames = getDocumentTypeNames as jest.MockedFunction<typeof getDocumentTypeNames>;
const NO_NAMES = { NATIONAL_ID: null, PASSPORT: null, RESIDENCE_PERMIT: null, TAX_ID: null, OTHER: null };

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
    docType: 'NATIONAL_ID',
    docTypeLabel: null,
    docTypeName: 'Documento nacional',
    docNumber: '52987654',
    email: 'claudia@example.com',
    phone: null,
    phoneInternational: null,
  },
  fullName: 'Claudia Navarro',
  docType: 'NATIONAL_ID',
  docTypeLabel: null,
  docTypeName: 'Documento nacional',
  docNumber: '52987654',
  email: 'claudia@example.com',
  phone: null,
  phoneInternational: null,
  relationship: 'MOTHER',
  isPayer: true,
  receivesNotices: true,
  migratedFromGuardian: false,
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
};

const renderSection = () =>
  render(<PatientResponsiblePartiesSection token="tok" patientId="son" />);


/** Editar y quitar viven en el «⋯» de la fila (RowActions). */
async function partyAction(user: ReturnType<typeof setupUser>, name: string, action: 'Editar' | 'Quitar') {
  await user.click(await screen.findByRole('button', { name: `Acciones de ${name}` }));
  await user.click(await screen.findByRole('menuitem', { name: action }));
}

describe('PatientResponsiblePartiesSection (DX-203)', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockedGetNames.mockResolvedValue(NO_NAMES);
  });

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

  it('the contact line shows the international phone, or the stored one when it has none (DX-387)', async () => {
    mockedGet.mockResolvedValue(
      data({
        parties: [
          { ...motherParty, phone: '0412-1234567', phoneInternational: '+58 412 1234567' },
          {
            ...motherParty,
            id: 'r2',
            kind: 'CONTACT',
            responsiblePatient: null,
            fullName: 'Luis Ortiz',
            docNumber: null,
            email: null,
            isPayer: false,
            phone: 'oficina 2',
            phoneInternational: null,
          },
        ],
      }),
    );
    renderSection();
    const rows = await screen.findAllByTestId('responsible-row');
    expect(within(rows[0]).getByText(/\+58 412 1234567/)).toBeInTheDocument();
    expect(within(rows[0]).queryByText(/0412-1234567/)).not.toBeInTheDocument();
    expect(within(rows[1]).getByText('oficina 2')).toBeInTheDocument();
  });

  it('un correo largo sin espacios en el aviso parte la línea en vez de ensanchar la ficha a 390 px', async () => {
    // jsdom no maqueta: se fija lo que lo hace posible (mismo caso que «Datos»).
    const email = 'claudia.navarro.consultorio@una-empresa-de-nombre-largo.example.com';
    mockedGet.mockResolvedValue(
      data({
        parties: [motherParty],
        noticeRecipient: {
          kind: 'RESPONSIBLE',
          name: 'Claudia',
          email,
          minor: true,
          responsiblePartyId: 'r1',
        },
      }),
    );
    renderSection();
    expect(
      await screen.findByText(`Los avisos de este paciente van a Claudia (${email}).`),
    ).toHaveClass('break-words');
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
        docTypeLabel: null,
        docNumber: null,
        email: 'claudia@example.com',
        phone: null,
      }),
    );
    expect(await screen.findByText('Responsable guardado.')).toBeInTheDocument();
    expect(await screen.findByTestId('responsible-row')).toBeInTheDocument();
  });

  it('a contact offers no document and the five types', async () => {
    mockedGetNames.mockResolvedValue({ ...NO_NAMES, RESIDENCE_PERMIT: 'ID local' });
    mockedGet.mockResolvedValue(data());
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Añadir responsable' }));
    await user.click(screen.getByRole('radio', { name: 'Un contacto nuevo (sin ficha)' }));
    const select = screen.getByLabelText('Tipo de documento') as HTMLSelectElement;
    await within(select).findByRole('option', { name: 'ID local' });
    expect(select).toHaveValue('');
    expect(Array.from(select.options).map((o) => [o.value, o.textContent])).toEqual([
      ['', 'Sin documento'],
      ['NATIONAL_ID', 'Documento nacional'],
      ['PASSPORT', 'Pasaporte'],
      ['RESIDENCE_PERMIT', 'ID local'],
      ['TAX_ID', 'Identificación fiscal'],
      ['OTHER', 'Otro documento'],
    ]);
  });

  it('a contact shows the label field only with a type', async () => {
    mockedGet.mockResolvedValue(data());
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Añadir responsable' }));
    await user.click(screen.getByRole('radio', { name: 'Un contacto nuevo (sin ficha)' }));
    expect(screen.queryByLabelText('Nombre del documento (opcional)')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'NATIONAL_ID');
    expect(screen.getByLabelText('Nombre del documento (opcional)')).toHaveValue('');
    expect(screen.getByText('Si lo escribes, se muestra en lugar del tipo en fichas y documentos.')).toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Tipo de documento'), '');
    expect(screen.queryByLabelText('Nombre del documento (opcional)')).not.toBeInTheDocument();
  });

  it('the contact dialog always sends docTypeLabel with the contact', async () => {
    const contact: ResponsibleParty = {
      ...motherParty,
      kind: 'CONTACT',
      responsiblePatient: null,
      docTypeLabel: 'ID local',
      docTypeName: 'ID local',
    };
    mockedGet.mockResolvedValue(data({ parties: [contact] }));
    mockedUpdate.mockResolvedValue(contact);
    mockedCreate.mockResolvedValue(contact);
    renderSection();
    const user = setupUser();

    // Edición sin tocar la etiqueta: viaja la actual.
    await partyAction(user, 'Claudia Navarro', 'Editar');
    const label = screen.getByLabelText('Nombre del documento (opcional)');
    expect(label).toHaveValue('ID local');
    await user.click(screen.getByLabelText('Recibe los avisos'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][3]).toMatchObject({ docType: 'NATIONAL_ID', docTypeLabel: 'ID local' });

    // Vaciada: viaja null, nunca se omite.
    await partyAction(user, 'Claudia Navarro', 'Editar');
    await user.clear(screen.getByLabelText('Nombre del documento (opcional)'));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(2));
    expect(mockedUpdate.mock.calls[1][3]).toHaveProperty('docTypeLabel', null);

    // Con otro tipo, la etiqueta del anterior no se arrastra.
    await partyAction(user, 'Claudia Navarro', 'Editar');
    await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'PASSPORT');
    expect(screen.getByLabelText('Nombre del documento (opcional)')).toHaveValue('');
    await user.type(screen.getByLabelText('Nombre del documento (opcional)'), '  Documento   A ');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(3));
    expect(mockedUpdate.mock.calls[2][3]).toMatchObject({ docType: 'PASSPORT', docTypeLabel: 'Documento A' });
  });

  it('a contact: changing the type and back restores the saved label', async () => {
    const contact: ResponsibleParty = {
      ...motherParty,
      kind: 'CONTACT',
      responsiblePatient: null,
      docTypeLabel: 'ID local',
      docTypeName: 'ID local',
    };
    mockedGet.mockResolvedValue(data({ parties: [contact] }));
    mockedUpdate.mockResolvedValue(contact);
    renderSection();
    const user = setupUser();

    await partyAction(user, 'Claudia Navarro', 'Editar');
    const label = screen.getByLabelText('Nombre del documento (opcional)');
    await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'PASSPORT');
    expect(label).toHaveValue('');
    await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'NATIONAL_ID');
    expect(screen.getByLabelText('Nombre del documento (opcional)')).toHaveValue('ID local');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(mockedUpdate).toHaveBeenCalledTimes(1));
    expect(mockedUpdate.mock.calls[0][3]).toMatchObject({ docType: 'NATIONAL_ID', docTypeLabel: 'ID local' });
  });

  it('a contact label with a control or format character is marked on its field', async () => {
    mockedGet.mockResolvedValue(data());
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Añadir responsable' }));
    await user.click(screen.getByRole('radio', { name: 'Un contacto nuevo (sin ficha)' }));
    await user.type(screen.getByLabelText('Nombre completo'), 'Claudia Navarro');
    await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'NATIONAL_ID');
    const label = screen.getByLabelText('Nombre del documento (opcional)');
    fireEvent.change(label, { target: { value: 'ID\u200Blocal' } });
    await user.click(screen.getByRole('button', { name: 'Añadir' }));

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(label).toHaveAttribute('aria-invalid', 'true');
    expect(document.getElementById(label.getAttribute('aria-describedby')!)).toHaveTextContent(
      'El nombre del documento no puede llevar caracteres de control.',
    );
    expect(label).toHaveFocus();
  });

  it('a contact email the API would reject («ana@x», no TLD) is marked on its field', async () => {
    mockedGet.mockResolvedValue(data());
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Añadir responsable' }));
    await user.click(screen.getByRole('radio', { name: 'Un contacto nuevo (sin ficha)' }));
    await user.type(screen.getByLabelText('Nombre completo'), 'Claudia Navarro');
    const email = screen.getByLabelText('Email');
    expect(email).toHaveAccessibleDescription(
      'A él le llegan los avisos del paciente si es menor o no tiene email.',
    );
    await user.type(email, 'ana@x');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAccessibleDescription('Revisa el email: le falta algo (p. ej. nombre@dominio.com).');
    expect(email).toHaveFocus();

    mockedCreate.mockResolvedValue(motherParty);
    await user.type(email, '.co');
    expect(email).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0][2]).toMatchObject({ email: 'ana@x.co' });
  });

  it('a contact label over 40 characters is marked on its field', async () => {
    mockedGet.mockResolvedValue(data());
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Añadir responsable' }));
    await user.click(screen.getByRole('radio', { name: 'Un contacto nuevo (sin ficha)' }));
    await user.type(screen.getByLabelText('Nombre completo'), 'Claudia Navarro');
    await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'NATIONAL_ID');
    const label = screen.getByLabelText('Nombre del documento (opcional)');
    fireEvent.change(label, { target: { value: '\u{1D49C}'.repeat(41) } });
    await user.click(screen.getByRole('button', { name: 'Añadir' }));

    expect(mockedCreate).not.toHaveBeenCalled();
    expect(label).toHaveAttribute('aria-invalid', 'true');
    const errorId = label.getAttribute('aria-describedby');
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId!)).toHaveTextContent('Hasta 40 caracteres.');
    expect(label).toHaveFocus();
    expect(screen.getByLabelText('Nombre completo')).not.toHaveAttribute('aria-invalid');

    mockedCreate.mockResolvedValue(motherParty);
    fireEvent.change(label, { target: { value: '\u{1D49C}'.repeat(40) } });
    expect(label).not.toHaveAttribute('aria-invalid');
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0][2]).toMatchObject({ docTypeLabel: '\u{1D49C}'.repeat(40) });
  });

  it('a patient responsible never sends a label', async () => {
    mockedGet.mockResolvedValue(data());
    mockedList.mockResolvedValue({
      items: [{ id: 'mother', firstName: 'Claudia', lastName: 'Navarro', docType: 'NATIONAL_ID', docNumber: '1' }],
      total: 1,
      page: 1,
      pageSize: 8,
    } as never);
    mockedCreate.mockResolvedValue(motherParty);
    renderSection();
    const user = setupUser();
    await user.click(await screen.findByRole('button', { name: 'Añadir responsable' }));
    // Una etiqueta escrita como contacto no viaja si al final es un paciente.
    await user.click(screen.getByRole('radio', { name: 'Un contacto nuevo (sin ficha)' }));
    await user.selectOptions(screen.getByLabelText('Tipo de documento'), 'NATIONAL_ID');
    await user.type(screen.getByLabelText('Nombre del documento (opcional)'), 'ID local');
    await user.click(screen.getByRole('radio', { name: 'Un paciente de la clínica' }));
    await user.type(screen.getByLabelText('Buscar paciente'), 'Clau');
    await user.click(await screen.findByRole('button', { name: /Claudia Navarro/ }));
    await user.click(screen.getByRole('button', { name: 'Añadir' }));
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1));
    expect(mockedCreate.mock.calls[0][2]).toEqual({
      relationship: 'MOTHER',
      isPayer: false,
      receivesNotices: true,
      responsiblePatientId: 'mother',
    });
  });

  it('alta buscando a un paciente de la clínica; el 422 del segundo pagador sale en el modal', async () => {
    mockedGet.mockResolvedValue(data());
    mockedList.mockResolvedValue({
      items: [
        {
          id: 'mother',
          firstName: 'Claudia',
          lastName: 'Navarro',
          docType: 'NATIONAL_ID',
          docTypeLabel: 'Documento A',
          docTypeName: 'Documento A',
          docNumber: '52987654',
        },
        { id: 'son', firstName: 'Tomás', lastName: 'Ortiz', docType: 'PASSPORT', docNumber: '1' },
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
    // El documento del resultado sale del `docTypeName` del DTO.
    expect(within(option).getByText('Documento A 52987654')).toBeInTheDocument();
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
    await partyAction(user, 'Claudia Navarro', 'Editar');
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
    await partyAction(user, 'Claudia Navarro', 'Quitar');
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
    await partyAction(user, 'Claudia Navarro', 'Quitar');
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Quitar' }));
    await screen.findByText('Sin responsable registrado');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Añadir responsable' })).toHaveFocus(),
    );
  });

  it('al cancelar el quitar, el foco vuelve al «⋯» de su fila', async () => {
    mockedGet.mockResolvedValueOnce(data({ parties: [motherParty] }));
    renderSection();
    const user = setupUser();
    const remove = await screen.findByRole('button', { name: 'Acciones de Claudia Navarro' });
    await user.click(remove);
    await user.click(await screen.findByRole('menuitem', { name: 'Quitar' }));
    const dialog = await screen.findByRole('dialog');
    await user.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(remove).toHaveFocus());
  });
});
