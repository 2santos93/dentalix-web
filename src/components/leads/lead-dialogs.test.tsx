import { render, screen, waitFor } from '@testing-library/react';
import { apiErrorFromBody } from '@/lib/api/client';
import { convertLead, createLead, listLeadReasons, type Lead } from '@/lib/leads/leads-api';
import { setupUser } from '@/lib/test/user';
import { LeadCreateDialog } from './lead-create-dialog';
import { LeadConvertDialog } from './lead-dialogs';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
jest.mock('../../lib/leads/leads-api', () => ({
  ...jest.requireActual('../../lib/leads/leads-api'),
  createLead: jest.fn(),
  convertLead: jest.fn(),
  listLeadReasons: jest.fn(),
}));

const mockedCreate = createLead as jest.MockedFunction<typeof createLead>;
const mockedConvert = convertLead as jest.MockedFunction<typeof convertLead>;
const mockedReasons = listLeadReasons as jest.MockedFunction<typeof listLeadReasons>;

const LEAD = { id: 'l1', fullName: 'María José Pérez' } as Lead;

describe('Nuevo prospecto (DX-556)', () => {
  beforeEach(() => {
    push.mockReset();
    mockedCreate.mockReset().mockResolvedValue({ ...LEAD, stage: 'NEW' } as Lead);
    mockedReasons.mockReset().mockResolvedValue([
      { id: null, kind: 'INTEREST', name: 'Ortodoncia', predefined: true },
      { id: 'r1', kind: 'INTEREST', name: 'Diseño de sonrisa', predefined: false },
    ]);
  });

  function renderCreate() {
    const onCreated = jest.fn();
    render(<LeadCreateDialog open onOpenChange={jest.fn()} token="tok" onCreated={onCreated} />);
    return onCreated;
  }

  it('empieza en el nombre, con WhatsApp de canal, y Enter crea con los cuatro campos', async () => {
    const user = setupUser();
    const onCreated = renderCreate();
    await waitFor(() => expect(screen.getByLabelText('Nombre')).toHaveFocus());
    expect(screen.getByLabelText('Canal')).toHaveValue('WHATSAPP');
    expect(screen.getByText(/Nunca síntomas, diagnósticos ni medicación/)).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Diseño de sonrisa' });
    await user.selectOptions(screen.getByLabelText('Motivo de interés'), 'Ortodoncia');
    await user.type(screen.getByLabelText('Nombre'), 'Yusmary Rondón');
    await user.type(screen.getByLabelText('Teléfono'), '0412 1234567{Enter}');
    await waitFor(() =>
      expect(mockedCreate).toHaveBeenCalledWith('tok', {
        fullName: 'Yusmary Rondón',
        phone: '0412 1234567',
        channel: 'WHATSAPP',
        interestReason: 'Ortodoncia',
      }),
    );
    expect(onCreated).toHaveBeenCalled();
  });

  it('sin nombre ni teléfono no envía y lo dice junto a cada campo', async () => {
    const user = setupUser();
    renderCreate();
    await user.click(screen.getByRole('button', { name: 'Crear prospecto' }));
    expect(await screen.findByText('Escribe el nombre.')).toBeInTheDocument();
    expect(screen.getByText('Escribe el teléfono.')).toBeInTheDocument();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('teléfono de un paciente: aviso con «Abrir paciente»', async () => {
    const user = setupUser();
    mockedCreate.mockRejectedValueOnce(
      apiErrorFromBody(
        409,
        { code: 'LEAD_PHONE_TAKEN', existing: { kind: 'PATIENT', id: 'p9', name: 'Ana Rojas' } },
        null,
      ),
    );
    renderCreate();
    await user.type(screen.getByLabelText('Nombre'), 'Ana');
    await user.type(screen.getByLabelText('Teléfono'), '04141234567{Enter}');
    expect(await screen.findByText(/ya es de Ana Rojas, que ya es paciente/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Abrir paciente' }));
    expect(push).toHaveBeenCalledWith('/patients/p9');
  });

  it('teléfono de un prospecto de otra sede: solo el aviso, sin botón', async () => {
    const user = setupUser();
    mockedCreate.mockRejectedValueOnce(
      apiErrorFromBody(409, { code: 'LEAD_PHONE_TAKEN', existing: { kind: 'LEAD', id: null, name: null } }, null),
    );
    renderCreate();
    await user.type(screen.getByLabelText('Nombre'), 'Ana');
    await user.type(screen.getByLabelText('Teléfono'), '04141234567{Enter}');
    expect(await screen.findByText('Ese teléfono ya es de un prospecto de otra sede.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Abrir prospecto' })).not.toBeInTheDocument();
  });

  it('si fallan los motivos, el campo se sustituye por su reintento', async () => {
    mockedReasons.mockRejectedValueOnce(new Error('caída'));
    renderCreate();
    expect(await screen.findByText('Motivos no disponibles')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
  });
});

describe('Convertir en paciente (DX-556)', () => {
  beforeEach(() => {
    mockedConvert.mockReset();
  });

  it('prellena nombre y apellido partiendo el nombre del prospecto', async () => {
    const user = setupUser();
    mockedConvert.mockResolvedValue({ patientId: 'p1', created: true, linked: false, lead: LEAD });
    const onConverted = jest.fn();
    render(<LeadConvertDialog open onOpenChange={jest.fn()} token="tok" lead={LEAD} onConverted={onConverted} />);
    expect(screen.getByLabelText('Nombre')).toHaveValue('María');
    expect(screen.getByLabelText('Apellido')).toHaveValue('José Pérez');
    await user.click(screen.getByRole('button', { name: 'Convertir en paciente' }));
    await waitFor(() =>
      expect(mockedConvert).toHaveBeenCalledWith('tok', 'l1', { firstName: 'María', lastName: 'José Pérez' }),
    );
    expect(onConverted).toHaveBeenCalledWith(expect.objectContaining({ patientId: 'p1' }));
  });

  it('con varios pacientes con ese teléfono se elige uno y se reenvía con `patientId`', async () => {
    const user = setupUser();
    mockedConvert
      .mockRejectedValueOnce(
        apiErrorFromBody(
          409,
          {
            code: 'LEAD_AMBIGUOUS_PATIENTS',
            candidates: [
              { id: 'pa', name: 'María Pérez' },
              { id: 'pb', name: 'María José Pérez' },
            ],
          },
          null,
        ),
      )
      .mockResolvedValueOnce({ patientId: 'pb', created: false, linked: true, lead: LEAD });
    const onConverted = jest.fn();
    render(<LeadConvertDialog open onOpenChange={jest.fn()} token="tok" lead={LEAD} onConverted={onConverted} />);
    await user.click(screen.getByRole('button', { name: 'Convertir en paciente' }));
    expect(await screen.findByText('Hay varios pacientes con ese teléfono. ¿Con cuál se enlaza?')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Enlazar con este paciente' }));
    expect(await screen.findByText('Elige con qué paciente enlazarlo.')).toBeInTheDocument();
    await user.click(screen.getByLabelText('María José Pérez'));
    await user.click(screen.getByRole('button', { name: 'Enlazar con este paciente' }));
    await waitFor(() => expect(mockedConvert).toHaveBeenLastCalledWith('tok', 'l1', { patientId: 'pb' }));
    expect(onConverted).toHaveBeenCalledWith(expect.objectContaining({ linked: true }));
  });
});
